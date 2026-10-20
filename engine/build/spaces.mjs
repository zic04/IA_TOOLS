// Spaces (ARCHITECTURE.md §6.1a): one source, one site per audience. content/toc.json declares the spaces; every
// section names its own, a page or a journey may name another one. This module, shared by the build and the CLI:
//   - checks the declaration (space.* problems) and resolves the kind (standard/spaces.json) and texts of each space;
//   - derives the export of one space from the full site data (exportSite): the other spaces' pages are physically
//     removed, the links to them become their text, the images and the statistics are recounted;
//   - paths of the exports, declared ids and the --space option of the CLI.
import fs from "node:fs";
import path from "node:path";
import { esc } from "../core/text.mjs";
import { closest } from "../project/validate.mjs";
import { KIT_ROOT } from "../project/find.mjs";
import { readToc } from "../project/toc.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { loadSpaceProfiles, spaceKind } from "../core/space-profiles.mjs";
import { BOARD_PLACEHOLDER } from "./business.mjs";
import { withoutBoardTexts } from "./board.mjs";

/** Keys of the i18n fragment of the spaces (i18n/en/spaces.json): embedded only when the site uses them. */
export const SPACE_TEXT_KEYS = Object.freeze(
  Object.keys(JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "i18n", "en", "spaces.json"), "utf8"))),
);

/** Embedded texts without those of the spaces (a site that uses neither spaces nor counterparts). */
export function withoutSpaceTexts(texts) {
  const skip = new Set(SPACE_TEXT_KEYS);
  return Object.fromEntries(Object.entries(texts).filter(([k]) => !skip.has(k)));
}

/**
 * Checks the spaces of a table of contents and resolves their texts.
 * @param {object} p
 * @param {object} p.toc                       validated table of contents
 * @param {(key: string) => string} p.t        translator of the site language
 * @param {(name: string) => string} p.iconKey stored key of an icon name
 * @returns {{ spaces: object[]|null, errors: object[] }}
 *   spaces: [{ id, kind, title, shortTitle, subtitle, icon?, for, pages: 0, tech? }] in declaration order, null
 *   when none is declared (`tech`: its readers see the glossary's technical correspondence); errors: { kind:
 *   "space", key, vars } (text: `cli.build.<key>`), blocking even a draft build. The standard spaces (their ids
 *   are the kinds of standard/spaces.json) take their texts from ui.spaces.<id>.* in the site language, and
 *   every space its icon from its kind; any other space needs a title.
 */
export function resolveSpaces({ toc, t, iconKey }) {
  const errors = [];
  const problem = (key, vars) => errors.push({ kind: "space", key, vars });
  // Where a space is named: a section (its id), a page (its id) or a journey (its title).
  const named = [];
  for (const sec of toc.sections) {
    if (sec.space !== undefined) named.push({ where: sec.id, space: sec.space });
    for (const g of sec.groups)
      for (const p of g.pages) if (p.space !== undefined) named.push({ where: p.id, space: p.space });
  }
  for (const j of toc.journeys || []) if (j.space !== undefined) named.push({ where: j.title, space: j.space });

  if (!Array.isArray(toc.spaces)) {
    for (const x of named) problem("space.undeclared", { where: x.where });
    return { spaces: null, errors };
  }
  const declared = toc.spaces.map((s) => (typeof s === "string" ? { id: s } : s));
  const ids = [];
  for (const s of declared) {
    if (ids.includes(s.id)) problem("space.duplicate", { space: s.id });
    else ids.push(s.id);
  }
  const known = ids.join(", ");
  for (const sec of toc.sections) if (sec.space === undefined) problem("space.missing", { section: sec.id, known });
  for (const x of named)
    if (!ids.includes(x.space)) problem("space.unknown", { where: x.where, space: x.space, known });

  const profiles = loadSpaceProfiles();
  const kinds = [...profiles.keys()].join(", ");
  const spaces = [];
  for (const s of declared) {
    if (spaces.some((x) => x.id === s.id)) continue;
    const kind = spaceKind(s);
    if (!kind) {
      problem("space.kind", { space: s.id, kinds });
      continue;
    }
    const profile = profiles.get(kind);
    const standard = profiles.has(s.id);
    // A field of the object wins over the default text of a standard space.
    const text = (field) => s[field] ?? (standard ? t(`ui.spaces.${s.id}.${field}`) : undefined);
    const title = text("title");
    if (!title) {
      problem("space.title", { space: s.id, kinds });
      continue;
    }
    spaces.push({
      id: s.id,
      kind,
      title,
      shortTitle: text("shortTitle") ?? title,
      subtitle: text("subtitle") ?? "",
      icon: iconKey(s.icon ?? profile.icon),
      for: text("for") ?? "",
      pages: 0,
      ...flagsOf(profile),
    });
  }
  return { spaces, errors };
}

/** The flags of a kind the site reads: `tech` (the glossary's technical side), `board` (the Product board). */
const flagsOf = (profile) => ({
  ...(profile.glossaryTechnical ? { tech: true } : {}),
  ...(profile.board ? { board: true } : {}),
});

// ─── Exports ──────────────────────────────────────────────────────────────────
/** A link of the rendered HTML to a page or a section: <a … href="#/<target>[~anchor]" …>text</a>. */
const LINK = /<a\b([^>]*?)\bhref="#\/([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g;

/**
 * The board of a space's export (ARCHITECTURE.md §6.8b), as for the whole site (engine/build/render-language.mjs):
 * shown when its space's kind shows it or a page it keeps holds ::board{}; then the features whose sheet it keeps,
 * their stories, the epics left with a feature. Null otherwise, or when it keeps no feature.
 * @param {object} d  the export's site data, its spaces and pages already kept
 * @param {Set<string>} keep  the ids of the pages kept
 */
function boardOfExport(d, keep) {
  const shown = d.spaces[0]?.board || [...keep].some((id) => d.pages[id]?.html.includes(BOARD_PLACEHOLDER));
  const features = shown ? d.board.features.filter((f) => keep.has(f.page)) : [];
  if (!features.length) return null;
  const ids = new Set(features.map((f) => f.id));
  return {
    ...d.board,
    features,
    stories: d.board.stories.filter((s) => ids.has(s.feature)),
    epics: d.board.epics
      .map((e) => ({ ...e, features: e.features.filter((id) => ids.has(id)) }))
      .filter((e) => e.features.length),
  };
}

/**
 * Site data of the export of one space (a copy: `data` is not changed).
 * @param {object} p
 * @param {object} p.data   full site data (pages[].space, sections[].space, journeys[].space, spaces)
 * @param {string} p.space  id of the exported space
 * @param {{ pages: Record<string, object>, intros: Record<string, object>, home: object|null }} p.used
 *   what each rendered document uses ({ images: Set, diagrams: Set, zones }, engine/build/markdown.mjs)
 * @param {(key: string, vars?: object) => string} p.t  translator of the site language
 * @returns {{ data: object, images: Set<string>, excludedLinks: number }}
 */
export function exportSite({ data, space, used, t }) {
  const d = structuredClone(data);
  delete d.meta.screenshots; // recomputed from the kept pages by assemble()
  const keep = new Set(d.order.filter((id) => d.pages[id]?.space === space));
  d.sections = d.sections
    .map((s) => ({
      ...s,
      groups: s.groups
        .map((g) => ({ ...g, pages: g.pages.filter((id) => keep.has(id)) }))
        .filter((g) => g.pages.length),
    }))
    .filter((s) => s.groups.length);
  const sectionsKept = new Set(d.sections.map((s) => s.id));
  d.pages = Object.fromEntries(Object.entries(d.pages).filter(([id]) => keep.has(id)));
  d.order = d.order.filter((id) => keep.has(id));
  d.search = d.search.filter((e) => keep.has(e.p));
  d.suggestions = d.suggestions.filter((id) => keep.has(id));
  d.journeys = d.journeys
    .filter((j) => j.space === space)
    .map((j) => {
      const steps = j.steps.filter((id) => keep.has(id));
      const hidden = j.steps.length - steps.length;
      return { ...j, steps, ...(hidden ? { hidden } : {}) };
    });

  // Links to a page or a section of another space: their text, then "(see the {space} documentation)".
  const spaceOfTarget = (target) => data.pages[target]?.space ?? data.sections.find((s) => s.id === target)?.space;
  const shortTitle = (id) => data.spaces.find((s) => s.id === id)?.shortTitle ?? id;
  let excludedLinks = 0;
  const rewrite = (html) =>
    String(html || "").replace(LINK, (m, before, href, after, text) => {
      const target = href.split("~")[0];
      if (!target || keep.has(target) || sectionsKept.has(target)) return m;
      const other = spaceOfTarget(target);
      if (!other) return m; // an unknown target: a broken link, reported by the link check
      excludedLinks++;
      return `<span class="lien-exclu">${text}</span>${esc(t("render.spaces.excludedLink", { space: shortTitle(other) }))}`;
    });
  for (const p of Object.values(d.pages)) {
    p.html = rewrite(p.html);
    // The topic group (§6.1a): the members the export keeps; none, no line.
    if (p.topic) p.topic = p.topic.filter((m) => keep.has(m.id));
    if (p.topic?.length === 0) delete p.topic;
  }
  // A section kept for some of its pages loses its introduction, subtitle and highlights: they belong to its own
  // space, with its overview.
  for (const s of d.sections) {
    if (s.space === space) s.introHtml = rewrite(s.introHtml);
    else Object.assign(s, { subtitle: "", highlights: [], featured: false, introHtml: "" });
  }
  d.homeHtml = rewrite(d.homeHtml);

  // What is kept: its images (embedded) and its statistics.
  const images = new Set();
  const diagrams = new Set();
  let zones = 0;
  const count = (u) => {
    if (!u) return;
    for (const id of u.images) images.add(id);
    for (const id of u.diagrams) diagrams.add(id);
    zones += u.zones;
  };
  for (const id of d.order) count(used.pages[id]);
  for (const s of d.sections) if (s.space === space) count(used.intros[s.id]);
  count(used.home);
  d.meta.stats = { pages: d.order.length, captures: images.size, zones, diagrams: diagrams.size };
  d.meta.space = space;
  d.spaces = d.spaces.filter((s) => s.id === space);
  // The glossary is kept whole (§7), except its technical correspondence (§6.8): only the export of a space whose
  // kind shows it (admin, develop: `tech`) keeps it.
  if (!d.spaces[0]?.tech) d.glossary = d.glossary.map(({ tech, ...rest }) => rest);
  // The board: what the export keeps of it, or neither the board nor its texts.
  if (d.board) {
    const board = boardOfExport(d, keep);
    if (board) d.board = board;
    else {
      delete d.board;
      d.i18n = withoutBoardTexts(d.i18n);
    }
  }
  return { data: d, images, excludedLinks };
}

/**
 * File of the export of a space: `spaces.output` with {space} replaced (relative to the project), otherwise the
 * full site's output with -<space> before its extension (dist/Acme-Orders-Documentation-business.html).
 * @param {string} root     project folder
 * @param {object} config   validated configuration
 * @param {string} space    space id
 * @param {string} output   absolute path of the full site
 */
export function spaceOutput(root, config, space, output) {
  if (config.spaces?.output) return path.resolve(root, config.spaces.output.split("{space}").join(space));
  const ext = path.extname(output);
  return `${output.slice(0, output.length - ext.length)}-${space}${ext}`;
}

/** Ids of the spaces declared by the project's table of contents (read only for that), or null. */
export function declaredSpaceIds(root, config) {
  const { toc } = readToc(root, config.paths.content); // null when unreadable: reported by the build
  if (!Array.isArray(toc?.spaces)) return null;
  return [
    ...new Set(toc.spaces.map((s) => (typeof s === "string" ? s : s?.id)).filter((id) => typeof id === "string")),
  ];
}

/**
 * The --space option of build, view and open: a declared id, otherwise a usage error (exit code 2).
 * @param {{ ids: string[]|null, space: string, t: (key: string, vars?: object) => string }} p  t: CLI translator
 * @throws {KitError} build.noSpaces (no space declared), build.spaceUnknown (with the closest id)
 */
export function checkSpaceOption({ ids, space, t }) {
  if (!ids || !ids.length) throw new KitError(EXIT.USAGE, "build.noSpaces", {});
  if (ids.includes(space)) return space;
  const near = closest(String(space), ids);
  throw new KitError(EXIT.USAGE, "build.spaceUnknown", {
    space,
    known: ids.join(", "),
    closest: near ? t("cli.build.spaceUnknown.closest", { space: near }) : "",
  });
}
