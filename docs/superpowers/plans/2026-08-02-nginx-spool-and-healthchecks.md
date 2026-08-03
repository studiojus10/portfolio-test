# nginx-Side Spooling and Container Healthchecks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept contact-form submissions in nginx when the mailer container is unreachable, so the site being up is sufficient for a submission to be retained — and add liveness healthchecks to both images.

**Architecture:** `/api/contact` becomes an njs `js_content` handler that proxies to the mailer with `r.subrequest()`. A reply below 500 passes through untouched; anything else means the mailer could not answer, so njs writes the raw submission to `/data/inbox/` and returns success. The mailer promotes inbox files into proper queue envelopes at the top of each drain tick, keeping validation and mail construction in one place.

**Tech Stack:** nginx 1.31 + njs (`nginx-module-njs`), Node 26 ESM, `node:test`. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-02-nginx-spool-and-healthchecks-design.md`

## Global Constraints

- **No new npm dependencies.** `mailer/package.json` must still list `nodemailer` as its only entry under `dependencies`. Do not run `npm install`.
- **ESM only**, Node >= 22. Top-level `await` is available.
- **Tests must be uid-independent.** The CI runner is root, and root bypasses POSIX permission checks, so `chmod`-based fault injection passes vacuously there. A guard in `mailer/queue.test.js` already fails the suite if `chmod(` reappears — do not defeat it. Simulate root locally with `cd mailer && unshare -r node --test`.
- **Existing response codes are unchanged** end to end: honeypot 200, invalid 400, oversized 413, rate-limited 429, spool-write failure 503.
- **Failed mail is never auto-deleted.** No sweeper, no TTL.
- **`/api/health` keeps working** through the existing `location /api/` proxy — do not route it through njs.
- **Comment style:** explain *why*, not *what*.
- **Spool ownership:** spool dirs are `99:100`; `inbox/` must end up mode `0o775`. `fs.mkdir`'s `mode` option is masked by umask, so an explicit `chmod` is required, run unconditionally.
- **No Docker daemon is available** in the working environment (`docker info` → permission denied). Do not attempt `docker build` or `docker run`, and do not use `sudo`. Tasks needing a daemon are marked and deferred to the deployment host.

---

### Task 1: Shared validation

**Files:**
- Modify: `mailer/server.js` (extract validation from the request handler)
- Create: `mailer/validate.js`
- Create: `mailer/validate.test.js`
- Modify: `mailer/Dockerfile` (copy the new module into the image)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `isHoneypot(data) -> boolean`
  - `validateSubmission(data) -> { ok: true, name, email, message } | { ok: false, error: string }`
  - `renderMail({name, email, message}, {from, to}) -> { from, to, replyTo, subject, text }`

Validation currently lives inline in the request handler (`mailer/server.js:146` honeypot, `:157-166` fields). Both the HTTP path and the new inbox promoter must apply identical rules, so this extracts them once. Behaviour must not change.

- [ ] **Step 1: Write the failing test**

Create `mailer/validate.test.js`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isHoneypot, renderMail, validateSubmission } from "./validate.js";

describe("isHoneypot", () => {
  it("is true only when _gotcha has content", () => {
    assert.equal(isHoneypot({ _gotcha: "bot" }), true);
    assert.equal(isHoneypot({ _gotcha: "  " }), false);
    assert.equal(isHoneypot({ _gotcha: "" }), false);
    assert.equal(isHoneypot({}), false);
  });
});

describe("validateSubmission", () => {
  const good = { name: "Jane Doe", email: "jane@example.com", message: "Hello" };

  it("accepts a valid submission", () => {
    assert.deepEqual(validateSubmission(good), {
      ok: true,
      name: "Jane Doe",
      email: "jane@example.com",
      message: "Hello",
    });
  });

  it("rejects a missing name, a bad email, or an empty message", () => {
    for (const bad of [
      { ...good, name: "" },
      { ...good, email: "not-an-email" },
      { ...good, message: "   " },
    ]) {
      const result = validateSubmission(bad);
      assert.equal(result.ok, false);
      assert.match(result.error, /name, a valid email, and a message/);
    }
  });

  it("collapses newlines in single-line fields and caps lengths", () => {
    const result = validateSubmission({
      name: `${"a".repeat(200)}\nsecond line`,
      email: "jane@example.com",
      message: "b".repeat(6000),
    });
    assert.equal(result.ok, true);
    assert.equal(result.name.length, 100);
    assert.ok(!result.name.includes("\n"));
    assert.equal(result.message.length, 5000);
  });

  it("preserves newlines inside the message body", () => {
    const result = validateSubmission({ ...good, message: "line one\nline two" });
    assert.equal(result.ok, true);
    assert.equal(result.message, "line one\nline two");
  });
});

describe("renderMail", () => {
  it("builds the mail the transport sends", () => {
    const mail = renderMail(
      { name: "Jane Doe", email: "jane@example.com", message: "Hello" },
      { from: "Studio Jus10 <s@example.com>", to: "s@example.com" },
    );
    assert.deepEqual(mail, {
      from: "Studio Jus10 <s@example.com>",
      to: "s@example.com",
      replyTo: "Jane Doe <jane@example.com>",
      subject: "Portfolio inquiry from Jane Doe",
      text: "Hello\n\n— Jane Doe (jane@example.com)",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mailer && npm test`
Expected: FAIL — `Cannot find module '.../mailer/validate.js'`

- [ ] **Step 3: Write the implementation**

Create `mailer/validate.js`:

```js
// Submission rules, shared by the HTTP handler and the inbox promoter.
//
// nginx accepts submissions when the mailer is unreachable (see spool.js) but
// writes them raw -- it has no access to MAIL_TO/MAIL_FROM and no business
// rules. Both paths funnel through here so the two cannot drift.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const oneLine = (v) => String(v ?? "").replace(/[\r\n]+/g, " ").trim();

export function isHoneypot(data) {
  return Boolean(oneLine(data?._gotcha));
}

export function validateSubmission(data) {
  const name = oneLine(data?.name).slice(0, 100);
  const email = oneLine(data?.email).slice(0, 200);
  const message = String(data?.message ?? "").trim().slice(0, 5000);

  if (!name || !EMAIL_RE.test(email) || !message) {
    return {
      ok: false,
      error: "Please provide a name, a valid email, and a message.",
    };
  }
  return { ok: true, name, email, message };
}

export function renderMail({ name, email, message }, { from, to }) {
  return {
    from,
    to,
    replyTo: `${name} <${email}>`,
    subject: `Portfolio inquiry from ${name}`,
    text: `${message}\n\n— ${name} (${email})`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mailer && npm test`
Expected: PASS — 6 new tests, 33 total

- [ ] **Step 5: Rewire the request handler**

In `mailer/server.js`, add to the imports:

```js
import { isHoneypot, renderMail, validateSubmission } from "./validate.js";
```

Replace the honeypot block (currently `mailer/server.js:146-148`) with:

```js
    if (isHoneypot(data)) {
      return sendJson(res, 200, { success: true });
    }
```

Replace the field extraction and validation (currently `mailer/server.js:157-166`) with:

```js
    const submission = validateSubmission(data);
    if (!submission.ok) {
      return sendJson(res, 400, { success: false, error: submission.error });
    }
```

Replace the `enqueue` call's inline mail object with:

```js
      await enqueue(
        QUEUE_DIR,
        renderMail(submission, { from: MAIL_FROM, to: MAIL_TO }),
        Date.now(),
      );
```

Then delete the now-unused `EMAIL_RE` and `oneLine` definitions (currently `mailer/server.js:83-84`) — but **check first** whether `oneLine` is still used elsewhere. It is: the client-IP extraction at `mailer/server.js:119` calls it. Keep `oneLine`, delete only `EMAIL_RE`.

- [ ] **Step 6: Verify nothing changed behaviourally**

Run: `cd mailer && QUEUE_DIR=/tmp/val-smoke QUEUE_POLL_MS=1000 PORT=3999 node server.js &`

Then:

```bash
sleep 1
for body in \
  '{"name":"Jane","email":"jane@example.com","message":"hi"}' \
  '{"name":"","email":"jane@example.com","message":"hi"}' \
  '{"name":"Jane","email":"nope","message":"hi"}' \
  '{"name":"Jane","email":"jane@example.com","message":"hi","_gotcha":"bot"}' ; do
  curl -s -o /dev/null -w "%{http_code} " -X POST localhost:3999/api/contact \
    -H 'Content-Type: application/json' -d "$body"
done
echo
kill %1
```

Expected: `200 400 400 200` — valid, missing name, bad email, honeypot. Clean up with `rm -rf "${TMPDIR:-/tmp}"/val-smoke`.

- [ ] **Step 7: Copy the new module into the image**

`mailer/Dockerfile` copies runtime sources explicitly. `server.js` now imports
`./validate.js`, so the image would start and immediately die with
`ERR_MODULE_NOT_FOUND` — the exact failure the transitive COPY guard in
`mailer/queue.test.js` exists to catch. That guard walks every relative import
reachable from `server.js`, so **`npm test` is already failing at this point**;
this step is what makes it pass.

Change the `COPY` line in `mailer/Dockerfile` to:

```dockerfile
COPY server.js queue.js validate.js ./
```

- [ ] **Step 8: Confirm the guard is satisfied**

Run: `cd mailer && npm test`
Expected: PASS — 33 tests, including "ensures every module transitively reachable from server.js by relative import is copied into the image".

Then run `cd mailer && unshare -r node --test` and confirm the same count. The CI runner is root; a count that differs between the two uids is an environment-dependent test and must be fixed rather than accepted.

- [ ] **Step 9: Commit**

```bash
git add mailer/validate.js mailer/validate.test.js mailer/server.js mailer/Dockerfile
git commit -m "Extract submission validation so both intake paths share it"
```

---

### Task 2: Inbox promotion

**Files:**
- Modify: `mailer/queue.js` (add `inboxDir` to `queuePaths`, create it in `ensureDirs`, add `promoteInbox`)
- Modify: `mailer/queue.test.js`

**Interfaces:**
- Consumes: `queuePaths`, `ensureDirs`, `enqueue`, `listQueued` from the existing module; `isHoneypot`, `validateSubmission`, `renderMail` from Task 1
- Produces: `promoteInbox(dir, mailConfig, opts) -> Promise<{promoted, dropped, failed, skipped}>` where `mailConfig` is `{from, to}` and `opts` is `{ now: number, maxBytes?: number, log?: {error: Function} }`

The inbox file shape nginx writes:

```json
{
  "receivedAt": "2026-08-02T07:23:33.000Z",
  "ip": "203.0.113.7",
  "body": { "name": "...", "email": "...", "message": "...", "_gotcha": "" }
}
```

- [ ] **Step 1: Write the failing test**

Append to `mailer/queue.test.js`:

```js
const MAIL_CONFIG = {
  from: "Studio Jus10 <studiojus10@gmail.com>",
  to: "studiojus10@gmail.com",
};

function inboxFile(body, receivedAt = "2025-08-01T00:00:00.000Z") {
  return JSON.stringify({ receivedAt, ip: "203.0.113.7", body });
}

const GOOD_BODY = {
  name: "Jane Doe",
  email: "jane@example.com",
  message: "Hello",
};

describe("promoteInbox", () => {
  it("turns a valid inbox file into a queued envelope and removes it", async () => {
    const box = path.join(dir, "promote-ok");
    await ensureDirs(box);
    const { inboxDir } = queuePaths(box);
    await fs.writeFile(path.join(inboxDir, "1754006400000-aaa.json"), inboxFile(GOOD_BODY));

    const result = await promoteInbox(box, MAIL_CONFIG, {
      now: 1754006400000,
      log: SILENT,
    });

    assert.equal(result.promoted, 1);
    assert.deepEqual(await fs.readdir(inboxDir), []);

    const queued = await listQueued(box);
    assert.equal(queued.length, 1);
    const envelope = await readEnvelope(box, queued[0]);
    assert.equal(envelope.mail.subject, "Portfolio inquiry from Jane Doe");
    assert.equal(envelope.mail.replyTo, "Jane Doe <jane@example.com>");
    assert.equal(envelope.mail.to, MAIL_CONFIG.to);
    assert.equal(envelope.attempts, 0);
  });

  it("drops a honeypot submission without queueing it", async () => {
    const box = path.join(dir, "promote-honeypot");
    await ensureDirs(box);
    const { inboxDir } = queuePaths(box);
    await fs.writeFile(
      path.join(inboxDir, "1754006400000-bbb.json"),
      inboxFile({ ...GOOD_BODY, _gotcha: "bot" }),
    );

    const result = await promoteInbox(box, MAIL_CONFIG, {
      now: 1754006400000,
      log: SILENT,
    });

    assert.equal(result.dropped, 1);
    assert.equal(result.promoted, 0);
    assert.deepEqual(await fs.readdir(inboxDir), []);
    assert.deepEqual(await listQueued(box), []);
  });

  it("moves an invalid submission to failed/", async () => {
    const box = path.join(dir, "promote-invalid");
    await ensureDirs(box);
    const { inboxDir, failedDir } = queuePaths(box);
    await fs.writeFile(
      path.join(inboxDir, "1754006400000-ccc.json"),
      inboxFile({ ...GOOD_BODY, email: "not-an-email" }),
    );

    const result = await promoteInbox(box, MAIL_CONFIG, {
      now: 1754006400000,
      log: SILENT,
    });

    assert.equal(result.failed, 1);
    assert.deepEqual(await fs.readdir(inboxDir), []);
    assert.deepEqual(await fs.readdir(failedDir), ["1754006400000-ccc.json"]);
    assert.deepEqual(await listQueued(box), []);
  });

  it("skips an unparseable file, leaves it in place, and continues the pass", async () => {
    const box = path.join(dir, "promote-corrupt");
    await ensureDirs(box);
    const { inboxDir } = queuePaths(box);
    await fs.writeFile(path.join(inboxDir, "1754006400000-ddd.json"), "{ torn");
    await fs.writeFile(path.join(inboxDir, "1754006400001-eee.json"), inboxFile(GOOD_BODY));

    const result = await promoteInbox(box, MAIL_CONFIG, {
      now: 1754006400001,
      log: SILENT,
    });

    assert.equal(result.promoted, 1);
    assert.equal(result.skipped, 1);
    assert.deepEqual(await fs.readdir(inboxDir), ["1754006400000-ddd.json"]);
    assert.equal((await listQueued(box)).length, 1);
  });

  it("ignores .partial files", async () => {
    const box = path.join(dir, "promote-partial");
    await ensureDirs(box);
    const { inboxDir } = queuePaths(box);
    await fs.writeFile(
      path.join(inboxDir, "1754006400000-fff.json.partial"),
      inboxFile(GOOD_BODY),
    );

    const result = await promoteInbox(box, MAIL_CONFIG, {
      now: 1754006400000,
      log: SILENT,
    });

    assert.equal(result.promoted, 0);
    assert.equal(result.skipped, 0);
    assert.deepEqual(await fs.readdir(inboxDir), [
      "1754006400000-fff.json.partial",
    ]);
  });

  it("moves an oversized file to failed/ without parsing it", async () => {
    const box = path.join(dir, "promote-oversize");
    await ensureDirs(box);
    const { inboxDir, failedDir } = queuePaths(box);
    await fs.writeFile(
      path.join(inboxDir, "1754006400000-ggg.json"),
      inboxFile({ ...GOOD_BODY, message: "x".repeat(50_000) }),
    );

    const result = await promoteInbox(box, MAIL_CONFIG, {
      now: 1754006400000,
      maxBytes: 20_000,
      log: SILENT,
    });

    assert.equal(result.failed, 1);
    assert.deepEqual(await fs.readdir(inboxDir), []);
    assert.deepEqual(await fs.readdir(failedDir), ["1754006400000-ggg.json"]);
  });

  it("creates the inbox directory with group-write so nginx can write it", async () => {
    const box = path.join(dir, "promote-mode");
    await ensureDirs(box);
    const { inboxDir } = queuePaths(box);
    const mode = (await fs.stat(inboxDir)).mode & 0o777;
    assert.equal(mode, 0o775, `expected 0o775, got 0o${mode.toString(8)}`);
  });
});
```

Add `promoteInbox` to the import list at the top of `mailer/queue.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mailer && npm test`
Expected: FAIL — `promoteInbox is not a function`

- [ ] **Step 3: Extend queuePaths and ensureDirs**

In `mailer/queue.js`, change `queuePaths` (currently `mailer/queue.js:12-17`) to:

```js
export function queuePaths(dir) {
  return {
    queueDir: path.join(dir, "queue"),
    failedDir: path.join(dir, "failed"),
    inboxDir: path.join(dir, "inbox"),
  };
}
```

Change `ensureDirs` (currently `mailer/queue.js:19`) to:

```js
export async function ensureDirs(dir) {
  const { queueDir, failedDir, inboxDir } = queuePaths(dir);
  await fs.mkdir(queueDir, { recursive: true });
  await fs.mkdir(failedDir, { recursive: true });
  await fs.mkdir(inboxDir, { recursive: true });

  // nginx (uid 101) writes here when the mailer is unreachable; the mailer
  // (uid 99) owns the directory. mkdir's mode option is masked by umask, so
  // 0o775 would silently become 0o755 -- chmod unconditionally so a directory
  // left at 0o755 by an earlier version is repaired too.
  await fs.chmod(inboxDir, 0o775);
}
```

- [ ] **Step 4: Write promoteInbox**

Add to the imports at the top of `mailer/queue.js`:

```js
import { isHoneypot, renderMail, validateSubmission } from "./validate.js";
```

Append to `mailer/queue.js`:

```js
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

      // Enqueue before unlinking: a crash between them re-promotes and sends
      // twice, the other order loses the message outright.
      await enqueue(dir, renderMail(submission, mailConfig), now);
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd mailer && npm test`
Expected: PASS — 7 new tests

- [ ] **Step 6: Verify at both uids**

Run: `cd mailer && node --test` then `cd mailer && unshare -r node --test`
Expected: identical pass counts. `unshare -r` reports `uid=0`, which is what the CI runner is — a test whose result differs between the two is environment-dependent and must be fixed, not accepted.

- [ ] **Step 7: Commit**

```bash
git add mailer/queue.js mailer/queue.test.js
git commit -m "Promote nginx-spooled submissions into real queue envelopes"
```

---

### Task 3: Run promotion on every tick

**Files:**
- Modify: `mailer/server.js` (config, drain tick, startup log)

**Interfaces:**
- Consumes: `promoteInbox` from Task 2
- Produces: the running service — inbox files become queued mail without operator action

No unit test of its own; this is wiring over logic covered in Task 2, verified by the smoke test in Step 4.

- [ ] **Step 1: Add config**

In `mailer/server.js`, add after the `QUEUE_STALE_SEC` line (currently `mailer/server.js:45`):

```js
const PROMOTE_MAX_BYTES = Number(env.PROMOTE_MAX_BYTES || 20_000);
```

Add `promoteInbox` and `queuePaths` to the `./queue.js` import (currently `mailer/server.js:29`).

- [ ] **Step 2: Promote before draining**

In `drainTick` (currently `mailer/server.js:205`), immediately after the existing `await ensureDirs(QUEUE_DIR)` at `mailer/server.js:213`, insert:

```js
    const promoted = await promoteInbox(
      QUEUE_DIR,
      { from: MAIL_FROM, to: MAIL_TO },
      { now: Date.now(), maxBytes: PROMOTE_MAX_BYTES },
    );
    if (promoted.promoted || promoted.failed) {
      console.log(
        `[mailer] promoted: ${promoted.promoted} queued, ${promoted.dropped} dropped, ${promoted.failed} failed`,
      );
    }
```

Promotion runs before `drainOnce` in the same tick, so a submission nginx accepted seconds ago can be delivered without waiting for the next interval.

- [ ] **Step 3: Log the resolved inbox path at startup**

Replace the `server.listen` callback body with:

```js
server.listen(PORT, () => {
  console.log(
    `[mailer] listening on :${PORT} (mode: ${hasCreds ? "smtp" : "log-only"}, to: ${MAIL_TO || "unset"}, queue: ${QUEUE_DIR}, inbox: ${queuePaths(QUEUE_DIR).inboxDir})`,
  );
});
```

The inbox path is compiled into the web image's `spool.js` as `/data/inbox` but derived from `QUEUE_DIR` here via `queuePaths`. Logging it makes a mismatch visible in the first line of the log rather than as files that silently pile up.

- [ ] **Step 4: Smoke test the promotion path**

```bash
cd mailer
rm -rf /tmp/promote-smoke && mkdir -p /tmp/promote-smoke/inbox
cat > /tmp/promote-smoke/inbox/1754006400000-aaa.json <<'EOF'
{"receivedAt":"2025-08-01T00:00:00.000Z","ip":"203.0.113.7","body":{"name":"Jane","email":"jane@example.com","message":"from nginx"}}
EOF
QUEUE_DIR=/tmp/promote-smoke QUEUE_POLL_MS=1000 PORT=3999 node server.js &
sleep 3
echo "--- inbox (expect empty) ---"; ls /tmp/promote-smoke/inbox
echo "--- queue (expect empty, already delivered) ---"; ls /tmp/promote-smoke/queue
kill %1
```

Expected: the startup line ends `queue: /tmp/promote-smoke, inbox: /tmp/promote-smoke/inbox`; a `promoted: 1 queued` line appears; both directories end empty because log-only mode delivers and unlinks. Clean up with `rm -rf "${TMPDIR:-/tmp}"/promote-smoke`.

- [ ] **Step 5: Commit**

```bash
git add mailer/server.js
git commit -m "Promote inbox submissions at the top of each drain tick"
```

---

### Task 4: The njs handler and nginx routing

**Files:**
- Create: `njs/spool.js`
- Create: `njs/spool.test.js`
- Modify: `nginx.conf`
- Modify: `Dockerfile` (web image)
- Modify: `package.json` (root `check` script)

**Interfaces:**
- Consumes: the inbox format Task 2 reads; `r.variables.inbox_dir` from nginx
- Produces: `/api/contact` that accepts submissions whether or not the mailer is reachable

`spool.js` runs unmodified under Node — `import fs from "fs"`, `fs.writeFileSync`, `fs.renameSync` and `export default` behave identically in njs and Node, and `r` is the only nginx-specific object. It is therefore unit-tested with a hand-rolled fake `r` (verified working before this plan was written). `nginx -t` on the built image is the second gate and catches njs-vs-Node runtime differences; that runs in CI (Task 4 Step 7) since it needs a Docker daemon.

The inbox path comes from `r.variables.inbox_dir`, not a constant, so tests can inject it.

- [ ] **Step 1: Write the njs handler**

Create `njs/spool.js`:

```js
// Accept contact-form submissions even when the mailer container is down.
//
// The mailer owns the disk queue, so if it is unreachable nothing can spool the
// message and nginx would 502 -- which is exactly how two submissions were lost
// on 2026-08-02. This handler proxies to the mailer and, when the mailer cannot
// answer, writes the raw submission where the mailer will find it on recovery.
//
// Deliberately dumb: no validation, no honeypot check, no mail construction.
// MAIL_TO/MAIL_FROM are not visible here, and duplicating the rules in a second
// language is how the two intake paths would drift. mailer/validate.js decides.

import fs from "fs";

function spool(r) {
  // The path comes from nginx config, not a constant baked into this file: it
  // has to stay in step with the mailer's derived inbox path
  // (`${QUEUE_DIR}/inbox`), and a variable keeps that a config change rather
  // than an image rebuild. It also lets the unit tests point this at a temp
  // directory.
  const inbox = r.variables.inbox_dir;
  const id = `${Date.now()}-${r.variables.request_id.substring(0, 6)}`;
  const final = `${inbox}/${id}.json`;

  let body;
  try {
    body = JSON.parse(r.requestText);
  } catch (e) {
    // Not JSON -- the mailer would have rejected it anyway.
    return false;
  }

  const record = JSON.stringify({
    receivedAt: new Date().toISOString(),
    ip: r.headersIn["X-Forwarded-For"] || r.remoteAddress,
    body,
  });

  // Same protocol as the mailer's writeAtomic: stage in the same directory,
  // then rename. A same-directory rename cannot go cross-device, which is what
  // the spool's shfs union mount requires.
  fs.writeFileSync(`${final}.partial`, record);
  fs.renameSync(`${final}.partial`, final);
  return true;
}

async function handle(r) {
  let reply = null;
  try {
    reply = await r.subrequest("/internal/mailer", {
      method: "POST",
      body: r.requestText,
    });
  } catch (e) {
    r.error(`mailer subrequest failed: ${e.message}`);
  }

  // Anything the mailer positively answered below 500 is a real judgement about
  // this submission -- 400, 413 and 429 included -- and must reach the visitor
  // unchanged. Spooling a rejected message would deliver what the honeypot
  // caught. Every other outcome, including a missing status, falls through to
  // the spool: ambiguity should retain the message, not discard it.
  if (reply && reply.status > 0 && reply.status < 500) {
    r.return(reply.status, reply.responseText);
    return;
  }

  try {
    if (spool(r)) {
      r.return(200, '{"success":true}');
    } else {
      r.return(400, '{"success":false,"error":"Invalid JSON"}');
    }
  } catch (e) {
    r.error(`spool write failed: ${e.message}`);
    r.return(
      503,
      '{"success":false,"error":"Could not accept message. Please email directly."}',
    );
  }
}

export default { handle };
```

- [ ] **Step 2: Write the njs unit tests**

Create `njs/spool.test.js`:

```js
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import spool from "./spool.js";

let dir;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "njs-spool-test-"));
});

after(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const BODY = '{"name":"Jane","email":"jane@example.com","message":"hi"}';

// Stands in for the nginx request object. Only the members spool.js touches.
function fakeR(inbox, subrequestResult, over = {}) {
  const r = {
    returned: null,
    errors: [],
    variables: { request_id: "abcdef0123456789abcdef0123456789", inbox_dir: inbox },
    requestText: BODY,
    headersIn: { "X-Forwarded-For": "203.0.113.7" },
    remoteAddress: "10.0.0.1",
    subrequest: async () => {
      if (subrequestResult instanceof Error) throw subrequestResult;
      return subrequestResult;
    },
    return: (status, body) => { r.returned = { status, body }; },
    error: (msg) => { r.errors.push(msg); },
    ...over,
  };
  return r;
}

async function box(name) {
  const p = path.join(dir, name);
  await fs.mkdir(p, { recursive: true });
  return p;
}

describe("spool.handle", () => {
  it("passes a mailer success straight through", async () => {
    const inbox = await box("ok");
    const r = fakeR(inbox, { status: 200, responseText: '{"success":true}' });
    await spool.handle(r);
    assert.deepEqual(r.returned, { status: 200, body: '{"success":true}' });
    assert.deepEqual(await fs.readdir(inbox), [], "must not spool a delivered message");
  });

  it("passes a mailer rejection through WITHOUT spooling it", async () => {
    for (const status of [400, 413, 429]) {
      const inbox = await box(`reject-${status}`);
      const r = fakeR(inbox, { status, responseText: `{"error":${status}}` });
      await spool.handle(r);
      assert.equal(r.returned.status, status);
      assert.deepEqual(
        await fs.readdir(inbox),
        [],
        `status ${status} is a judgement about the submission, not an outage`,
      );
    }
  });

  it("spools and returns 200 when the mailer is unreachable", async () => {
    const inbox = await box("unreachable");
    const r = fakeR(inbox, new Error("mailer could not be resolved"));
    await spool.handle(r);
    assert.deepEqual(r.returned, { status: 200, body: '{"success":true}' });

    const files = await fs.readdir(inbox);
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith(".json"), "no .partial left behind");

    const record = JSON.parse(await fs.readFile(path.join(inbox, files[0]), "utf8"));
    assert.equal(record.ip, "203.0.113.7");
    assert.deepEqual(record.body, JSON.parse(BODY));
    assert.ok(record.receivedAt);
  });

  it("spools on a mailer 5xx", async () => {
    const inbox = await box("five-hundred");
    const r = fakeR(inbox, { status: 503, responseText: "" });
    await spool.handle(r);
    assert.equal(r.returned.status, 200);
    assert.equal((await fs.readdir(inbox)).length, 1);
  });

  it("spools when the reply has no usable status", async () => {
    const inbox = await box("no-status");
    const r = fakeR(inbox, { status: 0, responseText: "" });
    await spool.handle(r);
    assert.equal(r.returned.status, 200, "ambiguity must retain the message");
    assert.equal((await fs.readdir(inbox)).length, 1);
  });

  it("returns 400 for a non-JSON body instead of spooling garbage", async () => {
    const inbox = await box("bad-json");
    const r = fakeR(inbox, new Error("down"), { requestText: "not json at all" });
    await spool.handle(r);
    assert.equal(r.returned.status, 400);
    assert.deepEqual(await fs.readdir(inbox), []);
  });

  it("returns 503 when the spool itself cannot be written", async () => {
    const r = fakeR("/nonexistent/path/that/cannot/be/written", new Error("down"));
    await spool.handle(r);
    assert.equal(r.returned.status, 503);
    assert.ok(r.errors.some((m) => /spool write failed/.test(m)));
  });

  it("falls back to remoteAddress when there is no forwarded header", async () => {
    const inbox = await box("no-xff");
    const r = fakeR(inbox, new Error("down"), { headersIn: {} });
    await spool.handle(r);
    const files = await fs.readdir(inbox);
    const record = JSON.parse(await fs.readFile(path.join(inbox, files[0]), "utf8"));
    assert.equal(record.ip, "10.0.0.1");
  });
});
```

- [ ] **Step 3: Run the njs tests**

Run: `node --test njs/`
Expected: PASS — 8 tests.

These run under Node, so they verify logic but not njs runtime compatibility. Step 7 covers that.

- [ ] **Step 4: Wire up nginx**

In `nginx.conf`, add above the `server {` block:

```nginx
js_import spool from /etc/nginx/njs/spool.js;
limit_req_zone $binary_remote_addr zone=contact:1m rate=30r/m;
```

Inside the `server` block, add these two locations **before** the existing `location /api/`:

```nginx
  # Exact match, so it takes precedence over the /api/ prefix below without
  # reordering anything. /api/health stays on the plain proxy.
  location = /api/contact {
    limit_req zone=contact burst=5 nodelay;
    client_max_body_size 16k;
    client_body_buffer_size 16k;   # r.requestText needs the body in memory
    # Must match the mailer's derived inbox path (`${QUEUE_DIR}/inbox`). Kept
    # here rather than inside spool.js so it stays changeable without
    # rebuilding the web image.
    set $inbox_dir /data/inbox;
    js_content spool.handle;
  }

  location = /internal/mailer {
    internal;
    resolver 127.0.0.11 ipv6=off valid=30s;
    set $mailer_upstream http://mailer:3000;
    proxy_pass $mailer_upstream/api/contact;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
```

Leave the existing `location /api/` exactly as it is — it still serves `/api/health`.

- [ ] **Step 5: Build njs into the web image**

In `Dockerfile`, replace the serve stage's `COPY nginx.conf ...` line and what follows with:

```dockerfile
# njs handles /api/contact so submissions survive the mailer being down.
# The base image has no modules-enabled include and no load_module line, so it
# is prepended to the main context here. addgroup puts the nginx worker in gid
# 100 (users), which is what lets it write the 0o775 spool inbox owned by 99:100.
RUN apk add --no-cache nginx-module-njs \
 && sed -i '1i load_module modules/ngx_http_js_module.so;' /etc/nginx/nginx.conf \
 && addgroup nginx users
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY njs/spool.js /etc/nginx/njs/spool.js
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 6: Mount the spool into the web container**

In `docker-compose.yml`, add the shared volume to the `web` service so the local stack matches production:

```yaml
  web:
    build: .
    image: studiojus10
    ports:
      - "8080:80"
    volumes:
      - ./public/assets:/usr/share/nginx/html/assets:ro
      - mailer-queue:/data
    depends_on:
      - mailer
    restart: unless-stopped
```

- [ ] **Step 7: Gate njs syntax in CI**

Unit tests run `spool.js` under Node, which accepts language features njs may not
support. `js_import` is resolved when nginx parses its configuration, so
`nginx -t` loads and compiles the file and fails with the offending line number.
Verified: a valid handler passes; a deliberately broken one fails with
`at /etc/nginx/njs/ok.js:1`.

In `.forgejo/workflows/ci.yml`, add this step to the `docker` job immediately
after "Build & push" (the web image) and before "Build & push mailer":

```yaml
      # Unit tests exercise spool.js under Node, which is more permissive than
      # njs. nginx -t compiles the js_import at config-parse time, so this is
      # what catches a language feature njs does not support.
      - name: Verify njs compiles in the built image
        env:
          TAGS: ${{ steps.t.outputs.tags }}
        run: |
          set -eu
          FIRST_TAG=$(echo "$TAGS" | cut -d, -f1)
          docker run --rm "$FIRST_TAG" nginx -t
```

`--push` sends the image to the registry without loading it into the host store,
so pull it by tag rather than assuming it is present locally.

- [ ] **Step 8: Run the njs tests from the root check script**

In the root `package.json`, change the `check` script to append the njs tests:

```json
    "check": "astro check && biome check src/scripts tests *.js && node scripts/check-raw-colors.mjs && npm --prefix mailer test && node --test njs/",
```

- [ ] **Step 9: Verify**

Run: `docker compose config`
Expected: exit 0, both services showing `mailer-queue` mounted at `/data`.

Run: `npm run check`
Expected: exit 0, including the 8 njs tests.

`docker compose build` and any container run are **not** possible here — no daemon. Do not attempt them; Steps 7 and Task 6 cover that.

- [ ] **Step 10: Commit**

```bash
git add njs/spool.js njs/spool.test.js nginx.conf Dockerfile docker-compose.yml package.json .forgejo/workflows/ci.yml
git commit -m "Accept submissions in nginx when the mailer is unreachable"
```

---

### Task 5: Healthchecks

**Files:**
- Modify: `mailer/Dockerfile`
- Modify: `Dockerfile` (web image)
- Modify: `mailer/README.md`

**Interfaces:**
- Consumes: `/api/health` (mailer) and `/` (web)
- Produces: `docker ps` reporting health for both containers

- [ ] **Step 1: Add the mailer healthcheck**

In `mailer/Dockerfile`, insert immediately before the `CMD` line:

```dockerfile
# Liveness only -- deliberately not asserting "ok":true. That flips false when
# anything sits in failed/, nothing clears it automatically, and no restart
# would fix it; a single undeliverable message would pin the container unhealthy
# forever. Queue health is a monitoring concern on /api/health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://localhost:3000/api/health || exit 1
```

Both base images ship busybox `wget` and neither has `curl`.

- [ ] **Step 2: Add the web healthcheck**

In `Dockerfile`, insert after `EXPOSE 80`:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://localhost/ || exit 1
```

- [ ] **Step 3: Document both**

Add to the `## Durability` section of `mailer/README.md`:

```markdown
### When the mailer itself is down

nginx handles `/api/contact` through an njs handler (`njs/spool.js`). It proxies
to the mailer and passes any answer below `500` straight through — `400`, `413`
and `429` are real judgements about the submission. If the mailer cannot answer
at all, nginx writes the raw submission to `$QUEUE_DIR/inbox` and returns `200`;
the mailer promotes it into a real queue envelope on its next tick.

So the site being up is enough for a submission to be retained. The mailer can
be down indefinitely — crash-looping, mid-redeploy, or stopped — without losing
mail.

`inbox/` is mode `0775` owned `99:100`: the nginx worker writes as uid 101 via
group `users`, and the mailer unlinks as the directory's owner.

### Healthchecks

Both images carry a `HEALTHCHECK`. They test liveness only — that the process
answers — and deliberately do not require `"ok":true`, which goes false whenever
anything sits in `failed/` and stays false until an operator clears it. Docker
does not restart unhealthy containers by itself; these drive
`depends_on: condition: service_healthy`, the Unraid UI, and `docker ps`.
```

- [ ] **Step 4: Run the full check**

Run: `npm run check`
Expected: exit 0 — astro check, biome, the raw-colour guard, and the mailer suite.

- [ ] **Step 5: Commit**

```bash
git add mailer/Dockerfile Dockerfile mailer/README.md
git commit -m "Add liveness healthchecks to both images"
```

---

### Task 6: Verify on the deployment host

**Files:** none — this is verification of the built images.

**STOP — this task requires a Docker daemon and touches `root@192.168.1.69`. Do not execute it autonomously. It also cannot run until Tasks 1–5 are merged and CI has published both images. Present the commands, confirm with the user, then run them.**

The njs handler has unit tests under Node (Task 4) and a build-time `nginx -t` gate (Task 4 Step 7), but neither runs it under a real nginx. This task is the first exercise of njs's `fs` and `r.subrequest` against the actual njs runtime — treat a failure here as expected-and-useful, not as a surprise.

- [ ] **Step 1: Confirm both images carry healthchecks**

```bash
ssh root@192.168.1.69 'docker inspect -f "{{.Name}} {{.State.Health.Status}}" studiojus10 studiojus10-mailer'
```

Expected: both `healthy`. If `<no value>`, WUD has not yet pulled an image built from this branch.

- [ ] **Step 2: Confirm njs loaded**

```bash
ssh root@192.168.1.69 'docker exec studiojus10 nginx -T 2>/dev/null | grep -E "load_module|js_import|js_content"'
```

Expected: the `load_module`, `js_import`, and `js_content` lines. If empty, the module did not build into the image.

- [ ] **Step 3: Baseline — submit with the mailer UP**

```bash
ssh root@192.168.1.69 'curl -s -X POST localhost:6806/api/contact -H "Content-Type: application/json" -d "{\"name\":\"Baseline\",\"email\":\"b@example.com\",\"message\":\"njs-baseline\"}"'
```

Expected: `{"success":true}`, and the mailer log shows `drained: 1 sent`. This proves the njs proxy path did not break the normal case.

- [ ] **Step 4: Confirm a rejection still passes through**

```bash
ssh root@192.168.1.69 'curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:6806/api/contact -H "Content-Type: application/json" -d "{\"name\":\"\",\"email\":\"nope\",\"message\":\"\"}"'
```

Expected: `400`. A `200` here means njs is spooling messages the mailer rejected — the single most important thing this task checks.

- [ ] **Step 5: The real test — submit with the mailer DOWN**

```bash
ssh root@192.168.1.69 'docker stop studiojus10-mailer'
ssh root@192.168.1.69 'curl -s -X POST localhost:6806/api/contact -H "Content-Type: application/json" -d "{\"name\":\"Outage Test\",\"email\":\"o@example.com\",\"message\":\"njs-outage\"}"'
ssh root@192.168.1.69 'ls -la /mnt/user/appdata/studiojus10-mailer/inbox/'
```

Expected: `{"success":true}` — not a 502 — and one `.json` file in `inbox/`, owned by the nginx worker.

- [ ] **Step 6: Confirm recovery delivers it**

```bash
ssh root@192.168.1.69 'docker start studiojus10-mailer'
sleep 20
ssh root@192.168.1.69 'ls /mnt/user/appdata/studiojus10-mailer/inbox/ /mnt/user/appdata/studiojus10-mailer/queue/; docker logs --tail 5 studiojus10-mailer'
```

Expected: both directories empty, log showing `promoted: 1 queued` then `drained: 1 sent`, and the message arrives in the destination inbox. **This is the behaviour the whole feature exists for.**

- [ ] **Step 7: Confirm the permission model**

```bash
ssh root@192.168.1.69 'docker exec studiojus10 id nginx; stat -c "%a %U:%G" /mnt/user/appdata/studiojus10-mailer/inbox'
```

Expected: nginx in group `users`, inbox `775 nobody:users`. A `755` here means the umask masked the mkdir mode and the chmod did not run — Step 5 would have failed with a permission error.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Request routing (`= /api/contact`, `= /internal/mailer`) | 4 |
| njs handler and the `< 500` split | 4 |
| What nginx writes (raw fields + ip) | 4 |
| Atomic `.partial` + rename in njs | 4 |
| Promotion order and rules | 2 |
| Enqueue-before-unlink | 2 |
| Shared validation | 1 |
| Rate limiting via `limit_req` | 4 |
| Ownership, `addgroup`, 0o775 + explicit chmod | 2 (chmod), 4 (addgroup), 6 (verify) |
| Inbox path coupling + startup log | 3 |
| Healthchecks, liveness only | 5 |
| Configuration (`PROMOTE_MAX_BYTES`) | 3 |
| Testing: 9 listed cases | 1 (case 9), 2 (cases 1–8) |
| njs testing: unit / `nginx -t` / live | 4 Step 3, 4 Step 7, 6 |
| `r.variables.inbox_dir` instead of a constant | 4 Steps 1, 4 |
| Out of scope: client retry, claim mechanism, clearing failed/ | untouched |

No gaps.

**Guard interaction:** `mailer/queue.test.js` carries a transitive COPY guard
that walks every relative import reachable from `server.js` and asserts each is
in the Dockerfile's `COPY`. Task 1 introduces `validate.js` as a new import, so
that guard fails until Task 1 Step 7 updates the `COPY` line — this is expected
and is called out inside the task. No later task adds a relative import, so the
guard stays green from Step 8 onward. `njs/spool.js` is outside the mailer image
and is not reachable from `server.js`, so it is correctly not covered.

**Placeholder scan:** No TBD/TODO. Every code step carries complete code; every command states expected output.

**Type consistency:** `queuePaths` returns `{queueDir, failedDir, inboxDir}` — `inboxDir` is destructured in `ensureDirs` and `promoteInbox`, and asserted in the Task 2 mode test. `promoteInbox(dir, mailConfig, opts)` returns `{promoted, dropped, failed, skipped}`; Task 3 reads `promoted.promoted`, `.dropped`, `.failed`. `validateSubmission` returns a discriminated union on `ok`, consumed identically in `mailer/server.js` (Task 1 Step 5) and `promoteInbox` (Task 2 Step 4). `renderMail(submission, {from, to})` takes the validated shape — Task 1 passes `submission` directly, which carries the extra `ok: true` key; harmless, since `renderMail` destructures only `name`, `email`, `message`.
