// Masking of sensitive values in the screenshots (and the values `check secrets` looks for).
//   masking.env       the application's local .env files: values of the keys whose name suggests a URL, a host, a
//                     tenant, a client, an account, an e-mail address, a user or a secret (SENSITIVE_KEY), longer
//                     than 6 characters, except those matching masking.exclude (default: localhost, 127.0.0.1)
//   masking.guid      GUIDs (8-4-4-4-12 hexadecimal)
//   masking.patterns  more JavaScript regular expressions
// In the page, every text node and every field value that matches is replaced by dots; then the `masks` targets
// of the capture are replaced entirely. Masking does not know production-only values: review every image.
import fs from "node:fs";
import path from "node:path";
import { locate, CaptureError, describeTarget } from "./actions.mjs";

export const DOTS = "••••••••";
export const GUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
/** Names of .env keys whose values are masked. */
const SENSITIVE_KEY = /URL|URI|HOST|DOMAIN|ENDPOINT|TENANT|CLIENT|AUDIENCE|ACCOUNT|EMAIL|MAIL|USER|LOGIN|SECRET|PASSWORD|PASSWD|PWD|TOKEN|KEY|DSN|CONNECTION/i;
const MIN_LENGTH = 7;

/**
 * Entries of a .env text: KEY=value, `export KEY=value`, quoted values; comments and blank lines ignored.
 * @returns {Array<{ key: string, value: string, line: number }>}
 */
export function parseEnv(text) {
  const out = [];
  String(text)
    .split(/\r?\n/)
    .forEach((l, i) => {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(l);
      if (!m) return;
      let v = m[2].trim();
      const q = /^(["'`])(.*)\1/.exec(v);
      v = q ? q[2] : v.replace(/\s+#.*$/, "").trim();
      out.push({ key: m[1], value: v, line: i + 1 });
    });
  return out;
}

/**
 * Sensitive values of the masking.env files (relative to the project root; missing files are skipped).
 * @returns {Array<{ key: string, value: string, file: string }>}
 */
export function sensitiveValues(root, masking) {
  const exclude = masking.exclude ? new RegExp(masking.exclude, "i") : null;
  const seen = new Set();
  const out = [];
  for (const f of masking.env || []) {
    const file = path.resolve(root, f);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    for (const { key, value } of parseEnv(fs.readFileSync(file, "utf8"))) {
      if (!SENSITIVE_KEY.test(key) || value.length < MIN_LENGTH || (exclude && exclude.test(value)) || seen.has(value)) continue;
      seen.add(value);
      out.push({ key, value, file: f });
    }
  }
  return out;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Source of the masking regular expression (flags "gi"), or null when there is nothing to mask.
 * Longest values first, so that a value containing another one is masked whole.
 */
export function maskSource(values, { guid = true, patterns = [] } = {}) {
  const parts = [...values]
    .map((v) => (typeof v === "string" ? v : v.value))
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  if (guid) parts.push(GUID);
  for (const p of patterns) parts.push(`(?:${p})`);
  return parts.length ? parts.join("|") : null;
}

/** Applies the masking regex to a text (used by the tests and by `check secrets`). */
export function maskText(text, source) {
  return source ? String(text).replace(new RegExp(source, "gi"), DOTS) : String(text);
}

/**
 * Masks the page: every text node and field value matching `source`, then the `masks` targets. A target that
 * matches nothing is an error (CaptureError "maskMissing"), unless `required` is false (the second pass, just
 * before the shot).
 * @returns {Promise<number>} number of replacements in the text
 */
export async function maskPage(page, { source, masks = [], selectors = {}, required = true }) {
  let n = 0;
  if (source)
    n = await page.evaluate(
      ({ source, dots }) => {
        const re = new RegExp(source, "gi");
        let count = 0;
        const replace = (s) =>
          s.replace(re, () => {
            count++;
            return dots;
          });
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const v = replace(node.nodeValue);
          if (v !== node.nodeValue) node.nodeValue = v;
        }
        for (const el of document.querySelectorAll("input, textarea")) {
          if (!el.value) continue;
          const v = replace(el.value);
          if (v !== el.value) el.value = v;
        }
        for (const el of document.querySelectorAll("[title], [placeholder]"))
          for (const a of ["title", "placeholder"]) {
            const old = el.getAttribute(a);
            const v = old === null ? old : replace(old);
            if (v !== old) el.setAttribute(a, v);
          }
        return count;
      },
      { source, dots: DOTS }
    );
  // Every match of a mask target (unless it names one with nth or last).
  // A mask target that matches nothing is an error, never a silent pass: what it should hide would be shown
  // (ETUDE-CAPTURES.md C1).
  for (const t of masks) {
    const found = locate(page, t, selectors, page, { all: true });
    if ((await found.count()) === 0) {
      // The second pass, just before the shot: a target located by its text is already dots.
      if (!required) continue;
      throw new CaptureError("maskMissing", { target: describeTarget(t) });
    }
    await found.evaluateAll((els, dots) => {
      for (const el of els) {
        if ("value" in el && el.tagName !== "BUTTON") el.value = dots;
        else el.textContent = dots;
      }
    }, DOTS);
  }
  return n;
}
