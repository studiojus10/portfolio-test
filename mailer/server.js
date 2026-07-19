// Contact-form mailer sidecar.
//
// A tiny dependency-light HTTP service that accepts the inquiry form's POST and
// relays it over SMTP (Gmail app password by default). nginx proxies /api/ here;
// it is never exposed directly. All config comes from the environment:
//
//   SMTP_HOST   default smtp.gmail.com
//   SMTP_PORT   default 587 (STARTTLS; 465 = implicit TLS)
//   SMTP_USER   the Gmail address that sends (required to actually deliver)
//   SMTP_PASS   a Gmail *app password* (required to actually deliver)
//   MAIL_TO     inbox that receives inquiries      (default: SMTP_USER)
//   MAIL_FROM   From header  (default: "Studio Jus10 <SMTP_USER>")
//   PORT        listen port                        (default: 3000)
//   RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS          (default: 5 per 10 min per IP)
//
// With no SMTP_USER/SMTP_PASS it runs in LOG-ONLY mode: submissions are accepted
// and logged but not delivered — handy for local `docker compose up` without creds.

import http from "node:http";
import nodemailer from "nodemailer";

const env = process.env;
const PORT = Number(env.PORT || 3000);
const SMTP_HOST = env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(env.SMTP_PORT || 587);
const SMTP_USER = env.SMTP_USER || "";
const SMTP_PASS = env.SMTP_PASS || "";
const MAIL_TO = env.MAIL_TO || SMTP_USER;
const MAIL_FROM =
  env.MAIL_FROM || (SMTP_USER ? `Studio Jus10 <${SMTP_USER}>` : "Studio Jus10");
const RATE_LIMIT_MAX = Number(env.RATE_LIMIT_MAX || 5);
const RATE_LIMIT_WINDOW_MS = Number(env.RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const MAX_BODY_BYTES = 10_000;

const hasCreds = Boolean(SMTP_USER && SMTP_PASS);

const transport = hasCreds
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : nodemailer.createTransport({ jsonTransport: true });

if (!hasCreds) {
  console.warn(
    "[mailer] SMTP_USER/SMTP_PASS not set — LOG-ONLY mode (email is not delivered).",
  );
}

// --- crude in-memory per-IP rate limiter -----------------------------------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  let rec = hits.get(ip);
  if (!rec || now > rec.reset) {
    rec = { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
    hits.set(ip, rec);
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of hits) if (now > rec.reset) hits.delete(ip);
}, 60_000).unref();

// --- helpers ---------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const oneLine = (v) => String(v ?? "").replace(/[\r\n]+/g, " ").trim();

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// --- server ----------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, 200, { ok: true, mode: hasCreds ? "smtp" : "log-only" });
  }
  if (req.url !== "/api/contact") {
    return sendJson(res, 404, { success: false, error: "Not found" });
  }
  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed" });
  }

  const ip =
    oneLine((req.headers["x-forwarded-for"] || "").split(",")[0]) ||
    req.socket.remoteAddress ||
    "unknown";

  let body = "";
  let aborted = false;
  req.on("data", (chunk) => {
    if (aborted) return;
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      aborted = true;
      sendJson(res, 413, { success: false, error: "Payload too large" });
      req.destroy();
    }
  });

  req.on("end", async () => {
    if (aborted) return;

    let data;
    try {
      data = JSON.parse(body || "{}");
    } catch {
      return sendJson(res, 400, { success: false, error: "Invalid JSON" });
    }

    // Honeypot: bots fill hidden fields. Pretend success, deliver nothing.
    if (oneLine(data._gotcha)) {
      return sendJson(res, 200, { success: true });
    }

    if (rateLimited(ip)) {
      return sendJson(res, 429, {
        success: false,
        error: "Too many requests — please try again later.",
      });
    }

    const name = oneLine(data.name).slice(0, 100);
    const email = oneLine(data.email).slice(0, 200);
    const message = String(data.message ?? "").trim().slice(0, 5000);

    if (!name || !EMAIL_RE.test(email) || !message) {
      return sendJson(res, 400, {
        success: false,
        error: "Please provide a name, a valid email, and a message.",
      });
    }

    try {
      const info = await transport.sendMail({
        from: MAIL_FROM,
        to: MAIL_TO,
        replyTo: `${name} <${email}>`,
        subject: `Portfolio inquiry from ${name}`,
        text: `${message}\n\n— ${name} (${email})`,
      });
      if (!hasCreds) {
        console.log(
          "[mailer] LOG-ONLY message:",
          info.message ? info.message.toString() : info,
        );
      }
      return sendJson(res, 200, { success: true });
    } catch (err) {
      console.error("[mailer] send failed:", (err && err.message) || err);
      return sendJson(res, 502, {
        success: false,
        error: "Could not send message. Please email directly.",
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(
    `[mailer] listening on :${PORT} (mode: ${hasCreds ? "smtp" : "log-only"}, to: ${MAIL_TO || "unset"})`,
  );
});
