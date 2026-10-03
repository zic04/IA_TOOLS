// WCAG 2.x contrast of the token pairs that carry text (used by `doc-kit doctor`, batch L4, and by the tests
// of the default palette). Ratio = (L1 + 0.05) / (L2 + 0.05); thresholds: 4.5 (body text, AA),
// 3 (large text and interface elements).
import { themeTokens } from "./tokens.mjs";

/** #rgb, #rgba, #rrggbb, #rrggbbaa → [r, g, b] (0..255), or null. Opacity is ignored. */
function hexToRgb(hex) {
  const m = /^#([0-9a-f]{3,8})$/i.exec(String(hex).trim());
  if (!m || ![3, 4, 6, 8].includes(m[1].length)) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** WCAG relative luminance of a hexadecimal colour. */
function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) throw new Error(`hexadecimal colour expected: ${hex}`);
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio (1 to 21), rounded to two decimals. */
export function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

/** Resolves the var(--x) references of a token set. */
export function resolve(tokens) {
  const out = {};
  const value = (name, guard = 0) => {
    const v = tokens[name];
    const m = /^var\(--([\w-]+)\)$/.exec(v || "");
    return m && guard < 10 ? value(m[1], guard + 1) : v;
  };
  for (const k of Object.keys(tokens)) out[k] = value(k);
  return out;
}

/** Checked pairs [text, background, threshold]. */
const PAIRS = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text-soft", "surface", 4.5],
  ["text-faint", "surface", 3],
  ["brand-strong", "surface", 4.5],
  ["brand-strong", "brand-soft", 4.5],
  ["on-brand", "brand", 4.5],
  ["on-chrome", "chrome", 4.5],
  ["chrome-text", "chrome", 4.5],
  ["chrome-text", "chrome-2", 4.5], // the search field of the top bar and its key (Ctrl K)
  ["brand-on-chrome", "chrome", 4.5],
  ["hero-accent", "chrome", 3],
  ["violet", "violet-soft", 4.5],
  ["warn", "warn-soft", 4.5],
  ["danger", "danger-soft", 4.5],
  ["info", "info-soft", 4.5],
  ["ok", "ok-soft", 4.5],
];

/**
 * Checks both themes of a project.
 * @returns {Array<{ mode: string, text: string, background: string, ratio: number, threshold: number, ok: boolean }>}
 */
export function checkContrasts(theme = {}) {
  const results = [];
  for (const mode of ["light", "dark"]) {
    const tk = resolve(themeTokens(theme, mode));
    for (const [text, background, threshold] of PAIRS) {
      if (!hexToRgb(tk[text]) || !hexToRgb(tk[background])) continue;
      const r = ratio(tk[text], tk[background]);
      results.push({ mode, text, background, ratio: r, threshold, ok: r >= threshold });
    }
  }
  return results;
}
