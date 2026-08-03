# Accept submissions in nginx when the mailer is down, and add healthchecks

**Date:** 2026-08-02
**Status:** Approved, ready for planning
**Builds on:** [2026-08-01-mailer-disk-queue-design.md](2026-08-01-mailer-disk-queue-design.md)

## Problem

The disk queue makes the mailer survive an SMTP outage: a submission is spooled
before the visitor gets a response, then retried for ~14 hours. It cannot help
when the **mailer container itself** is down, because the mailer is what writes
the spool.

Observed in production on 2026-08-02:

```
07:22:52  POST /api/contact  200          accepted, later delivered
07:23:33  POST /api/contact  502          nginx: "mailer could not be resolved"
07:30:42  POST /api/contact  200          accepted, drained 9s later
07:31:24  POST /api/contact  502          nginx: "mailer could not be resolved"
```

The two 502s never reached any application code. nginx could not resolve the
`mailer` upstream, so the request died at the proxy and the submission was
lost.

Three things cause that state, and only the first is brief:

- A What's-Up-Docker redeploy of the mailer image — 1–2 seconds, on every push
- A crash-looping mailer. `ensureDirs` is deliberately fail-fast at startup, so
  an unwritable `/data` exits the process rather than limping. Good for
  surfacing the fault, but it means a broken mount keeps the mailer down
  indefinitely while the site stays up.
- A manual `docker stop`

There is also no container healthcheck on either service, so neither Docker nor
the Unraid UI can distinguish "running" from "actually serving".

## Approach

Move acceptance into nginx. If the website is up, submissions are accepted —
the mailer becomes purely a drainer that can be down indefinitely without
costing mail.

`/api/contact` is handled by an njs `js_content` handler that proxies to the
mailer via `r.subrequest()`. When the mailer answers, its response passes
through untouched. When it cannot answer, njs writes the submission to disk and
returns success.

Chosen over an `error_page 502 = @spool` fallback: `r.requestBuffer` is only
populated while the body is in memory and has not been spilled to a temp file,
and its availability inside a location reached by internal redirect after a
failed proxy attempt is not something the documentation guarantees. Handling
`/api/contact` as the primary `js_content` handler removes that question — the
body is read before anything else happens.

Also considered and rejected:

- **`client_body_in_file_only on`** — no module needed, but nginx would persist
  *every* request body including successful ones, with no envelope, no id, and
  no way to tell which the mailer had already taken. Duplicate sends.
- **Two mailer replicas** — the queue has no claim mechanism; the whole-branch
  review demonstrated two concurrent drainers each deliver every queued item.
  Would require an atomic claim before it is safe.
- **Client-side retry alone** — covers the 1–2s redeploy window, which is the
  common case, but nothing longer.

## Verified constraints

Everything below was confirmed empirically before this design was accepted, on
the deployment host:

| Claim | Evidence |
|---|---|
| njs is installable on `nginx:alpine` | `apk add --no-cache nginx-module-njs` on nginx 1.31.3 produced `/etc/nginx/modules/ngx_http_js_module.so` |
| `load_module` needs explicit placement | The image's `nginx.conf` has no `modules-enabled` include and no existing `load_module` line |
| Healthchecks can use `wget` | Both `nginx:alpine` and `node:26-alpine` ship `/usr/bin/wget`; neither has `curl` |
| `r.subrequest()` can POST a body | Documented: `r.subrequest(uri, {method, body})`, resolves to `{status, responseText, headersOut}` |
| njs can write files | `fs.writeFileSync` since njs 0.1.15, `fs.renameSync` since 0.3.4 |
| `r.requestText` is available | Documented for `js_content`, given the body stays in memory |

## Request routing

```nginx
js_import spool from /etc/nginx/njs/spool.js;
limit_req_zone $binary_remote_addr zone=contact:1m rate=30r/m;

location = /api/contact {
  limit_req zone=contact burst=5 nodelay;
  client_max_body_size 16k;
  client_body_buffer_size 16k;    # keep the body in memory for r.requestText
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

location /api/ {
  # unchanged — still a plain proxy, still serves /api/health
}
```

`location = /api/contact` is an exact match, so it wins over the `/api/` prefix
without reordering anything else.

`client_max_body_size 16k` bounds what njs will hold in memory. The mailer's own
`MAX_BODY_BYTES` is 10000, so a body between 10k and 16k is accepted by nginx
and rejected by the mailer with 413 — which passes through as a real answer.

## The njs handler

```
handle(r):
  reply = await r.subrequest('/internal/mailer', {method: 'POST', body: r.requestText})

  if reply and reply.status < 500:
      r.return(reply.status, reply.responseText)   # the mailer answered
      return

  # mailer unreachable, or answered 5xx
  write /data/inbox/<id>.json
  r.return(200, '{"success":true}')

  on write failure:
      r.error(...)
      r.return(503, '{"success":false,"error":"..."}')
```

**The `< 500` split is the core rule.** A 400, 413, or 429 from the mailer is a
real judgement about the submission and must reach the visitor unchanged.
Spooling a message the mailer already rejected would deliver spam the honeypot
caught, or resurrect a rate-limited flood. Only "the mailer could not answer"
triggers the fallback.

A subrequest that throws (upstream unresolvable — the exact production failure)
is treated the same as a 5xx. So is a reply with a missing or zero `status`:
the condition is written as "answered with a status below 500", and anything
that does not positively satisfy it falls through to the spool. Failing toward
retaining the message is the right direction for every ambiguous case.

The mailer's own `503` — its spool write failed — is a 5xx, so nginx tries to
write instead. Both write to the same volume, so if the volume is the problem
nginx fails too and returns 503. That is correct: the visitor is told only when
the message genuinely was not retained.

### What nginx writes

**Raw submitted fields, not a finished envelope.**

```json
{
  "receivedAt": "2026-08-02T07:23:33.000Z",
  "ip": "203.0.113.7",
  "body": { "name": "...", "email": "...", "message": "...", "_gotcha": "" }
}
```

njs does not validate, does not apply the honeypot rule, and does not construct
the mail. It cannot: `MAIL_TO` and `MAIL_FROM` live in the mailer's `.env` and
are not visible to the web container. Duplicating the validation rules in a
second language, in a second image, is the maintenance hazard this avoids —
the mailer stays the single authority on what a valid submission is and what
the resulting mail looks like.

The id is `<epochMillis>-<first 6 of $request_id>`, keeping the same sortable
shape as queue filenames. `$request_id` is nginx's own random 32-hex value, so
no randomness source is needed in njs.

The write uses the same protocol as `writeAtomic`: write `<id>.json.partial`,
then `renameSync` to `<id>.json` in the same directory. Same-directory rename
cannot go cross-device, which is what the original design established for the
shfs union mount.

## Promotion in the mailer

`promoteInbox(dir, now)` runs at the top of each drain tick, before
`drainOnce`. For each `*.json` in `inbox/`:

1. Parse. Unparseable → log and skip, never delete. A torn write resolves on a
   later tick, exactly as `readEnvelope` already behaves.
2. Apply the honeypot rule. Tripped → unlink silently. It was never mail.
3. Validate name / email / message. Invalid → move to `failed/`. Bots and
   broken clients are visible rather than silently dropped, and the operator
   can see what arrived.
4. Valid → `enqueue()` the rendered mail, then unlink the inbox file.

**Order matters: enqueue before unlink.** A crash between them re-promotes the
same submission and sends it twice; a crash the other way loses it. Duplicate
beats loss, consistent with the at-least-once guarantee the queue already makes.

Validation currently lives inline in the request handler. It moves into a shared
function both the handler and the promoter call, so the two paths cannot drift.

## Rate limiting

`limit_req` in nginx replaces the mailer's in-memory limiter as the primary
control, at 30 requests/minute per IP with a burst of 5.

This closes a gap recorded as out-of-scope in the queue design: the in-memory
counter resets on every container recreation, and WUD recreates the mailer on
every image push. It also protects the fallback path — without it, a bot could
fill `inbox/` unboundedly while the mailer is down, since njs does no
validation.

The mailer keeps its own limiter as defence in depth. It is unreachable from
outside the compose network, but the cost of keeping it is zero.

## Ownership

The spool is owned `99:100`. nginx workers run as `user nginx` (uid 101 in
alpine), so uid 101 must be able to create files in `inbox/` and uid 99 must be
able to unlink them.

- `addgroup nginx users` in the web image puts the worker in gid 100
- `inbox/` is mode 775, owned `99:100`

nginx writes via the group bit; the mailer unlinks as the directory's owner
(unlink permission comes from the directory, not the file). The web container
mounts the same spool path, read-write — it currently mounts only assets,
read-only.

`ensureDirs` creates `inbox/` alongside `queue/` and `failed/`, and must
**`chmod` it to 0o775 explicitly after creating it**. The `mode` option on
`fs.mkdir` is masked by the process umask, so under the usual 022 a requested
0o775 silently becomes 0o755 and nginx loses write access. A bare `mkdir`
followed by `chmod` is the only reliable form. The chmod must run
unconditionally, not just on creation, so an existing directory left at 0o755
by an earlier version is repaired on the next start.

The path is shared across two images: njs writes it, the mailer derives it
from its spool root (`${QUEUE_DIR}/inbox`). Keeping the two in step means
nginx's `$inbox_dir` must match that path. nginx supplies it as a
configuration variable (`set $inbox_dir /data/inbox;`) rather than a constant
inside `spool.js`, so changing it is a config edit rather than an image rebuild.
The mailer logs its resolved inbox path at startup next to the queue path, so a
mismatch shows up in the first line of the log instead of as files silently
piling up.

## Healthchecks

Both go in the Dockerfiles rather than compose, so they travel with the image
and apply wherever it runs — including the Unraid deployment, whose compose file
is maintained separately from this repo.

```dockerfile
# mailer
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://localhost:3000/api/health || exit 1

# web
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://localhost/ || exit 1
```

**Liveness only.** The mailer's check deliberately does not parse the JSON or
require `ok:true`. `ok` goes false when anything sits in `failed/`, and nothing
clears that automatically — a single permanently-undeliverable message would pin
the container unhealthy forever, and no restart would fix it. Queue health stays
a monitoring concern on `/api/health`; container health answers only "is this
process serving requests".

Docker does not restart unhealthy containers on its own, so these primarily
drive the Unraid UI and anything watching `docker ps`.

**Decision: not wired to `depends_on: condition: service_healthy`.**
`docker-compose.yml` keeps `depends_on: [mailer]` on `web` a plain start-order
hint, not a health gate. Two independent reasons:

1. Gating `web`'s startup on the mailer's health would take the whole site
   down whenever the mailer is unhealthy — including the njs fallback this
   design adds (`njs/spool.js`), which only exists inside a running nginx.
   That inverts this design's entire premise: the site staying up is what
   lets a submission be retained while the mailer is down, and
   `service_healthy` would make the site depend on the mailer's health after
   all.
2. The mailer's healthcheck hits `/api/health`, which calls `stats()` —
   O(queue size), since it reads every queued envelope to compute
   `oldestAgeSec`. A large backlog could make that check slow enough to mark
   the mailer unhealthy, and `service_healthy` would then block `web` from
   starting at all after a host reboot — for exactly the condition this
   feature exists to survive.

Both reasons must be re-litigated, not just noticed, before anyone "fixes" the
apparent inconsistency between this document and `docker-compose.yml` by
adding `service_healthy`.

## Configuration

New environment variable, optional:

| Variable | Default | Meaning |
|---|---|---|
| `PROMOTE_MAX_BYTES` | `20000` | Reject an inbox file larger than this |

`PROMOTE_MAX_BYTES` bounds what the promoter will read. nginx caps bodies at
16k, but the inbox is a filesystem path — this stops a hand-placed or corrupted
file from being read wholesale into memory.

## Testing

`mailer/queue.test.js` runs under `node --test` with no new dependencies. Tests
must be uid-independent: the CI runner is root, and root bypasses POSIX
permission checks, so `chmod`-based fault injection passes vacuously there. A
guard already fails the suite if `chmod(` reappears in that file.

Promotion coverage, against a temp directory:

1. A valid inbox file becomes a queued envelope and the inbox file is removed
2. The rendered mail matches what the HTTP path produces for the same input
3. A honeypot-tripped file is unlinked and never enqueued
4. An invalid submission moves to `failed/`
5. An unparseable file is skipped, left in place, and does not abort the pass
6. A `.partial` file in `inbox/` is ignored
7. A file over `PROMOTE_MAX_BYTES` moves to `failed/` without being fully read
8. Promotion runs before draining, so a promoted item can be delivered in the
   same tick
9. Shared validation accepts and rejects identically on both paths

The njs handler is covered in three layers, all verified feasible before this
design was accepted:

**Unit tests under `node --test`.** `spool.js` runs unmodified in Node —
`import fs from "fs"`, `fs.writeFileSync`, `fs.renameSync` and `export default`
behave identically in both runtimes, and `r` is the only nginx-specific object,
which tests supply as a plain fake. Confirmed by running the real handler shape
against a fake `r`: pass-through on 200, pass-through on 400 without spooling,
and spool-then-200 when the subrequest rejects. This is the layer that catches
logic errors and runs in CI with no new tooling.

**`nginx -t` on the built image.** `js_import` is resolved at configuration
parse time, so a syntax error or an unsupported language feature fails the
config test with the offending line number. Confirmed empirically: a valid
handler passes, a deliberately broken one fails with `at /etc/nginx/njs/ok.js:1`.
This is what catches njs-vs-Node runtime differences, which unit tests under
Node cannot see. It runs in the CI `docker` job after the image is built.

**Live integration on the deployment host.** Stop the mailer, POST, assert the
file appears in `inbox/`, restart, assert delivery. Requires a Docker daemon,
which the working environment does not have.

Residual risk after the first two layers is narrow: njs's `fs` implementation
differing from Node's in some edge case for these specific calls. The third
layer closes it.

To keep the handler testable, the inbox path is **not** a compiled-in constant.
nginx sets it as a variable and njs reads `r.variables.inbox_dir`, so tests
inject it through the fake `r`. This also removes the cross-image coupling
described under Ownership: the path lives in nginx configuration rather than
inside the image, so it can be changed without a rebuild.

## Out of scope

- **Client-side retry.** Discussed and deferred. nginx-side acceptance covers
  the same window and more, so browser retry adds little once this lands.
- **A claim mechanism for multiple drainers.** Still exactly one mailer.
- **Clearing `failed/`.** Still deliberate manual action.
