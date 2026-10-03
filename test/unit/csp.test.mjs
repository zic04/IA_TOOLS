// Content Security Policy of the generated site (engine/build/csp.mjs, AUDIT.md S9).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { contentSecurityPolicy, withContentSecurityPolicy, INLINE_SCRIPT } from "../../engine/build/csp.mjs";

const sha = (text) => `'sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}'`;
const page = (body) =>
  `<!doctype html><html><head>\n<meta charset="utf-8">\n<title>x</title></head><body>${body}</body></html>`;

describe("content security policy", () => {
  test("only the inline scripts that run are allowed, by hash; data blocks are not scripts", () => {
    const html = page(`<script>run()</script><script type="application/json" id="d">{"a":1}</script>
      <script type="text/plain" id="img-x">data:image/webp;base64,AAAA</script><script type="module">m()</script>`);
    const csp = contentSecurityPolicy(html);
    assert.match(csp, /^default-src 'none'; script-src /);
    assert.ok(csp.includes(sha("run()")) && csp.includes(sha("m()")), csp);
    assert.ok(!csp.includes(sha('{"a":1}')) && !csp.includes(sha("data:image/webp;base64,AAAA")), csp);
    for (const d of [
      "style-src 'unsafe-inline'",
      "img-src data:",
      "font-src data:",
      "connect-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ])
      assert.ok(csp.includes(d), d);
    assert.match(contentSecurityPolicy(page("")), /script-src 'none'/);
  });

  test("written right after the charset, replaced on a second pass (the dev server's), never on a fragment", () => {
    const once = withContentSecurityPolicy(page("<script>a()</script>"));
    assert.match(once, /<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="[^"]+">\n<title>/);
    const dev = withContentSecurityPolicy(once.replace("</body>", "<script>live()</script></body>"), { dev: true });
    assert.equal(dev.match(/Content-Security-Policy/g).length, 1);
    assert.ok(dev.includes(sha("a()")) && dev.includes(sha("live()")) && dev.includes("connect-src 'self'"));
    assert.equal(withContentSecurityPolicy("<p>fragment</p>"), "<p>fragment</p>");
  });

  test("INLINE_SCRIPT reads each script up to its own closing tag", () => {
    const found = [...'<script>a</script><p>x</p><script src="s">b</script>'.matchAll(INLINE_SCRIPT)].map((m) => m[2]);
    assert.deepEqual(found, ["a", "b"]);
  });
});
