// Disk-backed spool for the contact-form mailer.
//
// Submissions are written to /data/queue before the HTTP response is sent, and
// a worker drains them later. Every function here takes `dir` and `now`
// explicitly rather than reading module state or the clock, which is what lets
// the tests drive them without a server, an SMTP connection, or fake timers.

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function queuePaths(dir) {
  return {
    queueDir: path.join(dir, "queue"),
    failedDir: path.join(dir, "failed"),
  };
}

export async function ensureDirs(dir) {
  const { queueDir, failedDir } = queuePaths(dir);
  await fs.mkdir(queueDir, { recursive: true });
  await fs.mkdir(failedDir, { recursive: true });
}

export function makeId(now, suffix = randomBytes(3).toString("hex")) {
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

export async function enqueue(dir, mail, now, suffix) {
  const { queueDir } = queuePaths(dir);
  const id = makeId(now, suffix);
  const at = new Date(now).toISOString();
  await writeAtomic(queueDir, id, {
    id,
    receivedAt: at,
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
export async function stats(dir, now) {
  const { failedDir } = queuePaths(dir);
  const queued = await listQueued(dir);
  const failed = (await fs.readdir(failedDir)).filter((name) =>
    name.endsWith(".json"),
  );

  let oldestAgeSec = 0;
  for (const filename of queued) {
    const envelope = await readEnvelope(dir, filename);
    if (!envelope) continue;
    const age = Math.floor((now - Date.parse(envelope.receivedAt)) / 1000);
    if (age > oldestAgeSec) oldestAgeSec = age;
  }

  return { queued: queued.length, failed: failed.length, oldestAgeSec };
}
