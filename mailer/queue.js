// Disk-backed spool for the contact-form mailer.
//
// Submissions are written to /data/queue before the HTTP response is sent, and
// a worker drains them later. Every function here takes `dir` and `now`
// explicitly rather than reading module state or the clock, which is what lets
// the tests drive them without a server, an SMTP connection, or fake timers.
// The one deliberate exception is promoteInbox's per-item id timestamp: see
// its own comment for why a real clock read, not the injected `now`, is what
// keeps ids unique across a large batch.

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { isHoneypot, renderMail, validateSubmission } from "./validate.js";

export function queuePaths(dir) {
  return {
    queueDir: path.join(dir, "queue"),
    failedDir: path.join(dir, "failed"),
    inboxDir: path.join(dir, "inbox"),
  };
}

// Best-effort: chmod requires ownership of the target, and the mailer runs
// as uid 99 in production. If /data (or inbox/ specifically) is ever
// created by something else first -- notably Docker, which creates a
// missing bind-mount source directory as root -- this throws EPERM every
// time. ensureDirs runs at module top level in server.js and again at the
// top of every drainTick, so letting that escape would crash-loop the whole
// process (restart: unless-stopped) or abort an entire drain pass -- no
// queued mail delivered -- over what only degrades nginx's fallback path.
// Exported so the failure branch is exercisable directly and
// uid-independently (ENOENT on a path that was never created), without the
// chmod-based ownership fault injection the test suite's guard forbids.
export async function chmodBestEffort(path, mode, log = console) {
  try {
    await fs.chmod(path, mode);
  } catch (err) {
    log.warn(
      `[mailer] could not chmod ${path} to 0o${mode.toString(8)}: ` +
        `${String((err && err.message) || err)} -- nginx's fallback ` +
        "write to this directory may fail until ownership is fixed; " +
        "mail already in queue/ and failed/ is unaffected",
    );
  }
}

export async function ensureDirs(dir, opts = {}) {
  const { log = console } = opts;
  const { queueDir, failedDir, inboxDir } = queuePaths(dir);
  await fs.mkdir(queueDir, { recursive: true });
  await fs.mkdir(failedDir, { recursive: true });
  await fs.mkdir(inboxDir, { recursive: true });

  // nginx (uid 101) writes here when the mailer is unreachable; the mailer
  // (uid 99) owns the directory. mkdir's mode option is masked by umask, so
  // 0o775 would silently become 0o755 -- chmod unconditionally so a directory
  // left at 0o755 by an earlier version is repaired too.
  await chmodBestEffort(inboxDir, 0o775, log);
}

// The suffix is 8 random bytes (64 bits), not 3 (24 bits): promoteInbox can
// promote thousands of inbox files in a single pass, all sharing whatever
// millisecond `now` lands on for a fast loop iteration, and 24 bits of
// collision space is not enough headroom at that volume -- measured at
// 4,000 ids/ms, a 24-bit suffix has a ~37% chance of at least one collision
// (birthday bound). 64 bits pushes that to practically zero at any volume
// this feature is designed to absorb.
export function makeId(now, suffix = randomBytes(8).toString("hex")) {
  return `${now}-${suffix}`;
}

// The partial file is staged inside queueDir rather than a sibling tmp/ dir:
// on Unraid the spool lives under /mnt/user/appdata, an shfs union where a
// rename is only atomic when both paths sit on the same underlying disk. A
// same-directory rename cannot go cross-device regardless of share layout.
export async function writeAtomic(queueDir, id, envelope) {
  const finalPath = path.join(queueDir, `${id}.json`);
  const partialPath = `${finalPath}.partial`;

  const handle = await fs.open(partialPath, "w");
  try {
    await handle.writeFile(JSON.stringify(envelope, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }

  await fs.rename(partialPath, finalPath);

  // Persist the rename itself. Best-effort: the data is already durable, and
  // some filesystems reject fsync on a directory handle.
  try {
    const dirHandle = await fs.open(queueDir, "r");
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  } catch {
    /* ignore */
  }
}

// `now` drives the id and nextAttemptAt (i.e. "when is this eligible for
// delivery"); `receivedAt` defaults to the same instant, which is correct for
// the HTTP path where the two are simultaneous. promoteInbox passes a
// separate, earlier `receivedAt` -- the original inbox record's receipt
// time -- because that submission may have waited out an entire outage
// before this call ever happens; see promoteInbox's own comment.
export async function enqueue(dir, mail, now, suffix, receivedAt) {
  const { queueDir } = queuePaths(dir);
  const id = makeId(now, suffix);
  const at = new Date(now).toISOString();
  await writeAtomic(queueDir, id, {
    id,
    receivedAt: receivedAt ?? at,
    attempts: 0,
    nextAttemptAt: at,
    lastError: null,
    mail,
  });
  return id;
}

export async function listQueued(dir) {
  const { queueDir } = queuePaths(dir);
  const entries = await fs.readdir(queueDir);
  return entries.filter((name) => name.endsWith(".json")).sort();
}

// A corrupt or vanished file yields null rather than throwing. Callers treat
// that as "skip this pass", never as "discard" — a torn write left by a crash
// resolves on a later tick instead of costing a message.
export async function readEnvelope(dir, filename) {
  const { queueDir } = queuePaths(dir);
  try {
    return JSON.parse(await fs.readFile(path.join(queueDir, filename), "utf8"));
  } catch {
    return null;
  }
}

const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000];
const BACKOFF_CAP_MS = 3_600_000;

export function backoffMs(attempts) {
  if (attempts < 1) return 0;
  return BACKOFF_STEPS_MS[attempts - 1] ?? BACKOFF_CAP_MS;
}

// Retries are unconditional, including on SMTP 5xx. The realistic permanent
// failures here are a bad app password or a wrong MAIL_TO, both operator-
// fixable in .env — so the queue drains itself once the config is corrected
// rather than having discarded the mail on the first hard rejection.
export async function drainOnce(dir, send, opts = {}) {
  const { now, maxAttempts = 20, log = console } = opts;
  const { queueDir, failedDir } = queuePaths(dir);
  const result = { sent: 0, retried: 0, failed: 0, skipped: 0 };

  for (const filename of await listQueued(dir)) {
    const envelope = await readEnvelope(dir, filename);
    if (!envelope) {
      log.error(`[mailer] unreadable queue file, leaving in place: ${filename}`);
      result.skipped += 1;
      continue;
    }
    if (Date.parse(envelope.nextAttemptAt) > now) {
      result.skipped += 1;
      continue;
    }

    // The on-disk filename is the item's identity for every path derived
    // below, not envelope.id. They're normally the same string, but an
    // operator can rename the file while triaging without touching its
    // contents — keying writeAtomic off the (now stale) envelope.id would
    // write a *second* file next to the original instead of updating it,
    // leaving the original stuck at attempts: 0 forever.
    const id = filename.slice(0, -".json".length);

    // Outer guard: a filesystem throw anywhere in here (writeAtomic, the
    // failed/ rename) must not escape and abort the whole pass — that would
    // leave this item's in-memory attempts bump unpersisted (so it looks
    // never-attempted on the next pass, forever) and would starve every item
    // behind it in FIFO order, which never even gets read. The inner
    // try/catch below is the ordinary send-failure handling and is
    // untouched; this only catches what *that* handling itself throws.
    try {
      let delivered = false;
      try {
        await send(envelope.mail);
        delivered = true;
        await fs.unlink(path.join(queueDir, filename));
        result.sent += 1;
      } catch (err) {
        // The mail already left the building — bumping attempts and retrying
        // would send it a second time. Best effort to clear the spool slot,
        // then move on; a stuck file here needs a human, not another attempt.
        if (delivered) {
          log.error(
            `[mailer] ${id} DELIVERED but not dequeued: ${String((err && err.message) || err)}`,
          );
          try {
            await fs.rename(
              path.join(queueDir, filename),
              path.join(failedDir, filename),
            );
          } catch {
            /* operator must intervene */
          }
          result.sent += 1;
          continue;
        }

        envelope.attempts += 1;
        envelope.lastError = String((err && err.message) || err);

        if (envelope.attempts >= maxAttempts) {
          // Persist the final attempt count before setting the item aside.
          await writeAtomic(queueDir, id, envelope);
          await fs.rename(
            path.join(queueDir, filename),
            path.join(failedDir, filename),
          );
          log.error(
            `[mailer] giving up on ${id} after ${envelope.attempts} attempts: ${envelope.lastError}`,
          );
          result.failed += 1;
        } else {
          envelope.nextAttemptAt = new Date(
            now + backoffMs(envelope.attempts),
          ).toISOString();
          await writeAtomic(queueDir, id, envelope);
          result.retried += 1;
        }
      }
    } catch (err) {
      log.error(
        `[mailer] ${filename} state persistence failed, leaving in place for next pass: ${String((err && err.message) || err)}`,
      );
      result.skipped += 1;
      continue;
    }
  }

  return result;
}

// oldestAgeSec measures how long mail has been undelivered (from receivedAt),
// not how long since the last attempt — it is what a monitor should alert on.
//
// `inbox` counts submissions nginx spooled that promoteInbox has not yet
// turned into queue envelopes -- e.g. every file failed to promote this tick
// (result.skipped > 0) while queued/failed both stayed at 0, which the tick
// summary log doesn't even print for. Without this, /api/health can report
// "queued:0, failed:0, ok:true" with an arbitrary number of submissions sitting
// undelivered and invisible. It is deliberately not folded into `ok`: an
// inbox item is in-flight, not failed, and a healthy promoteInbox clears it
// within one tick -- flipping ok:false on its mere presence would make the
// health check flap on totally ordinary traffic.
export async function stats(dir, now) {
  const { failedDir, inboxDir } = queuePaths(dir);
  const queued = await listQueued(dir);
  const failed = (await fs.readdir(failedDir)).filter((name) =>
    name.endsWith(".json"),
  );
  const inbox = (await fs.readdir(inboxDir)).filter((name) =>
    name.endsWith(".json"),
  );

  let oldestAgeSec = 0;
  for (const filename of queued) {
    const envelope = await readEnvelope(dir, filename);
    if (!envelope) continue;
    const age = Math.floor((now - Date.parse(envelope.receivedAt)) / 1000);
    if (age > oldestAgeSec) oldestAgeSec = age;
  }

  return {
    queued: queued.length,
    failed: failed.length,
    inbox: inbox.length,
    oldestAgeSec,
  };
}

// nginx accepts submissions when this process is unreachable and drops them
// here raw -- it has no MAIL_TO/MAIL_FROM and applies no business rules. This
// is where they become real queue envelopes, so validation lives in exactly
// one place.
export async function promoteInbox(dir, mailConfig, opts = {}) {
  const { now, maxBytes = 20_000, log = console } = opts;
  const { inboxDir, failedDir } = queuePaths(dir);
  const result = { promoted: 0, dropped: 0, failed: 0, skipped: 0 };

  const entries = (await fs.readdir(inboxDir))
    .filter((name) => name.endsWith(".json"))
    .sort();

  for (const filename of entries) {
    const from = path.join(inboxDir, filename);
    try {
      const { size } = await fs.stat(from);
      if (size > maxBytes) {
        await fs.rename(from, path.join(failedDir, filename));
        log.error(`[mailer] inbox file ${filename} is ${size} bytes, set aside`);
        result.failed += 1;
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(await fs.readFile(from, "utf8"));
      } catch {
        // Possibly a torn write -- leave it and retry on a later tick.
        log.error(`[mailer] unreadable inbox file, leaving in place: ${filename}`);
        result.skipped += 1;
        continue;
      }

      const body = parsed?.body ?? {};
      if (isHoneypot(body)) {
        await fs.unlink(from);
        result.dropped += 1;
        continue;
      }

      const submission = validateSubmission(body);
      if (!submission.ok) {
        await fs.rename(from, path.join(failedDir, filename));
        log.error(`[mailer] invalid inbox submission ${filename}: ${submission.error}`);
        result.failed += 1;
        continue;
      }

      // Fresh timestamp per item, not the pass-level `now` above: reusing one
      // value for every envelope promoted in a pass collapses the id's
      // millisecond prefix to a single number, leaving only makeId's random
      // suffix to keep ids unique. A real drain tick can promote thousands of
      // inbox files in one pass -- see makeId for why that suffix alone,
      // even widened, is not the fix on its own. A fresh Date.now() per item
      // restores the per-request collision resistance the HTTP path always
      // had "for free" from being called once per request.
      const promotedAt = Date.now();

      // parsed.receivedAt is when nginx actually accepted this, which can be
      // arbitrarily far in the past during an outage. Stamping the envelope
      // with the current time instead would make oldestAgeSec -- and the
      // staleness alarm it feeds -- blind to however long the backlog really
      // waited. Fall back to the pass's own `now` (deterministic, unlike
      // promotedAt's real clock read) only when the recorded value is
      // missing or corrupt, never silently drop the submission over it.
      const parsedReceivedAt = Date.parse(parsed?.receivedAt);
      const receivedAt = new Date(
        Number.isNaN(parsedReceivedAt) ? now : parsedReceivedAt,
      ).toISOString();

      // Enqueue before unlinking: a crash between them re-promotes and sends
      // twice, the other order loses the message outright.
      await enqueue(
        dir,
        renderMail(submission, mailConfig),
        promotedAt,
        undefined,
        receivedAt,
      );
      await fs.unlink(from);
      result.promoted += 1;
    } catch (err) {
      log.error(
        `[mailer] promoting ${filename} failed: ${String((err && err.message) || err)}`,
      );
      result.skipped += 1;
    }
  }

  return result;
}
