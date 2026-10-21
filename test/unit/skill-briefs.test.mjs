// Coherence of the doc-kit skill (skill/doc-kit/, RULES.md M15): every brief exists in English and French with the
// same front matter and the same placeholders; every agent type a brief names exists, and every agent type is used;
// each agent's description names, in its "Used for …" sentence, the briefs it runs (Claude Code picks an agent by
// its description); the model routing (DEFAULT_ROUTING) names real briefs, and SKILL.md's model table puts every
// brief it lists on the model it really runs on; each agent's tools are listed alike in SKILL.md, ARCHITECTURE.md
// and the docs. A brief added in one language only, a routing entry left behind,
// or a table that drifted from the code fails here instead of misleading the orchestrator.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SKILL_SOURCE } from "../../cli/commands/skill.mjs";
import { AGENT_TYPES, DEFAULT_ROUTING, briefModel } from "../../skill/doc-kit/scripts/common.mjs";

const BRIEFS = path.join(SKILL_SOURCE, "assets", "briefs");
const AGENTS = path.join(SKILL_SOURCE, "agents");
const LANGS = ["en", "fr"];

const briefNames = (lang) =>
  fs
    .readdirSync(path.join(BRIEFS, lang))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
const read = (lang, name) => fs.readFileSync(path.join(BRIEFS, lang, `${name}.md`), "utf8");
const agentOf = (name) => frontMatter(read("en", name)).agent || "";

/** The `key: value` lines of a leading `---` front matter block. */
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  return Object.fromEntries(
    m[1]
      .split(/\r?\n/)
      .map((l) => /^([\w-]+):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map((x) => [x[1], x[2].trim()]),
  );
}
const placeholders = (text) => [...new Set([...text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((m) => m[1]))].sort();

test("every brief exists in English and French, with the same front matter and the same placeholders", () => {
  const en = briefNames("en");
  assert.ok(en.length >= 10, "the briefs are found");
  assert.deepEqual(briefNames("fr"), en, "the same briefs in both languages");
  for (const name of en) {
    const [a, b] = LANGS.map((lang) => read(lang, name));
    assert.deepEqual(frontMatter(b), frontMatter(a), `${name}: front matter differs between en and fr`);
    assert.deepEqual(placeholders(b), placeholders(a), `${name}: placeholders differ between en and fr`);
  }
});

test("every agent type a brief names exists, and every agent type is used by a brief", () => {
  const files = fs
    .readdirSync(AGENTS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
  assert.deepEqual(files, [...AGENT_TYPES].sort(), "skill/doc-kit/agents/ holds exactly AGENT_TYPES");
  const used = new Set();
  for (const name of briefNames("en")) {
    const agent = agentOf(name);
    if (!agent) continue; // a brief the orchestrator runs itself (consolidation)
    assert.ok(AGENT_TYPES.includes(agent), `${name}: unknown agent type “${agent}”`);
    used.add(agent);
  }
  for (const type of AGENT_TYPES) assert.ok(used.has(type), `${type} is used by no brief`);
});

test("each agent's tools, as its definition gives them, are those SKILL.md, ARCHITECTURE.md and the docs list", () => {
  // The analyst gained Edit in 0.4.0 and SKILL.md kept the old list: a list that drifts fails here.
  const set = (list) =>
    list
      .split(/[,/]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
  const kit = path.join(SKILL_SOURCE, "..", "..");
  const skill = fs.readFileSync(path.join(SKILL_SOURCE, "SKILL.md"), "utf8");
  const architecture = fs.readFileSync(path.join(kit, "ARCHITECTURE.md"), "utf8");
  for (const type of AGENT_TYPES) {
    const tools = set(frontMatter(fs.readFileSync(path.join(AGENTS, `${type}.md`), "utf8")).tools || "");
    assert.ok(tools.length, `${type}: its definition names no tool`);
    // SKILL.md: "`type` (`model`, Read/Grep/Glob only — …" or "(`model`, also Edit/Write/Bash — …".
    const inSkill = new RegExp("`" + type + "`\\s+\\(`\\w+`, ([^—]+?) —").exec(skill)?.[1] ?? "";
    const listed = inSkill.replace(/ only$/, "").replace(/^also /, "Read/Grep/Glob/");
    assert.deepEqual(set(listed), tools, `SKILL.md: the tools of ${type}`);
    const inArchitecture = new RegExp("`" + type + "` \\(`\\w+`; ([^:)]+)[:)]").exec(architecture)?.[1] ?? "";
    assert.deepEqual(set(inArchitecture), tools, `ARCHITECTURE.md: the tools of ${type}`);
    for (const lang of LANGS) {
      const page = fs.readFileSync(path.join(kit, "docs", lang, "content", "skill", "cost-and-speed.md"), "utf8");
      const row = new RegExp("^\\| `" + type + "` \\| \\w+ \\| ([^|(]+)", "m").exec(page)?.[1] ?? "";
      assert.deepEqual(set(row), tools, `docs/${lang} cost-and-speed: the tools of ${type}`);
    }
  }
});

test("each agent's description names, in its “Used for …” sentence, every brief that runs it", () => {
  for (const type of AGENT_TYPES) {
    const description = frontMatter(fs.readFileSync(path.join(AGENTS, `${type}.md`), "utf8")).description || "";
    const at = description.indexOf("Used for");
    assert.ok(at >= 0, `${type}: its description has no “Used for …” sentence naming its briefs`);
    const usedFor = description.slice(at); // ordinary prose before it ("the code inventory") does not count
    for (const name of briefNames("en"))
      if (agentOf(name) === type)
        assert.ok(new RegExp(`\\b${name}\\b`).test(usedFor), `${type}: “Used for …” does not name “${name}”`);
  }
});

test("DEFAULT_ROUTING names real briefs, and SKILL.md's model table puts each brief on the model it runs on", () => {
  const briefs = briefNames("en");
  for (const name of Object.keys(DEFAULT_ROUTING)) assert.ok(briefs.includes(name), `routing names no brief: ${name}`);
  const skill = fs.readFileSync(path.join(SKILL_SOURCE, "SKILL.md"), "utf8");
  const rows = [...skill.matchAll(/^\s*\|\s*`(haiku|sonnet|opus)`\s*\|(.*)\|\s*$/gm)];
  assert.equal(rows.length, 3, "SKILL.md has its model table (haiku, sonnet, opus)");
  const seen = new Map();
  for (const [, model, cell] of rows)
    for (const [, name] of cell.matchAll(/`([\w-]+)`/g)) {
      if (!briefs.includes(name)) continue;
      assert.ok(!seen.has(name), `SKILL.md lists ${name} in two rows (${seen.get(name)}, ${model})`);
      seen.set(name, model);
      // The model the brief really runs on: DEFAULT_ROUTING, else its agent type's own model.
      const runs = briefModel(name, agentOf(name));
      assert.equal(runs, model, `SKILL.md puts ${name} on ${model}; it runs on ${runs}`);
    }
  for (const name of Object.keys(DEFAULT_ROUTING))
    assert.ok(seen.has(name), `SKILL.md's model table does not list ${name}, which DEFAULT_ROUTING routes`);
});
