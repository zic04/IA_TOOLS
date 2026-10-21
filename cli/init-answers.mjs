// The answers of `doc-kit init` (cli/commands/init.mjs): the recap printed before anything is written, and the
// questions about the sources of the project (ARCHITECTURE.md §6.19, inputs.json) — asked only when the person wants
// to declare them now, each optional (Enter: none), every answer something `doc-kit inputs add` can give later.
import fs from "node:fs";
import path from "node:path";
import { productSlug } from "../engine/project/defaults.mjs";
import { slash } from "../engine/dev/environment.mjs";
import { addInput, writeInputs, isSafeRepoUrl, hasCredentials, nameOf, INPUTS_FILE } from "../engine/inputs/model.mjs";
import { KitError } from "../engine/project/errors.mjs";
import { absolutePath } from "./common.mjs";
import { SPACE_PRESETS } from "../engine/dev/skeleton.mjs";

export function recapLines(ctx, { target, appDir, detected, answers, nameFromDetection, docsToRoot, languages }) {
  const p = ctx.paint;
  const s = detected.nameSource;
  const nameSource = !nameFromDetection
    ? ctx.t(answers.nameFromOption ? "cli.init.source.option" : "cli.init.source.answer")
    : s.kind === "layout"
      ? ctx.t("cli.init.source.layout", { file: s.file })
      : s.kind === "package"
        ? ctx.t("cli.init.source.package", { field: s.field, file: s.file })
        : ctx.t("cli.init.source.folder");
  const v = detected.version;
  const coverage =
    detected.framework && detected.appPath
      ? `${detected.framework}: ${slash(path.relative(appDir, path.join(detected.packageDir || appDir, detected.appPath)))}`
      : ctx.t("cli.init.coverage.none");
  return [
    ["folder", absolutePath(target)],
    ["name", `${answers.name} ${p.dim(`(${nameSource})`)}`],
    ["slug", productSlug(answers.name)],
    ["language", `${answers.language} — ${ctx.t(`cli.init.language.${answers.language}`)}`],
    ...(languages ? [["languages", languages.join(", ")]] : []),
    ["url", answers.url],
    [
      "version",
      v.value
        ? ctx.t("cli.init.version.read", { version: v.value, file: v.file })
        : ctx.t("cli.init.version.unread", { file: v.file }),
    ],
    ["capture", ctx.t(`cli.init.capture.${answers.capture}`)],
    ...(answers.capture === "app" ? [["target", ctx.t(`cli.init.target.${answers.target}`)]] : []),
    [
      "auth",
      answers.capture === "none" ? `${answers.auth} ${p.dim(`(${ctx.t("cli.init.authUnused")})`)}` : answers.auth,
    ],
    ["spaces", answers.spaces.length ? answers.spaces.join(", ") : ctx.t("cli.init.spaces.noneShort")],
    ["coverage", coverage],
    ["masking", detected.envFiles.length ? detected.envFiles.join(", ") : ctx.t("cli.init.masking.none")],
    ["appDir", `${absolutePath(appDir)} ${p.dim(`(app.dir: ${docsToRoot})`)}`],
  ].map(([k, value]) => [ctx.t(`cli.init.recap.${k}`), value]);
}

/**
 * The audiences of the documentation (ARCHITECTURE.md §6.1a): one of SPACE_PRESETS (engine/dev/skeleton.mjs) —
 * the four spaces, users and product, the takeover (administer and develop), users alone, or none.
 * @returns {Promise<string>} the preset chosen
 */
export async function askSpaces(ctx, prompt, current) {
  const presets = Object.keys(SPACE_PRESETS); // in their order: the four, users and product, a takeover, users, none
  const now = presets.find((k) => SPACE_PRESETS[k].join() === current.join()) ?? "all";
  return prompt.choose(
    ctx.t("cli.init.ask.spaces"),
    presets.map((value) => ({ value, label: ctx.t(`cli.init.spaces.${value}`) })),
    now,
  );
}

/** The items of one answer: separated by commas or semicolons, trimmed. */
const itemsOf = (answer) =>
  String(answer)
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
const isWeb = (v) => /^https?:\/\//i.test(v) && !hasCredentials(v);
const looksLikeRepo = (v) => isWeb(v) || v.startsWith("ssh://") || (v.includes("@") && !v.includes("\\"));

/**
 * The sources, asked one kind at a time; null when the person does not want to declare them now.
 * @param {object} ctx
 * @param {{ ask: Function, confirm: Function }} prompt   prompterOf(ctx)
 * @param {{ from: string, target: string }} where   from: the folder the paths are typed from; target: the project
 * @returns {Promise<object|null>}   the content of inputs.json
 */
export async function askSources(ctx, prompt, where) {
  // Optional questions: an input that ends (no terminal any more) stops them, keeping what was answered.
  const state = { inputs: {} };
  try {
    if (!(await prompt.confirm(ctx.t("cli.init.sources.ask"), false))) return null;
    await askEach(ctx, prompt, where, state);
  } catch (e) {
    if (!(e instanceof KitError && e.key === "prompt.cancelled")) throw e;
  }
  return Object.keys(state.inputs).length ? state.inputs : null;
}

/** The questions one kind at a time, each answer added to `state.inputs` at once. */
async function askEach(ctx, prompt, { from, target }, state) {
  let inputs = state.inputs;
  // An answer the sources refuse (a name or an environment given twice…) is said, never fatal: the rest goes on.
  const add = (kind, o) => {
    try {
      inputs = state.inputs = addInput(inputs, kind, o);
    } catch (e) {
      if (!(e instanceof KitError)) throw e;
      ctx.print(`  ${ctx.paint.warn("⚠")} ${ctx.t(`cli.${e.key}`, e.vars)}`);
    }
  };
  const unique = (x) => {
    let name = nameOf(x);
    for (let i = 2; (inputs.code || []).some((c) => c.name === name); i++) name = `${nameOf(x)}-${i}`;
    return name;
  };
  // A path is typed from where init runs; inputs.json holds it from the documentation project.
  const fromProject = (v) => slash(path.relative(target, path.resolve(from, v))) || ".";
  const found = (v) => fs.existsSync(path.resolve(from, v));
  const codeCheck = (v) =>
    itemsOf(v).find((x) => (looksLikeRepo(x) ? !isSafeRepoUrl(x) : !found(x))) ? "init.sources.badCode" : null;
  const ask = (key, check) => prompt.ask(ctx.t(key), "", check);
  for (const [key, role] of [
    ["cli.init.sources.infra", "infra"],
    ["cli.init.sources.code", "lib"],
  ])
    for (const x of itemsOf(await ask(key, codeCheck)))
      add("code", { value: looksLikeRepo(x) ? x : fromProject(x), name: unique(x), role });
  const app = await ask("cli.init.sources.app", (v) =>
    itemsOf(v).every((x) => isWeb(x.includes("=") ? x.slice(x.indexOf("=") + 1).trim() : x))
      ? null
      : "init.sources.badUrl",
  );
  itemsOf(app).forEach((x, i) => {
    const [env, url] = x.includes("=")
      ? [x.slice(0, x.indexOf("=")).trim(), x.slice(x.indexOf("=") + 1).trim()]
      : [null, x];
    add("app", { value: url, env: env || (i ? `env${i + 1}` : "prod") });
  });
  const document = (v) => (itemsOf(v).every((x) => isWeb(x) || found(x)) ? null : "init.sources.badDocument");
  for (const [key, kind] of [
    ["cli.init.sources.dat", "dat"],
    ["cli.init.sources.documents", "spec"],
  ])
    for (const x of itemsOf(await ask(key, document))) add("document", { value: isWeb(x) ? x : fromProject(x), kind });
  const web = (v) => (itemsOf(v).every(isWeb) ? null : "init.sources.badUrl");
  for (const x of itemsOf(await ask("cli.init.sources.workspaces", web))) add("workspace", { value: x });
  const backlog = itemsOf(await ask("cli.init.sources.backlog", web))[0];
  if (backlog) add("backlog", { value: backlog });
}

/** Writes the sources into the new project; the name of the file written. */
export function saveSources(target, inputs) {
  writeInputs(target, inputs);
  return INPUTS_FILE;
}
