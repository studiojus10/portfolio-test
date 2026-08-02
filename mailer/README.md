# Contact-form mailer sidecar

A tiny Node service that receives the contact form's submission and relays it
over SMTP. The static site (nginx) proxies `/api/` to this service; it is never
exposed to the internet directly.

```
browser ──POST /api/contact──▶ nginx (web) ──proxy──▶ mailer:3000 ──SMTP──▶ inbox
```

- **Only dependency:** `nodemailer`.
- **No database.** Durable state is a directory of JSON files on disk (see
  "Durability" below) plus an in-memory rate-limit counter that still resets
  on every redeploy.
- Lives on the internal compose network as `mailer`; `expose: 3000` (never
  published to the host).

---

## Endpoints

| Method | Path           | Purpose                                             |
| ------ | -------------- | --------------------------------------------------- |
| `POST` | `/api/contact` | Submit an inquiry. JSON body (see below).           |
| `GET`  | `/api/health`  | Health check → `{"ok":true,"mode":"smtp\|log-only","queued":0,"failed":0,"oldestAgeSec":0}` |

**Request body** (`application/json`):

```json
{ "name": "Ada", "email": "ada@example.com", "message": "Hello", "_gotcha": "" }
```

**Responses:** `200 {"success":true}` accepted (queued, not yet delivered) ·
`400` invalid input · `429` rate-limited · `413` body too large · `503` the
spool itself was unwritable (the only response where the message was not
retained).

---

## Configuration

All settings come from the environment (the compose `mailer` service reads them
from `.env`):

| Variable               | Default                      | Notes                                        |
| ---------------------- | ---------------------------- | -------------------------------------------- |
| `SMTP_HOST`            | `smtp.gmail.com`             |                                              |
| `SMTP_PORT`            | `587`                        | 587 = STARTTLS, 465 = implicit TLS           |
| `SMTP_USER`            | —                            | sending account; **required to deliver**     |
| `SMTP_PASS`            | —                            | Gmail **app password**; **required**         |
| `MAIL_TO`              | `SMTP_USER`                  | inbox that receives inquiries                |
| `MAIL_FROM`            | `Studio Jus10 <SMTP_USER>`   | `From` header                                |
| `PORT`                 | `3000`                       | listen port                                  |
| `RATE_LIMIT_MAX`       | `5`                          | requests per window per IP                   |
| `RATE_LIMIT_WINDOW_MS` | `600000`                     | rate-limit window (10 min)                   |
| `QUEUE_DIR`            | `/data`                     | spool root — needs a persistent volume in production |
| `QUEUE_POLL_MS`        | `15000`                     | worker tick interval                         |
| `MAX_ATTEMPTS`         | `20`                        | delivery attempts before moving an item to `failed/` |
| `QUEUE_STALE_SEC`      | `3600`                      | oldest queued age at which `/api/health` reports `ok: false` |

> **Log-only mode:** with `SMTP_USER`/`SMTP_PASS` unset, the service accepts and
> logs submissions but does **not** deliver them. Handy for local development —
> but it means a misconfigured production deploy silently drops mail, so verify
> `/api/health` reports `"mode":"smtp"` after deploying.

### Getting a Gmail app password

1. The Gmail account must have **2-Step Verification** enabled.
2. Google Account → **Security** → **2-Step Verification** → **App passwords**.
3. Create one (any name, e.g. "studiojus10 mailer"); copy the 16-character value.
4. Use it as `SMTP_PASS` (spaces optional). Your normal Gmail password will not
   work.

### Create the `.env`

```sh
cp .env.example .env          # in the repo root
# edit .env and fill in SMTP_USER + SMTP_PASS
```

`.env` is gitignored — never commit it.

---

## Running

### Local (whole site + mailer)

From the repo root:

```sh
docker compose up -d --build
```

- Site: <http://localhost:8080>
- Contact form posts to `http://localhost:8080/api/contact` (proxied to the mailer).
- Health: `curl localhost:8080/api/health`

Without a `.env`, the mailer starts in log-only mode (submissions are logged in
`docker compose logs mailer`, not delivered).

### Just the mailer (no Docker)

`QUEUE_DIR` defaults to `/data`, which this process has no permission to
create outside a container — set it to a local path instead:

```sh
cd mailer
npm install
QUEUE_DIR=./data SMTP_USER=you@gmail.com SMTP_PASS='app password' npm start   # listens on :3000
```

`./data` (under `mailer/`) is gitignored — safe to leave in place between runs.

---

## Production deploy

CI (`.forgejo/workflows/ci.yml`) builds and pushes **two** images to the Forgejo
registry on every merge to `main`:

- `forge.daveynet.xyz/davey/studiojus10` — the nginx site
- `forge.daveynet.xyz/davey/studiojus10-mailer` — this service

(each tagged `:latest` and `:sha-<commit>`), so What's-Up-Docker can auto-update
both.

The host's production compose must include the mailer service and an `.env` with
the SMTP credentials. Minimal shape:

```yaml
services:
  web:
    image: forge.daveynet.xyz/davey/studiojus10:latest
    ports:
      - "8080:80"
    volumes:
      - /srv/studiojus10/assets:/usr/share/nginx/html/assets:ro
    depends_on:
      - mailer
    restart: unless-stopped

  mailer:
    image: forge.daveynet.xyz/davey/studiojus10-mailer:latest
    env_file:
      - .env
    expose:
      - "3000"
    volumes:
      - /srv/studiojus10/mailer-queue:/data
    restart: unless-stopped
```

That bind mount (or a named volume — anything that outlives the container) is
not optional; see "Durability" below for why.

The nginx image already contains the `/api/` → `mailer:3000` proxy (see
`nginx.conf`), so no extra web config is needed — just make sure both services
share a compose network (the default network does).

---

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

**Run exactly one mailer against a given spool.** There is no claim or lock
on queue files — two drainers pointed at the same directory will each deliver
every queued item (verified), i.e. duplicate mail to the recipient.

**`/api/health` returns HTTP `200` even when the body says `"ok":false`.** A
monitor that only checks the status code will stay green through an SMTP
outage or a full `failed/` directory; it has to assert on the JSON body.
Also note `ok:false` is sticky once anything lands in `failed/` — nothing
auto-deletes those files, so the endpoint stays unhealthy until an operator
clears the directory, a deliberate manual action.

---

## Abuse protection

- **Honeypot** — the form includes a hidden `_gotcha` field; a filled value is
  silently accepted and dropped (no email sent).
- **Rate limit** — 5 requests / 10 min per client IP (`X-Forwarded-For` from
  nginx), tunable via `RATE_LIMIT_*`.
- **Body cap** — requests over 10 KB are rejected with `413`.
- **Header-injection guard** — name/email are stripped of CR/LF before use, and
  the visitor's address is set only as `Reply-To`.

---

## Troubleshooting

| Symptom                                   | Likely cause / fix                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `/api/health` shows `"mode":"log-only"`   | `SMTP_USER`/`SMTP_PASS` not reaching the container — check `.env` and `env_file`.   |
| Form returns `503`                        | The spool write itself failed — volume unmounted, disk full, or bad permissions on `QUEUE_DIR`. This is the only response where the message was not retained. |
| Form returns `429`                        | Rate limit hit; wait, or raise `RATE_LIMIT_MAX`.                                    |
| `502`/`504` from nginx on `/api/contact`  | mailer container not running or not on the same network as web.                     |
| `/api/health` body has `"ok":false` (HTTP status is still `200`) | Either `failed` > 0 — read `lastError` in the files under `$QUEUE_DIR/failed`, fix the underlying cause (bad app password, wrong `MAIL_TO`), then clear the directory manually — or `oldestAgeSec` exceeds `QUEUE_STALE_SEC`, meaning the worker is stalled or SMTP has been down a while; check `docker compose logs mailer`. |
| Nothing arrives but health is `smtp`      | Check spam; confirm `MAIL_TO`; read `docker compose logs mailer` for send errors.   |
