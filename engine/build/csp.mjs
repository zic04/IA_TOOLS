// Content Security Policy of the generated site (AUDIT.md S9, SECURITY.md): the Markdown pages may hold HTML and
// the SVG diagrams are inlined unsanitised, so the site tells the browser what it may run. Only the site's own
// inline scripts run (each allowed by its SHA-256 hash); images and fonts are embedded (data: URIs); no request,
// frame, form, plugin or <base> is allowed. A `<script>` in a page's HTML, an `onclick=`, a `javascript:` link or
// an external image is refused by the browser. In `dev` (doc-kit dev), the live-reload client gets its own hash and
// may connect to the local server.
import crypto from "node:crypto";

/** The <meta> this module writes, for it to be replaced on a second pass (the dev server's). */
const CSP_META = /<meta http-equiv="Content-Security-Policy" content="[^"]*">\n?/;
/**
 * An inline script of the HTML (opening tag attributes, then its text). Linear: the attributes are one run of
 * characters other than ">", the text a lazy run up to the first "</script>" (RULES.md S5).
 */
export const INLINE_SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const NOT_RUN = /\btype\s*=\s*["']?(?!(?:text|application)\/(?:javascript|ecmascript)|module)[^"'\s>]/i;

/** The policy for the inline scripts the HTML runs. */
export function contentSecurityPolicy(html, { dev = false } = {}) {
  const hashes = [];
  for (const [, attributes = "", text] of String(html).matchAll(INLINE_SCRIPT)) {
    if (NOT_RUN.test(attributes)) continue; // data: application/json, text/plain
    hashes.push(`'sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}'`);
  }
  return [
    "default-src 'none'",
    `script-src ${[...new Set(hashes)].join(" ") || "'none'"}`,
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
    `connect-src ${dev ? "'self'" : "'none'"}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/**
 * The HTML with its policy right after `<meta charset="utf-8">` (replacing an earlier one). A text without that
 * charset is not a page of the site (a fragment): it is returned as it is.
 */
export function withContentSecurityPolicy(html, options) {
  const bare = String(html).replace(CSP_META, "");
  const at = bare.indexOf('<meta charset="utf-8">');
  if (at < 0) return bare;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(bare, options)}">\n`;
  const end = at + '<meta charset="utf-8">'.length + 1;
  return bare.slice(0, end) + meta + bare.slice(end);
}
