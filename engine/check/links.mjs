// Internal links (#/page, #/page~anchor) and journey steps. Pure function, used by the build (blocking
// errors unless --draft) and by `doc-kit check links`. Only the links of PAGES are checked, as in the
// original engine (not those of section introductions or of the home page).

/**
 * @param {object} p
 * @param {Record<string, {id: string, toc: Array<{id: string}>}>} p.pages
 * @param {Record<string, string[]>} p.links   "#/…" links found in each page, by page id
 * @param {string[]} p.sections                section ids
 * @param {Array<{title: string, steps: string[]}>} [p.journeys]
 * @returns {Array<{kind: string, key: string, vars: object}>}
 */
export function checkLinks({ pages, links, sections, journeys = [] }) {
  const problems = [];
  const sectionIds = new Set(sections);
  for (const p of Object.values(pages)) {
    for (const link of links[p.id] || []) {
      const [target, anchor] = link.slice(2).split("~");
      if (!target) continue;
      if (!pages[target] && !sectionIds.has(target)) problems.push({ kind: "link", key: "link.broken", vars: { page: p.id, link } });
      else if (anchor && pages[target] && !pages[target].toc.some((t) => t.id === anchor))
        problems.push({ kind: "link", key: "link.anchor", vars: { page: p.id, link } });
    }
  }
  for (const j of journeys)
    for (const step of j.steps || []) if (!pages[step]) problems.push({ kind: "link", key: "link.journey", vars: { journey: j.title, page: step } });
  return problems;
}
