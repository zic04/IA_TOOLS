// Anchors of translated pages (ARCHITECTURE.md §6.12 §5), the third of the three places that map an anchor by
// position: the site (switching language, engine/site/app.js), the build (a page's `counterpart`), and here, the
// Markdown files themselves (`translate --fix-anchors`). Pure: no disk access, no network.

/** Ids of a rendered table of contents (render().toc, engine/build/markdown.mjs), in heading order. */
const idsOf = (toc) => (toc || []).map((h) => h.id);

/**
 * Whether `anchor` (as written in a translated page, linking to `target`) is already a heading of the
 * translated target page, or can be mapped there by position.
 * @param {{ sourceToc: object[]|null, targetToc: object[]|null, anchor: string }} p
 * @returns {{ ok: true, same: true }|{ ok: true, mapped: string }|{ ok: false, reason: "missing"|"count"|"unknown" }}
 */
function classify({ sourceToc, targetToc, anchor }) {
  const targetIds = idsOf(targetToc);
  if (targetIds.includes(anchor)) return { ok: true, same: true };
  if (!targetToc) return { ok: false, reason: "missing" }; // the target page has no translation at all
  const i = idsOf(sourceToc).indexOf(anchor);
  if (i < 0) return { ok: false, reason: "unknown" }; // not a heading of either page
  if ((sourceToc || []).length !== targetToc.length) return { ok: false, reason: "count" };
  return { ok: true, mapped: targetIds[i] };
}

/**
 * The heading at the same position (index) in the target page's outline as `anchor` is in the source's, when
 * both outlines have the same number of headings; otherwise `null` (ARCHITECTURE.md §6.12 §5, used identically
 * by `counterpartOf` at build time and by `switchLanguage` in the site — kept here as the one pure reference).
 * @param {{ sourceToc: object[]|null, targetToc: object[]|null, anchor: string }} p
 * @returns {string|null}
 */
export function mapAnchor({ sourceToc, targetToc, anchor }) {
  const r = classify({ sourceToc, targetToc, anchor });
  return r.ok ? (r.same ? anchor : r.mapped) : null;
}

// A Markdown link `[text](#/target~anchor)`, and the same written as raw HTML `href="#/target~anchor"` (both
// spellings the kit's own Markdown engine can leave untouched, ARCHITECTURE.md §6.6). The target and the anchor
// never contain ")", the closing quote or whitespace.
const MD_LINK = /\]\(#\/([^)~\s"]+)~([^)\s"]+)\)/g;
const HREF_LINK = /href="#\/([^"~\s]+)~([^"\s]+)"/g;

/** One rewrite pass; the replacement is always built from matched groups through a function (never a literal
 * replacement string), so that a target id or anchor containing "$" is never mis-expanded by String.replace. */
function rewrite(text, re, wrap, tocs, changed, unmapped) {
  return text.replace(re, (whole, target, anchor) => {
    const { source, target: targetToc } = tocs(target) || {};
    const result = classify({ sourceToc: source, targetToc, anchor });
    if (result.ok) {
      if (result.same) return whole;
      changed.push({ from: anchor, to: result.mapped, target });
      return wrap(target, result.mapped);
    }
    unmapped.push({ link: `#/${target}~${anchor}`, reason: result.reason });
    return whole;
  });
}

/**
 * Rewrites, deterministically, every `#/target~anchor` link of a translated page whose anchor is not a heading
 * of the translated target but is one of the source target, from the position of that heading.
 * @param {{ markdown: string, tocs: (pageId: string) => { source: object[]|null, target: object[]|null } }} p
 *   `tocs(pageId)`: the SOURCE and the TRANSLATED outline of that page (render().toc, both already rendered);
 *   `target: null` when the page has no translation at all.
 * @returns {{ text: string, changed: Array<{ from: string, to: string, target: string }>, unmapped: Array<{ link: string, reason: "missing"|"count"|"unknown" }> }}
 */
export function fixAnchors({ markdown, tocs }) {
  const changed = [];
  const unmapped = [];
  let text = rewrite(markdown, MD_LINK, (target, anchor) => `](#/${target}~${anchor})`, tocs, changed, unmapped);
  text = rewrite(text, HREF_LINK, (target, anchor) => `href="#/${target}~${anchor}"`, tocs, changed, unmapped);
  return { text, changed, unmapped };
}
