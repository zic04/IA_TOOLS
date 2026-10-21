// Search index: one "page" entry (its summary and its introduction, before the first heading), then one entry per
// section (h2/h3) of the page. Built once the second pass has resolved the generated tables and the citations, so
// that what a table lists can be found (render-language.mjs).
// Embedded format: { p: page id, a: anchor | null, t: title, x: text (at most 4,000 characters) }.
import { plainText } from "../core/text.mjs";

/** A section's heading, its anchor and its title (the build writes the anchor link last). */
const HEADING = /^<h[23] id="([^"]+)">([\s\S]*?)<a class="ancre"/;
/** The whole heading of a section, removed from its text. */
const HEADING_TAG = /^<h[23][^>]*>[\s\S]*?<\/h[23]>/;
const MAX_TEXT = 4000;

/** Adds the entries of a rendered page to `index`. */
export function indexPage(index, pageId, pageTitle, html, summary = "") {
  const chunks = html.split(/(?=<h[23] id=")/);
  const intro = chunks.length && !HEADING.test(chunks[0]) ? plainText(chunks.shift()) : "";
  const text = [summary, intro].filter(Boolean).join(" — ");
  index.push({ p: pageId, a: null, t: pageTitle, x: text.slice(0, MAX_TEXT) });
  for (const chunk of chunks) {
    const h = HEADING.exec(chunk);
    const x = plainText(chunk.replace(HEADING_TAG, "")).slice(0, MAX_TEXT);
    if (h) index.push({ p: pageId, a: h[1], t: plainText(h[2]), x });
    else if (x) index.push({ p: pageId, a: null, t: pageTitle, x });
  }
  return index;
}
