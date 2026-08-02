# Mailer Disk Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the contact-form mailer durable — a submission is written to disk before the visitor gets a response, and a background worker delivers it with capped exponential backoff, so an SMTP outage or a container redeploy cannot lose mail.

**Architecture:** A new `mailer/queue.js` owns all spool mechanics as plain exported functions taking explicit `dir` and `now` arguments (no module-level state, no hidden clock — this is what makes it testable without an HTTP server or a real SMTP connection). `mailer/server.js` keeps HTTP handling and validation, calling `enqueue()` on the request path and `drainOnce()` from a `setInterval`. Delivery is injected into `drainOnce()` as a `send` callback, so tests use a stub.

**Tech Stack:** Node 26 ESM, `node:test` (built in), `nodemailer` (already present). No new dependencies.

## Global Constraints

- **No new runtime dependencies.** `mailer/package.json` must still list `nodemailer` as its only entry under `dependencies`. `node:test` is built in and needs no devDependency.
- **ESM only.** `mailer/package.json` sets `"type": "module"`; use `import`, not `require`.
- **Node >= 22** per `mailer/package.json` `engines`. Top-level `await` is available.
- **All new env vars are optional** and must have working defaults: `QUEUE_DIR` = `/data`, `QUEUE_POLL_MS` = `15000`, `MAX_ATTEMPTS` = `20`, `QUEUE_STALE_SEC` = `3600`.
- **Log-only mode must keep working.** With no `SMTP_USER`/`SMTP_PASS`, `docker compose up` still accepts submissions, logs them, and removes them from the queue.
- **Existing validation is untouched.** The honeypot check, rate limiter, and name/email/message validation in `mailer/server.js` keep their current behaviour and response codes.
- **Failed mail is never auto-deleted.** No sweeper, no TTL, no cleanup timer on `/data/failed/`.
- **Comment style:** this codebase explains *why*, not *what* (see the header comment in `mailer/server.js` and the resolver comment in `nginx.conf`). Match that density — do not narrate obvious code.

---

### Task 1: Test harness and atomic enqueue

**Files:**
- Create: `mailer/queue.js`
- Create: `mailer/queue.test.js`
- Modify: `mailer/package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `queuePaths(dir) -> { queueDir: string, failedDir: string }`
  - `ensureDirs(dir) -> Promise<void>`
  - `makeId(now: number, suffix?: string) -> string`
  - `writeAtomic(queueDir: string, id: string, envelope: object) -> Promise<void>`
  - `enqueue(dir: string, mail: object, now: number, suffix?: string) -> Promise<string>` (returns the id)
  - Envelope shape: `{ id, receivedAt, attempts, nextAttemptAt, lastError, mail }`

- [ ] **Step 1: Add the test script**

In `mailer/package.json`, change the `scripts` block to:

```json
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Write the failing test**

Create `mailer/queue.test.js`:

```js
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { enqueue, ensureDirs, makeId, queuePaths } from "./queue.js";

let dir;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mailer-queue-test-"));
});

after(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const SAMPLE_MAIL = {
  from: "Studio Jus10 <studiojus10@gmail.com>",
  to: "studiojus10@gmail.com",
  replyTo: "Jane Doe <jane@example.com>",
  subject: "Portfolio inquiry from Jane Doe",
  text: "Hello\n\n— Jane Doe (jane@example.com)",
};

describe("enqueue", () => {
  it("writes a parseable envelope and leaves no .partial behind", async () => {
    const box = path.join(dir, "enqueue");
    await ensureDirs(box);

    const now = 1754006400000;
    const id = await enqueue(box, SAMPLE_MAIL, now, "a3f9c1");
    assert.equal(id, "1754006400000-a3f9c1");

    const { queueDir } = queuePaths(box);
    const entries = await fs.readdir(queueDir);
    assert.deepEqual(entries, ["1754006400000-a3f9c1.json"]);

    const envelope = JSON.parse(
      await fs.readFile(path.join(queueDir, entries[0]), "utf8"),
    );
    assert.equal(envelope.id, id);
    assert.equal(envelope.attempts, 0);
    assert.equal(envelope.lastError, null);
    assert.equal(envelope.receivedAt, "2025-08-01T00:00:00.000Z");
    assert.equal(envelope.nextAttemptAt, "2025-08-01T00:00:00.000Z");
    assert.deepEqual(envelope.mail, SAMPLE_MAIL);
  });

  it("creates both queue and failed directories", async () => {
    const box = path.join(dir, "dirs");
    await ensureDirs(box);
    const { queueDir, failedDir } = queuePaths(box);
    assert.ok((await fs.stat(queueDir)).isDirectory());
    assert.ok((await fs.stat(failedDir)).isDirectory());
  });

  it("generates ids that sort in arrival order", () => {
    const ids = [makeId(1754006400002, "ff"), makeId(1754006400001, "aa")];
    assert.deepEqual(ids.sort(), [
      "1754006400001-aa",
      "1754006400002-ff",
    ]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd mailer && npm test`
Expected: FAIL — `Cannot find module '.../mailer/queue.js'`

- [ ] **Step 4: Write the implementation**

Create `mailer/queue.js`:

```js
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd mailer && npm test`
Expected: PASS — 3 tests passing

- [ ] **Step 6: Commit**

```bash
git add mailer/queue.js mailer/queue.test.js mailer/package.json
git commit -m "Add atomic enqueue for the mailer spool"
```

---

### Task 2: Scanning the queue

**Files:**
- Modify: `mailer/queue.js`
- Modify: `mailer/queue.test.js`

**Interfaces:**
- Consumes: `queuePaths`, `ensureDirs`, `enqueue`, `writeAtomic` from Task 1
- Produces:
  - `listQueued(dir) -> Promise<string[]>` — `*.json` filenames only, sorted ascending (FIFO)
  - `readEnvelope(dir, filename) -> Promise<object|null>` — `null` when the file is missing or unparseable

- [ ] **Step 1: Write the failing test**

Append to `mailer/queue.test.js`:

```js
describe("listQueued", () => {
  it("ignores .partial files and returns FIFO order", async () => {
    const box = path.join(dir, "scan");
    await ensureDirs(box);
    const { queueDir } = queuePaths(box);

    await enqueue(box, SAMPLE_MAIL, 1754006400002, "bbb");
    await enqueue(box, SAMPLE_MAIL, 1754006400001, "aaa");
    await fs.writeFile(
      path.join(queueDir, "1754006400003-ccc.json.partial"),
      "{ half-written",
    );

    assert.deepEqual(await listQueued(box), [
      "1754006400001-aaa.json",
      "1754006400002-bbb.json",
    ]);
  });
});

describe("readEnvelope", () => {
  it("returns the parsed envelope", async () => {
    const box = path.join(dir, "read-ok");
    await ensureDirs(box);
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "a1");

    const envelope = await readEnvelope(box, "1754006400000-a1.json");
    assert.equal(envelope.id, "1754006400000-a1");
    assert.deepEqual(envelope.mail, SAMPLE_MAIL);
  });

  it("returns null for a corrupt file instead of throwing", async () => {
    const box = path.join(dir, "read-corrupt");
    await ensureDirs(box);
    const { queueDir } = queuePaths(box);
    await fs.writeFile(path.join(queueDir, "1754006400000-zz.json"), "{ torn");

    assert.equal(await readEnvelope(box, "1754006400000-zz.json"), null);
  });

  it("returns null for a missing file", async () => {
    const box = path.join(dir, "read-missing");
    await ensureDirs(box);
    assert.equal(await readEnvelope(box, "nope.json"), null);
  });
});
```

Update the import at the top of `mailer/queue.test.js` to:

```js
import {
  enqueue,
  ensureDirs,
  listQueued,
  makeId,
  queuePaths,
  readEnvelope,
} from "./queue.js";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mailer && npm test`
Expected: FAIL — `listQueued is not a function`

- [ ] **Step 3: Write the implementation**

Append to `mailer/queue.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mailer && npm test`
Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
git add mailer/queue.js mailer/queue.test.js
git commit -m "Add queue scanning that skips partial and corrupt files"
```

---

### Task 3: Backoff schedule

**Files:**
- Modify: `mailer/queue.js`
- Modify: `mailer/queue.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `backoffMs(attempts: number) -> number` — delay in ms before the next try, indexed by the post-increment attempt count

- [ ] **Step 1: Write the failing test**

Append to `mailer/queue.test.js`:

```js
describe("backoffMs", () => {
  it("follows the documented schedule", () => {
    assert.equal(backoffMs(1), 30_000);
    assert.equal(backoffMs(2), 60_000);
    assert.equal(backoffMs(3), 120_000);
    assert.equal(backoffMs(4), 300_000);
    assert.equal(backoffMs(5), 900_000);
    assert.equal(backoffMs(6), 1_800_000);
  });

  it("caps at one hour from the seventh attempt on", () => {
    assert.equal(backoffMs(7), 3_600_000);
    assert.equal(backoffMs(19), 3_600_000);
    assert.equal(backoffMs(200), 3_600_000);
  });

  it("returns 0 for a not-yet-attempted item", () => {
    assert.equal(backoffMs(0), 0);
  });
});
```

Add `backoffMs` to the import list in `mailer/queue.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mailer && npm test`
Expected: FAIL — `backoffMs is not a function`

- [ ] **Step 3: Write the implementation**

Append to `mailer/queue.js`:

```js
const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000];
const BACKOFF_CAP_MS = 3_600_000;

export function backoffMs(attempts) {
  if (attempts < 1) return 0;
  return BACKOFF_STEPS_MS[attempts - 1] ?? BACKOFF_CAP_MS;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mailer && npm test`
Expected: PASS — 10 tests passing

- [ ] **Step 5: Commit**

```bash
git add mailer/queue.js mailer/queue.test.js
git commit -m "Add capped exponential backoff schedule"
```

---

### Task 4: Draining the queue

**Files:**
- Modify: `mailer/queue.js`
- Modify: `mailer/queue.test.js`

**Interfaces:**
- Consumes: `queuePaths`, `writeAtomic`, `listQueued`, `readEnvelope`, `backoffMs`
- Produces: `drainOnce(dir, send, opts) -> Promise<{sent, retried, failed, skipped}>` where `send` is `(mail) => Promise<void>` and `opts` is `{ now: number, maxAttempts?: number, log?: {error: Function} }`

- [ ] **Step 1: Write the failing test**

Append to `mailer/queue.test.js`:

```js
const SILENT = { error() {} };

describe("drainOnce", () => {
  it("unlinks an item after a successful send", async () => {
    const box = path.join(dir, "drain-ok");
    await ensureDirs(box);
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "a1");

    const sent = [];
    const result = await drainOnce(box, async (mail) => {
      sent.push(mail);
    }, { now: 1754006400000, log: SILENT });

    assert.equal(result.sent, 1);
    assert.deepEqual(sent, [SAMPLE_MAIL]);
    assert.deepEqual(await listQueued(box), []);
  });

  it("increments attempts and defers the next try on failure", async () => {
    const box = path.join(dir, "drain-retry");
    await ensureDirs(box);
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "a1");

    const result = await drainOnce(box, async () => {
      throw new Error("ECONNREFUSED");
    }, { now: 1754006400000, log: SILENT });

    assert.equal(result.retried, 1);

    const envelope = await readEnvelope(box, "1754006400000-a1.json");
    assert.equal(envelope.attempts, 1);
    assert.equal(envelope.lastError, "ECONNREFUSED");
    assert.equal(
      Date.parse(envelope.nextAttemptAt),
      1754006400000 + 30_000,
    );
  });

  it("skips items whose nextAttemptAt is still in the future", async () => {
    const box = path.join(dir, "drain-early");
    await ensureDirs(box);
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "a1");
    await drainOnce(box, async () => {
      throw new Error("down");
    }, { now: 1754006400000, log: SILENT });

    let calls = 0;
    const result = await drainOnce(box, async () => {
      calls += 1;
    }, { now: 1754006400000 + 10_000, log: SILENT });

    assert.equal(calls, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(await listQueued(box), ["1754006400000-a1.json"]);
  });

  it("moves an item to failed/ once attempts are exhausted", async () => {
    const box = path.join(dir, "drain-exhausted");
    await ensureDirs(box);
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "a1");

    let now = 1754006400000;
    let result;
    for (let i = 0; i < 3; i += 1) {
      result = await drainOnce(box, async () => {
        throw new Error("nope");
      }, { now, maxAttempts: 3, log: SILENT });
      now += 3_600_000;
    }

    assert.equal(result.failed, 1);
    assert.deepEqual(await listQueued(box), []);

    const { failedDir } = queuePaths(box);
    assert.deepEqual(await fs.readdir(failedDir), ["1754006400000-a1.json"]);

    const dead = JSON.parse(
      await fs.readFile(path.join(failedDir, "1754006400000-a1.json"), "utf8"),
    );
    assert.equal(dead.attempts, 3);
    assert.equal(dead.lastError, "nope");
  });

  it("skips a corrupt file without deleting it or aborting the pass", async () => {
    const box = path.join(dir, "drain-corrupt");
    await ensureDirs(box);
    const { queueDir } = queuePaths(box);
    await fs.writeFile(path.join(queueDir, "1754006400000-zz.json"), "{ torn");
    await enqueue(box, SAMPLE_MAIL, 1754006400001, "a1");

    let calls = 0;
    const result = await drainOnce(box, async () => {
      calls += 1;
    }, { now: 1754006400001, log: SILENT });

    assert.equal(calls, 1);
    assert.equal(result.sent, 1);
    assert.equal(result.skipped, 1);
    assert.deepEqual(await listQueued(box), ["1754006400000-zz.json"]);
  });

  it("sends in FIFO order", async () => {
    const box = path.join(dir, "drain-fifo");
    await ensureDirs(box);
    await enqueue(box, { ...SAMPLE_MAIL, subject: "second" }, 1754006400002, "b");
    await enqueue(box, { ...SAMPLE_MAIL, subject: "first" }, 1754006400001, "a");

    const order = [];
    await drainOnce(box, async (mail) => {
      order.push(mail.subject);
    }, { now: 1754006400002, log: SILENT });

    assert.deepEqual(order, ["first", "second"]);
  });
});
```

Add `drainOnce` to the import list in `mailer/queue.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mailer && npm test`
Expected: FAIL — `drainOnce is not a function`

- [ ] **Step 3: Write the implementation**

Append to `mailer/queue.js`:

```js
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

    try {
      await send(envelope.mail);
      await fs.unlink(path.join(queueDir, filename));
      result.sent += 1;
    } catch (err) {
      envelope.attempts += 1;
      envelope.lastError = String((err && err.message) || err);

      if (envelope.attempts >= maxAttempts) {
        // Persist the final attempt count before setting the item aside.
        await writeAtomic(queueDir, envelope.id, envelope);
        await fs.rename(
          path.join(queueDir, filename),
          path.join(failedDir, filename),
        );
        log.error(
          `[mailer] giving up on ${envelope.id} after ${envelope.attempts} attempts: ${envelope.lastError}`,
        );
        result.failed += 1;
      } else {
        envelope.nextAttemptAt = new Date(
          now + backoffMs(envelope.attempts),
        ).toISOString();
        await writeAtomic(queueDir, envelope.id, envelope);
        result.retried += 1;
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mailer && npm test`
Expected: PASS — 16 tests passing

- [ ] **Step 5: Commit**

```bash
git add mailer/queue.js mailer/queue.test.js
git commit -m "Add queue drain pass with retry and failed-item handoff"
```

---

### Task 5: Queue stats for the health endpoint

**Files:**
- Modify: `mailer/queue.js`
- Modify: `mailer/queue.test.js`

**Interfaces:**
- Consumes: `queuePaths`, `listQueued`, `readEnvelope`
- Produces: `stats(dir, now) -> Promise<{queued: number, failed: number, oldestAgeSec: number}>`

- [ ] **Step 1: Write the failing test**

Append to `mailer/queue.test.js`:

```js
describe("stats", () => {
  it("reports zeroes for an empty queue", async () => {
    const box = path.join(dir, "stats-empty");
    await ensureDirs(box);
    assert.deepEqual(await stats(box, 1754006400000), {
      queued: 0,
      failed: 0,
      oldestAgeSec: 0,
    });
  });

  it("counts queued and failed items and ages the oldest", async () => {
    const box = path.join(dir, "stats-full");
    await ensureDirs(box);
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "a1");
    await enqueue(box, SAMPLE_MAIL, 1754006460000, "b2");

    const { failedDir } = queuePaths(box);
    await fs.writeFile(
      path.join(failedDir, "1754006300000-dead.json"),
      JSON.stringify({ id: "1754006300000-dead" }),
    );

    // 412s after the oldest queued item arrived.
    const result = await stats(box, 1754006400000 + 412_000);
    assert.deepEqual(result, { queued: 2, failed: 1, oldestAgeSec: 412 });
  });
});
```

Add `stats` to the import list in `mailer/queue.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mailer && npm test`
Expected: FAIL — `stats is not a function`

- [ ] **Step 3: Write the implementation**

Append to `mailer/queue.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mailer && npm test`
Expected: PASS — 18 tests passing

- [ ] **Step 5: Commit**

```bash
git add mailer/queue.js mailer/queue.test.js
git commit -m "Add queue stats for the health endpoint"
```

---

### Task 6: Wire the queue into the server

**Files:**
- Modify: `mailer/server.js` (header comment, config block, health handler, send path, startup)

**Interfaces:**
- Consumes: `enqueue`, `ensureDirs`, `drainOnce`, `stats` from Tasks 1–5
- Produces: the running service — `POST /api/contact` enqueues, `GET /api/health` reports queue state

This task has no unit test of its own; the queue logic is covered by Tasks 1–5 and the wiring is verified by the manual smoke test in Step 7.

- [ ] **Step 1: Extend the header comment**

In `mailer/server.js`, replace the env documentation block (currently lines 7–17) with:

```js
//   SMTP_HOST   default smtp.gmail.com
//   SMTP_PORT   default 587 (STARTTLS; 465 = implicit TLS)
//   SMTP_USER   the Gmail address that sends (required to actually deliver)
//   SMTP_PASS   a Gmail *app password* (required to actually deliver)
//   MAIL_TO     inbox that receives inquiries      (default: SMTP_USER)
//   MAIL_FROM   From header  (default: "Studio Jus10 <SMTP_USER>")
//   PORT        listen port                        (default: 3000)
//   RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS          (default: 5 per 10 min per IP)
//   QUEUE_DIR       spool root                     (default: /data)
//   QUEUE_POLL_MS   worker tick                    (default: 15000)
//   MAX_ATTEMPTS    tries before giving up         (default: 20)
//   QUEUE_STALE_SEC age at which health goes false (default: 3600)
//
// Submissions are spooled to disk before the response is sent and delivered by
// a background worker (see queue.js), so an SMTP outage or a container
// redeploy cannot lose mail. A 200 means accepted, not yet delivered.
//
// With no SMTP_USER/SMTP_PASS it runs in LOG-ONLY mode: submissions are accepted
// and logged but not delivered — handy for local `docker compose up` without creds.
```

- [ ] **Step 2: Add the import and config**

Add to the imports at the top of `mailer/server.js`:

```js
import { drainOnce, enqueue, ensureDirs, stats } from "./queue.js";
```

Add after the `RATE_LIMIT_WINDOW_MS` line in the config block:

```js
const QUEUE_DIR = env.QUEUE_DIR || "/data";
const QUEUE_POLL_MS = Number(env.QUEUE_POLL_MS || 15_000);
const MAX_ATTEMPTS = Number(env.MAX_ATTEMPTS || 20);
const QUEUE_STALE_SEC = Number(env.QUEUE_STALE_SEC || 3600);
```

- [ ] **Step 3: Replace the health handler**

Replace the `/api/health` block (currently lines 84–86) with:

```js
  if (req.method === "GET" && req.url === "/api/health") {
    return stats(QUEUE_DIR, Date.now()).then(
      (queue) =>
        sendJson(res, 200, {
          ok: queue.failed === 0 && queue.oldestAgeSec <= QUEUE_STALE_SEC,
          mode: hasCreds ? "smtp" : "log-only",
          ...queue,
        }),
      (err) => {
        console.error("[mailer] health check failed:", (err && err.message) || err);
        return sendJson(res, 500, { ok: false, error: "Queue unreadable" });
      },
    );
  }
```

- [ ] **Step 4: Replace the inline send with an enqueue**

Replace the `try { const info = await transport.sendMail({...}) ... }` block (currently lines 144–165) with:

```js
    try {
      await enqueue(
        QUEUE_DIR,
        {
          from: MAIL_FROM,
          to: MAIL_TO,
          replyTo: `${name} <${email}>`,
          subject: `Portfolio inquiry from ${name}`,
          text: `${message}\n\n— ${name} (${email})`,
        },
        Date.now(),
      );
      return sendJson(res, 200, { success: true });
    } catch (err) {
      // The spool is unwritable (volume missing, disk full, bad permissions).
      // This is the only path where the message was genuinely not retained.
      console.error("[mailer] enqueue failed:", (err && err.message) || err);
      return sendJson(res, 503, {
        success: false,
        error: "Could not accept message. Please email directly.",
      });
    }
```

- [ ] **Step 5: Add the worker**

Insert immediately before the `server.listen(...)` call at the bottom of `mailer/server.js`:

```js
// --- delivery worker -------------------------------------------------------
async function deliver(mail) {
  const info = await transport.sendMail(mail);
  if (!hasCreds) {
    console.log(
      "[mailer] LOG-ONLY message:",
      info.message ? info.message.toString() : info,
    );
  }
}

let draining = false;
async function drainTick() {
  if (draining) return; // a slow pass must not overlap the next tick
  draining = true;
  try {
    const result = await drainOnce(QUEUE_DIR, deliver, {
      now: Date.now(),
      maxAttempts: MAX_ATTEMPTS,
    });
    if (result.sent || result.failed) {
      console.log(
        `[mailer] drained: ${result.sent} sent, ${result.retried} retrying, ${result.failed} failed`,
      );
    }
  } catch (err) {
    console.error("[mailer] drain pass failed:", (err && err.message) || err);
  } finally {
    draining = false;
  }
}

await ensureDirs(QUEUE_DIR);
setInterval(drainTick, QUEUE_POLL_MS).unref();
drainTick();
```

- [ ] **Step 6: Update the startup log**

Replace the `server.listen` callback body with:

```js
server.listen(PORT, () => {
  console.log(
    `[mailer] listening on :${PORT} (mode: ${hasCreds ? "smtp" : "log-only"}, to: ${MAIL_TO || "unset"}, queue: ${QUEUE_DIR})`,
  );
});
```

- [ ] **Step 7: Smoke test in log-only mode**

Run from the repo root:

Note the short `QUEUE_POLL_MS`. The startup `drainTick()` fires while the queue
is still empty, so with the 15s default the next pass would not come until long
after this script finishes — the submission would still be sitting in `queue/`
and the run would look like a failure.

```bash
cd mailer && QUEUE_DIR=/tmp/mailer-smoke QUEUE_POLL_MS=1000 PORT=3999 node server.js &
sleep 1
curl -s -X POST localhost:3999/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane","email":"jane@example.com","message":"hello"}'
echo
curl -s localhost:3999/api/health
echo
sleep 3
ls /tmp/mailer-smoke/queue
kill %1
```

Expected: the POST returns `{"success":true}`; health returns `ok:true` with `mode:"log-only"` and `queued:1` (or `queued:0` if a drain pass already landed); the final `ls` prints nothing, because log-only mode delivers and unlinks. `rm -rf "${TMPDIR:-/tmp}"/mailer-smoke` to clean up.

- [ ] **Step 8: Commit**

```bash
git add mailer/server.js
git commit -m "Spool submissions to disk and deliver from a background worker"
```

---

### Task 7: Image, local compose, and CI wiring

**Files:**
- Modify: `mailer/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `package.json` (root `check` script)
- Modify: `mailer/README.md`

**Interfaces:**
- Consumes: the working service from Task 6
- Produces: a local `docker compose up -d --build` that persists the queue across container restarts

- [ ] **Step 1: Copy the runtime files and create the spool directory**

In `mailer/Dockerfile`, update line 13 to copy all runtime source files:

```dockerfile
COPY server.js queue.js ./
```

This ensures both `server.js` and the new `queue.js` (which `server.js` imports) are included in the image.

Then insert immediately before the `USER node` line:

```dockerfile
# A fresh named volume mounted at /data inherits this ownership, so the local
# compose setup needs no host-side preparation.
RUN mkdir -p /data/queue /data/failed && chown -R node:node /data
```

- [ ] **Step 2: Add the volume to local compose**

In `docker-compose.yml`, add a `volumes` key to the `mailer` service and a top-level `volumes` block:

```yaml
  mailer:
    build: ./mailer
    image: studiojus10-mailer
    env_file:
      - path: .env
        required: false
    expose:
      - "3000"
    volumes:
      - mailer-queue:/data
    restart: unless-stopped

volumes:
  mailer-queue:
```

- [ ] **Step 3: Run the mailer tests from the root check script**

In the root `package.json`, change the `check` script to:

```json
    "check": "astro check && biome check src/scripts tests *.js && node scripts/check-raw-colors.mjs && npm --prefix mailer test",
```

- [ ] **Step 4: Document the queue in the mailer README**

Add this section to `mailer/README.md`:

```markdown
## Durability

Submissions are written to `$QUEUE_DIR/queue` (default `/data/queue`) before the
HTTP response is sent, then delivered by a worker that retries with capped
exponential backoff — 30s, 1m, 2m, 5m, 15m, 30m, then hourly, up to
`MAX_ATTEMPTS` (default 20, roughly 14 hours). A `200` therefore means
*accepted*, not *delivered*; the only failure the visitor sees is `503`, which
means the spool itself was unwritable.

Items that exhaust their attempts move to `$QUEUE_DIR/failed` and stay there.
Nothing is deleted automatically — clearing that directory is a manual action.

`GET /api/health` reports `queued`, `failed`, and `oldestAgeSec`, and returns
`ok: false` once anything has failed or the oldest queued item passes
`QUEUE_STALE_SEC` (default 3600). Point uptime monitoring at it.

**The queue needs a persistent volume.** Without one the spool lives in the
container's writable layer and is lost on every redeploy — which is exactly
what this design exists to prevent.
```

- [ ] **Step 5: Verify the whole stack builds and runs**

```bash
docker compose up -d --build
sleep 5
docker compose exec -T mailer sh -c 'ls -la /data'
curl -s localhost:8080/api/health
echo
docker compose down
```

Expected: `/data` contains `queue` and `failed` owned by `node`; health returns JSON with `queued`, `failed`, `oldestAgeSec`.

- [ ] **Step 6: Run the full check**

Run: `npm run check`
Expected: PASS — astro check, biome, the raw-colour check, and 18 mailer tests all pass.

- [ ] **Step 7: Commit**

```bash
git add mailer/Dockerfile mailer/README.md docker-compose.yml package.json
git commit -m "Persist the mailer queue and run its tests in check"
```

---

### Task 8: Production compose on Unraid

**Files:**
- Modify (on the server): `/boot/config/plugins/compose.manager/projects/studiojus10/compose.yaml`

**Interfaces:**
- Consumes: the published `studiojus10-mailer` image built from Tasks 1–7
- Produces: a production mailer whose queue survives WUD redeploys

**STOP — this task modifies a running production server (`root@192.168.1.69`). Do not execute it autonomously. Present the diff, confirm with the user, and only then apply. The preceding tasks must be merged and the image published first, since WUD pulls `:latest` from the registry.**

- [ ] **Step 1: Back up the current compose file**

```bash
ssh root@192.168.1.69 'cp /boot/config/plugins/compose.manager/projects/studiojus10/compose.yaml \
  /boot/config/plugins/compose.manager/projects/studiojus10/compose.yaml.bak-before-queue'
```

- [ ] **Step 2: Create the spool directory**

```bash
ssh root@192.168.1.69 'mkdir -p /mnt/user/appdata/studiojus10-mailer/queue \
  /mnt/user/appdata/studiojus10-mailer/failed && \
  chown -R 99:100 /mnt/user/appdata/studiojus10-mailer && \
  ls -la /mnt/user/appdata/studiojus10-mailer'
```

Expected: both directories exist, owned `nobody:users`.

- [ ] **Step 3: Add the volume and uid to the mailer service**

Edit the `mailer:` service in `/boot/config/plugins/compose.manager/projects/studiojus10/compose.yaml` so it reads:

```yaml
  # Contact-form relay. nginx in the web container proxies /api/ to
  # http://mailer:3000, so this service must keep the name "mailer".
  # Never published to the host: reachable only on the compose network.
  #
  # /data is the disk spool: submissions land there before the visitor gets a
  # response, so an SMTP outage or a WUD redeploy cannot lose mail. Runs as
  # 99:100 (nobody:users) to match appdata ownership — the image's own USER is
  # node (uid 1000), which would not be able to write the bind mount.
  mailer:
    image: forge.daveynet.xyz/davey/studiojus10-mailer:latest
    container_name: studiojus10-mailer
    restart: unless-stopped
    user: "99:100"
    env_file:
      - .env
    expose:
      - "3000"
    volumes:
      - /mnt/user/appdata/studiojus10-mailer:/data
    labels:
      - wud.watch=true
      - wud.watch.digest=true
      - wud.trigger.include=docker.redeploy
```

- [ ] **Step 4: Recreate the stack**

```bash
ssh root@192.168.1.69 'cd /boot/config/plugins/compose.manager/projects/studiojus10 && \
  docker compose -f compose.yaml -f compose.override.yaml up -d'
```

- [ ] **Step 5: Verify the queue is live**

```bash
ssh root@192.168.1.69 'docker exec studiojus10-mailer sh -c "ls -la /data && id" && \
  docker logs --tail 5 studiojus10-mailer'
```

Expected: `/data` shows `queue` and `failed`; `id` reports `uid=99 gid=100`; the startup log ends with `queue: /data`.

- [ ] **Step 6: Verify end to end through nginx**

```bash
ssh root@192.168.1.69 'curl -s localhost:6806/api/health'
```

Expected: `{"ok":true,"mode":"smtp","queued":0,"failed":0,"oldestAgeSec":0}`

- [ ] **Step 7: Confirm durability across a redeploy**

```bash
ssh root@192.168.1.69 'docker restart studiojus10-mailer && sleep 5 && \
  docker exec studiojus10-mailer ls /data'
```

Expected: `queue` and `failed` still present — the bind mount survived.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Storage layout, write protocol | 1 |
| Envelope shape | 1 |
| Worker scan, `.partial` ignored, corrupt self-heal | 2, 4 |
| Backoff schedule | 3 |
| Unconditional retries, `failed/` handoff | 4 |
| Failure retention (no sweeper) | 4 (absence of one), 7 (documented) |
| Health endpoint | 5, 6 |
| Request path incl. 503 | 6 |
| Log-only mode | 6 |
| Configuration table | 6 |
| Code structure split | 1–6 |
| Deployment: local named volume | 7 |
| Deployment: prod bind mount + uid | 8 |
| Testing: 10 listed cases | 1–5 (18 assertions covering all 10) |
| Out of scope: rate limiter | untouched by design |

No gaps.

**Placeholder scan:** No TBD/TODO. Every code step shows complete code; every command shows expected output.

**Type consistency:** `queuePaths`, `ensureDirs`, `makeId`, `writeAtomic`, `enqueue`, `listQueued`, `readEnvelope`, `backoffMs`, `drainOnce`, `stats` are named identically in their defining task, their tests, and `server.js`. `drainOnce` returns `{sent, retried, failed, skipped}` — the same four keys are read in Task 6's log line. `stats` returns `{queued, failed, oldestAgeSec}` — spread directly into the health response in Task 6.
