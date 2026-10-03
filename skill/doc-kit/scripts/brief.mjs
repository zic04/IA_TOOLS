#!/usr/bin/env node
// Fills a brief template of the doc-kit skill from the project's doc.config.mjs and from --var values.
//
//   node brief.mjs <template> --project <docDir> [--lang en|fr] [--var key=value]… [--output <file>]
//   node brief.mjs <template> --project <docDir> --vars       show the template's placeholders and their values
//   node brief.mjs <template> --project <docDir> --estimate [--var key=value]…   token and cost estimate
//   node brief.mjs --list [--lang en|fr]                       list the languages and the templates of each
//
// <template>: a file name of assets/briefs/<lang>/ (writing-batch, journey…) or the path of a .md file.
// --lang picks the language of the brief (default: the project's `language`); {{language}} stays the site's language.
// The messages of this script follow the project's language (without a project: --lang, else English).
// Value precedence: --var > extra.briefs in doc.config.mjs > value derived from the config > empty (reported).
// {{appDir}} (the application code): app.dir of doc.config.mjs, else the documentation folder's parent or
// grandparent that holds .git, else its grandparent; a warning says when it was derived, and when the coverage
// source sits in a separate front end (the inventory of routes does not see the back end).
// "--var key=@file" reads the value from a file (a multi-line value becomes a bullet list).
// Default output: <docDir>/.doc-kit/brief-<template>[-<code>].md.
// Every brief template starts with a front matter line `agent: <type>` (ARCHITECTURE.md §6.11): this script
// reports it after writing the brief ("launch it with the agent type …").
// --estimate (no file written): input tokens (the filled brief, plus the files it cites in backticks when they
// exist on disk, characters ÷ 4) and output tokens (1.4 per word of the template's `maxWords` for a new page,
// 0.3 for an update), read from `{{pages}}` and the project's table of contents; the cost when `llm.prices` of
// the agent's model is set in doc.config.mjs.
// Exit codes: 0 OK · 1 placeholders left unfilled (the file is written anyway) · 2 usage or configuration.
import fs from "node:fs";
import path from "node:path";
import {
  ExitError,
  LANGUAGES,
  SKILL_ROOT,
  WORK_DIR,
  addMessages,
  briefModel,
  appDirInfo,
  baseVariables,
  checkLanguage,
  citedPaths,
  fill,
  findProject,
  flattenedPages,
  loadConfig,
  maxWordsOf,
  pageTemplatesTable,
  parseOptions,
  parsePageList,
  readVars,
  run,
  setMessageLanguage,
  t,
  templateAgent,
  templateVariables,
  warn,
} from "./common.mjs";

addMessages({
  en: {
    usage: [
      "Usage:",
      "  node brief.mjs <template> --project <docDir> [--lang en|fr] [--var key=value]… [--output <file>]",
      "  node brief.mjs <template> --project <docDir> --vars",
      "  node brief.mjs <template> --project <docDir> --estimate [--var key=value]…",
      "  node brief.mjs --list [--lang en|fr]",
    ].join("\n"),
    notABrief: '"{name}" is not a brief',
    notABrief_todo: "create the consolidation file with: node consolidation.mjs init --project <docDir> --codes a,b,c",
    unknownTemplate: 'unknown template: "{name}" (language {lang})',
    unknownTemplate_todo: "available templates: {list}",
    none: "none",
    oneTemplate: "give exactly one template",
    languages: "Languages: {list}",
    templates: "Templates ({lang}): {list}",
    placeholders: "Placeholders of {file}:",
    empty: "(empty)",
    written: "✔ brief written: {file}",
    unfilled: "placeholder(s) left unfilled: {list}",
    unfilled_todo: "add {vars} (or extra.briefs.<key> in doc.config.mjs), then run again",
    launch: "  → launch it with the agent type {agent} and the model {model}, the brief's full text as the prompt (the common part first: every agent of the wave after the first reads it from the prompt cache)",
    noAgent: "  → this brief template declares no agent type (add a front matter line \"agent: <type>\")",
    estimateTitle: "Estimate for {template} — agent {agent}, model {model}",
    estimateNoAgent: "Estimate for {template} — this brief declares no agent type",
    estimateInput: "  input:  {tokens} tokens (brief {brief} + {n} cited file(s) {files})",
    estimateOutput: "  output: {tokens} tokens ({n} page(s): {fresh} new, {update} update)",
    estimateOutputNone: "  output: 0 tokens (no page list to estimate from: {reason})",
    estimateOutputNone_noPages: "the \"pages\" placeholder is empty or not used by this template",
    estimateTotal: "  total:  {tokens} tokens",
    estimateCost: "  cost:   {cost} {currency}",
    estimateNoCost: "  cost:   not estimated (set llm.prices.{model} in doc.config.mjs)",
    appDirDerived: "appDir is not configured (app.dir in doc.config.mjs): {dir} is assumed ({how})",
    appDirDerived_todo: "check it: set app.dir in doc.config.mjs (the application root, relative to the documentation folder), or pass --var appDir=<folder>",
    how_git: "the folder that holds .git",
    how_parent: "two levels above the documentation folder",
    appDirMissing: "appDir not found: {dir}",
    appDirMissing_todo: "fix app.dir in doc.config.mjs, or pass --var appDir=<folder>",
    separateFront: "the coverage source ({source}) is in a separate front end ({front}): the inventory of routes only sees the front end",
    separateFront_todo: "the briefs point at {dir}: make sure the agents also read the back end there (API, permissions, writes while rendering)",
  },
  fr: {
    usage: [
      "Usage :",
      "  node brief.mjs <modèle> --project <dossierDoc> [--lang en|fr] [--var clé=valeur]… [--output <fichier>]",
      "  node brief.mjs <modèle> --project <dossierDoc> --vars",
      "  node brief.mjs <modèle> --project <dossierDoc> --estimate [--var clé=valeur]…",
      "  node brief.mjs --list [--lang en|fr]",
    ].join("\n"),
    notABrief: "« {name} » n'est pas un brief",
    notABrief_todo: "créez le fichier de consolidation avec : node consolidation.mjs init --project <dossierDoc> --codes a,b,c",
    unknownTemplate: "modèle inconnu : « {name} » (langue {lang})",
    unknownTemplate_todo: "modèles disponibles : {list}",
    none: "aucun",
    oneTemplate: "donnez exactement un modèle",
    languages: "Langues : {list}",
    templates: "Modèles ({lang}) : {list}",
    placeholders: "Paramètres de {file} :",
    empty: "(vide)",
    written: "✔ brief écrit : {file}",
    unfilled: "paramètre(s) non rempli(s) : {list}",
    unfilled_todo: "ajoutez {vars} (ou extra.briefs.<clé> dans doc.config.mjs), puis relancez",
    launch: "  → lancez-le avec le type d'agent {agent} et le modèle {model}, le texte complet du brief comme consigne (la partie commune d'abord : chaque agent de la vague après le premier la lit dans le cache de prompt)",
    noAgent: "  → ce modèle de brief ne déclare aucun type d'agent (ajoutez une ligne d'en-tête « agent: <type> »)",
    estimateTitle: "Estimation pour {template} — agent {agent}, modèle {model}",
    estimateNoAgent: "Estimation pour {template} — ce brief ne déclare aucun type d'agent",
    estimateInput: "  entrée : {tokens} jetons (brief {brief} + {n} fichier(s) cité(s) {files})",
    estimateOutput: "  sortie : {tokens} jetons ({n} page(s) : {fresh} nouvelle(s), {update} mise(s) à jour)",
    estimateOutputNone: "  sortie : 0 jeton (rien à estimer : {reason})",
    estimateOutputNone_noPages: "le paramètre « pages » est vide ou inutilisé par ce modèle",
    estimateTotal: "  total :  {tokens} jetons",
    estimateCost: "  coût :   {cost} {currency}",
    estimateNoCost: "  coût :   non estimé (renseignez llm.prices.{model} dans doc.config.mjs)",
    appDirDerived: "appDir n'est pas configuré (app.dir dans doc.config.mjs) : {dir} est supposé ({how})",
    appDirDerived_todo: "vérifiez-le : renseignez app.dir dans doc.config.mjs (la racine de l'application, relative au dossier de la documentation), ou passez --var appDir=<dossier>",
    how_git: "le dossier qui contient .git",
    how_parent: "deux niveaux au-dessus du dossier de la documentation",
    appDirMissing: "appDir introuvable : {dir}",
    appDirMissing_todo: "corrigez app.dir dans doc.config.mjs, ou passez --var appDir=<dossier>",
    separateFront: "la source de couverture ({source}) est dans un front-end séparé ({front}) : l'inventaire des routes ne voit que le front-end",
    separateFront_todo: "les briefs pointent vers {dir} : assurez-vous que les agents y lisent aussi le back-end (API, droits, écritures au rendu)",
  },
});

// Filled section by section by consolidation.mjs, not by this script.
const NOT_A_BRIEF = new Set(["consolidation"]);

const templatesDir = (lang) => path.join(SKILL_ROOT, "assets", "briefs", lang);

/** Languages that have brief templates. */
const briefLanguages = () => LANGUAGES.filter((l) => fs.existsSync(templatesDir(l)));

function listTemplates(lang) {
  const dir = templatesDir(lang);
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).filter((n) => !NOT_A_BRIEF.has(n)).sort()
    : [];
}

function findTemplate(name, lang) {
  if (name.endsWith(".md") && fs.existsSync(path.resolve(name))) return path.resolve(name);
  const base = name.replace(/\.md$/, "");
  if (NOT_A_BRIEF.has(base)) throw new ExitError(2, t("notABrief", { name: base }), t("notABrief_todo"));
  const file = path.join(templatesDir(lang), `${base}.md`);
  if (fs.existsSync(file)) return file;
  throw new ExitError(2, t("unknownTemplate", { name, lang }), t("unknownTemplate_todo", { list: listTemplates(lang).join(", ") || t("none") }));
}

/** The project's language, read quietly (no project, or an unreadable configuration: null). */
async function projectLanguage(option) {
  try {
    const config = await loadConfig(findProject(option));
    return LANGUAGES.includes(config.language) ? config.language : "en";
  } catch {
    return null;
  }
}

/** Warnings about {{appDir}}: derived (not configured), missing, or a separate front end that hides the back end. */
function appDirWarnings(docDir, config, given) {
  const info = appDirInfo(docDir, config, given);
  if (info.from === "git" || info.from === "parent") warn(t("appDirDerived", { dir: info.dir, how: t(`how_${info.from}`) }), t("appDirDerived_todo"));
  else if (!info.exists) warn(t("appDirMissing", { dir: info.dir }), t("appDirMissing_todo"));
  if (info.front) warn(t("separateFront", { source: info.source, front: path.relative(info.dir, info.front).replace(/\\/g, "/") }), t("separateFront_todo", { dir: info.dir }));
}

/**
 * Token and cost estimate of a filled brief (ARCHITECTURE.md §6.11): input (the brief plus the files it cites
 * that exist on disk, characters ÷ 4) and output (the pages named by `{{pages}}`, 1.4 × maxWords for a page not
 * written yet, 0.3 × maxWords for one that already has a content file); cost when `llm.prices` of the agent's
 * model is set.
 */
async function printEstimate({ name, agent, text, vars, docDir, config }) {
  const model = agent ? briefModel(name, agent, config) : "";
  console.log(t(agent ? "estimateTitle" : "estimateNoAgent", { template: name, agent, model }));
  if (!agent) console.log(t("noAgent"));

  const pageIds = parsePageList(vars.pages);
  // Candidate paths: whatever the (filled) brief cites in backticks, plus the context file of each page named
  // by {{pages}} (doc-kit context <page> --update, ARCHITECTURE.md §6.11) — the brief only ever names its
  // pattern, never the per-page path, so it is rebuilt here the same way `doc-kit context` names that file.
  const candidates = new Set(citedPaths(text));
  for (const id of pageIds) candidates.add(`.doc-kit/context/${id.replace(/\//g, "__")}.md`);
  let filesChars = 0;
  let filesCounted = 0;
  for (const p of candidates) {
    const abs = path.isAbsolute(p) ? p : path.resolve(docDir, p);
    try {
      const st = fs.statSync(abs);
      if (st.isFile()) {
        filesChars += st.size;
        filesCounted++;
      }
    } catch {
      // cited but absent (not written yet, no context file generated, or a placeholder left in the text): not counted
    }
  }
  const briefTokens = Math.ceil(text.length / 4);
  const inputTokens = briefTokens + Math.ceil(filesChars / 4);
  console.log(t("estimateInput", { tokens: inputTokens, brief: briefTokens, n: filesCounted, files: `${Math.ceil(filesChars / 4)} tokens` }));

  let outputTokens = 0;
  if (!pageIds.length) {
    console.log(t("estimateOutputNone", { reason: t("estimateOutputNone_noPages") }));
  } else {
    const pages = await flattenedPages(docDir, config, vars.kitPath);
    const byId = new Map(pages.map((p) => [p.id, p]));
    const table = await pageTemplatesTable(vars.kitPath);
    const contentDir = vars.contentDir || "content";
    let fresh = 0;
    let update = 0;
    for (const id of pageIds) {
      const page = byId.get(id);
      const maxWords = maxWordsOf(table, page?.template);
      const file = path.join(docDir, contentDir, page?.file || `${id}.md`);
      if (fs.existsSync(file)) {
        update++;
        outputTokens += maxWords * 0.3;
      } else {
        fresh++;
        outputTokens += maxWords * 1.4;
      }
    }
    outputTokens = Math.ceil(outputTokens);
    console.log(t("estimateOutput", { tokens: outputTokens, n: pageIds.length, fresh, update }));
  }

  console.log(t("estimateTotal", { tokens: inputTokens + outputTokens }));
  const prices = model ? config.llm?.prices?.[model] : null;
  if (prices) {
    const cost = (inputTokens / 1e6) * (prices.input ?? 0) + (outputTokens / 1e6) * (prices.output ?? 0);
    console.log(t("estimateCost", { cost: cost.toFixed(4), currency: config.llm?.currency ?? "" }));
  } else {
    console.log(t("estimateNoCost", { model: model || "?" }));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const iLang = argv.indexOf("--lang");
  // Messages before the project is read (usage errors): --lang, else English.
  setMessageLanguage(iLang >= 0 ? argv[iLang + 1] : "en");
  const { values: o, positionals } = parseOptions(
    {
      project: { type: "string" },
      lang: { type: "string" },
      var: { type: "string", multiple: true },
      output: { type: "string" },
      vars: { type: "boolean" },
      estimate: { type: "boolean" },
      list: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    t("usage"),
  );
  checkLanguage(o.lang);
  // The messages follow the project's language; without a project, --lang, else English.
  setMessageLanguage((await projectLanguage(o.project)) ?? o.lang ?? "en");
  if (o.help) {
    console.log(t("usage"));
    return 0;
  }
  if (o.list) {
    const langs = briefLanguages();
    console.log(t("languages", { list: langs.join(", ") }));
    for (const lang of o.lang ? [o.lang] : langs) console.log(t("templates", { lang, list: listTemplates(lang).join(", ") || t("none") }));
    return 0;
  }
  if (positionals.length !== 1) throw new ExitError(2, t("oneTemplate"), t("usage").split("\n")[1].trim());
  const name = positionals[0];

  const docDir = findProject(o.project);
  const config = await loadConfig(docDir);
  const lang = o.lang ?? config.language ?? "en";
  checkLanguage(lang, "language");
  const templateFile = findTemplate(name, lang);
  const template = fs.readFileSync(templateFile, "utf8");

  const given = readVars(o.var, docDir);
  const vars = { ...baseVariables(docDir, config, lang), ...given };
  if (!vars.prefix && vars.code) vars.prefix = vars.code;
  const overridden = "appDir" in given || config.extra?.briefs?.appDir !== undefined;
  if (templateVariables(template).includes("appDir")) appDirWarnings(docDir, config, overridden ? vars.appDir : "");

  if (o.vars) {
    console.log(t("placeholders", { file: path.basename(templateFile) }));
    for (const key of templateVariables(template)) {
      const v = vars[key] == null || String(vars[key]).trim() === "" ? t("empty") : String(vars[key]).replace(/\s*\n\s*/g, " ⏎ ");
      console.log(`  ${key.padEnd(22)} ${v.length > 90 ? `${v.slice(0, 87)}…` : v}`);
    }
    return 0;
  }

  const { text, unfilled } = fill(template, vars);
  const agent = templateAgent(template);
  const base = path.basename(templateFile, ".md");

  if (o.estimate) {
    await printEstimate({ name: base, agent, text, vars, docDir, config });
    return 0;
  }

  const output = o.output ? path.resolve(o.output) : path.join(docDir, WORK_DIR, `brief-${base}${vars.code ? `-${vars.code}` : ""}.md`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, text);
  console.log(t("written", { file: output }));
  if (unfilled.length) {
    warn(t("unfilled", { list: unfilled.join(", ") }), t("unfilled_todo", { vars: unfilled.map((v) => `--var ${v}=…`).join(" ") }));
    return 1;
  }
  if (agent) console.log(t("launch", { file: output, agent, model: briefModel(base, agent, config) }));
  else console.log(t("noAgent"));
  return 0;
}

await run(main);
