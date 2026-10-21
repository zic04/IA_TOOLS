// Topic groups (ARCHITECTURE.md §6.1a): the pages that treat one subject, each for its own readers — a feature sheet,
// its screen, its technical page, its runbook. A page's `counterpart` names one or more of them ("<page id>" or
// "<page id>~<anchor>"); a group is every page joined to another by a counterpart, either way: declared once, it is
// shown on each of its members. Shared by the build (the site's "This topic for" line), `context` and `sync`. Pure.

/**
 * The pages a counterpart names, a text or a list of texts.
 * @param {string|string[]|undefined} value
 * @returns {Array<{ id: string, anchor?: string }>}
 */
export function counterpartTargets(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((v) => {
    const [id, anchor] = String(v).split("~");
    return anchor ? { id, anchor } : { id };
  });
}

/**
 * The topic group of each page that belongs to one: page id → the other members, in the order of `pages`, each with
 * the anchor a counterpart gave it (the first one declared). A target that is no page, or the page itself, joins
 * nothing (the link check reports it).
 * @param {Array<{ id: string, counterpart?: string|string[] }>} pages   every page, in the order of the site
 * @returns {Map<string, Array<{ id: string, anchor?: string }>>}
 */
export function topicGroups(pages) {
  const known = new Set(pages.map((p) => p.id));
  // Union-find over the pages a counterpart joins.
  const parent = new Map();
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    // Every page on the way now points at the root.
    for (let y = x; parent.get(y) !== r;) {
      const next = parent.get(y);
      parent.set(y, r);
      y = next;
    }
    return r;
  };
  const join = (a, b) => {
    for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x);
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(rb, ra);
  };
  const anchors = new Map();
  for (const p of pages)
    for (const target of counterpartTargets(p.counterpart)) {
      if (!known.has(target.id) || target.id === p.id) continue;
      join(p.id, target.id);
      if (target.anchor && !anchors.has(target.id)) anchors.set(target.id, target.anchor);
    }
  const groups = new Map();
  for (const p of pages)
    if (parent.has(p.id)) {
      const root = find(p.id);
      groups.set(root, [...(groups.get(root) ?? []), p.id]);
    }
  const out = new Map();
  for (const ids of groups.values())
    for (const id of ids)
      out.set(
        id,
        ids.filter((x) => x !== id).map((x) => (anchors.has(x) ? { id: x, anchor: anchors.get(x) } : { id: x })),
      );
  return out;
}

/**
 * The topic group of one page of a table of contents: the other members (topicGroups), [] without one.
 * @param {{ sections?: any[] }} toc
 * @param {string} pageId
 */
export function topicOf(toc, pageId) {
  const pages = (toc.sections || []).flatMap((s) => (s.groups || []).flatMap((g) => g.pages || []));
  return topicGroups(pages).get(pageId) ?? [];
}
