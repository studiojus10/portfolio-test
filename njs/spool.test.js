import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import spool from './spool.js';

let dir;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'njs-spool-test-'));
});

after(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const BODY = '{"name":"Jane","email":"jane@example.com","message":"hi"}';

// Stands in for the nginx request object. Only the members spool.js touches.
function fakeR(inbox, subrequestResult, over = {}) {
  const r = {
    returned: null,
    errors: [],
    warnings: [],
    headersOut: {},
    subrequestCalls: [],
    variables: {
      request_id: 'abcdef0123456789abcdef0123456789',
      inbox_dir: inbox,
    },
    requestText: BODY,
    headersIn: { 'X-Forwarded-For': '203.0.113.7' },
    remoteAddress: '10.0.0.1',
    subrequest: async (uri, options) => {
      r.subrequestCalls.push({ uri, options });
      if (subrequestResult instanceof Error) throw subrequestResult;
      return subrequestResult;
    },
    return: (status, body) => {
      r.returned = { status, body };
    },
    error: (msg) => {
      r.errors.push(msg);
    },
    warn: (msg) => {
      r.warnings.push(msg);
    },
    ...over,
  };
  return r;
}

async function box(name) {
  const p = path.join(dir, name);
  await fs.mkdir(p, { recursive: true });
  return p;
}

describe('spool.handle', () => {
  it('passes a mailer success straight through', async () => {
    const inbox = await box('ok');
    const r = fakeR(inbox, { status: 200, responseText: '{"success":true}' });
    await spool.handle(r);
    assert.deepEqual(r.returned, { status: 200, body: '{"success":true}' });
    assert.deepEqual(
      await fs.readdir(inbox),
      [],
      'must not spool a delivered message',
    );

    // A subrequest pointed at the wrong internal location still comes back
    // with some status < 500 (e.g. a 404), so the handler would pass that
    // through and the submission would be silently discarded -- assert the
    // exact call, not just the outcome.
    assert.equal(r.subrequestCalls.length, 1);
    assert.equal(r.subrequestCalls[0].uri, '/internal/mailer');
    assert.equal(r.subrequestCalls[0].options.method, 'POST');
    assert.equal(r.subrequestCalls[0].options.body, BODY);
  });

  it('passes a mailer rejection through WITHOUT spooling it', async () => {
    for (const status of [400, 413, 429]) {
      const inbox = await box(`reject-${status}`);
      const r = fakeR(inbox, { status, responseText: `{"error":${status}}` });
      await spool.handle(r);
      assert.equal(r.returned.status, status);
      assert.deepEqual(
        await fs.readdir(inbox),
        [],
        `status ${status} is a judgement about the submission, not an outage`,
      );
    }
  });

  it('spools and returns 200 when the mailer is unreachable', async () => {
    const inbox = await box('unreachable');
    const r = fakeR(inbox, new Error('mailer could not be resolved'));
    await spool.handle(r);
    assert.deepEqual(r.returned, { status: 200, body: '{"success":true}' });

    const files = await fs.readdir(inbox);
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('.json'), 'no .partial left behind');

    const record = JSON.parse(
      await fs.readFile(path.join(inbox, files[0]), 'utf8'),
    );
    assert.equal(record.ip, '203.0.113.7');
    assert.deepEqual(record.body, JSON.parse(BODY));
    assert.ok(record.receivedAt);

    assert.deepEqual(
      r.warnings,
      [],
      'the throw path already logged via r.error; must not also warn',
    );
  });

  it('spools on a mailer 5xx', async () => {
    for (const status of [500, 502, 503]) {
      const inbox = await box(`five-${status}`);
      const r = fakeR(inbox, { status, responseText: '' });
      await spool.handle(r);
      assert.equal(r.returned.status, 200, `status ${status} must still spool`);
      assert.equal((await fs.readdir(inbox)).length, 1);
      assert.ok(
        r.warnings.some((m) => m.includes(String(status))),
        `warning must name the triggering status ${status}`,
      );
    }
  });

  it('spools when the reply has no usable status', async () => {
    const inbox = await box('no-status');
    const r = fakeR(inbox, { status: 0, responseText: '' });
    await spool.handle(r);
    assert.equal(r.returned.status, 200, 'ambiguity must retain the message');
    assert.ok(
      r.warnings.some((m) => /\b0\b/.test(m)),
      'warning must name the (falsy) status that triggered the spool',
    );
    assert.equal((await fs.readdir(inbox)).length, 1);
  });

  it('returns 400 for a non-JSON body instead of spooling garbage', async () => {
    const inbox = await box('bad-json');
    const r = fakeR(inbox, new Error('down'), {
      requestText: 'not json at all',
    });
    await spool.handle(r);
    assert.equal(r.returned.status, 400);
    assert.deepEqual(await fs.readdir(inbox), []);
  });

  it('returns 503 when the spool itself cannot be written', async () => {
    const r = fakeR(
      '/nonexistent/path/that/cannot/be/written',
      new Error('down'),
    );
    await spool.handle(r);
    assert.equal(r.returned.status, 503);
    assert.ok(r.errors.some((m) => /spool write failed/.test(m)));
  });

  it('falls back to remoteAddress when there is no forwarded header', async () => {
    const inbox = await box('no-xff');
    const r = fakeR(inbox, new Error('down'), { headersIn: {} });
    await spool.handle(r);
    const files = await fs.readdir(inbox);
    const record = JSON.parse(
      await fs.readFile(path.join(inbox, files[0]), 'utf8'),
    );
    assert.equal(record.ip, '10.0.0.1');
  });
});
