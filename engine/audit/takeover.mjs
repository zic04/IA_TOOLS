// The takeover dossier of the audit (standard/maturity.md): where its pages live and whether each required one is
// there. With spaces (ARCHITECTURE.md §6.1a), their kinds decide (standard/spaces.json): the takeover pages —
// proofs expected, outside written2 — are those of a kind with `proofs` (develop); the required takeover pages are
// looked for in the spaces whose kind holds them (`takeoverItems`: admin, develop), and each is suggested in the
// first section of its space. Without spaces: the Take over section (`take-over`, `reprendre`), or the last one.
import { analysePage } from "../core/page-templates.mjs";
import { declaredSpaces, loadSpaceProfiles } from "../core/space-profiles.mjs";
import { TAKEOVER_ITEMS } from "./thresholds.mjs";

/** Without spaces: ids of the Take over section; otherwise the last section (when there are at least two). */
const TAKEOVER_SECTION_IDS = ["take-over", "reprendre"];
/** Usual page types of the standard sections (standard/structure.md), used to guess the type of an untyped page. */
const SECTION_TYPES = Object.freeze({
  use: ["screen"],
  utiliser: ["screen"],
  administer: ["screen"],
  administrer: ["screen"],
  configure: ["editor", "recipe"],
  configurer: ["editor", "recipe"],
});

/**
 * Where the dossier lives in a table of contents.
 * @param {object} toc   table of contents
 * @returns {{ declared: ReturnType<typeof declaredSpaces>, takeoverId: string|null,
 *   itemSpaces: Record<string, string|null>, itemSections: Record<string, string|null>,
 *   roleOf: (sec: object, p: object) => { space: string|null, takeover: boolean, inDossier: boolean, prefer: string[] } }}
 *   takeoverId: the section of the dossier (the first of a `proofs` space, else of a space holding takeover pages);
 *   itemSpaces: the space each required takeover page belongs to — the first declared space whose kind holds it,
 *   else the dossier's main space (its level counts it: takeover4); itemSections: where each is suggested, the
 *   usual part of that space (`parts`), else its section holding a page of that type, else its first; roleOf: what a page of the table is for the audit (`takeover`: a takeover page;
 *   `inDossier`: looked at for the required pages; `prefer`: types to guess first).
 */
export function dossierLayout(toc) {
  const sections = toc.sections.map((s) => s.id);
  const declared = declaredSpaces(toc);
  const spaceOf = (sec, p) => p.space ?? sec.space ?? null;
  const firstSection = (space) =>
    space === null || space === undefined
      ? null
      : ((
          toc.sections.find((s) => s.space === space) ??
          toc.sections.find((s) => (s.groups || []).some((g) => (g.pages || []).some((p) => spaceOf(s, p) === space)))
        )?.id ?? null);
  const dossier = (declared || []).filter((s) => s.profile?.takeoverItems.length);
  const main = dossier.find((s) => s.profile.proofs) ?? dossier[0] ?? null;
  const takeoverId = declared
    ? firstSection(main?.id)
    : (sections.find((s) => TAKEOVER_SECTION_IDS.includes(s)) ?? (sections.length > 1 ? sections.at(-1) : null));
  const itemSpaces = Object.fromEntries(
    TAKEOVER_ITEMS.map((item) => [
      item.id,
      (dossier.find((s) => s.profile.takeoverItems.includes(item.id)) ?? main)?.id ?? null,
    ]),
  );
  const pagesIn = (s) => (s.groups || []).flatMap((g) => g.pages || []);
  // Where a required page is suggested: the usual part of its space (structure.md), else the section of that space
  // that already holds a page of its type, else the first section of the space.
  const itemSection = (item) => {
    const space = itemSpaces[item.id];
    const own = space ? toc.sections.filter((s) => pagesIn(s).some((p) => spaceOf(s, p) === space)) : [];
    const type = item.type ?? item.template;
    const usual =
      own.find((s) => item.parts.includes(s.id)) ?? own.find((s) => pagesIn(s).some((p) => p.template === type));
    return usual?.id ?? firstSection(space) ?? takeoverId;
  };
  const itemSections = Object.fromEntries(TAKEOVER_ITEMS.map((item) => [item.id, itemSection(item)]));
  // Without spaces, the Take over section's usual types: those of the kind that expects proofs (develop).
  const takeoverTypes = [...loadSpaceProfiles().values()].find((p) => p.proofs)?.preferTypes ?? [];
  const roleOf = (sec, p) => {
    const space = spaceOf(sec, p);
    if (!declared) {
      const takeover = sec.id === takeoverId;
      return { space, takeover, inDossier: takeover, prefer: takeover ? takeoverTypes : SECTION_TYPES[sec.id] || [] };
    }
    const profile = declared.find((s) => s.id === space)?.profile ?? null;
    return {
      space,
      takeover: !!profile?.proofs,
      inDossier: !!profile?.takeoverItems.length,
      prefer: SECTION_TYPES[sec.id] ?? profile?.preferTypes ?? [],
    };
  };
  return { declared, takeoverId, itemSpaces, itemSections, roleOf };
}

/** The `takeover` indicator: how many of the required takeover pages evaluated are there. */
export function takeoverIndicator(results) {
  const n = results.filter((t) => t.ok).length;
  return { kind: "ratio", measured: true, n, total: results.length, value: results.length ? n / results.length : null };
}

/**
 * The required Take over pages (`items`, the 7 of standard/maturity.md by default): present or not, the page that
 * satisfies each, candidates, and the section where each is suggested (`sections`: item id → section id).
 */
export function evaluateTakeover({ pages, subPages, sections, items = TAKEOVER_ITEMS, table, language }) {
  // Only the written pages count (standard/maturity.md): a draft, or a page without its file, is named as the page
  // to write (`unwritten`), never as present.
  const live = pages.filter((p) => p.written);
  const typeOf = (p) => p.template || p.guess?.type || null;
  const pending = (test) => {
    const u = pages.find((p) => !p.written && test(p));
    return u ? { id: u.id, state: u.state } : null;
  };
  return items.map((item) => {
    const r = {
      id: item.id,
      section: sections[item.id] ?? null,
      ok: false,
      page: null,
      candidate: null,
      unwritten: null,
      template: item.template,
      suggest: item.suggest,
      sub: item.sub || null,
      min: item.min || 0,
    };
    if (!r.section) return r;
    if (item.match) {
      const p = live.find(item.match);
      return { ...r, ok: !!p, page: p?.id ?? null, unwritten: p ? null : pending(item.match) };
    }
    for (const p of live.filter((x) => x.template === item.type)) {
      const subs = item.sub ? subPages(p).filter((s) => s.written && s.template === item.sub).length : 0;
      const numbered = item.numbered ? p.finding || subPages(p).some((s) => s.finding) : true;
      if (subs >= r.min && numbered) return { ...r, ok: true, page: p.id };
      if (!r.page) Object.assign(r, { page: p.id, subs, numbered });
    }
    if (!r.page) {
      // Not typed yet: a page that follows the template, or whose id is the conventional one.
      const c = live.find((p) => typeOf(p) === item.type) || live.find((p) => item.hint.test(p.id) && p.level === 1);
      if (c) {
        const subs = item.sub ? subPages(c).filter((s) => s.written && typeOf(s) === item.sub).length : 0;
        const missing = analysePage({ table, type: item.type, headings: c.headings, language }).missing;
        r.candidate = { id: c.id, follows: typeOf(c) === item.type, subs, missing };
      } else r.unwritten = pending((p) => p.level === 1 && (p.template === item.type || item.hint.test(p.id)));
    }
    return r;
  });
}
