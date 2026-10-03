// Search index: one entry per section (h2/h3) of each page, plus one "page" entry.
// Embedded format: { p: page id, a: anchor | null, t: title, x: text (at most 4,000 characters) }.
import { plainText } from "../core/text.mjs";

/** Adds the entries of a rendered page to `index`. */
export function indexPage(index, pageId, pageTitle, html) {
  const chunks = html.split(/(?=<h[23] id=")/);
  chunks.forEach((chunk, i) => {
    const h = /^<h[23] id="([^"]+)">([\s\S]*?)<a class="ancre"/.exec(chunk);
    const x = plainText(chunk.replace(/^<h[23][^>]*>[\s\S]*?<\/h[23]>/, "")).slice(0, 4000);
    if (!x && !h) return;
    index.push({ p: pageId, a: h ? h[1] : null, t: h ? plainText(h[2]) : pageTitle, x });
    if (i === 0 && h) index.push({ p: pageId, a: null, t: pageTitle, x: "" });
  });
  if (!chunks.length) index.push({ p: pageId, a: null, t: pageTitle, x: "" });
  return index;
}
