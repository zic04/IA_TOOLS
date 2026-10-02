// skill install: copy into a TEMPORARY skills folder only (never the real ~/.claude), {{KIT_PATH}} replaced,
// fingerprint read by doctor (current / outdated / modified / missing), other skills untouched.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { runCli } from "../../cli/doc-kit.mjs";
import { installSkill, skillStatus, skillsFolder, SKILL_SOURCE, FINGERPRINT } from "../../cli/commands/skill.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env });
  return { code, out, err };
}
const kitPath = KIT_ROOT.split(path.sep).join("/");

describe("skill install", () => {
  test("copies the skill, replaces {{KIT_PATH}}, writes the fingerprint, leaves other skills alone", async () => {
    const skills = tempDir("doc-kit-skills-");
    try {
      fs.mkdirSync(path.join(skills, "other-skill"));
      fs.writeFileSync(path.join(skills, "other-skill", "SKILL.md"), "---\nname: other\n---\n");
      const r = await cli(["skill", "install", "--target", skills]);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^✔ Claude Code skill installed in .*doc-kit \(\d+ files, kit .*\)\n/);
      const dir = path.join(skills, "doc-kit");
      const skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
      assert.doesNotMatch(skill, /\{\{KIT_PATH\}\}/);
      assert.ok(skill.includes(`\`${kitPath}\``), "absolute kit path, forward slashes");
      assert.doesNotMatch(fs.readFileSync(path.join(dir, "scripts", "common.mjs"), "utf8"), /\{\{KIT_PATH\}\}/);
      for (const f of fs.readdirSync(path.join(dir, "references"))) assert.doesNotMatch(fs.readFileSync(path.join(dir, "references", f), "utf8"), /\{\{KIT_PATH\}\}/, f);
      // Brief templates keep their own placeholders.
      assert.match(fs.readFileSync(path.join(dir, "assets", "briefs", "en", "inventory.md"), "utf8"), /\{\{\w+\}\}/);
      const fp = JSON.parse(fs.readFileSync(path.join(dir, FINGERPRINT), "utf8"));
      assert.equal(fp.kitPath, kitPath);
      assert.match(fp.source, /^[0-9a-f]{64}$/);
      assert.equal(fs.readFileSync(path.join(skills, "other-skill", "SKILL.md"), "utf8"), "---\nname: other\n---\n");
      assert.deepEqual(fs.readdirSync(skills).sort(), ["doc-kit", "other-skill"]);
      // The installed scripts find the kit through the replaced path.
      const common = await import(pathToFileURL(path.join(dir, "scripts", "common.mjs")).href);
      assert.equal(path.resolve(common.kitPath()), KIT_ROOT);

      // Reinstall: replaced (fingerprint present).
      const again = await cli(["skill", "install", "--target", skills]);
      assert.equal(again.code, 0);
      assert.match(again.out, /updated/);
    } finally {
      fs.rmSync(skills, { recursive: true, force: true });
    }
  });

  test("a doc-kit folder not installed by the command is kept unless --force; unknown action → 2", async () => {
    const skills = tempDir("doc-kit-skills-");
    try {
      fs.mkdirSync(path.join(skills, "doc-kit"));
      fs.writeFileSync(path.join(skills, "doc-kit", "SKILL.md"), "mine");
      const r = await cli(["skill", "install", "--target", skills]);
      assert.equal(r.code, 1);
      assert.match(r.err, /already exists and was not installed by this command\n {2}→ remove it, or add --force/);
      assert.equal(fs.readFileSync(path.join(skills, "doc-kit", "SKILL.md"), "utf8"), "mine");
      assert.equal((await cli(["skill", "install", "--target", skills, "--force"])).code, 0);
      assert.notEqual(fs.readFileSync(path.join(skills, "doc-kit", "SKILL.md"), "utf8"), "mine");
      assert.equal((await cli(["skill", "remove"])).code, 2);
    } finally {
      fs.rmSync(skills, { recursive: true, force: true });
    }
  });

  test("status for doctor: missing, current, modified, outdated, other kit; CLAUDE_CONFIG_DIR honoured", () => {
    const config = tempDir("doc-kit-claude-");
    try {
      const env = { CLAUDE_CONFIG_DIR: config };
      assert.equal(skillsFolder({ env }), path.join(config, "skills"));
      assert.equal(skillsFolder({ env: { HOME: config } }), path.join(config, ".claude", "skills"));
      assert.equal(skillStatus({ env }).state, "missing");
      installSkill({ skills: path.join(config, "skills") });
      assert.equal(skillStatus({ env }).state, "current");
      fs.appendFileSync(path.join(config, "skills", "doc-kit", "SKILL.md"), "\nlocal edit\n");
      assert.equal(skillStatus({ env }).state, "modified");
      // A changed source (newer kit): copy the source, change it, compare.
      const source = path.join(config, "source");
      fs.cpSync(SKILL_SOURCE, source, { recursive: true });
      fs.appendFileSync(path.join(source, "SKILL.md"), "\nnew section\n");
      assert.equal(skillStatus({ env, source }).state, "outdated");
      assert.equal(skillStatus({ env, kitRoot: config }).state, "otherKit");
    } finally {
      fs.rmSync(config, { recursive: true, force: true });
    }
  });
});

// The skill's brief.mjs (run as the agents run it: a separate Node process).
const BRIEF = path.join(SKILL_SOURCE, "scripts", "brief.mjs");
function brief(args, cwd) {
  const r = spawnSync(process.execPath, [BRIEF, ...args], { cwd, encoding: "utf8", env: { ...process.env, DOC_KIT_URL: "", DOC_KIT_LANG: "" } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
/** An application with a separate front end and its documentation project (<app>/docs/manual). */
function briefProject(config) {
  const app = tempDir("doc-kit-brief-");
  const docs = path.join(app, "docs", "manual");
  fs.mkdirSync(path.join(app, "frontend", "src", "app"), { recursive: true });
  fs.mkdirSync(path.join(app, "api"), { recursive: true });
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(app, "frontend", "package.json"), JSON.stringify({ name: "acme-orders-frontend", version: "1.0.0" }));
  fs.writeFileSync(path.join(app, "version.txt"), "2.4.0\n");
  fs.writeFileSync(path.join(docs, "doc.config.mjs"), `export default ${JSON.stringify({ product: { name: "Acme Orders" }, version: { file: "../../version.txt", pattern: "^([\\d.]+)" }, coverage: [{ adapter: "next-app-router", app: "../../frontend/src/app" }], ...config }, null, 2)};\n`);
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
    const { app, docs } = briefProject({ language: "fr", app: { url: "http://localhost:3000", dir: "../.." }, capture: { mode: "none" } });
    try {
      const vars = brief(["inventory", "--project", docs, "--vars"], app);
      assert.equal(vars.code, 0, vars.err);
      assert.match(vars.out, /^Paramètres de inventory\.md :/);
      assert.ok(vars.out.includes(`appDir                 ${app.length > 87 ? app.slice(0, 87) : app}`), vars.out);
      assert.match(vars.err, /⚠ la source de couverture \(\.\.\/\.\.\/frontend\/src\/app\) est dans un front-end séparé \(frontend\) : l'inventaire des routes ne voit que le front-end\n {2}→ les briefs pointent vers /);
      assert.doesNotMatch(vars.err, /appDir n'est pas configuré/);
      const r = brief(["writing-batch", "--project", docs, "--var", "code=u1", "--var", "pages=use/orders", "--var", "referencePage=configure/x"], app);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^✔ brief écrit : .*brief-writing-batch-u1\.md\n {2}→ lancez l'agent avec : « Lis .* et exécute-le en entier\. »\n$/);
      const text = fs.readFileSync(path.join(docs, ".doc-kit", "brief-writing-batch-u1.md"), "utf8");
      assert.match(text, /\*\*AUCUNE CAPTURE DU TOUT\*\* \(`capture\.mode: "none"`/);
      assert.match(text, /\| Élément \| Ce qu'il montre \|/);
      assert.doesNotMatch(text, /Réutilise au plus 1 ou 2 captures/);
      assert.match(text, /du produit \*\*Acme Orders\*\*/, "no elision trap");
      const unknown = brief(["nope", "--project", docs], app);
      assert.equal(unknown.code, 2);
      assert.match(unknown.err, /^✖ modèle inconnu : « nope » \(langue fr\)\n {2}→ modèles disponibles : /);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("an English project without app.dir: appDir is derived (the .git folder, else two levels up), and the warning says so", () => {
    const { app, docs } = briefProject({ language: "en" });
    try {
      let r = brief(["inventory", "--project", docs, "--vars"], app);
      assert.equal(r.code, 0, r.err);
      assert.match(r.err, /⚠ appDir is not configured \(app\.dir in doc\.config\.mjs\): .* is assumed \(two levels above the documentation folder\)\n {2}→ check it: set app\.dir/);
      assert.match(r.err, /⚠ the coverage source \(\.\.\/\.\.\/frontend\/src\/app\) is in a separate front end \(frontend\): the inventory of routes only sees the front end/);
      fs.mkdirSync(path.join(app, ".git"));
      r = brief(["inventory", "--project", docs, "--vars"], app);
      assert.match(r.err, /is assumed \(the folder that holds \.git\)/);
      // Given explicitly: no "not configured" warning; the separate front end is still reported.
      r = brief(["inventory", "--project", docs, "--vars", "--var", `appDir=${app}`], app);
      assert.doesNotMatch(r.err, /not configured/);
      assert.match(r.err, /⚠ the coverage source \(\.\.\/\.\.\/frontend\/src\/app\) is in a separate front end \(frontend\)/);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});
