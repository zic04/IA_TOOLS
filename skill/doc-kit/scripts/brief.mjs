#!/usr/bin/env node
// Fills a brief template of the doc-kit skill from the project's doc.config.mjs and from --var values.
//
//   node brief.mjs <template> --project <docDir> [--lang en|fr] [--var key=value]… [--output <file>]
//   node brief.mjs <template> --project <docDir> --vars       show the template's placeholders and their values
//   node brief.mjs --list [--lang en|fr]                       list the available templates
//
// <template>: a file name of assets/briefs/<lang>/ (writing-batch, journey…) or the path of a .md file.
// --lang picks the language of the brief (default: the project's `language`); {{language}} stays the site's language.
// Value precedence: --var > extra.briefs in doc.config.mjs > value derived from the config > empty (reported).
// "--var key=@file" reads the value from a file (a multi-line value becomes a bullet list).
// Default output: <docDir>/.doc-kit/brief-<template>[-<code>].md.
// Exit codes: 0 OK · 1 placeholders left unfilled (the file is written anyway) · 2 usage or configuration.
import fs from "node:fs";
import path from "node:path";
import {
  ExitError,
  SKILL_ROOT,
  WORK_DIR,
  baseVariables,
  checkLanguage,
  fill,
  findProject,
  loadConfig,
  parseOptions,
  readVars,
  run,
  templateVariables,
  warn,
} from "./common.mjs";

const USAGE = `Usage:
  node brief.mjs <template> --project <docDir> [--lang en|fr] [--var key=value]… [--output <file>]
  node brief.mjs <template> --project <docDir> --vars
  node brief.mjs --list [--lang en|fr]`;

// Filled section by section by consolidation.mjs, not by this script.
const NOT_A_BRIEF = new Set(["consolidation"]);

const templatesDir = (lang) => path.join(SKILL_ROOT, "assets", "briefs", lang);

function listTemplates(lang) {
  const dir = templatesDir(lang);
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).filter((n) => !NOT_A_BRIEF.has(n)).sort()
    : [];
}

function findTemplate(name, lang) {
  if (name.endsWith(".md") && fs.existsSync(path.resolve(name))) return path.resolve(name);
  const base = name.replace(/\.md$/, "");
  if (NOT_A_BRIEF.has(base)) {
    throw new ExitError(2, `"${base}" is not a brief`, "create the consolidation file with: node consolidation.mjs init --project <docDir> --codes a,b,c");
  }
  const file = path.join(templatesDir(lang), `${base}.md`);
  if (fs.existsSync(file)) return file;
  throw new ExitError(2, `unknown template: "${name}" (language ${lang})`, `available templates: ${listTemplates(lang).join(", ") || "none"}`);
}

async function main() {
  const { values: o, positionals } = parseOptions(
    {
      project: { type: "string" },
      lang: { type: "string" },
      var: { type: "string", multiple: true },
      output: { type: "string" },
      vars: { type: "boolean" },
      list: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    USAGE,
  );
  if (o.help) {
    console.log(USAGE);
    return 0;
  }
  checkLanguage(o.lang);
  if (o.list) {
    const lang = o.lang ?? "en";
    console.log(`Templates (${lang}): ${listTemplates(lang).join(", ")}`);
    return 0;
  }
  if (positionals.length !== 1) throw new ExitError(2, "give exactly one template", USAGE.split("\n")[1].trim());
  const name = positionals[0];

  const docDir = findProject(o.project);
  const config = await loadConfig(docDir);
  const lang = o.lang ?? config.language ?? "en";
  checkLanguage(lang, "language");
  const templateFile = findTemplate(name, lang);
  const template = fs.readFileSync(templateFile, "utf8");

  const vars = { ...baseVariables(docDir, config, lang), ...readVars(o.var, docDir) };
  if (!vars.prefix && vars.code) vars.prefix = vars.code;

  if (o.vars) {
    console.log(`Placeholders of ${path.basename(templateFile)}:`);
    for (const key of templateVariables(template)) {
      const v = vars[key] == null || String(vars[key]).trim() === "" ? "(empty)" : String(vars[key]).replace(/\s*\n\s*/g, " ⏎ ");
      console.log(`  ${key.padEnd(22)} ${v.length > 90 ? `${v.slice(0, 87)}…` : v}`);
    }
    return 0;
  }

  const { text, unfilled } = fill(template, vars);
  const base = path.basename(templateFile, ".md");
  const output = o.output ? path.resolve(o.output) : path.join(docDir, WORK_DIR, `brief-${base}${vars.code ? `-${vars.code}` : ""}.md`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, text);
  console.log(`✔ brief written: ${output}`);
  if (unfilled.length) {
    warn(
      `placeholder(s) left unfilled: ${unfilled.join(", ")}`,
      `add ${unfilled.map((v) => `--var ${v}=…`).join(" ")} (or extra.briefs.<key> in doc.config.mjs), then run again`,
    );
    return 1;
  }
  console.log(`  → launch the agent with: "Read ${output} and carry it out in full."`);
  return 0;
}

await run(main);
