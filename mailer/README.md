# Contact-form mailer sidecar

A tiny Node service that receives the contact form's submission and relays it
over SMTP. The static site (nginx) proxies `/api/` to this service; it is never
exposed to the internet directly.

```
browser ──POST /api/contact──▶ nginx (web) ──proxy──▶ mailer:3000 ──SMTP──▶ inbox
```

- **Only dependency:** `nodemailer`.
- **No database, no state** beyond an in-memory rate-limit counter.
- Lives on the internal compose network as `mailer`; `expose: 3000` (never
  published to the host).

---

## Endpoints

| Method | Path           | Purpose                                             |
| ------ | -------------- | --------------------------------------------------- |
| `POST` | `/api/contact` | Submit an inquiry. JSON body (see below).           |
| `GET`  | `/api/health`  | Health check → `{"ok":true,"mode":"smtp\|log-only"}` |

**Request body** (`application/json`):

```json
{ "name": "Ada", "email": "ada@example.com", "message": "Hello", "_gotcha": "" }
```

**Responses:** `200 {"success":true}` on send · `400` invalid input ·
`429` rate-limited · `413` body too large · `502` SMTP send failed.

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

```sh
cd mailer
npm install
SMTP_USER=you@gmail.com SMTP_PASS='app password' npm start   # listens on :3000
```

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
    restart: unless-stopped
```

The nginx image already contains the `/api/` → `mailer:3000` proxy (see
`nginx.conf`), so no extra web config is needed — just make sure both services
share a compose network (the default network does).

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
| Form returns `502`                        | SMTP rejected the send — usually a wrong/expired app password or 2FA not enabled.   |
| Form returns `429`                        | Rate limit hit; wait, or raise `RATE_LIMIT_MAX`.                                    |
| `502`/`504` from nginx on `/api/contact`  | mailer container not running or not on the same network as web.                     |
| Nothing arrives but health is `smtp`      | Check spam; confirm `MAIL_TO`; read `docker compose logs mailer` for send errors.   |
