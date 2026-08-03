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
//   QUEUE_DIR       spool root                     (default: /data)
//   QUEUE_POLL_MS   worker tick                    (default: 15000)
//   MAX_ATTEMPTS    tries before giving up         (default: 20)
//   QUEUE_STALE_SEC age at which health goes false (default: 3600)
//   PROMOTE_MAX_BYTES  cap on a promoted inbox file (default: 20000)
//
// Submissions are spooled to disk before the response is sent and delivered by
// a background worker (see queue.js), so an SMTP outage or a container
// redeploy cannot lose mail. A 200 means accepted, not yet delivered.
//
// With no SMTP_USER/SMTP_PASS it runs in LOG-ONLY mode: submissions are accepted
// and logged but not delivered — handy for local `docker compose up` without creds.

import http from "node:http";
import nodemailer from "nodemailer";
import {
  drainOnce,
  enqueue,
  ensureDirs,
  promoteInbox,
  queuePaths,
  stats,
} from "./queue.js";
import { isHoneypot, renderMail, validateSubmission } from "./validate.js";

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
const QUEUE_DIR = env.QUEUE_DIR || "/data";
const QUEUE_POLL_MS = Number(env.QUEUE_POLL_MS || 15_000);
const MAX_ATTEMPTS = Number(env.MAX_ATTEMPTS || 20);
const QUEUE_STALE_SEC = Number(env.QUEUE_STALE_SEC || 3600);
const PROMOTE_MAX_BYTES = Number(env.PROMOTE_MAX_BYTES || 20_000);
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
    if (isHoneypot(data)) {
      return sendJson(res, 200, { success: true });
    }

    if (rateLimited(ip)) {
      return sendJson(res, 429, {
        success: false,
        error: "Too many requests — please try again later.",
      });
    }

    const submission = validateSubmission(data);
    if (!submission.ok) {
      return sendJson(res, 400, { success: false, error: submission.error });
    }

    try {
      await enqueue(
        QUEUE_DIR,
        renderMail(submission, { from: MAIL_FROM, to: MAIL_TO }),
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
  });
});

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
    // Re-run on every tick, not just at startup: if the spool root vanishes
    // (unmounted volume, host maintenance) the process doesn't exit — it
    // just serves 503s — so a returning volume needs this to recover without
    // a restart.
    await ensureDirs(QUEUE_DIR);
    // Before draining, not after: a submission nginx accepted seconds ago can
    // then be delivered without waiting for the next interval.
    const promoted = await promoteInbox(
      QUEUE_DIR,
      { from: MAIL_FROM, to: MAIL_TO },
      { now: Date.now(), maxBytes: PROMOTE_MAX_BYTES },
    );
    // Widened to include `skipped`: a torn/unreadable inbox file or a
    // per-item promotion error leaves promoted/dropped/failed all at 0, so
    // the old condition (promoted || failed) silently swallowed the only
    // sign anything was wrong -- 40 files could sit stuck in inbox/,
    // reattempted forever, with nothing in the log to say so.
    if (
      promoted.promoted ||
      promoted.dropped ||
      promoted.failed ||
      promoted.skipped
    ) {
      console.log(
        `[mailer] promoted: ${promoted.promoted} queued, ${promoted.dropped} dropped, ${promoted.failed} failed, ${promoted.skipped} skipped`,
      );
    }
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

server.listen(PORT, () => {
  console.log(
    `[mailer] listening on :${PORT} (mode: ${hasCreds ? "smtp" : "log-only"}, to: ${MAIL_TO || "unset"}, queue: ${QUEUE_DIR}, inbox: ${queuePaths(QUEUE_DIR).inboxDir})`,
  );
});
