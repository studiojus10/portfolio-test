import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  backoffMs,
  drainOnce,
  enqueue,
  ensureDirs,
  listQueued,
  makeId,
  queuePaths,
  readEnvelope,
  stats,
} from "./queue.js";

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

  it("counts a successful send as sent, logs distinctly, and never retries it when cleanup fails afterwards", async () => {
    const box = path.join(dir, "drain-cleanup-fail");
    await ensureDirs(box);
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "a1");
    const { queueDir, failedDir } = queuePaths(box);
    const filePath = path.join(queueDir, "1754006400000-a1.json");

    const sentCalls = [];
    const errors = [];
    const log = { error: (msg) => errors.push(msg) };

    // The send stub deletes the spool file out from under the drain, between
    // readEnvelope and the post-send fs.unlink. The subsequent unlink then
    // fails with ENOENT, and the failed/ rename fallback fails the same way
    // for the same reason (the source is already gone). ENOENT is the kernel
    // reporting "this path does not exist" — a check that runs before, and
    // independently of, permission bits, so it fires identically at uid 0
    // and uid 1000. A chmod-based denial does not: root bypasses DAC checks
    // entirely, which is exactly why the previous version of this test (which
    // used fs.chmod(queueDir, 0o555) to force EACCES) passed vacuously under
    // the root-run CI container — the unlink it expected to fail, didn't.
    const result = await drainOnce(box, async (mail) => {
      sentCalls.push(mail);
      await fs.unlink(filePath);
    }, { now: 1754006400000, log });

    assert.equal(sentCalls.length, 1);
    assert.equal(result.sent, 1);
    assert.equal(result.retried, 0);
    assert.equal(result.failed, 0);

    assert.ok(
      errors.some(
        (m) =>
          m.includes("1754006400000-a1") &&
          m.includes("DELIVERED") &&
          m.includes("ENOENT"),
      ),
      `expected a delivered-but-not-dequeued log mentioning ENOENT, got: ${JSON.stringify(errors)}`,
    );

    // Nothing was ever (re)persisted for this item: not in queueDir, and not
    // in failedDir. The retry branch is the only code path that would write
    // envelope.attempts/lastError back to disk — reaching it would recreate
    // this file via writeAtomic(). Its continued absence from both
    // directories is exactly the proof that the failure took the delivered
    // branch, never the retry branch.
    assert.equal(await readEnvelope(box, "1754006400000-a1.json"), null);
    assert.deepEqual(await listQueued(box), []);
    assert.deepEqual(await fs.readdir(failedDir), []);
  });

  it("isolates a per-item state-persistence failure so the pass continues instead of aborting", async () => {
    const box = path.join(dir, "drain-write-failure-isolation");
    await ensureDirs(box);
    // Both items share the same `now` so both have nextAttemptAt <= now and
    // are actually attempted this pass — b2 one tick later would be skipped
    // by the "not due yet" check before ever reaching send, which would
    // prove nothing about isolation.
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "a1");
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "b2");
    const { queueDir } = queuePaths(box);

    // writeAtomic() stages its write at `<id>.json.partial` by opening that
    // path with fs.open(path, "w"). Pre-creating that exact path as a
    // directory, for item a1 only, makes the open fail with EISDIR — the
    // kernel refusing to open a directory for writing, a check that has
    // nothing to do with permission bits. It fires identically at uid 0 and
    // uid 1000, unlike the previous fs.chmod(queueDir, 0o555) fault, which
    // root bypasses outright (root ignores DAC permission checks), so the
    // old version of this test asserted on a write failure that never
    // happened when CI ran as root.
    await fs.mkdir(path.join(queueDir, "1754006400000-a1.json.partial"));

    const result = await drainOnce(box, async () => {
      throw new Error("smtp down");
    }, { now: 1754006400000, log: SILENT });

    // Item a1: send fails (no fault there), so it takes the retry branch,
    // whose writeAtomic() hits EISDIR on the pre-created directory. Without
    // per-item isolation that throw would escape drainOnce entirely and item
    // b2 — behind a1 in FIFO order — would never even be read. With
    // isolation, the outer catch turns it into a skip and the pass moves on.
    assert.equal(result.skipped, 1);
    // Item b2: untouched by the fault, so send fails and writeAtomic
    // succeeds — an ordinary retry, proving the pass actually reached and
    // processed the item behind the failing one rather than stopping short.
    assert.equal(result.retried, 1);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);

    const b2 = await readEnvelope(box, "1754006400000-b2.json");
    assert.equal(b2.attempts, 1);
    assert.equal(b2.lastError, "smtp down");

    // a1's in-memory attempts bump was never persisted (the write that would
    // have done so is what failed), so it stays at attempts: 0 and eligible
    // for the very next pass rather than being lost.
    const a1 = await readEnvelope(box, "1754006400000-a1.json");
    assert.equal(a1.attempts, 0);
    assert.deepEqual(await listQueued(box), [
      "1754006400000-a1.json",
      "1754006400000-b2.json",
    ]);
  });

  it("keys retry state off the on-disk filename, not the envelope's own id field, when they disagree", async () => {
    const box = path.join(dir, "drain-id-filename-mismatch");
    await ensureDirs(box);
    await enqueue(box, SAMPLE_MAIL, 1754006400000, "orig");
    const { queueDir } = queuePaths(box);

    // Model an operator renaming the file while triaging the spool by hand:
    // the on-disk filename no longer matches the envelope's `id` field, but
    // the file's JSON content (including `id: "1754006400000-orig"`) is
    // untouched.
    await fs.rename(
      path.join(queueDir, "1754006400000-orig.json"),
      path.join(queueDir, "renamed-by-operator.json"),
    );

    const result = await drainOnce(box, async () => {
      throw new Error("still down");
    }, { now: 1754006400000, log: SILENT });

    assert.equal(result.retried, 1);

    // Exactly one file must exist: the renamed one, updated in place. If
    // persistence is keyed off envelope.id instead, this would instead find
    // two files — the untouched "renamed-by-operator.json" (still
    // attempts: 0, so eligible again next pass) and a brand-new
    // "1754006400000-orig.json" that nothing else ever looks at.
    assert.deepEqual(await listQueued(box), ["renamed-by-operator.json"]);

    const envelope = await readEnvelope(box, "renamed-by-operator.json");
    assert.equal(envelope.attempts, 1);
    assert.equal(envelope.lastError, "still down");
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

describe("Dockerfile regression guard", () => {
  // The destination arg need not be "./" — match whatever the trailing
  // whitespace-separated token is so a destination change (e.g. "/app/")
  // doesn't quietly stop this from matching any COPY line at all.
  function extractCopiedFiles(dockerfileText) {
    const copyLines = dockerfileText
      .split("\n")
      .filter((line) => line.trim().startsWith("COPY"));
    const copiedFiles = new Set();
    for (const line of copyLines) {
      const match = line.match(/^COPY\s+(.+)\s+\S+\s*$/);
      if (match) {
        const files = match[1].split(/\s+/);
        for (const f of files) {
          copiedFiles.add(f);
        }
      }
    }
    return copiedFiles;
  }

  // A specifier shape this regex fails to recognize is silently dropped from
  // requiredFiles, and the guard goes green with that module missing from
  // the image — so every relative-import shape server.js might use must be
  // covered: static `from "./x"`, dynamic `import("./x")`, `require("./x")`,
  // and the bare side-effect `import "./x"`. The bare branch must be tried
  // after the `import\s*\(` branch in the alternation — both start with the
  // literal "import", and only one can win at a given position.
  const importRegex =
    /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([./][^"']+)["']/g;

  function extractRequiredFiles(sourceText) {
    importRegex.lastIndex = 0;
    const imports = [];
    let m;
    while ((m = importRegex.exec(sourceText)) !== null) {
      imports.push(m[1]);
    }
    // Absolute specifiers (leading "/") aren't files a relative COPY
    // destination would place, so only "."-prefixed ones are in scope.
    const relativeImports = imports.filter((spec) => spec.startsWith("."));
    return new Set(relativeImports.map((spec) => spec.replace(/^\.\//, "")));
  }

  it("detects every relative-import form, including the bare side-effect form, without double-counting a mixed static+bare file", () => {
    // Regression fixture for the exact hole a reviewer found: a bare
    // side-effect import mixed with a recognised `from` import used to let
    // the bare one vanish silently instead of tripping the empty-set guard.
    const source = [
      'import { enqueue } from "./queue.js";',
      'import "./sideEffectSetup.js";',
      'import("./dynamic.js");',
      'import ( "./dynamicSpaced.js" );',
      'require("./cjs.js");',
      'require ( "./cjsSpaced.js" );',
    ].join("\n");

    assert.deepEqual(
      [...extractRequiredFiles(source)].sort(),
      [
        "cjs.js",
        "cjsSpaced.js",
        "dynamic.js",
        "dynamicSpaced.js",
        "queue.js",
        "sideEffectSetup.js",
      ],
    );
  });

  it("resolves a named import's `from` clause to exactly one required file, not two", () => {
    // `import { enqueue } from "./queue.js"` must be claimed by the `from`
    // branch alone — after `import\s+` comes `{`, not a quote, so the bare
    // branch cannot also match here.
    const required = extractRequiredFiles(
      'import { enqueue } from "./queue.js";',
    );
    assert.deepEqual([...required], ["queue.js"]);
  });

  // Walks the relative-import graph starting from entryFilename inside
  // baseDir, following each discovered local file's own relative imports in
  // turn, until no new local file turns up. A direct-only check (server.js's
  // own imports alone) misses a module that a future queue.js — or anything
  // else server.js pulls in — imports on its own: the guard stays green,
  // the build stays green, and the container dies with
  // ERR_MODULE_NOT_FOUND on start. `visited` makes a cyclic import (A -> B
  // -> A) terminate instead of looping forever.
  async function collectRequiredFilesTransitively(baseDir, entryFilename) {
    const required = new Set();
    const visited = new Set();
    const toVisit = [entryFilename];

    while (toVisit.length > 0) {
      const current = toVisit.pop();
      if (visited.has(current)) continue;
      visited.add(current);

      const sourceText = await fs.readFile(
        path.join(baseDir, current),
        "utf8",
      );
      for (const imported of extractRequiredFiles(sourceText)) {
        required.add(imported);
        if (!visited.has(imported)) toVisit.push(imported);
      }
    }

    return required;
  }

  it("walks transitive relative imports, not just the entry file's own", async () => {
    // Fixture: entry -> mid -> leaf. entry.js does not import leaf.js
    // directly, so a direct-only check would miss it — exactly the hole a
    // future queue.js importing a new local module would fall into.
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "mailer-dockerfile-guard-test-"),
    );
    try {
      await fs.writeFile(
        path.join(tmp, "entry.js"),
        'import { a } from "./mid.js";\n',
      );
      await fs.writeFile(
        path.join(tmp, "mid.js"),
        'import { b } from "./leaf.js";\n',
      );
      await fs.writeFile(path.join(tmp, "leaf.js"), "export const b = 1;\n");

      const required = await collectRequiredFilesTransitively(tmp, "entry.js");
      assert.deepEqual([...required].sort(), ["leaf.js", "mid.js"]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("terminates on a cyclic relative import instead of looping forever", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "mailer-dockerfile-guard-cycle-test-"),
    );
    try {
      await fs.writeFile(path.join(tmp, "a.js"), 'import "./b.js";\n');
      await fs.writeFile(path.join(tmp, "b.js"), 'import "./a.js";\n');

      const required = await collectRequiredFilesTransitively(tmp, "a.js");
      assert.deepEqual([...required].sort(), ["a.js", "b.js"]);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("ensures every module transitively reachable from server.js by relative import is copied into the image", async () => {
    // There's no Docker daemon in CI or local dev to build the image and
    // notice a missing COPY — a module left out only surfaces as
    // ERR_MODULE_NOT_FOUND when the container actually starts, in
    // production. This static text check is the only thing standing in for
    // that build. The walk is transitive: it must also catch a module that
    // queue.js (or anything else in the graph) imports on its own, not just
    // server.js's own direct imports.
    const dockerfile = await fs.readFile(
      path.join(import.meta.dirname, "Dockerfile"),
      "utf8",
    );
    const copiedFiles = extractCopiedFiles(dockerfile);

    const requiredFiles = await collectRequiredFilesTransitively(
      import.meta.dirname,
      "server.js",
    );

    // If extraction ever finds nothing, that must read as "this regex broke"
    // and fail loudly — never as "server.js has no local dependencies", which
    // would let the per-file loop below pass by running zero times.
    assert.ok(
      requiredFiles.size > 0,
      "found zero relative imports reachable from server.js — the " +
        "extraction regex or walk is broken, not proof the Dockerfile is fine",
    );

    for (const file of requiredFiles) {
      assert.ok(
        copiedFiles.has(file),
        `COPY directive does not include ${file}, which is imported ` +
          "(directly or transitively) from server.js",
      );
    }
  });
});

describe("uid-independence guard", () => {
  it("has no chmod-based fault injection left in this file", async () => {
    // Forgejo CI runs this test suite as root. Root bypasses POSIX (DAC)
    // permission checks outright, so fs.chmod(dir, 0o555) followed by an
    // operation that "should" now fail with EACCES denies nothing: the
    // operation quietly succeeds, the code path under test never runs, and
    // the assertion built on top of it passes for a reason unrelated to what
    // it claims to prove. Two tests in this file relied on exactly that
    // (chmod'ing queueDir to force unlink/writeAtomic failures) and passed
    // vacuously in CI while failing the same assertions under
    // `unshare -r node --test`, which simulates uid 0 without needing real
    // root. They were rewritten to use faults the kernel enforces regardless
    // of uid (ENOENT, EISDIR). This guard exists so a future permission-based
    // fault, added and verified only as a non-root developer, fails loudly
    // here instead of shipping green and silently no-op'ing in CI.
    //
    // Comments (including this one) are stripped before scanning, so prose
    // that names "chmod" while explaining this history — on this line and
    // the two above — can't trip the guard on itself. What's checked is
    // actual code: a call shaped like `chmod(` or `.chmod(` outside a
    // comment. That's uid-independent too — it's a static text check, not a
    // filesystem operation, so it behaves identically for every reader of
    // this file no matter which uid runs it.
    const sourceText = await fs.readFile(import.meta.filename, "utf8");
    const withoutComments = sourceText
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    assert.ok(
      !/\bchmod\s*\(/.test(withoutComments),
      "found a permission-changing call outside a comment in " +
        "queue.test.js — permission-based fault injection is vacuous " +
        "under root, which is how Forgejo CI runs this suite; use a " +
        "uid-independent fault instead (e.g. ENOENT from deleting the " +
        "target file, or EISDIR from pre-creating the target path as a " +
        "directory)",
    );
  });
});
