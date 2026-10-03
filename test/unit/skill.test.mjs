// skill install: copy into a TEMPORARY skills folder only (never the real ~/.claude), {{KIT_PATH}} replaced,
// fingerprint read by doctor (current / outdated / modified / missing), other skills untouched; the three agent
// types (ARCHITECTURE.md §6.11) are copied next to the skills folder and reported the same way.
// brief.mjs: every brief template declares its agent type and its common part is byte-identical whatever the
// per-agent variables (code, pages…), so a wave's agents share their prompt cache; --estimate.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { runCli } from "../../cli/doc-kit.mjs";
import {
  installSkill,
  skillStatus,
  agentsStatus,
  agentFileNames,
  skillsFolder,
  agentsFolder,
  SKILL_SOURCE,
  FINGERPRINT,
} from "../../cli/commands/skill.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";
import { AGENT_TYPES } from "../../skill/doc-kit/scripts/common.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env });
  return { code, out, err };
}
const kitPath = KIT_ROOT.split(path.sep).join("/");
const AGENT_NAMES = agentFileNames();

describe("skill install", () => {
  test("copies the skill, replaces {{KIT_PATH}}, writes the fingerprint, leaves other skills alone", async () => {
    const root = tempDir("doc-kit-skills-");
    const skills = path.join(root, "skills");
    try {
      fs.mkdirSync(skills, { recursive: true });
      fs.mkdirSync(path.join(skills, "other-skill"));
      fs.writeFileSync(path.join(skills, "other-skill", "SKILL.md"), "---\nname: other\n---\n");
      const r = await cli(["skill", "install", "--target", skills]);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^✔ Claude Code skill installed in .*doc-kit \(\d+ files, kit .*\)\n/);
      assert.match(r.out, new RegExp(`agent types installed in .*agents \\(${AGENT_NAMES.length} files\\)`));
      const dir = path.join(skills, "doc-kit");
      const skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
      assert.doesNotMatch(skill, /\{\{KIT_PATH\}\}/);
      assert.ok(skill.includes(`\`${kitPath}\``), "absolute kit path, forward slashes");
      assert.doesNotMatch(fs.readFileSync(path.join(dir, "scripts", "common.mjs"), "utf8"), /\{\{KIT_PATH\}\}/);
      for (const f of fs.readdirSync(path.join(dir, "references")))
        assert.doesNotMatch(fs.readFileSync(path.join(dir, "references", f), "utf8"), /\{\{KIT_PATH\}\}/, f);
      // Brief templates keep their own placeholders.
      assert.match(fs.readFileSync(path.join(dir, "assets", "briefs", "en", "inventory.md"), "utf8"), /\{\{\w+\}\}/);
      // The skill folder itself never receives the agent definitions: they go next to the skills folder.
      assert.ok(!fs.existsSync(path.join(dir, "agents")));
      const fp = JSON.parse(fs.readFileSync(path.join(dir, FINGERPRINT), "utf8"));
      assert.equal(fp.kitPath, kitPath);
      assert.match(fp.source, /^[0-9a-f]{64}$/);
      assert.deepEqual(fp.agentNames, AGENT_NAMES);
      assert.match(fp.agentsSource, /^[0-9a-f]{64}$/);
      assert.equal(fp.agentsInstalled, fp.agentsSource, "just installed: source and installed hashes match");
      assert.equal(fs.readFileSync(path.join(skills, "other-skill", "SKILL.md"), "utf8"), "---\nname: other\n---\n");
      assert.deepEqual(fs.readdirSync(skills).sort(), ["doc-kit", "other-skill"]);

      // The agent types: copied as plain files (no {{KIT_PATH}}), next to the skills folder, nothing else there.
      const agents = path.join(root, "agents");
      assert.deepEqual(fs.readdirSync(agents).sort(), AGENT_NAMES);
      for (const name of AGENT_NAMES) {
        const installed = fs.readFileSync(path.join(agents, name), "utf8");
        assert.equal(installed, fs.readFileSync(path.join(SKILL_SOURCE, "agents", name), "utf8"), name);
        assert.match(
          installed,
          /^---\nname: doc-kit-\w+\ndescription: .+\nmodel: (haiku|sonnet|opus)\ntools: [\w, ]+\n---\n/,
          name,
        );
      }
      assert.equal(agentsStatus({ target: skills }).state, "current");

      // Reinstall: replaced (fingerprint present); a foreign file dropped into the shared agents folder is left alone.
      fs.writeFileSync(path.join(agents, "someone-elses-agent.md"), "not doc-kit's");
      const again = await cli(["skill", "install", "--target", skills]);
      assert.equal(again.code, 0);
      assert.match(again.out, /updated/);
      assert.equal(fs.readFileSync(path.join(agents, "someone-elses-agent.md"), "utf8"), "not doc-kit's");
      assert.deepEqual(fs.readdirSync(agents).sort(), [...AGENT_NAMES, "someone-elses-agent.md"].sort());

      // The installed scripts find the kit through the replaced path.
      const common = await import(pathToFileURL(path.join(dir, "scripts", "common.mjs")).href);
      assert.equal(path.resolve(common.kitPath()), KIT_ROOT);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a doc-kit folder not installed by the command is kept unless --force; unknown action → 2", async () => {
    const root = tempDir("doc-kit-skills-");
    const skills = path.join(root, "skills");
    try {
      fs.mkdirSync(path.join(skills, "doc-kit"), { recursive: true });
      fs.writeFileSync(path.join(skills, "doc-kit", "SKILL.md"), "mine");
      const r = await cli(["skill", "install", "--target", skills]);
      assert.equal(r.code, 1);
      assert.match(r.err, /already exists and was not installed by this command\n {2}→ remove it, or add --force/);
      assert.equal(fs.readFileSync(path.join(skills, "doc-kit", "SKILL.md"), "utf8"), "mine");
      // Nothing was written to the agents folder either, since the install was refused before copying anything.
      assert.ok(!fs.existsSync(path.join(root, "agents")));
      assert.equal((await cli(["skill", "install", "--target", skills, "--force"])).code, 0);
      assert.notEqual(fs.readFileSync(path.join(skills, "doc-kit", "SKILL.md"), "utf8"), "mine");
      assert.deepEqual(fs.readdirSync(path.join(root, "agents")).sort(), AGENT_NAMES);
      assert.equal((await cli(["skill", "remove"])).code, 2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("status for doctor: missing, current, modified, outdated, other kit; CLAUDE_CONFIG_DIR honoured", () => {
    const config = tempDir("doc-kit-claude-");
    try {
      const env = { CLAUDE_CONFIG_DIR: config };
      assert.equal(skillsFolder({ env }), path.join(config, "skills"));
      assert.equal(skillsFolder({ env: { HOME: config } }), path.join(config, ".claude", "skills"));
      assert.equal(agentsFolder({ env }), path.join(config, "agents"));
      assert.equal(skillStatus({ env }).state, "missing");
      assert.equal(agentsStatus({ env }).state, "missing");
      installSkill({ skills: path.join(config, "skills") });
      assert.equal(skillStatus({ env }).state, "current");
      assert.equal(agentsStatus({ env }).state, "current");
      fs.appendFileSync(path.join(config, "skills", "doc-kit", "SKILL.md"), "\nlocal edit\n");
      assert.equal(skillStatus({ env }).state, "modified");
      assert.equal(agentsStatus({ env }).state, "current", "editing SKILL.md does not affect the agents' own status");
      // The agent types edited after install, and one removed: both report "modified".
      fs.appendFileSync(path.join(config, "agents", AGENT_NAMES[0]), "\nlocal edit\n");
      assert.equal(agentsStatus({ env }).state, "modified");
      fs.rmSync(path.join(config, "agents", AGENT_NAMES[0]));
      assert.equal(agentsStatus({ env }).state, "modified");
      // All agent files removed: "missing", like the skill would report if its own folder were gone.
      for (const name of AGENT_NAMES) fs.rmSync(path.join(config, "agents", name), { force: true });
      assert.equal(agentsStatus({ env }).state, "missing");
      // A changed source (newer kit): copy the source, change it, compare (skill and agents both pick it up).
      const source = path.join(config, "source");
      fs.cpSync(SKILL_SOURCE, source, { recursive: true });
      fs.appendFileSync(path.join(source, "SKILL.md"), "\nnew section\n");
      assert.equal(skillStatus({ env, source }).state, "outdated");
      fs.appendFileSync(path.join(source, "agents", AGENT_NAMES[0]), "\nnew section\n");
      // Reinstall cleanly first, from the ORIGINAL source, so the fingerprint matches what's on disk again.
      installSkill({ skills: path.join(config, "skills"), force: true });
      assert.equal(agentsStatus({ env, source }).state, "outdated");
      assert.equal(skillStatus({ env, kitRoot: config }).state, "otherKit");
      assert.equal(agentsStatus({ env, kitRoot: config }).state, "otherKit");
    } finally {
      fs.rmSync(config, { recursive: true, force: true });
    }
  });
});

// The skill's brief.mjs (run as the agents run it: a separate Node process).
const BRIEF = path.join(SKILL_SOURCE, "scripts", "brief.mjs");
function brief(args, cwd) {
  const r = spawnSync(process.execPath, [BRIEF, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, DOC_KIT_URL: "", DOC_KIT_LANG: "" },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
/** An application with a separate front end and its documentation project (<app>/docs/manual). */
function briefProject(config) {
  const app = tempDir("doc-kit-brief-");
  const docs = path.join(app, "docs", "manual");
  fs.mkdirSync(path.join(app, "frontend", "src", "app"), { recursive: true });
  fs.mkdirSync(path.join(app, "api"), { recursive: true });
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(
    path.join(app, "frontend", "package.json"),
    JSON.stringify({ name: "acme-orders-frontend", version: "1.0.0" }),
  );
  fs.writeFileSync(path.join(app, "version.txt"), "2.4.0\n");
  fs.writeFileSync(
    path.join(docs, "doc.config.mjs"),
    `export default ${JSON.stringify({ product: { name: "Acme Orders" }, version: { file: "../../version.txt", pattern: "^([\\d.]+)" }, coverage: [{ adapter: "next-app-router", app: "../../frontend/src/app" }], ...config }, null, 2)};\n`,
  );
  return { app, docs };
}

describe("brief.mjs", () => {
  test("--list: the languages, then the templates of each; in the language of --lang without a project", () => {
    const empty = tempDir("doc-kit-brief-");
    try {
      const r = brief(["--list"], empty);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^Languages: en, fr\nTemplates \(en\): .*writing-batch.*\nTemplates \(fr\): .*writing-batch/);
      assert.match(brief(["--list", "--lang", "fr"], empty).out, /^Langues : en, fr\nModèles \(fr\) : .*inventory/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  test("a French project: French messages; appDir from app.dir; the separate front end is reported; no screenshot", () => {
    const { app, docs } = briefProject({
      language: "fr",
      app: { url: "http://localhost:3000", dir: "../.." },
      capture: { mode: "none" },
    });
    try {
      const vars = brief(["inventory", "--project", docs, "--vars"], app);
      assert.equal(vars.code, 0, vars.err);
      assert.match(vars.out, /^Paramètres de inventory\.md :/);
      assert.ok(vars.out.includes(`appDir                 ${app.length > 87 ? app.slice(0, 87) : app}`), vars.out);
      assert.match(
        vars.err,
        /⚠ la source de couverture \(\.\.\/\.\.\/frontend\/src\/app\) est dans un front-end séparé \(frontend\) : l'inventaire des routes ne voit que le front-end\n {2}→ les briefs pointent vers /,
      );
      assert.doesNotMatch(vars.err, /appDir n'est pas configuré/);
      const r = brief(
        [
          "writing-batch",
          "--project",
          docs,
          "--var",
          "code=u1",
          "--var",
          "pages=use/orders",
          "--var",
          "referencePage=configure/x",
        ],
        app,
      );
      assert.equal(r.code, 0, r.err);
      assert.match(
        r.out,
        /^✔ brief écrit : .*brief-writing-batch-u1\.md\n {2}→ lancez-le avec le type d'agent doc-kit-writer et le modèle sonnet, le texte complet du brief comme consigne \(la partie commune d'abord : chaque agent de la vague après le premier la lit dans le cache de prompt\)\n$/,
      );
      const text = fs.readFileSync(path.join(docs, ".doc-kit", "brief-writing-batch-u1.md"), "utf8");
      assert.match(text, /^agent: doc-kit-writer\n/m);
      assert.match(text, /\*\*AUCUNE CAPTURE DU TOUT\*\* \(`capture\.mode: "none"`/);
      assert.match(text, /\| Élément \| Ce qu'il montre \|/);
      assert.doesNotMatch(text, /Réutilise au plus 1 ou 2 captures/);
      assert.match(text, /Acme Orders/, "product name filled correctly, no corruption near a template boundary");
      const unknown = brief(["nope", "--project", docs], app);
      assert.equal(unknown.code, 2);
      assert.match(unknown.err, /^✖ modèle inconnu : « nope » \(langue fr\)\n {2}→ modèles disponibles : /);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("writing-batch (en and fr): the announced word range is the template's maxWords, with no contradicting fixed range", () => {
    const templates = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "standard", "templates.json"), "utf8"));
    const screenMaxWords = templates.types.screen.maxWords;
    assert.equal(screenMaxWords, 2500, "sanity check: the screen template's bound this brief refers to");
    const en = fs.readFileSync(
      path.join(KIT_ROOT, "skill", "doc-kit", "assets", "briefs", "en", "writing-batch.md"),
      "utf8",
    );
    const fr = fs.readFileSync(
      path.join(KIT_ROOT, "skill", "doc-kit", "assets", "briefs", "fr", "writing-batch.md"),
      "utf8",
    );
    // No hard-coded range that could contradict a template's own maxWords (the former "2,000 to 3,500 words").
    assert.doesNotMatch(en, /\b2,000 to 3,500 words\b/);
    assert.doesNotMatch(fr, /\b2 000\s*à\s*3 500 mots\b/);
    // The brief must point the writer at the template's own bound instead, with no minimum.
    assert.match(en, /up\s+to\s+the\s+template's\s+`maxWords`[\s\S]*no\s+minimum/);
    assert.match(fr, /jusqu'au\s+`maxWords`\s+du\s+gabarit[\s\S]*sans\s+minimum/);
  });

  test("an English project without app.dir: appDir is derived (the .git folder, else two levels up), and the warning says so", () => {
    const { app, docs } = briefProject({ language: "en" });
    try {
      let r = brief(["inventory", "--project", docs, "--vars"], app);
      assert.equal(r.code, 0, r.err);
      assert.match(
        r.err,
        /⚠ appDir is not configured \(app\.dir in doc\.config\.mjs\): .* is assumed \(two levels above the documentation folder\)\n {2}→ check it: set app\.dir/,
      );
      assert.match(
        r.err,
        /⚠ the coverage source \(\.\.\/\.\.\/frontend\/src\/app\) is in a separate front end \(frontend\): the inventory of routes only sees the front end/,
      );
      fs.mkdirSync(path.join(app, ".git"));
      r = brief(["inventory", "--project", docs, "--vars"], app);
      assert.match(r.err, /is assumed \(the folder that holds \.git\)/);
      // Given explicitly: no "not configured" warning; the separate front end is still reported.
      r = brief(["inventory", "--project", docs, "--vars", "--var", `appDir=${app}`], app);
      assert.doesNotMatch(r.err, /not configured/);
      assert.match(
        r.err,
        /⚠ the coverage source \(\.\.\/\.\.\/frontend\/src\/app\) is in a separate front end \(frontend\)/,
      );
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});

// ARCHITECTURE.md §6.11: every brief declares its agent type, and two briefs of the same template differ only
// after their common part — tested here with different `code`/`pages` (and, where relevant, other per-agent
// variables), so that the agents of one wave can share their prompt cache.
const TEMPLATE_VARIANTS = {
  "writing-batch": [
    ["--var", "code=u1", "--var", "pages=use/orders", "--var", "referencePage=use/orders"],
    ["--var", "code=u2", "--var", "pages=use/settings", "--var", "referencePage=use/orders"],
  ],
  inventory: [
    ["--var", "reads=guide-a.md"],
    ["--var", "reads=guide-b.md"],
  ],
  "findings-verification": [
    ["--var", "consolidationFile=.doc-kit/consolidation-a.md"],
    ["--var", "consolidationFile=.doc-kit/consolidation-b.md"],
  ],
  "page-corrections": [
    ["--var", "labels=messages/a.json"],
    ["--var", "labels=messages/b.json"],
  ],
  journey: [
    [
      "--var",
      "code=ord",
      "--var",
      "pages=take-over/order-journey",
      "--var",
      "topic=the journey of an order",
      "--var",
      "diagram=t-order-journey",
    ],
    [
      "--var",
      "code=inv",
      "--var",
      "pages=take-over/invoice-journey",
      "--var",
      "topic=the journey of an invoice",
      "--var",
      "diagram=t-invoice-journey",
    ],
  ],
  troubleshooting: [
    ["--var", "code=tbl", "--var", "pages=take-over/troubleshooting", "--var", "diagram=t-troubleshooting"],
    ["--var", "code=tb2", "--var", "pages=take-over/troubleshooting-2", "--var", "diagram=t-troubleshooting-2"],
  ],
  "production-technical": [
    [
      "--var",
      "code=t",
      "--var",
      "pages=take-over/architecture",
      "--var",
      "portalCaptures=.doc-kit/portal-a",
      "--var",
      "diagram=t-architecture",
    ],
    [
      "--var",
      "code=t2",
      "--var",
      "pages=take-over/resources",
      "--var",
      "portalCaptures=.doc-kit/portal-b",
      "--var",
      "diagram=t-resources",
    ],
  ],
  triage: [
    ["--var", "pages=use/orders"],
    ["--var", "pages=use/settings"],
  ],
  update: [
    ["--var", "pages=use/orders"],
    ["--var", "pages=use/settings"],
  ],
  "functional-spec": [
    ["--var", "code=fs1", "--var", "pages=use/orders"],
    ["--var", "code=fs2", "--var", "pages=use/invoices"],
  ],
  "code-health": [
    ["--var", "code=t", "--var", "pages=take-over/api-surface"],
    ["--var", "code=t2", "--var", "pages=take-over/dependencies"],
  ],
  "access-ownership": [
    ["--var", "pages=take-over/access-ownership"],
    ["--var", "pages=take-over/access-ownership-2"],
  ],
  "system-dossier": [
    ["--var", "code=t3", "--var", "pages=take-over/runbook"],
    ["--var", "code=t4", "--var", "pages=take-over/data-model"],
  ],
  "security-review": [
    ["--var", "pages=take-over/security-review"],
    ["--var", "pages=take-over/security-review-2"],
  ],
  "maintainability-review": [
    ["--var", "pages=take-over/maintainability-review"],
    ["--var", "pages=take-over/maintainability-review-2"],
  ],
  translate: [
    ["--var", "lang=fr", "--var", "pages=use/orders", "--var", "contextFiles=.doc-kit/context/use__orders.fr.md"],
    ["--var", "lang=fr", "--var", "pages=use/settings", "--var", "contextFiles=.doc-kit/context/use__settings.fr.md"],
  ],
  "capture-plans": [
    ["--var", "code=cp1", "--var", "pages=/orders"],
    ["--var", "code=cp2", "--var", "pages=/settings"],
  ],
};
const AGENT_TYPES_KNOWN = new Set(AGENT_TYPES);

describe("brief templates: agent type and common/variable split", () => {
  for (const [name, variants] of Object.entries(TEMPLATE_VARIANTS)) {
    for (const lang of ["en", "fr"]) {
      test(`${name} (${lang}): declares a known agent type; common part byte-identical across variables`, () => {
        const { app, docs } = briefProject({ language: lang });
        try {
          const outputs = variants.map((vars, i) => {
            const output = path.join(docs, ".doc-kit", `t-${name}-${i}.md`);
            const r = brief([name, "--project", docs, "--lang", lang, "--output", output, ...vars], app);
            assert.ok(r.code === 0 || r.code === 1, `${name} ${lang} #${i}: ${r.err}`);
            return fs.readFileSync(output, "utf8");
          });
          for (const text of outputs) {
            const agent = /^agent:\s*(\S+)/m.exec(text)?.[1];
            assert.ok(agent && AGENT_TYPES_KNOWN.has(agent), `${name} (${lang}) has a known agent type, got ${agent}`);
          }
          const marker = "## Variables";
          const commons = outputs.map((t) => t.slice(0, t.indexOf(marker)));
          assert.ok(
            commons[0].length > 0 && outputs.every((t) => t.includes(marker)),
            `${name} (${lang}) has a Variables section`,
          );
          assert.equal(commons[1], commons[0], `${name} (${lang}): common part differs between two variable sets`);
        } finally {
          fs.rmSync(app, { recursive: true, force: true });
        }
      });
    }
  }

  test("newer briefs (triage, update, functional-spec, code-health, access-ownership, system-dossier, security-review, maintainability-review): the same placeholders in en and fr", () => {
    for (const name of [
      "triage",
      "update",
      "functional-spec",
      "code-health",
      "access-ownership",
      "system-dossier",
      "security-review",
      "maintainability-review",
      "translate",
      "capture-plans",
    ]) {
      const en = fs.readFileSync(path.join(SKILL_SOURCE, "assets", "briefs", "en", `${name}.md`), "utf8");
      const fr = fs.readFileSync(path.join(SKILL_SOURCE, "assets", "briefs", "fr", `${name}.md`), "utf8");
      const vars = (t) => [...new Set([...t.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((m) => m[1]))].sort();
      assert.deepEqual(vars(fr), vars(en), `${name}: en/fr placeholder parity`);
    }
  });
});

describe("brief.mjs --estimate", () => {
  test("input and output tokens, agent and model; no cost without llm.prices, a cost with it", () => {
    const { app, docs } = briefProject({ language: "en" });
    try {
      fs.mkdirSync(path.join(docs, "content", "use"), { recursive: true });
      fs.writeFileSync(
        path.join(docs, "content", "toc.json"),
        JSON.stringify({
          sections: [
            {
              id: "use",
              groups: [
                {
                  pages: [
                    { id: "use/orders", template: "screen" },
                    { id: "use/brandnew", template: "screen" },
                  ],
                },
              ],
            },
          ],
        }),
      );
      fs.writeFileSync(path.join(docs, "content", "use", "orders.md"), "existing content\n");

      const r = brief(
        [
          "writing-batch",
          "--project",
          docs,
          "--var",
          "code=u1",
          "--var",
          "pages=use/orders, use/brandnew",
          "--var",
          "referencePage=use/orders",
          "--estimate",
        ],
        app,
      );
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^Estimate for writing-batch — agent doc-kit-writer, model sonnet\n/);
      assert.match(r.out, /^ {2}input: {2}\d+ tokens \(brief \d+ \+ \d+ cited file\(s\) \d+ tokens\)$/m);
      assert.match(r.out, /^ {2}output: \d+ tokens \(2 page\(s\): 1 new, 1 update\)$/m);
      assert.match(r.out, /^ {2}total: {2}\d+ tokens$/m);
      assert.match(r.out, /not estimated \(set llm\.prices\.sonnet/);
      // No file was written: --estimate never produces a brief file.
      assert.ok(!fs.existsSync(path.join(docs, ".doc-kit", "brief-writing-batch-u1.md")));

      // With llm.prices set, the same run reports a cost.
      fs.writeFileSync(
        path.join(docs, "doc.config.mjs"),
        fs
          .readFileSync(path.join(docs, "doc.config.mjs"), "utf8")
          .replace(
            "export default {",
            'export default {\n  llm: { currency: "EUR", prices: { sonnet: { input: 3, output: 15 } } },',
          ),
      );
      const r2 = brief(
        [
          "writing-batch",
          "--project",
          docs,
          "--var",
          "code=u1",
          "--var",
          "pages=use/orders, use/brandnew",
          "--var",
          "referencePage=use/orders",
          "--estimate",
        ],
        app,
      );
      assert.equal(r2.code, 0, r2.err);
      assert.match(r2.out, /^ {2}cost: {3}\d+\.\d{4} EUR$/m);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("a read-only template (inventory, no pages): input tokens only, no output", () => {
    const { app, docs } = briefProject({ language: "en" });
    try {
      const r = brief(["inventory", "--project", docs, "--estimate"], app);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^Estimate for inventory — agent doc-kit-reviewer, model opus\n/);
      assert.match(r.out, /^ {2}output: 0 tokens \(no page list to estimate from:/m);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});

describe("llm configuration (ARCHITECTURE.md §6.11)", () => {
  test("model routing (G4): the brief's default model, then llm.routing; the estimate and the launch line name it", async () => {
    const { briefModel, DEFAULT_ROUTING } = await import("../../skill/doc-kit/scripts/common.mjs");
    assert.equal(briefModel("translate", "doc-kit-writer"), "haiku");
    assert.equal(briefModel("triage", "doc-kit-triage"), "haiku");
    assert.equal(briefModel("findings-verification", "doc-kit-reviewer"), "sonnet");
    assert.equal(briefModel("security-review", "doc-kit-reviewer"), "opus");
    assert.equal(briefModel("writing-batch", "doc-kit-writer"), "sonnet", "not routed: the agent type's model");
    assert.equal(briefModel("translate", "doc-kit-writer", { llm: { routing: { translate: "sonnet" } } }), "sonnet");
    assert.ok(Object.isFrozen(DEFAULT_ROUTING));
  });

  test("accepted with prices per model, currency optional; rejected without output, or with an unknown key", () => {
    const base = { product: { name: "Acme Orders" } };
    const ok = prepareConfig(
      {
        ...base,
        llm: {
          currency: "EUR",
          prices: { sonnet: { input: 3, output: 15, cacheRead: 0.3 }, haiku: { input: 0.25, output: 1.25 } },
        },
      },
      { env: {} },
    );
    assert.deepEqual(ok.llm, {
      currency: "EUR",
      routing: {},
      prices: { sonnet: { input: 3, output: 15, cacheRead: 0.3 }, haiku: { input: 0.25, output: 1.25 } },
    });
    const noCurrency = prepareConfig({ ...base, llm: { prices: { opus: { input: 15, output: 75 } } } }, { env: {} });
    assert.equal(noCurrency.llm.currency, null, "no default currency");
    assert.deepEqual(
      prepareConfig(base, { env: {} }).llm,
      { currency: null, routing: {}, prices: {} },
      "no price by default: prices change and differ by contract",
    );
    assert.deepEqual(prepareConfig({ ...base, llm: { routing: { translate: "sonnet" } } }, { env: {} }).llm.routing, {
      translate: "sonnet",
    });
    assert.throws(
      () => prepareConfig({ ...base, llm: { routing: { translate: "" } } }, { env: {} }),
      /KitError|invalid/i,
      "an empty model name",
    );
    assert.throws(
      () => prepareConfig({ ...base, llm: { prices: { sonnet: { input: 3 } } } }, { env: {} }),
      /KitError|invalid/i,
      "output is required",
    );
    assert.throws(
      () => prepareConfig({ ...base, llm: { bogus: 1 } }, { env: {} }),
      /KitError|invalid/i,
      "no unknown key",
    );
    assert.throws(
      () => prepareConfig({ ...base, llm: { prices: { sonnet: { input: -1, output: 1 } } } }, { env: {} }),
      /KitError|invalid/i,
      "no negative price",
    );
  });
});

describe("skill messages (skill/doc-kit/i18n, AUDIT.md M5)", () => {
  const read = (l) => JSON.parse(fs.readFileSync(path.join(SKILL_SOURCE, "i18n", `${l}.json`), "utf8"));
  const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const scripts = path.join(SKILL_SOURCE, "scripts");

  test("en and fr: the same sections, the same keys, the same {variables}", () => {
    const en = read("en");
    const fr = read("fr");
    assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
    for (const section of Object.keys(en)) {
      assert.deepEqual(Object.keys(fr[section]).sort(), Object.keys(en[section]).sort(), section);
      for (const key of Object.keys(en[section]))
        assert.deepEqual(vars(fr[section][key]), vars(en[section][key]), `${section}.${key}`);
    }
  });

  test('every t("key") of a script exists in its section or in common', () => {
    const en = read("en");
    for (const file of fs.readdirSync(scripts).filter((f) => f.endsWith(".mjs"))) {
      const source = fs.readFileSync(path.join(scripts, file), "utf8");
      const section = /useMessages\("(\w+)"\)/.exec(source)?.[1] ?? null;
      for (const [, key] of source.matchAll(/\bt\("(\w+)"/g))
        assert.ok(en[section]?.[key] !== undefined || en.common[key] !== undefined, `${file}: t("${key}")`);
    }
  });

  test("consolidation.mjs speaks French with --lang fr", () => {
    const r = spawnSync(process.execPath, [path.join(scripts, "consolidation.mjs"), "--lang", "fr"], {
      encoding: "utf8",
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^✖ commande manquante\n {2}→ Usage :/);
    const en = spawnSync(process.execPath, [path.join(scripts, "consolidation.mjs")], { encoding: "utf8" });
    assert.match(en.stderr, /^✖ missing command\n {2}→ Usage:/);
  });
});
