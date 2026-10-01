// skill install: copy into a TEMPORARY skills folder only (never the real ~/.claude), {{KIT_PATH}} replaced,
// fingerprint read by doctor (current / outdated / modified / missing), other skills untouched.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
