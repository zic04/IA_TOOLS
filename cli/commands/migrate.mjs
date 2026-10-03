// migrate — rewrites the legacy French-keyed files in the current format (ARCHITECTURE.md §6.7):
//   <content>/sommaire.json → <content>/toc.json        <content>/glossaire.json → <content>/glossary.json
//   <content>/accueil.md    → <content>/home.md          <images>/zones/*.json    → rewritten in place
// Folder names are kept (declared through `paths`). Capture plans are JavaScript: they are normalised when
// read, never rewritten. Nothing is written when the normalised table of contents is invalid (exit code 1).
import fs from "node:fs";
import path from "node:path";
import {
  normalizeToc,
  normalizeGlossary,
  normalizeZones,
  LEGACY_FILES,
  CURRENT_FILES,
} from "../../engine/project/legacy.mjs";
import { validate } from "../../engine/project/validate.mjs";
import { readSchema } from "../../engine/project/load.mjs";
import { HOME_FILES } from "../../engine/build/build.mjs";

export const options = {};

/**
 * Migrates a project folder. Pure enough to be tested: returns what was done.
 * @returns {{ converted: Array<{from: string, to: string}>, errors: object[] }}
 */
export function migrateProject(root, paths) {
  const converted = [];
  const errors = [];
  const rel = (...p) =>
    path
      .join(...p)
      .split(path.sep)
      .join("/");
  const abs = (p) => path.join(root, p);
  const writeJson = (p, value) => fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + "\n");

  const plan = [];
  for (const [
    kind,
    normalize,
    schema,
  ] of /** @type {Array<["toc"|"glossary", (raw: any) => { value: any }, string]>} */ ([
    ["toc", normalizeToc, "toc"],
    ["glossary", normalizeGlossary, "glossary"],
  ])) {
    const legacy = rel(paths.content, LEGACY_FILES[kind]);
    const current = rel(paths.content, CURRENT_FILES[kind]);
    if (!fs.existsSync(abs(legacy)) || fs.existsSync(abs(current))) continue;
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(abs(legacy), "utf8"));
    } catch (e) {
      errors.push({ kind: "json", key: "json.invalid", vars: { file: legacy, error: e.message } });
      continue;
    }
    const { value } = normalize(raw);
    for (const e of validate(value, readSchema(schema)).errors)
      errors.push({ kind: "validate", key: e.key, vars: e.vars, file: legacy, path: e.path });
    plan.push({ legacy, current, value });
  }
  if (errors.length) return { converted, errors };

  for (const { legacy, current, value } of plan) {
    writeJson(current, value);
    fs.unlinkSync(abs(legacy));
    converted.push({ from: legacy, to: current });
  }
  const [home, oldHome] = HOME_FILES.map((f) => rel(paths.content, f));
  if (fs.existsSync(abs(oldHome)) && !fs.existsSync(abs(home))) {
    fs.renameSync(abs(oldHome), abs(home));
    converted.push({ from: oldHome, to: home });
  }
  const zones = rel(paths.images, "zones");
  for (const f of fs.existsSync(abs(zones))
    ? fs
        .readdirSync(abs(zones))
        .filter((x) => x.endsWith(".json"))
        .sort()
    : []) {
    const file = rel(zones, f);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(abs(file), "utf8"));
    } catch (e) {
      errors.push({ kind: "json", key: "json.invalid", vars: { file, error: e.message } });
      continue;
    }
    const r = normalizeZones(raw);
    if (!r.legacy) continue;
    writeJson(file, r.value);
    converted.push({ from: file, to: file });
  }
  return { converted, errors };
}

export async function run({ ctx }) {
  const { project, config } = await ctx.loadProject();
  const r = migrateProject(project.root, config.paths);
  if (ctx.json) {
    ctx.print(JSON.stringify(r, null, 2));
    return r.errors.length ? 1 : 0;
  }
  ctx.printProblems({ errors: r.errors });
  if (r.errors.length) return 1;
  if (!r.converted.length) {
    ctx.print(ctx.t("cli.migrate.nothing"));
    return 0;
  }
  for (const c of r.converted) ctx.print(ctx.t("cli.migrate.converted", c));
  ctx.print(ctx.t("cli.migrate.summary", { n: r.converted.length }));
  if (config.paths.content !== "content" || config.paths.diagrams !== "diagrams")
    ctx.print(ctx.t("cli.migrate.pathsHint", { content: config.paths.content, diagrams: config.paths.diagrams }));
  return 0;
}
