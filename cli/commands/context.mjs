// context <page…> [--budget <tokens>] [--update]
// Writes .doc-kit/context/<page id, "/" → "__">.md, the only reading an agent needs to write or update that page
// (ARCHITECTURE.md §6.11): its dependencies (ARCHITECTURE.md §6.10) instead of the whole code inventory and table
// of contents. A page unknown to the table of contents: exit code 2; a declared page not written yet is accepted
// (the context serves to write it). --update also needs .doc-kit/sync-report.json (doc-kit sync): without it,
// exit code 2.
import fs from "node:fs";
import path from "node:path";
import { runCoverage, adapterTools } from "../../engine/check/coverage.mjs";
import { loadPlans } from "../../engine/capture/plans.mjs";
import { pageDependencies, findPageEntry } from "../../engine/sync/dependencies.mjs";
import { labelFiles, flattenMessages } from "../../engine/sync/labels.mjs";
import { readSyncReference } from "../../engine/sync/reference.mjs";
import { buildContext, contextFileName } from "../../engine/context/context.mjs";
import { buildTranslateContext, translateContextFileName, findSourceCommit } from "../../engine/context/translate.mjs";
import { readProjectVersion } from "../../engine/build/build.mjs";
import { loadPageTemplates } from "../../engine/build/page-templates.mjs";
import {
  checkLanguageOption,
  translatedToc,
  translatedGlossary,
  readSources,
  translationState,
} from "../../engine/build/languages.mjs";
import { createGit } from "../../engine/sync/git.mjs";
import { hashText } from "../../engine/sync/hash.mjs";
import { normalizeGlossary, LEGACY_FILES, CURRENT_FILES } from "../../engine/project/legacy.mjs";
import { readToc, stripBom } from "../../engine/project/toc.mjs";
import { validate } from "../../engine/project/validate.mjs";
import { readSchema } from "../../engine/project/load.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { shown } from "./connect.mjs";

export const options = {
  budget: { type: "string" },
  update: { type: "boolean" },
  translate: { type: "string" },
};

/** Reads content/toc.json (or the legacy sommaire.json), normalised; null when missing or invalid. */
function readProjectToc(root, config) {
  const { toc } = readToc(root, config.paths.content);
  return toc && !validate(toc, readSchema("toc")).errors.length ? toc : null;
}

/** Reads content/glossary.json (or the legacy glossaire.json); [] when missing or invalid. */
function readGlossary(root, config) {
  const { content } = config.paths;
  const rel = [CURRENT_FILES.glossary, LEGACY_FILES.glossary]
    .map((f) => `${content}/${f}`)
    .find((f) => fs.existsSync(path.join(root, f)));
  if (!rel) return [];
  try {
    const raw = JSON.parse(stripBom(fs.readFileSync(path.join(root, rel), "utf8")));
    const glossary = normalizeGlossary(raw).value;
    return validate(glossary, readSchema("glossary")).errors.length ? [] : glossary;
  } catch {
    return [];
  }
}

/** { [projRelFile]: flattened messages } of every message file sync.labels follows (ARCHITECTURE.md §6.10). */
function readLabels(root, config) {
  const out = {};
  for (const file of labelFiles(root, config)) {
    try {
      out[file] = flattenMessages(JSON.parse(fs.readFileSync(path.join(root, file), "utf8")));
    } catch {
      out[file] = {};
    }
  }
  return out;
}

/** { [source]: items } of every facts/<source>.json (ARCHITECTURE.md §6.9); skips files it cannot read. */
function readFacts(root, config) {
  const dir = path.join(root, config.paths.facts);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("tool-"))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      out[data.source || f.slice(0, -5)] = data.items || [];
    } catch {
      // unreadable fact file: simply not offered to the context
    }
  }
  return out;
}

/** Loaded capture plan entries, or [] (no screenshots, or the plans folder is missing). */
async function readPlans(root, config) {
  if (config.capture.mode === "none") return [];
  try {
    const { captures } = await loadPlans({ folder: path.resolve(root, config.capture.plans) });
    return captures;
  } catch {
    return [];
  }
}

export async function run({ ctx, values, positionals }) {
  if (!positionals.length) throw new KitError(EXIT.USAGE, "context.missingPage");
  let budget = 16000;
  if (values.budget !== undefined) {
    budget = Number(values.budget);
    if (!Number.isInteger(budget) || budget <= 0)
      throw new KitError(EXIT.USAGE, "option.value", {
        option: "budget",
        value: values.budget,
        expected: "a whole number > 0",
      });
  }

  const { project, config } = await ctx.loadProject();
  const root = project.root;
  const toc = readProjectToc(root, config);
  if (!toc) throw new KitError(EXIT.CHECK, "new.noToc", { file: `${config.paths.content}/${CURRENT_FILES.toc}` });
  for (const id of positionals)
    if (!findPageEntry(toc, id)) throw new KitError(EXIT.USAGE, "context.unknownPage", { page: id });

  if (values.translate !== undefined) {
    if (values.update) throw new KitError(EXIT.USAGE, "context.translateUpdate");
    const lang = checkLanguageOption({ languages: config.languages, lang: values.translate, t: ctx.t });
    if (lang === config.languages[0]) throw new KitError(EXIT.USAGE, "context.translateSource", { lang });
    return runTranslate({ ctx, positionals, config, root, toc, lang, budget });
  }

  let report = null;
  if (values.update) {
    const file = path.join(root, ".doc-kit", "sync-report.json");
    if (!fs.existsSync(file)) throw new KitError(EXIT.USAGE, "context.noSyncReport", { file: shown(file) });
    try {
      report = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      throw new KitError(EXIT.CHECK, "context.noSyncReport", { file: shown(file) }, { cause: e });
    }
  }

  const appDir = config.app.dir ? path.resolve(root, config.app.dir) : null;
  const [inventory, plans, glossary, { reference }] = await Promise.all([
    runCoverage({ root, config }),
    readPlans(root, config),
    readGlossary(root, config),
    readSyncReference(root, config),
  ]);
  const tools = adapterTools(root);
  const labels = /** @type {Record<string, Record<string, string>>} */ (readLabels(root, config));
  const facts = /** @type {Record<string, any[]>} */ (readFacts(root, config));
  const templates = loadPageTemplates();

  const product = config.product?.name ?? null;
  const version = readProjectVersion(root, config.version);

  const dir = path.join(root, ".doc-kit", "context");
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const pageId of positionals) {
    const declared = reference?.pages?.[pageId]?.declared || [];
    const deps = await pageDependencies({
      root,
      config,
      toc,
      pageId,
      inventory,
      tools,
      factsDir: config.paths.facts,
      plans,
      declared,
    });
    const { text, tokens, cut } = buildContext({
      root,
      config,
      toc,
      pageId,
      deps,
      appDir,
      labels,
      facts,
      glossary,
      templates,
      report,
      update: !!values.update,
      budget,
      product,
      version,
      t: ctx.t,
    });
    const file = contextFileName(pageId);
    fs.writeFileSync(path.join(dir, file), text);
    written.push({ page: pageId, file: `.doc-kit/context/${file}`, tokens, cuts: cut.length, cut });
    if (!ctx.json)
      ctx.print(
        ctx.t("cli.context.written", { page: pageId, file: `.doc-kit/context/${file}`, tokens, cuts: cut.length }),
      );
  }
  if (ctx.json) ctx.print(JSON.stringify(written, null, 2));
  return EXIT.OK;
}

/** `context <page…> --translate <lang>` (ARCHITECTURE.md §6.12): the translator's dossier of each page, written
 * to `.doc-kit/context/<page, "/"→"__">.<lang>.md`. Exclusive with --update (checked by the caller). */
async function runTranslate({ ctx, positionals, config, root, toc, lang, budget }) {
  const { content, translations } = config.paths;
  const templates = loadPageTemplates();
  const translationsConfig = { paths: { content: `${translations}/${lang}` } };
  const rawTranslatedToc = readProjectToc(root, translationsConfig);
  const tocL = rawTranslatedToc ? translatedToc({ source: toc, translated: rawTranslatedToc }).toc : null;
  const glossary = readGlossary(root, config);
  const glossaryLExists = [CURRENT_FILES.glossary, LEGACY_FILES.glossary].some((f) =>
    fs.existsSync(path.join(root, translations, lang, f)),
  );
  const glossaryL = glossaryLExists
    ? translatedGlossary({ source: glossary, translated: readGlossary(root, translationsConfig) }).glossary
    : null;
  const recorded = readSources(root, translations, lang);
  const git = createGit(ctx.exec, root);

  const dir = path.join(root, ".doc-kit", "context");
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const pageId of positionals) {
    const page = findPageEntry(toc, pageId);
    const pageL = tocL ? findPageEntry(tocL, pageId) : null;
    const rel = page.file || `${pageId}.md`;
    const sourceAbs = path.join(root, content, rel);
    const sourceText = fs.existsSync(sourceAbs) ? stripBom(fs.readFileSync(sourceAbs, "utf8")) : "";
    const targetAbs = path.join(root, translations, lang, rel);
    const translatedExists = fs.existsSync(targetAbs);
    const previousText = translatedExists ? stripBom(fs.readFileSync(targetAbs, "utf8")) : null;
    const state = translationState({ sourceText, translatedExists, recorded: recorded[rel] });
    const commit = findSourceCommit({ git, path: rel, recorded: recorded[rel], hashText, limit: 50 });
    const diff = commit ? git.diff(commit, [rel]) : null;
    const { text, tokens, cut } = buildTranslateContext({
      page,
      pageL,
      pageId,
      lang,
      sourceFile: `${content}/${rel}`,
      targetFile: `${translations}/${lang}/${rel}`,
      state,
      sourceText,
      previousText,
      glossary,
      glossaryL,
      templates,
      diff,
      budget,
      t: ctx.t,
    });
    const file = translateContextFileName(pageId, lang);
    fs.writeFileSync(path.join(dir, file), text);
    written.push({ page: pageId, lang, file: `.doc-kit/context/${file}`, tokens, cuts: cut.length, cut });
    if (!ctx.json)
      ctx.print(
        ctx.t("cli.context.translate.written", {
          lang,
          page: pageId,
          file: `.doc-kit/context/${file}`,
          tokens,
          cuts: cut.length,
        }),
      );
  }
  if (ctx.json) ctx.print(JSON.stringify(written, null, 2));
  return EXIT.OK;
}
