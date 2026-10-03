// What every step of `build` (build.mjs) shares: the project's paths, the file readers, and the problems found so
// far. A problem is `report`ed as strict (an error, a warning with --draft) or not (always a warning).
import fs from "node:fs";
import path from "node:path";
import { normalizeZones } from "../project/legacy.mjs";
import { validate } from "../project/validate.mjs";
import { readSchema } from "../project/load.mjs";

/**
 * @param {{ project: { root: string }, config: object, options: object }} p
 * @returns {object} the build context: root, config, options, draft, paths, languages, errors, warnings,
 *   legacyFiles, readFs, existsFs, report, readJson, validateContent
 */
export function createBuildContext({ project, config, options }) {
  const root = project.root;
  const draft = !!options.draft;
  const errors = [];
  const warnings = [];
  const b = {
    root,
    config,
    options,
    draft,
    paths: config.paths,
    languages: config.languages || null,
    errors,
    warnings,
    /** Legacy French-named files read (ARCHITECTURE.md §6.7), for the one `legacy.read` warning. */
    legacyFiles: [],
    readFs: (p) => fs.readFileSync(path.join(root, p), "utf8"),
    existsFs: (p) => fs.existsSync(path.join(root, p)),
    report: (strict, s) => (strict && !draft ? errors : warnings).push(s),
  };
  b.readJson = (file) => {
    try {
      return JSON.parse(b.readFs(file));
    } catch (e) {
      b.report(true, { kind: "json", key: "json.invalid", vars: { file, error: e.message } });
      return undefined;
    }
  };
  b.validateContent = (value, schema, file) => {
    const r = validate(value, readSchema(schema));
    for (const e of r.errors) b.report(true, { kind: "validate", key: e.key, vars: e.vars, file, path: e.path });
    return r.errors.length === 0;
  };
  return b;
}

/**
 * The zone files of a folder (`<images>/zones`, or `<images>/<lang>/zones` for a language), normalised and
 * validated: { captures: { id: zones }, legacy: number of legacy files }; nothing without the folder.
 */
export function readZoneFolder(b, dir) {
  const captures = {};
  let legacy = 0;
  if (!b.existsFs(dir)) return { captures, legacy };
  for (const f of fs.readdirSync(path.join(b.root, dir)).filter((x) => x.endsWith(".json"))) {
    const file = `${dir}/${f}`;
    const raw = b.readJson(file);
    if (raw === undefined) continue;
    const nz = normalizeZones(raw);
    if (nz.legacy) legacy++;
    if (b.validateContent(nz.value, "zones", file)) captures[f.slice(0, -5)] = nz.value;
  }
  return { captures, legacy };
}

/** Translated `<lang>.json` content file (toc.json / glossary.json): parsed, or null (missing / unreadable). */
export function readTranslatedJson(b, lang, name) {
  const rel = `${b.paths.translations}/${lang}/${name}`;
  if (!b.existsFs(rel)) return null;
  try {
    return JSON.parse(b.readFs(rel));
  } catch (e) {
    b.report(true, { kind: "translation", key: "translation.missing", vars: { lang, file: name, error: e.message } });
    return null;
  }
}

/**
 * Per-language rendering reader (§6.12). Diagrams and images of a translated language, when they exist, replace
 * the source's for that language; a capture's own existence check (markdown.mjs) therefore also falls back to the
 * source file. Facts (common to every language) and anything else are read exactly like the source. A translated
 * diagram lives under the TRANSLATIONS tree (`<paths.translations>/<lang>/diagrams/<id>.svg`, mirroring content/,
 * ARCHITECTURE.md §6.12); a translated image lives as a SIBLING of <paths.images> (`<paths.images>/<lang>/<id>.webp`, §7).
 */
export function engineReadersFor(b, lang) {
  const { images, diagrams, translations } = b.paths;
  const { existsFs, readFs } = b;
  const diagramPath = (rel) =>
    existsFs(`${translations}/${lang}/${diagrams}/${rel}`) ? `${translations}/${lang}/${diagrams}/${rel}` : null;
  const imagePath = (rel) => (existsFs(`${images}/${lang}/${rel}`) ? `${images}/${lang}/${rel}` : null);
  return {
    exists: (p) => {
      if (p.startsWith(`${diagrams}/`)) return existsFs(diagramPath(p.slice(diagrams.length + 1)) || p) || existsFs(p);
      if (p.startsWith(`${images}/`)) return existsFs(imagePath(p.slice(images.length + 1)) || p) || existsFs(p);
      return existsFs(p);
    },
    read: (p) => {
      if (p.startsWith(`${diagrams}/`)) {
        const f = diagramPath(p.slice(diagrams.length + 1));
        if (f) return readFs(f);
      }
      return readFs(p);
    },
  };
}
