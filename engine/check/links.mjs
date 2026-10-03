// Internal links (#/page, #/page~anchor), journey steps and page counterparts (ARCHITECTURE.md §6.1a). Pure
// function, used by the build (blocking errors unless --draft) and by `doc-kit check links`. Only the links of
// PAGES are checked, as in the original engine (not those of section introductions or of the home page).

/**
 * @param {object} p
 * @param {Record<string, {id: string, toc: Array<{id: string}>}>} p.pages
 * @param {Record<string, string[]>} p.links   "#/…" links found in each page, by page id
 * @param {string[]} p.sections                section ids
 * @param {Array<{title: string, steps: string[]}>} [p.journeys]
 * @param {Record<string, string>} [p.counterparts]  "<page id>[~anchor]" declared by each page, by page id
 * @param {Set<string>} [p.unwritten]           pages declared without their file: the anchors that point into them
 *   cannot be checked before they are written (the build reports the missing page once, ARCHITECTURE.md §6.4)
 * @returns {Array<{kind: string, key: string, vars: object}>}
 */
export function checkLinks({ pages, links, sections, journeys = [], counterparts = {}, unwritten = new Set() }) {
  const problems = [];
  const sectionIds = new Set(sections);
  for (const p of Object.values(pages)) {
    for (const link of links[p.id] || []) {
      const [target, anchor] = link.slice(2).split("~");
      if (!target) continue;
      if (!pages[target] && !sectionIds.has(target)) problems.push({ kind: "link", key: "link.broken", vars: { page: p.id, link } });
      else if (anchor && pages[target] && !unwritten.has(target) && !pages[target].toc.some((t) => t.id === anchor))
        problems.push({ kind: "link", key: "link.anchor", vars: { page: p.id, link } });
    }
  }
  for (const j of journeys)
    for (const step of j.steps || []) if (!pages[step]) problems.push({ kind: "link", key: "link.journey", vars: { journey: j.title, page: step } });
  // A counterpart names ANOTHER page (a section is not a counterpart); its anchor is checked like a link's.
  for (const [id, value] of Object.entries(counterparts)) {
    const [target, anchor] = value.split("~");
    const link = `#/${value}`;
    if (!pages[target] || target === id) problems.push({ kind: "link", key: "link.counterpart", vars: { page: id, link } });
    else if (anchor && !unwritten.has(target) && !pages[target].toc.some((t) => t.id === anchor)) problems.push({ kind: "link", key: "link.anchor", vars: { page: id, link } });
  }
  return problems;
}
