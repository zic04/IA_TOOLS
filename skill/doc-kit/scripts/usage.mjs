#!/usr/bin/env node
// Measures what the agents actually consumed (ARCHITECTURE.md §6.11): appends to and reports on
// <docDir>/.doc-kit/usage.jsonl (one JSON object per line, never rewritten).
//
//   node usage.mjs log --brief <name> --agent <type> --model <model> --tokens <n>
//                      [--tools <n>] [--duration <ms>] [--pages a,b] [--phase <name>] [--project <docDir>]
//   node usage.mjs report [--json] [--project <docDir>]
//   node usage.mjs scan --transcripts <folder> [--project <docDir>]
//
// `log`: the orchestrator calls it with what Claude Code reports when an agent ends (total tokens, tool calls,
// duration); one line is appended, `tokens` is a single total (no input/output split at this point).
// `report`: totals by phase, brief, agent type, model and page; tokens per written page; cost (`llm.prices` of
// `doc.config.mjs`) -- precisely for entries with a detailed split (from `scan`), approximately (the model's
// blended input/output rate) for plain `log` entries, which carry only a total; the gap with a fresh estimate
// of the same briefs (ARCHITECTURE.md §6.11, `brief.mjs --estimate`), when a brief template for that name
// exists and at least one entry named its pages.
// `scan`: tolerant -- reads every `.jsonl` file under `--transcripts <folder>` (recursively), and for every
// line that parses as JSON and has a `message.usage` object, sums `input_tokens`, `output_tokens`,
// `cache_read_input_tokens` and `cache_creation_input_tokens` where they exist; everything else in a line, and
// any line that is not valid JSON or has no such object, is ignored. One aggregate entry is appended.
// Exit codes: 0 OK, 2 usage or configuration.
import fs from "node:fs";
import path from "node:path";
import {
  AGENTS_DIR,
  ExitError,
  SKILL_ROOT,
  WORK_DIR,
  addMessages,
  agentModel,
  checkLanguage,
  citedPaths,
  findProject,
  flattenedPages,
  loadConfig,
  maxWordsOf,
  pageTemplatesTable,
  parseOptions,
  parsePageList,
  run,
  setMessageLanguage,
  t,
} from "./common.mjs";

addMessages({
  en: {
    usage: [
      "Usage:",
      "  node usage.mjs log --brief <name> --agent <type> --model <model> --tokens <n> [--tools <n>]",
      "                     [--duration <ms>] [--pages a,b] [--phase <name>] [--project <docDir>]",
      "  node usage.mjs report [--json] [--project <docDir>]",
      "  node usage.mjs scan --transcripts <folder> [--project <docDir>]",
    ].join("\n"),
    noAction: "give one of: log, report, scan",
    missing: "--{option} is required for {action}",
    badTokens: "--tokens must be a non-negative integer, not {value}",
    badTokens_todo: "pass the total tokens Claude Code reported for this agent",
    logged: "✔ usage logged: {brief} ({agent}, {model}): {tokens} tokens",
    transcriptsMissing: "transcripts folder not found: {folder}",
    transcriptsMissing_todo: "pass the folder that holds Claude Code's .jsonl transcripts",
    scanned: "✔ scanned {files} transcript file(s), {lines} usage line(s): {tokens} tokens",
    scannedNone: "scanned {files} transcript file(s): no message.usage found",
    empty: "No usage logged yet ({file}).",
    reportTitle: "Usage report ({n} entries)",
    byGroup: "By {label}:",
    noPages: "No page tokens to report (no --pages was logged).",
    pageAverage: "Average tokens per page: {avg} ({n} page(s))",
    costTitle: "Cost:",
    costPrecise: "  {model}: {cost} {currency} (from {n} scanned token(s), precise)",
    costApprox: "  {model}: {cost} {currency} (from {n} logged token(s), approximate: no input/output split)",
    costNone: "  not estimated: set llm.prices in doc.config.mjs",
    costNoneModel: "  {model}: {tokens} token(s) not estimated (set llm.prices.{model})",
    unpriced: "  {tokens} scanned token(s) have no model tag and are not priced",
    gapTitle: "Gap with a fresh estimate:",
    gapLine: "  {brief}: logged {actual} tokens, estimate ~{estimate} tokens ({sign}{pct}%)",
    gapNone: "  no brief template or no logged pages to compare against",
  },
  fr: {
    usage: [
      "Usage :",
      "  node usage.mjs log --brief <nom> --agent <type> --model <modèle> --tokens <n> [--tools <n>]",
      "                     [--duration <ms>] [--pages a,b] [--phase <nom>] [--project <dossierDoc>]",
      "  node usage.mjs report [--json] [--project <dossierDoc>]",
      "  node usage.mjs scan --transcripts <dossier> [--project <dossierDoc>]",
    ].join("\n"),
    noAction: "donnez l'une de : log, report, scan",
    missing: "--{option} est obligatoire pour {action}",
    badTokens: "--tokens doit être un entier non négatif, pas « {value} »",
    badTokens_todo: "donnez le total de jetons rapporté par Claude Code pour cet agent",
    logged: "✔ consommation journalisée : {brief} ({agent}, {model}) : {tokens} jetons",
    transcriptsMissing: "dossier de transcriptions introuvable : {folder}",
    transcriptsMissing_todo: "donnez le dossier qui contient les transcriptions .jsonl de Claude Code",
    scanned: "✔ {files} fichier(s) de transcription parcouru(s), {lines} ligne(s) d'usage : {tokens} jetons",
    scannedNone: "{files} fichier(s) de transcription parcouru(s) : aucun message.usage trouvé",
    empty: "Aucune consommation journalisée pour l'instant ({file}).",
    reportTitle: "Rapport de consommation ({n} entrée(s))",
    byGroup: "Par {label} :",
    noPages: "Aucun jeton de page à rapporter (aucun --pages journalisé).",
    pageAverage: "Jetons moyens par page : {avg} ({n} page(s))",
    costTitle: "Coût :",
    costPrecise: "  {model} : {cost} {currency} (sur {n} jeton(s) scanné(s), précis)",
    costApprox: "  {model} : {cost} {currency} (sur {n} jeton(s) journalisé(s), approximatif : pas de répartition entrée/sortie)",
    costNone: "  non estimé : renseignez llm.prices dans doc.config.mjs",
    costNoneModel: "  {model} : {tokens} jeton(s) non estimé(s) (renseignez llm.prices.{model})",
    unpriced: "  {tokens} jeton(s) scanné(s) sans modèle associé ne sont pas tarifés",
    gapTitle: "Écart avec une estimation fraîche :",
    gapLine: "  {brief} : journalisé {actual} jetons, estimation ~{estimate} jetons ({sign}{pct} %)",
    gapNone: "  aucun gabarit de brief ou aucune page journalisée à comparer",
  },
});

const usageFile = (docDir) => path.join(docDir, WORK_DIR, "usage.jsonl");

/** Reads usage.jsonl, one object per well-formed line; a malformed line is skipped silently. */
function readEntries(docDir) {
  const file = usageFile(docDir);
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a hand-edited or truncated line is ignored, the same way "scan" ignores what it cannot read
    }
  }
  return out;
}

function appendEntry(docDir, entry) {
  const file = usageFile(docDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

/** Total tokens of one entry, whichever shape it has (a flat "tokens", or the four split fields from scan). */
const entryTokens = (e) =>
  typeof e.tokens === "number"
    ? e.tokens
    : (e.input_tokens || 0) + (e.output_tokens || 0) + (e.cache_read_input_tokens || 0) + (e.cache_creation_input_tokens || 0);

/** Sums tokens of entries grouped by key(entry) (entries where key returns "" are left out). */
function groupTotals(entries, key) {
  const totals = new Map();
  for (const e of entries) {
    const k = key(e);
    if (!k) continue;
    totals.set(k, (totals.get(k) || 0) + entryTokens(e));
  }
  return totals;
}

function printGroup(label, totals) {
  if (!totals.size) return;
  console.log(t("byGroup", { label }));
  for (const [k, n] of [...totals.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
}

/** Every agent type's model (agents/<type>.md): available for a future, finer validation of --agent. */
function knownModels() {
  const models = new Map();
  if (fs.existsSync(AGENTS_DIR)) for (const f of fs.readdirSync(AGENTS_DIR)) if (f.endsWith(".md")) models.set(f.slice(0, -3), agentModel(f.slice(0, -3)));
  return models;
}

/**
 * A fresh output-token estimate for the union of pages logged under "brief" (ARCHITECTURE.md §6.11, the same
 * formula as brief.mjs --estimate), plus a rough input estimate from the raw (unfilled) template -- the filled
 * brief is usually gone by the time "report" runs, so this is an approximation, clearly labelled as such.
 */
async function freshEstimate(brief, pages, docDir, config, lang) {
  const file = ["en", "fr"].includes(lang) ? path.join(SKILL_ROOT, "assets", "briefs", lang, `${brief}.md`) : null;
  if (!file || !fs.existsSync(file) || !pages.length) return null;
  const template = fs.readFileSync(file, "utf8");
  const inputTokens = Math.ceil(template.length / 4);
  const kitRoot = path.resolve(SKILL_ROOT, "..", "..");
  const pagesOfToc = await flattenedPages(docDir, config, kitRoot);
  const byId = new Map(pagesOfToc.map((p) => [p.id, p]));
  const table = await pageTemplatesTable(kitRoot);
  const contentDir = config?.paths?.content ?? "content";
  let outputTokens = 0;
  for (const id of pages) {
    const page = byId.get(id);
    const maxWords = maxWordsOf(table, page?.template);
    const exists = fs.existsSync(path.join(docDir, contentDir, page?.file || `${id}.md`));
    outputTokens += maxWords * (exists ? 0.3 : 1.4);
  }
  return inputTokens + Math.ceil(outputTokens);
}

async function cmdLog(o, docDir) {
  for (const option of ["brief", "agent", "model", "tokens"]) if (!o[option]) throw new ExitError(2, t("missing", { option, action: "log" }), t("usage"));
  const tokens = Number(o.tokens);
  if (!Number.isInteger(tokens) || tokens < 0) throw new ExitError(2, t("badTokens", { value: o.tokens }), t("badTokens_todo"));
  const entry = { date: new Date().toISOString(), source: "log", brief: o.brief, agent: o.agent, model: o.model, tokens };
  if (o.phase) entry.phase = o.phase;
  if (o.tools) entry.tools = Number(o.tools);
  if (o.duration) entry.duration = Number(o.duration);
  if (o.pages) entry.pages = parsePageList(o.pages);
  appendEntry(docDir, entry);
  console.log(t("logged", { brief: o.brief, agent: o.agent, model: o.model, tokens }));
  return 0;
}

async function cmdScan(o, docDir) {
  if (!o.transcripts) throw new ExitError(2, t("missing", { option: "transcripts", action: "scan" }), t("usage"));
  const folder = path.resolve(o.transcripts);
  if (!fs.existsSync(folder)) throw new ExitError(2, t("transcriptsMissing", { folder }), t("transcriptsMissing_todo"));
  const isDir = fs.statSync(folder).isDirectory();
  const files = isDir ? fs.readdirSync(folder, { recursive: true }).map(String).filter((f) => f.endsWith(".jsonl")) : [path.basename(folder)];
  const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let lines = 0;
  for (const f of files) {
    const abs = isDir ? path.join(folder, f) : folder;
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue; // unreadable file: ignored, scan is tolerant
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // not JSON: ignored
      }
      const usage = obj?.message?.usage;
      if (!usage || typeof usage !== "object") continue;
      let found = false;
      for (const key of Object.keys(totals))
        if (typeof usage[key] === "number") {
          totals[key] += usage[key];
          found = true;
        }
      if (found) lines++;
    }
  }
  const tokens = Object.values(totals).reduce((a, b) => a + b, 0);
  if (!lines) {
    console.log(t("scannedNone", { files: files.length }));
    return 0;
  }
  appendEntry(docDir, { date: new Date().toISOString(), source: "scan", transcripts: folder, files: files.length, lines, ...totals, tokens });
  console.log(t("scanned", { files: files.length, lines, tokens }));
  return 0;
}

async function cmdReport(o, docDir) {
  const entries = readEntries(docDir);
  if (o.json) {
    console.log(JSON.stringify({ file: usageFile(docDir), entries: entries.length, total: entries.reduce((a, e) => a + entryTokens(e), 0) }, null, 2));
    return 0;
  }
  if (!entries.length) {
    console.log(t("empty", { file: usageFile(docDir) }));
    return 0;
  }
  console.log(t("reportTitle", { n: entries.length }));
  console.log(`  total: ${entries.reduce((a, e) => a + entryTokens(e), 0)} tokens`);
  printGroup("phase", groupTotals(entries, (e) => e.phase || ""));
  printGroup("brief", groupTotals(entries, (e) => e.brief || ""));
  printGroup("agent type", groupTotals(entries, (e) => e.agent || ""));
  printGroup("model", groupTotals(entries, (e) => e.model || ""));

  const pageTotals = new Map();
  for (const e of entries)
    if (Array.isArray(e.pages) && e.pages.length) {
      const share = entryTokens(e) / e.pages.length;
      for (const p of e.pages) pageTotals.set(p, (pageTotals.get(p) || 0) + share);
    }
  if (pageTotals.size) {
    printGroup("page", new Map([...pageTotals.entries()].map(([k, v]) => [k, Math.round(v)])));
    const total = [...pageTotals.values()].reduce((a, b) => a + b, 0);
    console.log(t("pageAverage", { avg: Math.round(total / pageTotals.size), n: pageTotals.size }));
  } else console.log(t("noPages"));

  let config = null;
  try {
    config = await loadConfig(docDir);
  } catch {
    // no project / unreadable configuration: cost is skipped below
  }
  console.log(t("costTitle"));
  const prices = config?.llm?.prices;
  const currency = config?.llm?.currency ?? "";
  if (prices) {
    const byModel = new Map();
    for (const e of entries) {
      const model = e.model;
      if (!model) continue;
      const g = byModel.get(model) || { precise: 0, preciseCost: 0, approx: 0 };
      if (typeof e.input_tokens === "number" || typeof e.output_tokens === "number") {
        const p = prices[model];
        if (p) {
          const cost =
            ((e.input_tokens || 0) / 1e6) * (p.input ?? 0) +
            ((e.output_tokens || 0) / 1e6) * (p.output ?? 0) +
            ((e.cache_read_input_tokens || 0) / 1e6) * (p.cacheRead ?? 0) +
            ((e.cache_creation_input_tokens || 0) / 1e6) * (p.input ?? 0);
          g.precise += entryTokens(e);
          g.preciseCost += cost;
        }
      } else g.approx += entryTokens(e);
      byModel.set(model, g);
    }
    for (const [model, g] of byModel) {
      if (g.precise) console.log(t("costPrecise", { model, cost: g.preciseCost.toFixed(4), currency, n: g.precise }));
      if (g.approx) {
        const p = prices[model];
        const blended = p ? ((p.input ?? 0) + (p.output ?? 0)) / 2 : null;
        if (blended != null) console.log(t("costApprox", { model, cost: ((g.approx / 1e6) * blended).toFixed(4), currency, n: g.approx }));
        else console.log(t("costNoneModel", { model, tokens: g.approx }));
      }
    }
    const untagged = entries.filter((e) => !e.model && e.source === "scan").reduce((a, e) => a + entryTokens(e), 0);
    if (untagged) console.log(t("unpriced", { tokens: untagged }));
  } else console.log(t("costNone"));

  const briefs = new Map();
  for (const e of entries)
    if (e.brief && Array.isArray(e.pages) && e.pages.length) {
      const g = briefs.get(e.brief) || { tokens: 0, pages: new Set() };
      g.tokens += entryTokens(e);
      for (const p of e.pages) g.pages.add(p);
      briefs.set(e.brief, g);
    }
  console.log(t("gapTitle"));
  if (!briefs.size) console.log(t("gapNone"));
  else {
    const lang = config?.language && ["en", "fr"].includes(config.language) ? config.language : "en";
    let any = false;
    for (const [brief, g] of briefs) {
      const estimate = await freshEstimate(brief, [...g.pages], docDir, config || {}, lang);
      if (estimate == null) continue;
      any = true;
      const pct = estimate ? Math.round(((g.tokens - estimate) / estimate) * 100) : 0;
      console.log(t("gapLine", { brief, actual: g.tokens, estimate, sign: pct >= 0 ? "+" : "", pct }));
    }
    if (!any) console.log(t("gapNone"));
  }
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const iLang = argv.indexOf("--lang");
  setMessageLanguage(iLang >= 0 ? argv[iLang + 1] : "en");
  const { values: o, positionals } = parseOptions(
    {
      project: { type: "string" },
      lang: { type: "string" },
      brief: { type: "string" },
      agent: { type: "string" },
      model: { type: "string" },
      tokens: { type: "string" },
      tools: { type: "string" },
      duration: { type: "string" },
      pages: { type: "string" },
      phase: { type: "string" },
      transcripts: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    t("usage"),
  );
  checkLanguage(o.lang);
  let docDir;
  try {
    docDir = findProject(o.project);
    const config = await loadConfig(docDir);
    setMessageLanguage(["en", "fr"].includes(config.language) ? config.language : (o.lang ?? "en"));
  } catch {
    setMessageLanguage(o.lang ?? "en");
    docDir = o.project ? path.resolve(o.project) : path.resolve(".");
  }
  if (o.help) {
    console.log(t("usage"));
    return 0;
  }
  const action = positionals[0];
  if (action === "log") return cmdLog(o, docDir);
  if (action === "scan") return cmdScan(o, docDir);
  if (action === "report") return cmdReport(o, docDir);
  void knownModels; // reserved for a future, finer validation of --agent; not enforced (open set of agent types)
  throw new ExitError(2, t("noAction"), t("usage"));
}

await run(main);
