// The data of the Product board (ARCHITECTURE.md §6.8b): the backlog model (engine/build/backlog.mjs) as the site
// reads it (D.board, engine/site/lib/board.js) — its epics, features and stories in order, each ticket's link already
// made (config.backlog.refs: the browser never builds an address), each kind of behaviour with its label in the
// site's language and its icon. Given only when the site has a space whose kind shows the board (standard/spaces.json
// `board`) or a page holds `::board{}`, and only when there is a feature sheet. Pure.
import { parseRef, refUrl } from "../core/refs.mjs";
import { inLanguage } from "../core/behaviours.mjs";

/** A ticket for the site: its text, and its link when the project has the tool's address; null without one. */
function ticketOf(ref, refs) {
  if (!ref) return null;
  const url = refUrl(parseRef(ref), refs);
  return url ? { text: ref, url } : { text: ref };
}

/**
 * @param {ReturnType<typeof import("./backlog.mjs").backlogModel>} model
 * @param {{ refs?: Record<string, string>, kinds: Map<string, any>, language: string, iconKey: (name: string) => string }} o
 *   kinds: the behaviour registry's kinds (engine/core/behaviours.mjs)
 */
export function boardData(model, { refs, kinds, language, iconKey }) {
  const used = new Set(model.features.flatMap((f) => f.kinds));
  return {
    epics: model.epics.map((e) => ({
      id: e.id,
      title: e.title,
      summary: e.summary,
      ticket: ticketOf(e.ref, refs),
      features: e.features,
    })),
    features: model.features.map((f) => ({
      id: f.id,
      title: f.title,
      summary: f.summary,
      page: f.page,
      epic: f.epic,
      since: f.since,
      ticket: ticketOf(f.ref, refs),
      roles: f.roles,
      kinds: f.kinds,
      rules: f.rules,
      criteria: f.criteria,
      stories: f.stories,
      depth: { score: f.depth.score, criteria: f.depth.criteria.map((c) => c.value) },
    })),
    stories: model.stories.map((s) => ({
      id: s.id,
      title: s.title,
      role: s.role,
      since: s.since,
      ticket: ticketOf(s.ref, refs),
      feature: s.feature,
      page: s.page,
      anchor: s.anchor,
      criteria: s.criteria,
    })),
    versions: model.versions,
    kinds: Object.fromEntries(
      [...used].map((id) => {
        const kind = kinds.get(id);
        return [id, { title: kind ? inLanguage(kind.title, language) : id, icon: iconKey(kind?.icon ?? "mecanisme") }];
      }),
    ),
  };
}

/** Embedded texts without the board's (ui.board.*): a site, or a space's export, that does not show it. */
export const withoutBoardTexts = (texts) =>
  Object.fromEntries(Object.entries(texts).filter(([k]) => !k.startsWith("ui.board.")));
