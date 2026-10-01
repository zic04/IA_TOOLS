// skill install [--target <skills folder>] [--force]
// Installs the Claude Code skill of the kit (skill/doc-kit) into <skills folder>/doc-kit:
//   <skills folder> = --target, otherwise $CLAUDE_CONFIG_DIR/skills, otherwise ~/.claude/skills.
// {{KIT_PATH}} is replaced with the kit's absolute path (forward slashes) in SKILL.md, references/*.md and
// scripts/*.mjs. A fingerprint file (.doc-kit-skill.json) lets `doctor` report an outdated copy.
// Only the doc-kit folder is ever written or replaced; a doc-kit folder without fingerprint (not installed by
// this command) is left alone unless --force.
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
};

export const SKILL_NAME = "doc-kit";
export const FINGERPRINT = ".doc-kit-skill.json";
export const SKILL_SOURCE = path.join(KIT_ROOT, "skill", SKILL_NAME);
const PLACEHOLDER = "{{KIT_PATH}}";
/** Files where the placeholder is replaced. */
const SUBSTITUTED = /^(SKILL\.md|references\/[^/]+\.md|scripts\/[^/]+\.mjs)$/;

/** Skills folder: --target, $CLAUDE_CONFIG_DIR/skills, ~/.claude/skills. */
export function skillsFolder({ target, env = process.env } = {}) {
  if (target) return path.resolve(process.cwd(), target);
  if (env.CLAUDE_CONFIG_DIR) return path.join(path.resolve(env.CLAUDE_CONFIG_DIR), "skills");
  const home = env.HOME || env.USERPROFILE || os.homedir();
  return path.join(home, ".claude", "skills");
}

/** Files of a folder, relative, forward slashes, sorted (fingerprint and copy). */
function listFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .map(slash)
    .filter((f) => f !== FINGERPRINT)
    .sort();
}

/** SHA-256 of a folder's files (names and contents). */
export function folderHash(dir) {
  const h = crypto.createHash("sha256");
  for (const f of listFiles(dir)) {
    h.update(f + "\0");
    h.update(fs.readFileSync(path.join(dir, f)));
    h.update("\0");
  }
  return h.digest("hex");
}

/**
 * Installs the skill.
 * @returns {{ folder: string, files: number, kitPath: string, replaced: boolean }}
 */
export function installSkill({ skills, force = false, source = SKILL_SOURCE, kitRoot = KIT_ROOT }) {
  if (!fs.existsSync(path.join(source, "SKILL.md"))) throw new KitError(EXIT.ENVIRONMENT, "skill.sourceMissing", { folder: source });
  const folder = path.join(skills, SKILL_NAME);
  const replaced = fs.existsSync(folder);
  if (replaced && !fs.existsSync(path.join(folder, FINGERPRINT)) && !force) throw new KitError(EXIT.CHECK, "skill.foreign", { folder });
  // Prepared in a temporary folder, then copied: an error while preparing never leaves half a skill, and
  // nothing but <skills>/doc-kit is ever created in the skills folder.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "doc-kit-skill-"));
  const kitPath = slash(path.resolve(kitRoot));
  const files = listFiles(source);
  for (const f of files) {
    const dest = path.join(staging, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (SUBSTITUTED.test(f)) fs.writeFileSync(dest, fs.readFileSync(path.join(source, f), "utf8").split(PLACEHOLDER).join(kitPath));
    else fs.copyFileSync(path.join(source, f), dest);
  }
  const fingerprint = { kit: BRAND.version, kitPath, source: folderHash(source), installed: folderHash(staging), date: new Date().toISOString() };
  fs.writeFileSync(path.join(staging, FINGERPRINT), JSON.stringify(fingerprint, null, 2) + "\n");
  try {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(skills, { recursive: true });
    fs.cpSync(staging, folder, { recursive: true });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return { folder, files: files.length, kitPath, replaced };
}

/**
 * State of the installed skill, for `doctor`:
 *   missing · current · outdated (the kit's skill changed since) · modified (edited after install) ·
 *   otherKit (installed from another kit folder) · foreign (a doc-kit folder without fingerprint)
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

export async function run({ ctx, values, positionals }) {
  const action = positionals[0];
  if (action !== "install") throw new KitError(EXIT.USAGE, "skill.action", { action: action ?? "", command: BRAND.command });
  const skills = skillsFolder({ target: values.target, env: ctx.env });
  const r = installSkill({ skills, force: !!values.force });
  if (ctx.json) {
    ctx.print(JSON.stringify(r, null, 2));
    return EXIT.OK;
  }
  ctx.print(`${ctx.paint.ok("✔")} ${ctx.t(r.replaced ? "cli.skill.updated" : "cli.skill.installed", { folder: shownPath(r.folder), n: r.files, kit: r.kitPath })}`);
  ctx.print(`  ${ctx.paint.dim(ctx.t("cli.skill.restart"))}`);
  return EXIT.OK;
}
