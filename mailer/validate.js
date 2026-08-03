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
