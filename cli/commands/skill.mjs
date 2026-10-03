// skill install [--target <skills folder>] [--force] [--hooks [--settings <file>]]
// Installs the Claude Code skill of the kit (skill/doc-kit) into <skills folder>/doc-kit, and its three agent
// types (ARCHITECTURE.md §6.11) into <skills folder>/../agents/ (Claude Code's own agents folder, next to the
// skills folder: only doc-kit-triage.md, doc-kit-writer.md and doc-kit-reviewer.md are ever written there, no
// other file in that shared folder is touched):
//   <skills folder> = --target, otherwise $CLAUDE_CONFIG_DIR/skills, otherwise ~/.claude/skills.
// {{KIT_PATH}} is replaced with the kit's absolute path (forward slashes) in SKILL.md, references/*.md and
// scripts/*.mjs. A fingerprint file (.doc-kit-skill.json, inside <skills folder>/doc-kit/) covers both the
// skill and the agent files, and lets `doctor` report either copy as outdated or modified.
// Only the doc-kit folder is ever written or replaced; a doc-kit folder without fingerprint (not installed by
// this command) is left alone unless --force. The three agent files are always written or replaced (they have
// no "foreign" concept: the shared agents folder is never owned exclusively by doc-kit).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { KIT_ROOT } from "../../engine/project/find.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { slash } from "../../engine/dev/environment.mjs";
import { shownPath } from "../common.mjs";

export const options = {
  target: { type: "string" },
  force: { type: "boolean" },
  hooks: { type: "boolean" },
  settings: { type: "string" },
};

/** The hook script, inside the installed skill. */
const HOOK_SCRIPT = "scripts/usage-hook.mjs";

/**
 * Registers the statistics hook (SubagentStop → usage-hook.mjs, ARCHITECTURE.md §6.14) in a Claude Code settings
 * file, merging with what is there: other hooks and settings are kept, and the doc-kit hook is replaced, never
 * added twice. An unreadable file is refused rather than overwritten.
 * @returns {{ file: string, added: boolean }} added: false when the same hook was already there
 */
export function installHooks({ settingsFile, skillFolder }) {
  let settings = {};
  if (fs.existsSync(settingsFile)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    } catch (e) {
      throw new KitError(EXIT.CHECK, "skill.settingsInvalid", { file: settingsFile, error: e.message });
    }
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
      throw new KitError(EXIT.CHECK, "skill.settingsInvalid", { file: settingsFile, error: "not an object" });
  }
  const command = `node "${slash(path.join(skillFolder, HOOK_SCRIPT))}"`;
  const ours = (h) => typeof h?.command === "string" && h.command.includes("usage-hook.mjs");
  settings.hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
  const groups = Array.isArray(settings.hooks.SubagentStop) ? settings.hooks.SubagentStop : [];
  const already = groups.some((g) => (g.hooks || []).some((h) => ours(h) && h.command === command));
  const kept = groups
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !ours(h)) }))
    .filter((g) => g.hooks.length);
  settings.hooks.SubagentStop = [...kept, { matcher: "", hooks: [{ type: "command", command }] }];
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
  return { file: settingsFile, added: !already };
}

export const SKILL_NAME = "doc-kit";
export const FINGERPRINT = ".doc-kit-skill.json";
export const SKILL_SOURCE = path.join(KIT_ROOT, "skill", SKILL_NAME);
const AGENTS_SUBDIR = "agents";
const PLACEHOLDER = "{{KIT_PATH}}";
/** Files where the placeholder is replaced. */
const SUBSTITUTED = /^(SKILL\.md|references\/[^/]+\.md|scripts\/[^/]+\.mjs)$/;

/**
 * Skills folder: --target, $CLAUDE_CONFIG_DIR/skills, ~/.claude/skills.
 * @param {{ target?: string, env?: NodeJS.ProcessEnv }} [p]
 */
export function skillsFolder({ target, env = process.env } = {}) {
  if (target) return path.resolve(process.cwd(), target);
  if (env.CLAUDE_CONFIG_DIR) return path.join(path.resolve(env.CLAUDE_CONFIG_DIR), "skills");
  const home = env.HOME || env.USERPROFILE || os.homedir();
  return path.join(home, ".claude", "skills");
}

/**
 * Claude Code's agents folder, next to the skills folder.
 * @param {{ target?: string, env?: NodeJS.ProcessEnv }} [p]
 */
export function agentsFolder({ target, env = process.env } = {}) {
  return path.join(skillsFolder({ target, env }), "..", AGENTS_SUBDIR);
}

/** Files of the skill proper (relative, forward slashes, sorted): everything under `dir` except the agent
 * definitions (installed separately) and the fingerprint. */
function listFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .map(slash)
    .filter((f) => f !== FINGERPRINT && !f.startsWith(`${AGENTS_SUBDIR}/`))
    .sort();
}

/** The agent definition file names shipped by the kit (skill/doc-kit/agents/*.md), sorted; [] if there are none. */
export function agentFileNames(source = SKILL_SOURCE) {
  const dir = path.join(source, AGENTS_SUBDIR);
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .sort()
    : [];
}

/** SHA-256 of a folder's files (names and contents). */
function folderHash(dir) {
  const h = crypto.createHash("sha256");
  for (const f of listFiles(dir)) {
    h.update(f + "\0");
    h.update(fs.readFileSync(path.join(dir, f)));
    h.update("\0");
  }
  return h.digest("hex");
}

/** SHA-256 of a fixed list of file names read from `dir` (an absent file contributes empty content: the hash
 * still changes between "none installed" and "some installed", which the caller tells apart separately). */
function namedFilesHash(dir, names) {
  const h = crypto.createHash("sha256");
  for (const name of [...names].sort()) {
    h.update(name + "\0");
    h.update(fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name)) : Buffer.alloc(0));
    h.update("\0");
  }
  return h.digest("hex");
}

/**
 * Installs the skill and the agent types.
 * @returns {{ folder: string, files: number, kitPath: string, replaced: boolean, agents: { folder: string, files: number }, hooks?: { file: string, added: boolean } }}
 */
export function installSkill({ skills, force = false, source = SKILL_SOURCE, kitRoot = KIT_ROOT }) {
  if (!fs.existsSync(path.join(source, "SKILL.md")))
    throw new KitError(EXIT.ENVIRONMENT, "skill.sourceMissing", { folder: source });
  const folder = path.join(skills, SKILL_NAME);
  const replaced = fs.existsSync(folder);
  if (replaced && !fs.existsSync(path.join(folder, FINGERPRINT)) && !force)
    throw new KitError(EXIT.CHECK, "skill.foreign", { folder });
  // Prepared in a temporary folder, then copied: an error while preparing never leaves half a skill, and
  // nothing but <skills>/doc-kit is ever created in the skills folder.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "doc-kit-skill-"));
  const kitPath = slash(path.resolve(kitRoot));
  const files = listFiles(source);
  for (const f of files) {
    const dest = path.join(staging, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (SUBSTITUTED.test(f))
      fs.writeFileSync(dest, fs.readFileSync(path.join(source, f), "utf8").split(PLACEHOLDER).join(kitPath));
    else fs.copyFileSync(path.join(source, f), dest);
  }

  const agentNames = agentFileNames(source);
  const agentsDest = agentsFolder({ target: skills });
  fs.mkdirSync(agentsDest, { recursive: true });
  for (const name of agentNames) fs.copyFileSync(path.join(source, AGENTS_SUBDIR, name), path.join(agentsDest, name));

  const fingerprint = {
    kit: BRAND.version,
    kitPath,
    source: folderHash(source),
    installed: folderHash(staging),
    agentsFolder: slash(path.resolve(agentsDest)),
    agentNames,
    agentsSource: namedFilesHash(path.join(source, AGENTS_SUBDIR), agentNames),
    agentsInstalled: namedFilesHash(agentsDest, agentNames),
    date: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(staging, FINGERPRINT), JSON.stringify(fingerprint, null, 2) + "\n");
  try {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(skills, { recursive: true });
    fs.cpSync(staging, folder, { recursive: true });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { folder, files: files.length, kitPath, replaced, agents: { folder: agentsDest, files: agentNames.length } };
}

/**
 * State of the installed skill, for `doctor`:
 *   missing · current · outdated (the kit's skill changed since) · modified (edited after install) ·
 *   otherKit (installed from another kit folder) · foreign (a doc-kit folder without fingerprint)
 * @param {{ env?: NodeJS.ProcessEnv, target?: string, source?: string, kitRoot?: string }} [p]
 */
export function skillStatus({ env = process.env, target, source = SKILL_SOURCE, kitRoot = KIT_ROOT } = {}) {
  const folder = path.join(skillsFolder({ target, env }), SKILL_NAME);
  if (!fs.existsSync(folder)) return { state: "missing", folder };
  const file = path.join(folder, FINGERPRINT);
  if (!fs.existsSync(file)) return { state: "foreign", folder };
  let fp;
  try {
    fp = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { state: "foreign", folder };
  }
  if (fp.kitPath !== slash(path.resolve(kitRoot))) return { state: "otherKit", folder, kitPath: fp.kitPath };
  if (fs.existsSync(source) && fp.source !== folderHash(source)) return { state: "outdated", folder, version: fp.kit };
  if (fp.installed !== folderHash(folder)) return { state: "modified", folder };
  return { state: "current", folder, version: fp.kit };
}

/**
 * State of the installed agent types (ARCHITECTURE.md §6.11), for `doctor`: missing (none installed, or no
 * fingerprint to compare against) · current · outdated (the kit's agents changed since) · modified (edited, or
 * removed, after install). Read from the main skill's fingerprint: the two are always installed together.
 * @param {{ env?: NodeJS.ProcessEnv, target?: string, source?: string, kitRoot?: string }} [p]
 */
export function agentsStatus({ env = process.env, target, source = SKILL_SOURCE, kitRoot = KIT_ROOT } = {}) {
  const folder = agentsFolder({ target, env });
  const fpFile = path.join(skillsFolder({ target, env }), SKILL_NAME, FINGERPRINT);
  if (!fs.existsSync(fpFile)) return { state: "missing", folder };
  let fp;
  try {
    fp = JSON.parse(fs.readFileSync(fpFile, "utf8"));
  } catch {
    return { state: "missing", folder };
  }
  if (!Array.isArray(fp.agentNames) || !fp.agentNames.length) return { state: "missing", folder };
  if (fp.kitPath !== slash(path.resolve(kitRoot))) return { state: "otherKit", folder, kitPath: fp.kitPath };
  const present = fp.agentNames.filter((n) => fs.existsSync(path.join(folder, n)));
  if (!present.length) return { state: "missing", folder };
  const sourceNames = agentFileNames(source);
  if (sourceNames.length && namedFilesHash(path.join(source, AGENTS_SUBDIR), fp.agentNames) !== fp.agentsSource)
    return { state: "outdated", folder, version: fp.kit };
  if (namedFilesHash(folder, fp.agentNames) !== fp.agentsInstalled) return { state: "modified", folder };
  return { state: "current", folder, version: fp.kit, n: fp.agentNames.length };
}

export async function run({ ctx, values, positionals }) {
  const action = positionals[0];
  if (action !== "install")
    throw new KitError(EXIT.USAGE, "skill.action", { action: action ?? "", command: BRAND.command });
  const skills = skillsFolder({ target: values.target, env: ctx.env });
  const r = installSkill({ skills, force: !!values.force });
  // --hooks: the statistics hook in the project's Claude Code settings (or --settings <file>).
  if (values.hooks || values.settings)
    r.hooks = installHooks({
      settingsFile: path.resolve(process.cwd(), values.settings || path.join(".claude", "settings.json")),
      skillFolder: r.folder,
    });
  if (ctx.json) {
    ctx.print(JSON.stringify(r, null, 2));
    return EXIT.OK;
  }
  ctx.print(
    `${ctx.paint.ok("✔")} ${ctx.t(r.replaced ? "cli.skill.updated" : "cli.skill.installed", { folder: shownPath(r.folder), n: r.files, kit: r.kitPath })}`,
  );
  if (r.agents.files)
    ctx.print(
      `  ${ctx.paint.dim(ctx.t("cli.skill.agents", { folder: shownPath(r.agents.folder), n: r.agents.files }))}`,
    );
  if (r.hooks) ctx.print(`  ${ctx.paint.dim(ctx.t("cli.skill.hooks", { file: shownPath(r.hooks.file) }))}`);
  ctx.print(`  ${ctx.paint.dim(ctx.t("cli.skill.restart"))}`);
  return EXIT.OK;
}
