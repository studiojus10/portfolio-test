import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isHoneypot, renderMail, validateSubmission } from "./validate.js";

describe("isHoneypot", () => {
  it("is true only when _gotcha has content", () => {
    assert.equal(isHoneypot({ _gotcha: "bot" }), true);
    assert.equal(isHoneypot({ _gotcha: "  " }), false);
    assert.equal(isHoneypot({ _gotcha: "" }), false);
    assert.equal(isHoneypot({}), false);
  });

  // JSON.parse(body || "{}") can legitimately return non-objects (null, numbers,
  // strings, booleans, arrays). Without optional chaining, accessing data._gotcha
  // on these values would throw TypeError and crash the process via unhandled
  // rejection. This test ensures we gracefully handle all parse results.
  it("handles non-object parse results without throwing", () => {
    const nonObjects = [null, undefined, 123, "str", true, []];
    for (const value of nonObjects) {
      assert.equal(isHoneypot(value), false);
    }
  });
});

describe("validateSubmission", () => {
  const good = { name: "Jane Doe", email: "jane@example.com", message: "Hello" };

  it("accepts a valid submission", () => {
    assert.deepEqual(validateSubmission(good), {
      ok: true,
      name: "Jane Doe",
      email: "jane@example.com",
      message: "Hello",
    });
  });

  it("rejects a missing name, a bad email, or an empty message", () => {
    for (const bad of [
      { ...good, name: "" },
      { ...good, email: "not-an-email" },
      { ...good, message: "   " },
    ]) {
      const result = validateSubmission(bad);
      assert.equal(result.ok, false);
      assert.match(result.error, /name, a valid email, and a message/);
    }
  });

  it("collapses newlines in single-line fields and caps lengths", () => {
    const result = validateSubmission({
      name: `${"a".repeat(200)}\nsecond line`,
      email: "jane@example.com",
      message: "b".repeat(6000),
    });
    assert.equal(result.ok, true);
    assert.equal(result.name.length, 100);
    assert.ok(!result.name.includes("\n"));
    assert.equal(result.message.length, 5000);
  });

  it("preserves newlines inside the message body", () => {
    const result = validateSubmission({ ...good, message: "line one\nline two" });
    assert.equal(result.ok, true);
    assert.equal(result.message, "line one\nline two");
  });

  // JSON.parse(body || "{}") can legitimately return non-objects (null, numbers,
  // strings, booleans, arrays). Without optional chaining, accessing data.name,
  // data.email, data.message on these values would throw TypeError and crash the
  // process via unhandled rejection. This test ensures we gracefully handle all
  // parse results and return an error object.
  it("handles non-object parse results without throwing", () => {
    const nonObjects = [null, undefined, 123, "str", true, []];
    for (const value of nonObjects) {
      const result = validateSubmission(value);
      assert.equal(result.ok, false);
      assert.match(result.error, /name, a valid email, and a message/);
    }
  });
});

describe("renderMail", () => {
  it("builds the mail the transport sends", () => {
    const mail = renderMail(
      { name: "Jane Doe", email: "jane@example.com", message: "Hello" },
      { from: "Studio Jus10 <s@example.com>", to: "s@example.com" },
    );
    assert.deepEqual(mail, {
      from: "Studio Jus10 <s@example.com>",
      to: "s@example.com",
      replyTo: "Jane Doe <jane@example.com>",
      subject: "Portfolio inquiry from Jane Doe",
      text: "Hello\n\n— Jane Doe (jane@example.com)",
    });
  });
});
