#!/usr/bin/env node
// The analyses of the features (ARCHITECTURE.md §6.11a): .doc-kit/analysis/<feature>.json, written by an agent that
// traced the feature in the application code, format doc-kit/behaviour-analysis@1.
//
//   node analysis.mjs check [<feature>…] --project <docDir>
//       checks each analysis (all of them when none is named): its structure, the kinds and rubrics of its behaviours,
//       each status with what it needs (a proof, a question, a reason), no code in a text for a reader without the
//       code, no secret in any text, and every proof — a file inside the application folder (a path that leaves it is
//       refused without being read), a line that exists.
//   node analysis.mjs digest <feature> --for use|product|admin|develop --project <docDir> [--output <file>]
//       writes what one reader's writer needs (default .doc-kit/analysis/<feature>.<reader>.md): a reader without the
//       code (noCode, standard/spaces.json) gets no mechanism, no proof and no finding.
//   node analysis.mjs questions --project <docDir> [--output <file>]
//       writes the open questions for the product owner (default .doc-kit/open-questions.md).
//   node analysis.mjs findings --project <docDir> [--json]
//       prints the candidate findings, ready for the consolidation file.
//   node analysis.mjs depth --project <docDir> [--audit <file>] [--json]
//       plans one round of the depth loop from the audit (default .doc-kit/audit.json, `doc-kit audit`): what to
//       deepen from the analyses, what to analyse again, what is left to the product owner; at most two rounds per
//       feature, recorded in .doc-kit/analysis/depth.json.
// questions, findings and depth read only the analyses that follow the format and hold no secret; the others are
// named, and skipped.
// Every text of an analysis printed on the console is put on one line, without control characters.
//
// Messages in the project's language. Exit codes: 0 OK · 1 a check failed · 2 usage or configuration.
import fs from "node:fs";
import path from "node:path";
import {
  ExitError,
  WORK_DIR,
  appDirInfo,
  findProject,
  importKitModule,
  kitPath,
  loadConfig,
  parseOptions,
  run,
  setMessageLanguage,
  t,
  useMessages,
  warn,
} from "./common.mjs";
import {
  FEATURE_ID,
  checkAnalysis,
  depthPlan,
  digest,
  findingsOf,
  openQuestions,
  proofText,
  secretProblems,
} from "./analysis-model.mjs";
import { proofLines } from "./analysis-files.mjs";

useMessages("analysis");

const READERS = ["use", "product", "admin", "develop"];

/** What every command needs: the project, its configuration, the kit's modules. */
async function setup(values) {
  const docDir = findProject(values.project);
  const config = await loadConfig(docDir);
  setMessageLanguage(config.language);
  const kitRoot = kitPath(docDir);
  const [validator, behaviours, profiles, i18n, text, secrets] = await Promise.all(
    [
      "engine/project/validate.mjs",
      "engine/build/behaviours.mjs",
      "engine/core/space-profiles.mjs",
      "engine/i18n.mjs",
      "engine/core/text.mjs",
      "engine/check/secrets.mjs",
    ].map((m) => importKitModule(kitRoot, m)),
  );
  if (!validator || !behaviours || !profiles || !i18n || !text || !secrets)
    throw new ExitError(2, t("noKit"), t("noKit_todo"));
  const { registry } = behaviours.projectBehaviours(docDir, config);
  const language = config.language === "fr" ? "fr" : "en";
  const rubricLabel = (kind, id) => {
    const r = registry.kinds.get(kind)?.rubrics.find((x) => x.id === id);
    return r ? (r.label[language] ?? r.label.en) : id;
  };
  const schema = JSON.parse(fs.readFileSync(path.join(kitRoot, "schemas", "behaviour-analysis.schema.json"), "utf8"));
  return {
    docDir,
    config,
    kitRoot,
    validator,
    schema,
    registry,
    profiles,
    kitT: i18n.createI18n({ language }).t,
    rubricLabel,
    oneLine: text.oneLine,
    // The kit's generic detectors: the kinds of secret a text holds, never its value.
    secretsIn: (s) => secrets.scanText(s, secrets.GENERIC).map((x) => x.kind),
  };
}

const analysisDir = (docDir) => path.join(docDir, WORK_DIR, "analysis");
const rel = (docDir, file) => path.relative(docDir, file).split(path.sep).join("/");

/** The analyses named (all of them when none is), parsed: [{ name, file, doc, error }]. */
function readAnalyses(docDir, names) {
  for (const n of names) if (!FEATURE_ID.test(n)) throw new ExitError(2, t("featureInvalid", { value: n }));
  const dir = analysisDir(docDir);
  const all = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json") && FEATURE_ID.test(f.slice(0, -5)))
        .map((f) => f.slice(0, -5))
        .sort()
    : [];
  return (names.length ? names : all).map((name) => {
    const file = path.join(dir, `${name}.json`);
    if (!fs.existsSync(file)) return { name, file, doc: null, error: t("fileMissing", { file: rel(docDir, file) }) };
    try {
      return { name, file, doc: JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch (e) {
      return { name, file, doc: null, error: t("jsonInvalid", { file: rel(docDir, file), error: e.message }) };
    }
  });
}

/** The application folder the proofs are checked against; said when it is guessed (app.dir not set). */
function applicationFolder(ctx) {
  const info = appDirInfo(ctx.docDir, ctx.config);
  if (info.from === "git" || info.from === "parent")
    warn(t("appDirDerived", { dir: info.dir }), t("appDirDerived_todo"));
  return info.dir;
}

/** The structure (the schema) of one analysis: the lines of its problems ([] when it follows the format). */
function schemaProblems(entry, ctx) {
  if (entry.error) return [entry.error];
  const { errors } = ctx.validator.validate(entry.doc, ctx.schema);
  return errors.map((e) => t("schema", { path: e.path || "/", error: ctx.kitT(`cli.validate.${e.key}`, e.vars) }));
}

/** The structure then the meaning of one analysis: the lines of its problems, each on one line. */
function problemsOf(entry, ctx, lines) {
  const structure = schemaProblems(entry, ctx);
  const problems = structure.length
    ? structure
    : checkAnalysis(entry.doc, { name: entry.name, kinds: ctx.registry.kinds, lines, secrets: ctx.secretsIn }).map(
        (p) => t(`problem.${p.key}`, p.vars),
      );
  return problems.map((p) => ctx.oneLine(p));
}

async function check(values, names) {
  const ctx = await setup(values);
  const entries = readAnalyses(ctx.docDir, names);
  if (!entries.length) {
    console.log(t("none", { dir: rel(ctx.docDir, analysisDir(ctx.docDir)) }));
    return 0;
  }
  const lines = proofLines(applicationFolder(ctx));
  let failed = 0;
  for (const entry of entries) {
    const problems = problemsOf(entry, ctx, lines);
    if (problems.length) failed++;
    console.log(problems.length ? `✖ ${entry.name}` : `✔ ${entry.name}`);
    for (const p of problems) console.log(`  ${p}`);
  }
  console.log(t("checked", { n: entries.length, failed }));
  return failed ? 1 : 0;
}

/** One analysis, valid: its problems stop the command (a digest is never made from a wrong analysis). */
function validAnalysis(ctx, name) {
  const [entry] = readAnalyses(ctx.docDir, [name]);
  const problems = problemsOf(entry, ctx, proofLines(applicationFolder(ctx)));
  if (problems.length)
    throw new ExitError(1, t("invalid", { feature: name, n: problems.length }), t("invalid_todo", { feature: name }));
  return entry.doc;
}

async function digestCommand(values, [name]) {
  if (!name) throw new ExitError(2, t("featureMissing"), t("usage"));
  if (!READERS.includes(values.for))
    throw new ExitError(2, t("readerInvalid", { value: values.for ?? "" }), t("usage"));
  const ctx = await setup(values);
  const doc = validAnalysis(ctx, name);
  const profile = ctx.profiles.loadSpaceProfiles(ctx.kitRoot).get(values.for);
  const text = digest(doc, {
    mechanism: !profile.noCode,
    proofs: !!profile.proofs,
    reader: t(`reader.${values.for}`),
    t: (key, vars) => t(key, vars),
    rubricLabel: ctx.rubricLabel,
  });
  const out = values.output
    ? path.resolve(values.output)
    : path.join(analysisDir(ctx.docDir), `${name}.${values.for}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(t("written", { file: rel(ctx.docDir, out) }));
  return 0;
}

const depthFile = (docDir) => path.join(analysisDir(docDir), "depth.json");

/** The state of the depth loop: { features: { id: { rounds } }, left: [...] }. */
function readDepth(docDir) {
  try {
    const s = JSON.parse(fs.readFileSync(depthFile(docDir), "utf8"));
    return { features: s.features ?? {}, left: Array.isArray(s.left) ? s.left : [] };
  } catch {
    return { features: {}, left: [] };
  }
}

/** The analyses that follow the format; each other one named on the console, and skipped. */
function readableAnalyses(ctx) {
  const out = [];
  for (const entry of readAnalyses(ctx.docDir, [])) {
    const vars = { feature: entry.name };
    if (schemaProblems(entry, ctx).length) warn(t("skipped", vars), t("skipped_todo", vars));
    // A text holding a secret is never printed nor written elsewhere: the analysis is skipped.
    else if (secretProblems(entry.doc, ctx.secretsIn).length) warn(t("skippedSecret", vars), t("skipped_todo", vars));
    else out.push(entry.doc);
  }
  return out;
}

async function questions(values) {
  const ctx = await setup(values);
  const text = openQuestions(readableAnalyses(ctx), {
    left: readDepth(ctx.docDir).left,
    t: (key, vars) => t(key, vars),
    rubricLabel: ctx.rubricLabel,
  });
  const out = values.output ? path.resolve(values.output) : path.join(ctx.docDir, WORK_DIR, "open-questions.md");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(t("written", { file: rel(ctx.docDir, out) }));
  return 0;
}

async function findings(values) {
  const ctx = await setup(values);
  const list = findingsOf(readableAnalyses(ctx));
  if (values.json) {
    console.log(JSON.stringify(list, null, 2));
    return 0;
  }
  if (!list.length) console.log(t("noFinding"));
  list.forEach((f, i) => {
    const line = `${i + 1}. ${t(`severity.${f.severity}`)} — ${f.text} (${f.feature}): ${f.proofs.map(proofText).join(", ")}`;
    console.log(ctx.oneLine(line));
  });
  return 0;
}

async function depth(values) {
  const ctx = await setup(values);
  const auditFile = values.audit ? path.resolve(values.audit) : path.join(ctx.docDir, WORK_DIR, "audit.json");
  let audit;
  try {
    audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
  } catch {
    throw new ExitError(2, t("auditMissing", { file: rel(ctx.docDir, auditFile) }), t("auditMissing_todo"));
  }
  const features = audit.depth?.features ?? [];
  const analyses = new Map(readableAnalyses(ctx).map((d) => [d.feature, d]));
  const saved = readDepth(ctx.docDir);
  const plan = depthPlan({ features, analyses, state: saved.features, rubricLabel: ctx.rubricLabel });
  // What was left of a feature the audit measured again is replaced by this round's (none when its gaps closed).
  const measured = new Set(features.map((f) => f.id));
  const left = [...saved.left.filter((l) => !measured.has(l.feature)), ...plan.left];
  fs.mkdirSync(analysisDir(ctx.docDir), { recursive: true });
  fs.writeFileSync(depthFile(ctx.docDir), JSON.stringify({ features: plan.state, left }, null, 2) + "\n");
  if (values.json) {
    console.log(JSON.stringify({ actions: plan.actions, left: plan.left }, null, 2));
    return 0;
  }
  if (!plan.actions.length && !plan.left.length) console.log(t("depthDone"));
  const print = (s) => console.log(ctx.oneLine(s));
  for (const a of plan.actions) {
    const named = (gaps) =>
      gaps.map((g) => (a.labels[g] && a.labels[g] !== g ? `${g} (${a.labels[g]})` : g)).join(", ");
    print(`${a.feature} · ${a.title}`);
    if (a.deepen.length) print(`  ${t("depth.deepen")} ${named(a.deepen)}`);
    if (a.reanalyse.length) print(`  ${t("depth.reanalyse")} ${named(a.reanalyse)}`);
    if (a.questions.length) print(`  ${t("depth.questions")} ${named(a.questions)}`);
  }
  if (plan.left.length) console.log(t("depthLeft", { n: plan.left.length }));
  return 0;
}

await run(async () => {
  const { values, positionals } = parseOptions(
    {
      project: { type: "string" },
      for: { type: "string" },
      output: { type: "string" },
      audit: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    t("usage"),
  );
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    console.log(t("usage"));
    return values.help ? 0 : 2;
  }
  const commands = { check, digest: digestCommand, questions, findings, depth };
  if (!commands[command]) throw new ExitError(2, t("commandUnknown", { command }), t("usage"));
  return commands[command](values, rest);
});
