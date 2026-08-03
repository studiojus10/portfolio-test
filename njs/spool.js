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

// njs (not Node) runs this file, so biome's useNodejsImportProtocol rule
// does not apply. Bare "fs" is what njs documents and verified working here;
// "node:" is not verified beyond config-parse time.
// biome-ignore lint/style/useNodejsImportProtocol: bare "fs" is required by njs, not Node
import fs from 'fs';

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
  } catch (_e) {
    // Not JSON -- the mailer would have rejected it anyway.
    return false;
  }

  const record = JSON.stringify({
    receivedAt: new Date().toISOString(),
    ip: r.headersIn['X-Forwarded-For'] || r.remoteAddress,
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
  // Every response this handler emits is a JSON body; without this nginx's
  // default_type (application/octet-stream) applies instead, even when the
  // reply below is passed through verbatim from the mailer.
  r.headersOut['Content-Type'] = 'application/json';

  let reply = null;
  try {
    reply = await r.subrequest('/internal/mailer', {
      method: 'POST',
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

  // A thrown subrequest is already logged above via r.error. This is the other
  // route into the fallback -- the mailer answered, just not usefully -- and
  // without it an operator sees an ordinary 200 in the access log with no clue
  // the fallback engaged. r.warn, not r.error: spooling is degraded-but-working,
  // not a failure.
  if (reply) {
    r.warn(`mailer answered ${reply.status}, spooling to inbox instead`);
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
