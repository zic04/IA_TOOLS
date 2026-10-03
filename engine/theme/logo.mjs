// Project logo (theme.logo): sanitised before being inlined in the top bar and reused as the favicon.
// Rejected when it contains a script, an event handler (on*), a javascript: URL, a <foreignObject>, an
// external reference, or when it has no viewBox. Fallback: engine/site/default-logo.svg.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LOGO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../site/default-logo.svg");
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

/**
 * @param {string} source  SVG content
 * @returns {{ ok: boolean, inline?: string, favicon?: (colour: string) => string, reason?: string }}
 *   `ok: true`: `inline` and `favicon` are set; `ok: false`: `reason` is
 *   `reason`: i18n key suffix (cli.build.theme.logo.*)
 */
export function sanitizeLogo(source) {
  const svg = String(source)
    .replace(/^﻿/, "")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>$/i.test(svg)) return { ok: false, reason: "notSvg" };
  if (/<script[\s/>]/i.test(svg)) return { ok: false, reason: "script" };
  if (/\son[a-z]+\s*=/i.test(svg)) return { ok: false, reason: "handler" };
  if (/javascript:/i.test(svg)) return { ok: false, reason: "javascript" };
  if (/<(foreignObject|iframe|embed|object)[\s/>]/i.test(svg)) return { ok: false, reason: "embedded" };
  for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi))
    if (!m[1].startsWith("#")) return { ok: false, reason: "external" };
  const root = /^<svg\b[^>]*>/i.exec(svg)[0];
  if (!/\sviewBox\s*=/.test(root)) return { ok: false, reason: "viewBox" };

  // Inline: without xmlns (useless in HTML), decorative for screen readers.
  let open = root.replace(/\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "");
  if (!/\saria-hidden=/.test(open)) open = open.replace(/^<svg/i, '<svg aria-hidden="true"');
  const inline = open + svg.slice(root.length);

  // Favicon: standalone SVG document (xmlns), drawn in the brand colour.
  const favicon = (colour) => {
    let o = root.replace(/\saria-hidden="[^"]*"/, "");
    if (!o.includes(XMLNS)) o = o.replace(/^<svg/i, `<svg ${XMLNS}`);
    if (colour && !/\sfill=/.test(o)) o = o.replace(/^<svg/i, `<svg fill="${colour}"`);
    return "data:image/svg+xml," + encodeURIComponent(o + svg.slice(root.length));
  };
  return { ok: true, inline, favicon };
}

/**
 * Logo of a project: `theme.logo` when it exists and passes sanitisation, otherwise the default logo.
 * @returns {{ logo: object, source: string, problem: null | { key: string, vars: object } }}
 */
export function loadLogo(projectRoot, logoPath) {
  let problem = null;
  if (logoPath) {
    const f = path.resolve(projectRoot, logoPath);
    if (fs.existsSync(f)) {
      const r = sanitizeLogo(fs.readFileSync(f, "utf8"));
      if (r.ok) return { logo: r, source: f, problem };
      problem = { key: `theme.logo.${r.reason}`, vars: { file: logoPath } };
    }
  }
  return { logo: sanitizeLogo(fs.readFileSync(DEFAULT_LOGO, "utf8")), source: DEFAULT_LOGO, problem };
}
