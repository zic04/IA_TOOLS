// Spaces (ARCHITECTURE.md §6.1a): one source, one site per audience. content/toc.json declares the spaces; every
// section names its own, a page or a journey may name another one. This module, shared by the build and the CLI:
//   - checks the declaration (space.* problems) and resolves the texts of each space (SPACE_DEFAULTS);
//   - derives the export of one space from the full site data (exportSite): the other spaces' pages are physically
//     removed, the links to them become their text, the images and the statistics are recounted;
//   - paths of the exports, declared ids and the --space option of the CLI.
import fs from "node:fs";
import path from "node:path";
import { esc } from "./text.mjs";
import { closest } from "../project/validate.mjs";
import { KIT_ROOT } from "../project/find.mjs";
import { normalizeToc, LEGACY_FILES, CURRENT_FILES } from "../project/legacy.mjs";
import { KitError, EXIT } from "../project/errors.mjs";

/**
 * The spaces of the standard (standard/structure.md): their texts are the keys ui.spaces.<id>.title, shortTitle,
 * subtitle and for, in the site language; their icon comes from the kit's set. Any other space needs a title.
 */
export const SPACE_DEFAULTS = Object.freeze({ business: Object.freeze({ icon: "book" }), takeover: Object.freeze({ icon: "code" }) });

/** Keys of the i18n fragment of the spaces (i18n/en/spaces.json): embedded only when the site uses them. */
export const SPACE_TEXT_KEYS = Object.freeze(Object.keys(JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "i18n", "en", "spaces.json"), "utf8"))));

/** Embedded texts without those of the spaces (a site that uses neither spaces nor counterparts). */
export function withoutSpaceTexts(texts) {
  const skip = new Set(SPACE_TEXT_KEYS);
  return Object.fromEntries(Object.entries(texts).filter(([k]) => !skip.has(k)));
}

/**
 * Checks the spaces of a table of contents and resolves their texts.
 * @param {object} p
 * @param {object} p.toc                       normalised and validated table of contents
 * @param {(key: string) => string} p.t        translator of the site language
 * @param {(name: string) => string} p.iconKey stored key of an icon name
 * @returns {{ spaces: object[]|null, errors: object[] }}
 *   spaces: [{ id, title, shortTitle, subtitle, icon?, for, pages: 0 }] in declaration order, null when none is
 *   declared; errors: { kind: "space", key, vars } (text: `cli.build.<key>`), blocking even a draft build.
 */
export function resolveSpaces({ toc, t, iconKey }) {
  const errors = [];
  const problem = (key, vars) => errors.push({ kind: "space", key, vars });
  // Where a space is named: a section (its id), a page (its id) or a journey (its title).
  const named = [];
  for (const sec of toc.sections) {
    if (sec.space !== undefined) named.push({ where: sec.id, space: sec.space });
    for (const g of sec.groups) for (const p of g.pages) if (p.space !== undefined) named.push({ where: p.id, space: p.space });
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
  for (const x of named) if (!ids.includes(x.space)) problem("space.unknown", { where: x.where, space: x.space, known });

  const spaces = [];
  for (const s of declared) {
    if (spaces.some((x) => x.id === s.id)) continue;
    const standard = SPACE_DEFAULTS[s.id];
    // A field of the object wins over the default text of a standard space.
    const text = (field) => s[field] ?? (standard ? t(`ui.spaces.${s.id}.${field}`) : undefined);
    const title = text("title");
    if (!title) {
      problem("space.title", { space: s.id });
      continue;
    }
    const icon = s.icon ?? standard?.icon;
    spaces.push({ id: s.id, title, shortTitle: text("shortTitle") ?? title, subtitle: text("subtitle") ?? "", ...(icon ? { icon: iconKey(icon) } : {}), for: text("for") ?? "", pages: 0 });
  }
  return { spaces, errors };
}

/** "<page id>[~anchor]" → { id, anchor? } (site data, pages[].counterpart). */
export function counterpartOf(value) {
  const [id, anchor] = String(value).split("~");
  return anchor ? { id, anchor } : { id };
}

// ─── Exports ──────────────────────────────────────────────────────────────────
/** A link of the rendered HTML to a page or a section: <a … href="#/<target>[~anchor]" …>text</a>. */
const LINK = /<a\b([^>]*?)\bhref="#\/([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g;

/**
 * Site data of the export of one space (a copy: `data` is not changed).
 * @param {object} p
 * @param {object} p.data   full site data (pages[].space, sections[].space, parcours[].space, spaces)
 * @param {string} p.space  id of the exported space
 * @param {{ pages: Record<string, object>, intros: Record<string, object>, home: object|null }} p.used
 *   what each rendered document uses ({ images: Set, diagrams: Set, zones }, engine/build/markdown.mjs)
 * @param {(key: string, vars?: object) => string} p.t  translator of the site language
 * @returns {{ data: object, images: Set<string>, excludedLinks: number }}
 */
export function exportSite({ data, space, used, t }) {
  const d = structuredClone(data);
  delete d.meta.screenshots; // recomputed from the kept pages by assemble()
  const keep = new Set(d.ordre.filter((id) => d.pages[id]?.space === space));
  d.sections = d.sections
    .map((s) => ({ ...s, groupes: s.groupes.map((g) => ({ ...g, pages: g.pages.filter((id) => keep.has(id)) })).filter((g) => g.pages.length) }))
    .filter((s) => s.groupes.length);
  const sectionsKept = new Set(d.sections.map((s) => s.id));
  d.pages = Object.fromEntries(Object.entries(d.pages).filter(([id]) => keep.has(id)));
  d.ordre = d.ordre.filter((id) => keep.has(id));
  d.recherche = d.recherche.filter((e) => keep.has(e.p));
  d.suggestions = d.suggestions.filter((id) => keep.has(id));
  d.parcours = d.parcours
    .filter((j) => j.space === space)
    .map((j) => {
      const etapes = j.etapes.filter((id) => keep.has(id));
      const hidden = j.etapes.length - etapes.length;
      return { ...j, etapes, ...(hidden ? { hidden } : {}) };
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
    if (p.counterpart && !keep.has(p.counterpart.id)) delete p.counterpart;
  }
  // A section kept for some of its pages loses its introduction, subtitle and highlights: they belong to its own
  // space, with its overview.
  for (const s of d.sections) {
    if (s.space === space) s.intro_html = rewrite(s.intro_html);
    else Object.assign(s, { sous_titre: "", points: [], vedette: false, intro_html: "" });
  }
  d.accueil_html = rewrite(d.accueil_html);

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
  for (const id of d.ordre) count(used.pages[id]);
  for (const s of d.sections) if (s.space === space) count(used.intros[s.id]);
  count(used.home);
  d.meta.stats = { pages: d.ordre.length, captures: images.size, zones, schemas: diagrams.size };
  d.meta.space = space;
  d.spaces = d.spaces.filter((s) => s.id === space);
  // The glossary is kept whole (§7), except its technical correspondence (§6.8): only the takeover export keeps it.
  if (space !== "takeover") d.glossaire = d.glossaire.map(({ tech, ...rest }) => rest);
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
  const file = [CURRENT_FILES.toc, LEGACY_FILES.toc].map((f) => path.join(root, config.paths.content, f)).find((f) => fs.existsSync(f));
  if (!file) return null;
  try {
    const toc = normalizeToc(JSON.parse(fs.readFileSync(file, "utf8"))).value;
    if (!Array.isArray(toc?.spaces)) return null;
    return [...new Set(toc.spaces.map((s) => (typeof s === "string" ? s : s?.id)).filter((id) => typeof id === "string"))];
  } catch {
    return null; // an unreadable table of contents is reported by the build
  }
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
  throw new KitError(EXIT.USAGE, "build.spaceUnknown", { space, known: ids.join(", "), closest: near ? t("cli.build.spaceUnknown.closest", { space: near }) : "" });
}
