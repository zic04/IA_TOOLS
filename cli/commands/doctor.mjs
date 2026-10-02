// doctor [--network] [--json]
// Checks the environment and the project, one line per check: ✔ OK · ⚠ to look at · ✖ to fix (with → the fix).
//   environment  Node version, kit version against the project's `kit` range, kit dependencies, Chromium,
//                the project's dependency on the kit (npm install), the installed Claude Code skill
//   project      configuration, paths (table of contents, version file — ⚠ a version 0.0.0 or 1.0.0 that a
//                version.txt, VERSION or CHANGELOG.md of the application contradicts —, application folder,
//                coverage sources, masking files, capture plans), .gitignore (.doc-kit/ and dist/), session
//                (present, age, not tracked by git; neither the session nor the plans with capture.mode "none"),
//                capture target (capture.target; ⚠ production without any capture.forbidden route), theme contrasts
//                (WCAG)
//   --network    the application URL answers
// Exit code: 3 when the environment fails, 2 when the configuration is invalid, 1 when a project check fails,
// 0 otherwise (warnings do not fail).
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { findProject, KIT_ROOT, kitVersion, CONFIG_FILE } from "../../engine/project/find.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";
import { satisfies, isValidRange } from "../../engine/project/semver.mjs";
import { checkContrasts } from "../../engine/theme/contrast.mjs";
import { describeProblem } from "../common.mjs";
import { BRAND } from "../../engine/brand.mjs";
import {
  kitPackage,
  kitDependencies,
  chromiumStatus,
  projectDependency,
  importConfig,
  sessionInfo,
  isIgnored,
  isTracked,
  slash,
  shownFolder,
} from "../../engine/dev/environment.mjs";
import { skillStatus } from "./skill.mjs";
import { VERSION_FILES, VERSION_TEXT_PATTERN } from "./init.mjs";

export const options = {
  network: { type: "boolean" },
};

const SYMBOLS = { ok: "✔", warn: "⚠", fail: "✖" };
/** Exit code of a failed check, by category. */
const FAILURE = { env: EXIT.ENVIRONMENT, config: EXIT.USAGE, project: EXIT.CHECK };

/** Relative path strings of an adapter's options (coverage sources). */
/** Adapter options that are never file paths (regular expressions, i18n keys, labels), even with a "/" or "\" in them. */
const NOT_PATHS = new Set(["adapter", "pattern", "block", "flags", "key", "fallback", "family", "aliases", "exclude", "ignore", "match", "prefix", "loginPattern", "start"]);

function pathOptions(value, at = "") {
  if (typeof value === "string") return /^(\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])|[\\/]/.test(value) && !/^https?:/.test(value) ? [{ at, value }] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => pathOptions(v, `${at}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => (NOT_PATHS.has(k) ? [] : pathOptions(v, at ? `${at}.${k}` : k)));
  return [];
}

/** Versions that a project which never bumps its version keeps: a documented one is suspicious. */
const FROZEN_VERSIONS = new Set(["0.0.0", "1.0.0"]);
/** First released version of a changelog (a heading "## [1.2.3]", "## v1.2.3 - date"; "Unreleased" skipped). */
const CHANGELOG_VERSION = /^#{1,3}\s*\[?v?(\d+\.\d+\.\d+[\w.+-]*)/m;

/**
 * Another version of the application than `documented`: a version.txt, VERSION or CHANGELOG.md in the application
 * folder (app.dir) or next to the version file. Null when none says otherwise.
 * @returns {{ file: string, version: string }|null}  file relative to the project root
 */
export function otherVersion(root, config, documented) {
  const versionFile = config.version.file ? path.resolve(root, config.version.file) : null;
  const folders = [config.app.dir ? path.resolve(root, config.app.dir) : null, versionFile ? path.dirname(versionFile) : null].filter(Boolean);
  for (const folder of [...new Set(folders)]) {
    for (const [name, pattern] of [...VERSION_FILES.map((f) => [f, new RegExp(VERSION_TEXT_PATTERN)]), ["CHANGELOG.md", CHANGELOG_VERSION]]) {
      const file = path.join(folder, name);
      if (file === versionFile || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      const version = pattern.exec(fs.readFileSync(file, "utf8"))?.[1];
      if (version && version !== documented) return { file: slash(path.relative(root, file)), version };
    }
  }
  return null;
}

/**
 * Runs every check.
 * @returns {Promise<{ project: string|null, checks: Array<{ id, status, category, text, help? }>, code: number }>}
 */
export async function diagnose(ctx, { network = false } = {}) {
  const checks = [];
  const add = (id, status, category, key, vars = {}, helpKey) => {
    const c = { id, status, category, text: ctx.t(key, vars) };
    const help = helpKey === undefined ? `${key}.help` : helpKey;
    if (status !== "ok" && help && ctx.i18n.has(help)) c.help = ctx.t(help, vars);
    checks.push(c);
    return c;
  };

  // ─── Environment ───────────────────────────────────────────────────────────
  const engines = kitPackage().engines?.node || ">=20";
  const node = process.versions.node;
  add("node", satisfies(node, engines) ? "ok" : "fail", "env", satisfies(node, engines) ? "cli.doctor.node.ok" : "cli.doctor.node.fail", { version: node, required: engines });

  const deps = kitDependencies();
  const missing = deps.filter((d) => !d.found);
  const different = deps.filter((d) => d.found && /^\d/.test(d.wanted) && d.found !== d.wanted);
  const kitFolder = slash(KIT_ROOT);
  if (missing.length) add("kitDeps", "fail", "env", "cli.doctor.kitDeps.fail", { names: missing.map((d) => d.name).join(", "), kit: kitFolder });
  else if (different.length)
    add("kitDeps", "warn", "env", "cli.doctor.kitDeps.warn", { list: different.map((d) => `${d.name} ${d.found} ≠ ${d.wanted}`).join(", "), kit: kitFolder });
  else add("kitDeps", "ok", "env", "cli.doctor.kitDeps.ok", { list: deps.map((d) => `${d.name} ${d.found}`).join(", ") });

  if (!missing.some((d) => d.name === "playwright")) {
    const chromium = await chromiumStatus();
    if (chromium.ok) add("chromium", "ok", "env", "cli.doctor.chromium.ok", { path: chromium.path });
    else add("chromium", "fail", "env", "cli.doctor.chromium.fail", { install: chromium.command });
  }

  const skill = skillStatus({ env: ctx.env });
  const skillKeys = { current: "ok", missing: "warn", outdated: "warn", modified: "warn", otherKit: "warn", foreign: "warn" };
  add("skill", skillKeys[skill.state], "env", `cli.doctor.skill.${skill.state}`, { folder: skill.folder, version: skill.version ?? "", kit: skill.kitPath ?? "", command: BRAND.command });

  // ─── Project ───────────────────────────────────────────────────────────────
  let found = null;
  try {
    found = findProject({ project: ctx.globals.project });
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
    add("project", "fail", "config", "cli.doctor.project.missing", { folder: path.resolve(ctx.globals.project || "."), command: BRAND.command });
  }
  if (found) await projectChecks(ctx, found, add, { network });

  const failed = checks.filter((c) => c.status === "fail");
  const code = failed.length ? Math.max(...failed.map((c) => FAILURE[c.category])) : EXIT.OK;
  // Precedence: environment (3) > configuration (2) > project (1).
  return { project: found?.root ?? null, checks, code };
}

async function projectChecks(ctx, { root, configFile }, add, { network }) {
  const version = kitVersion();
  // The project pins its kit in package.json ("doc-kit": "file:…"), linked by npm install.
  const pkgFile = path.join(root, "package.json");
  let declared = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    declared = BRAND.packageName in { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    // no (readable) package.json
  }
  const dependency = projectDependency(root);
  if (!declared && !dependency.ok) add("projectDeps", "warn", "env", "cli.doctor.projectDeps.undeclared", { file: "package.json", package: BRAND.packageName, kit: slash(KIT_ROOT) });
  else if (!dependency.ok) add("projectDeps", "fail", "env", "cli.doctor.projectDeps.fail", { folder: shownFolder(root) });
  else if (!dependency.sameKit) add("projectDeps", "warn", "env", "cli.doctor.projectDeps.other", { folder: dependency.folder, kit: KIT_ROOT });
  else add("projectDeps", "ok", "env", "cli.doctor.projectDeps.ok", { kit: slash(KIT_ROOT) });

  let raw;
  try {
    raw = await importConfig(configFile);
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
    if (e.key === "project.depsMissing") return; // already reported, with its fix
    add("config", "fail", "config", "cli.doctor.config.import", { error: e.vars.error });
    return;
  }

  // Kit range, then the rest of the configuration (validated with any kit version).
  const range = raw && typeof raw === "object" && typeof raw.kit === "string" ? raw.kit : "*";
  if (isValidRange(range)) {
    if (satisfies(version, range)) add("kit", "ok", "env", "cli.doctor.kit.ok", { version, range });
    else add("kit", "fail", "env", "cli.doctor.kit.fail", { version, range, command: BRAND.command });
  }
  let config;
  try {
    config = prepareConfig(raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw, kit: isValidRange(range) ? "*" : range } : raw, { file: CONFIG_FILE, env: ctx.env });
    add("config", "ok", "config", "cli.doctor.config.ok", { file: CONFIG_FILE });
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
    const c = add("config", "fail", "config", "cli.doctor.config.fail", { file: CONFIG_FILE, n: e.details.length || 1 });
    const details = e.details.length ? e.details.map((d) => describeProblem(ctx, { kind: "validate", ...d }).what) : [ctx.t(`cli.${e.key}`, e.vars)];
    c.details = details;
    return;
  }

  const rel = (p) => slash(path.relative(root, p)) || ".";
  const inside = (p) => {
    const r = path.relative(root, p);
    return !r.startsWith("..") && !path.isAbsolute(r);
  };

  // Table of contents (current or legacy name).
  const content = path.join(root, config.paths.content);
  const toc = ["toc.json", "sommaire.json"].map((f) => path.join(content, f)).find((f) => fs.existsSync(f));
  if (toc) add("toc", "ok", "project", "cli.doctor.toc.ok", { file: rel(toc) });
  else add("toc", "fail", "project", "cli.doctor.toc.fail", { file: `${config.paths.content}/toc.json`, command: BRAND.command });

  // Version file.
  if (config.version.file) {
    const f = path.resolve(root, config.version.file);
    if (!fs.existsSync(f)) add("version", "warn", "project", "cli.doctor.version.missing", { file: config.version.file, fallback: config.version.fallback });
    else {
      const m = new RegExp(config.version.pattern).exec(fs.readFileSync(f, "utf8"));
      // A version never incremented (0.0.0, 1.0.0) while the application says otherwise elsewhere: ⚠, not ✔.
      const other = m && m[1] && FROZEN_VERSIONS.has(m[1]) ? otherVersion(root, config, m[1]) : null;
      if (other) add("version", "warn", "project", "cli.doctor.version.frozen", { file: config.version.file, version: m[1], source: other.file, other: other.version });
      else if (m && m[1]) add("version", "ok", "project", "cli.doctor.version.ok", { file: config.version.file, version: m[1] });
      else add("version", "warn", "project", "cli.doctor.version.noMatch", { file: config.version.file, fallback: config.version.fallback });
    }
  }

  // Application folder (app.dir): the code read by the writers and the skill's briefs.
  if (config.app.dir) {
    const ok = fs.existsSync(path.resolve(root, config.app.dir));
    add("appDir", ok ? "ok" : "warn", "project", ok ? "cli.doctor.appDir.ok" : "cli.doctor.appDir.missing", { path: config.app.dir, folder: path.resolve(root, config.app.dir) });
  }

  // Coverage sources.
  config.coverage.forEach((entry, i) => {
    for (const { at, value } of pathOptions(entry)) {
      const ok = fs.existsSync(path.resolve(root, value));
      add(`coverage.${i}.${at}`, ok ? "ok" : "warn", "project", ok ? "cli.doctor.coverage.ok" : "cli.doctor.coverage.missing", { adapter: entry.adapter, option: at, path: value });
    }
  });

  // Masking files.
  config.masking.env.forEach((file) => {
    const ok = fs.existsSync(path.resolve(root, file));
    add(`masking.${file}`, ok ? "ok" : "warn", "project", ok ? "cli.doctor.masking.ok" : "cli.doctor.masking.missing", { file });
  });

  // Capture plans (none to expect without screenshots).
  const noCapture = config.capture.mode === "none";
  const plans = path.resolve(root, config.capture.plans);
  if (!noCapture && !fs.existsSync(plans)) add("plans", "warn", "project", "cli.doctor.plans.missing", { folder: config.capture.plans });

  // Capture target: where the screenshots are taken; production without any forbidden route deserves a look.
  if (!noCapture) {
    const target = config.capture.target;
    const vars = { url: config.app.url || "—", n: config.capture.forbidden.length };
    if (target === "production" && !config.capture.forbidden.length) add("target", "warn", "project", "cli.doctor.target.noForbidden", vars);
    else add("target", "ok", "project", `cli.doctor.target.${target}`, vars);
  }

  // .gitignore: the work folder (session!) and the built site.
  const work = isIgnored(root, ".doc-kit/session.json");
  const dist = isIgnored(root, "dist/site.html");
  const ignore = { file: rel(path.join(root, ".gitignore")), work: ".doc-kit/", dist: "dist/" };
  if (work === null && dist === null) add("gitignore", "warn", "project", "cli.doctor.gitignore.none", ignore);
  else if (!work) add("gitignore", "fail", "project", "cli.doctor.gitignore.work", ignore);
  else if (!dist) add("gitignore", "warn", "project", "cli.doctor.gitignore.dist", ignore);
  else add("gitignore", "ok", "project", "cli.doctor.gitignore.ok", ignore);

  // Session.
  const session = sessionInfo({ root, config, env: ctx.env });
  const shown = inside(session.file) ? rel(session.file) : session.file;
  if (noCapture) {
    add("session", "ok", "project", "cli.doctor.session.noCapture", {});
    // An old session left behind still holds sign-in cookies.
    if (session.exists && isTracked(root, session.file)) add("sessionGit", "fail", "project", "cli.doctor.session.tracked", { file: shown });
  } else if (!session.needed) add("session", "ok", "project", "cli.doctor.session.notNeeded", {});
  else if (!session.exists) add("session", "warn", "project", "cli.doctor.session.missing", { file: shown, command: BRAND.command });
  else {
    const age = session.ageHours < 1 ? ctx.t("cli.doctor.minutes", { n: Math.max(1, Math.round(session.ageHours * 60)) }) : session.ageHours < 48 ? ctx.t("cli.doctor.hours", { n: Math.round(session.ageHours) }) : ctx.t("cli.doctor.days", { n: Math.round(session.ageHours / 24) });
    if (session.expired) add("session", "warn", "project", "cli.doctor.session.expired", { file: shown, age, command: BRAND.command });
    else if (session.ageHours > 24) add("session", "warn", "project", "cli.doctor.session.old", { file: shown, age, command: BRAND.command });
    else add("session", "ok", "project", "cli.doctor.session.ok", { file: shown, age });
    if (isTracked(root, session.file)) add("sessionGit", "fail", "project", "cli.doctor.session.tracked", { file: shown });
  }

  // Theme contrasts (the default palette passes; a project's colours may not).
  const results = checkContrasts(config.theme);
  const failing = results.filter((r) => !r.ok);
  if (!failing.length) add("contrast", "ok", "project", "cli.doctor.contrast.ok", { n: results.length });
  else {
    const list = failing
      .slice(0, 6)
      .map((r) => ctx.t("cli.doctor.contrast.pair", { mode: r.mode, text: r.text, background: r.background, ratio: r.ratio, threshold: r.threshold }))
      .join(" · ");
    add("contrast", "warn", "project", "cli.doctor.contrast.fail", { n: failing.length, list: list + (failing.length > 6 ? " …" : "") });
  }

  // Application reachable.
  if (network) {
    if (!config.app.url) add("network", "warn", "project", "cli.doctor.network.noUrl", {});
    else {
      try {
        const res = await fetch(config.app.url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
        add("network", "ok", "env", "cli.doctor.network.ok", { url: config.app.url, status: res.status });
      } catch (e) {
        add("network", "fail", "env", "cli.doctor.network.fail", { url: config.app.url, error: e.cause?.code || e.name || e.message, prefix: config.env.prefix });
      }
    }
  }
}

export async function run({ ctx, values }) {
  const r = await diagnose(ctx, { network: !!values.network });
  if (ctx.json) {
    ctx.print(JSON.stringify(r, null, 2));
    return r.code;
  }
  const p = ctx.paint;
  const paint = { ok: p.ok, warn: p.warn, fail: p.fail };
  ctx.print(p.bold(ctx.t("cli.doctor.title", { name: BRAND.name, version: BRAND.version, folder: r.project || path.resolve(ctx.globals.project || ".") })) + "\n");
  for (const c of r.checks) {
    ctx.print(`${paint[c.status](SYMBOLS[c.status])} ${c.text}`);
    for (const d of c.details || []) ctx.print(`    ${p.dim(d)}`);
    if (c.help) ctx.print(`  → ${c.help}`);
  }
  const n = (s) => r.checks.filter((c) => c.status === s).length;
  ctx.print(`\n${ctx.t(r.code ? "cli.doctor.summary.fail" : "cli.doctor.summary.ok", { ok: n("ok"), warnings: n("warn"), problems: n("fail") })}`);
  return r.code;
}
