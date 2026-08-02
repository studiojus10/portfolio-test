# Durable disk queue for the contact-form mailer

**Date:** 2026-08-01
**Status:** Approved, ready for planning

## Problem

`mailer/server.js` sends inline. `transport.sendMail()` is awaited inside the
request handler; when it throws, the handler returns 502 and the submission is
gone. Any SMTP outage — Gmail rejecting a burst, a DNS blip, an expired app
password — silently costs an inquiry.

The container makes this worse. What's-Up-Docker watches the stack on a
5-minute cron with `wud.trigger.include=docker.redeploy`, so `studiojus10-mailer`
is destroyed and recreated whenever a new image digest lands. Nothing held in
memory survives. Durability has to reach disk.

## Approach

Spool-always. A valid submission is written to disk *before* the response is
sent; a background worker drains the queue. Chosen over spool-on-failure
(which loses mail if the process dies between accept and send, and needs two
divergent send paths) and over an embedded Postfix MTA (correct, but a far
heavier image and config surface than a portfolio contact form justifies).

The tradeoff accepted: `200` now means *accepted*, not *delivered*. For this
form that is the honest answer anyway — the previous `200` only meant Gmail had
accepted the handoff.

## Storage

One volume at `/data`, two directories:

```
/data/queue/    <id>.json           pending delivery
/data/queue/    <id>.json.partial   mid-write, ignored by the worker
/data/failed/   <id>.json           attempts exhausted
```

`<id>` is `<epochMillis>-<6 hex chars>`, so lexical filename order is arrival
order.

### Write protocol

1. Serialise the envelope to `/data/queue/<id>.json.partial`
2. `fsync` the file
3. `rename()` to `/data/queue/<id>.json`
4. `fsync` the `queue/` directory so the rename itself is durable

The partial file is staged **inside `queue/`**, not in a sibling `tmp/`
directory. This matters on the deployment target: `/mnt/user/appdata` is
Unraid's shfs FUSE union, and `rename()` across it is only atomic when source
and destination resolve to the same underlying disk. `appdata` is configured
`shareUseCache="prefer"` on the `nvme_cache` pool with `disk1` as spillover, so
a cross-disk layout is possible in principle. A same-directory rename is a
straight passthrough to whichever disk holds that directory and cannot go
cross-device, which removes the question entirely.

The worker globs `*.json` and never sees `*.partial`.

### Envelope

The *rendered* mail is stored, not the raw form fields, so a later change to
the subject line or body template cannot corrupt or reinterpret already-queued
items.

```json
{
  "id": "1754049600000-a3f9c1",
  "receivedAt": "2025-08-01T12:00:00.000Z",
  "attempts": 2,
  "nextAttemptAt": "2025-08-01T12:01:30.000Z",
  "lastError": "ECONNREFUSED",
  "mail": {
    "from": "Studio Jus10 <studiojus10@gmail.com>",
    "to": "studiojus10@gmail.com",
    "replyTo": "Jane Doe <jane@example.com>",
    "subject": "Portfolio inquiry from Jane Doe",
    "text": "…\n\n— Jane Doe (jane@example.com)"
  }
}
```

## Request path

Validation is unchanged: honeypot short-circuit, per-IP rate limit, then the
name / email / message checks. Only the tail of the handler changes.

| Outcome | Response |
|---|---|
| Valid, enqueued | `200 {"success":true}` |
| Honeypot tripped | `200 {"success":true}` (unchanged; nothing written) |
| Validation failed | `400` (unchanged) |
| Rate limited | `429` (unchanged) |
| **Enqueue write failed** | **`503`** — volume unmounted, disk full, permissions |

`503` is the one new response. It is the only case where the visitor must be
told to email directly, because it is the only case where the message was
genuinely not retained.

## Worker

A `setInterval` every `QUEUE_POLL_MS` (default 15000), guarded by a `draining`
flag so a slow pass cannot overlap the next tick. `unref()` so it never holds
the process open.

Each pass:

1. Read `/data/queue`, keep `*.json`, sort by filename (FIFO)
2. Skip any item whose `nextAttemptAt` is in the future
3. Send serially — one SMTP conversation at a time, no parallel fan-out at Gmail
4. Success → `unlink`
5. Failure → `attempts++`, set `lastError` and `nextAttemptAt`, rewrite via the
   same atomic protocol
6. `attempts >= MAX_ATTEMPTS` → move to `/data/failed/`, `console.error`

**Backoff schedule.** The delay is indexed by the *post-increment* `attempts`
value — after the first failure `attempts` is 1 and the next try is 30s later.
Delays are 30s, 1m, 2m, 5m, 15m, 30m, then 1h for every attempt from the
seventh onward. With `MAX_ATTEMPTS` at 20 that is 19 waits totalling
roughly 13h 54m before an item is set aside.

**Retries are unconditional, including SMTP 5xx.** Deliberate: the realistic
permanent failures here are a bad app password or a wrong `MAIL_TO`, both of
which are operator-fixable in `.env`. Retrying means the queue drains itself
once the config is corrected, instead of having discarded the mail on the
first hard rejection.

**Malformed files self-heal.** A file that fails to parse as JSON is logged and
skipped, never deleted. A torn write left by a crash or an unexpected
cross-device rename resolves on a later pass rather than costing a message.

## Failure retention

Nothing is deleted automatically. `/data/failed/` grows without bound by
design — auto-expiring undelivered mail would defeat the point of the feature.
Clearing it is a manual operator action. The health endpoint surfaces the
count so it does not accumulate unnoticed.

## Health endpoint

`GET /api/health` gains queue visibility:

```json
{
  "ok": true,
  "mode": "smtp",
  "queued": 3,
  "failed": 0,
  "oldestAgeSec": 412
}
```

`queued` and `failed` are file counts in their respective directories.
`oldestAgeSec` is measured from the `receivedAt` of the oldest item still in
`queue/`, and is `0` when the queue is empty — it reports how long mail has
been undelivered, not how long since the last attempt.

`ok` is `false` when `failed > 0`, or when `oldestAgeSec` exceeds
`QUEUE_STALE_SEC` (default 3600). That makes the endpoint directly usable as an
uptime-monitor target without any further work.

## Log-only mode

Unchanged in behaviour. With no `SMTP_USER`/`SMTP_PASS` the mailer still
enqueues; the worker logs each item and unlinks it. Local `docker compose up`
with no credentials keeps working exactly as it does today.

## Deployment

**Production** — Unraid, Compose Manager project `studiojus10`, at
`/boot/config/plugins/compose.manager/projects/studiojus10/compose.yaml`:

```yaml
  mailer:
    user: "99:100"
    volumes:
      - /mnt/user/appdata/studiojus10-mailer:/data
```

`mailer/Dockerfile` ends `USER node` (uid 1000) while `appdata` is
`nobody:users` (99:100). Overriding to `99:100` keeps the appdata tree
uniformly owned like every other stack on that host, and avoids a
`chown 1000:1000` that a future recreate against a fresh directory would
silently undo. The mailer writes nowhere but `/data`, so the uid override is
otherwise inert.

WUD is safe for this: its `prune` option calls `pruneImages()` and only removes
superseded image tags, and `cloneContainer` copies `HostConfig` wholesale, so
the bind mount is carried across every redeploy.

**Local** — the repo's `docker-compose.yml` uses a named volume instead, so
`docker compose up -d --build` needs no host preparation:

```yaml
  mailer:
    volumes: [mailer-queue:/data]
volumes:
  mailer-queue:
```

The image creates `/data/queue` and `/data/failed` so a fresh named volume
inherits sane ownership, and the mailer also `mkdir -p`s both at startup so a
newly-created bind-mount target works without manual setup.

## Code structure

`mailer/server.js` is 174 lines and this roughly doubles it. Split:

- **`mailer/queue.js`** — envelope construction, atomic write, directory scan,
  backoff computation, the drain pass, and queue stats. No HTTP.
- **`mailer/server.js`** — HTTP handling and validation, calling `enqueue()` and
  reading stats for `/api/health`.

The boundary is what makes the queue testable without standing up a server.

## Configuration

New environment variables, all optional:

| Variable | Default | Meaning |
|---|---|---|
| `QUEUE_DIR` | `/data` | Root of the spool |
| `QUEUE_POLL_MS` | `15000` | Worker tick interval |
| `MAX_ATTEMPTS` | `20` | Attempts before moving to `failed/` |
| `QUEUE_STALE_SEC` | `3600` | Age at which health reports `ok: false` |

Existing SMTP and rate-limit variables are unchanged.

## Testing

`mailer/` has no test runner today; the repo root uses Playwright for the site.
Queue logic gets unit tests under `node --test`, which is built into Node and
preserves the sidecar's zero-runtime-dependency character. Wire `npm test` in
`mailer/package.json`, and add it to the root `check` script.

Coverage, against a temp directory and a stub transport:

1. `enqueue()` writes a parseable envelope and leaves no `.partial` behind
2. A `.partial` file present in `queue/` is ignored by the scan
3. A successful drain unlinks the file
4. A failed drain increments `attempts` and pushes `nextAttemptAt` out
5. Items with a future `nextAttemptAt` are skipped
6. Backoff follows the documented schedule and caps at 1h
7. Exhausting `MAX_ATTEMPTS` moves the file to `failed/`
8. A corrupt JSON file is skipped, not deleted, and does not abort the pass
9. Scan order is FIFO by filename
10. Stats report `queued`, `failed`, and `oldestAgeSec` correctly

## Out of scope

The per-IP rate limiter (`server.js:53`) remains in-memory and still resets on
every redeploy. It is the same class of durability gap in the same file, but
abuse limits resetting is a much smaller problem than lost mail, and folding it
in would widen this change for little gain. Recorded here as a known
limitation.
