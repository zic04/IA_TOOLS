// upgrade [--apply]
// Brings a project to the installed kit version:
//   1. shows the CHANGELOG.md entries of the kit between the project's `kit` range and the installed version;
//   2. runs the migrations of engine/migrations/ (engine/migrations/runner.mjs) in dry run and shows the diff;
//   3. with --apply, writes the changes and sets `kit` to ^<installed version> in doc.config.mjs.
// Works on a project whose range no longer accepts the kit (that is precisely when it is needed).
import fs from "node:fs";
import path from "node:path";
import { EXIT } from "../../engine/project/errors.mjs";
import { findProject, KIT_ROOT, CONFIG_FILE } from "../../engine/project/find.mjs";
import { satisfies, isValidRange } from "../../engine/project/semver.mjs";
import { LANGUAGES } from "../../engine/i18n.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { importConfig } from "../../engine/dev/environment.mjs";
import { pendingMigrations, runMigrations, createVirtualFiles, unifiedDiff, setKitRange, compareVersions, rangeBase } from "../../engine/migrations/runner.mjs";

export const options = {
  apply: { type: "boolean" },
};

/** Entries of a changelog ("## [1.2.0] - 2026-10-01" or "## 1.2.0"): [{ version, heading, body }], or null. */
export function readChangelog(kitRoot = KIT_ROOT) {
  const file = path.join(kitRoot, "CHANGELOG.md");
  if (!fs.existsSync(file)) return null;
  const entries = [];
  let current = null;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?(.*)$/.exec(line);
    if (m) {
      current = { version: m[1], heading: line.replace(/^##\s+/, "").trim(), body: [] };
      entries.push(current);
    } else if (/^##\s/.test(line)) current = null;
    else if (current) current.body.push(line);
  }
  return entries.map((e) => ({ ...e, body: e.body.join("\n").trim() }));
}

/** Changelog entries newer than the range's base and not newer than the kit, newest first. */
export function changesBetween(entries, range, kitVersion) {
  const base = rangeBase(range);
  return entries
    .filter((e) => (!base || compareVersions(e.version, base) > 0) && compareVersions(e.version, kitVersion) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Plans (and with apply, performs) the upgrade of a project.
 * @returns {Promise<{ range, kit, compatible, changelog, migrations, diffs, newRange, applied, error? }>}
 */
export async function planUpgrade({ root, configFile, raw, apply = false, kitVersion = BRAND.version, migrationsFolder, kitRoot = KIT_ROOT }) {
  const range = raw && typeof raw.kit === "string" ? raw.kit : "*";
  const compatible = isValidRange(range) && satisfies(kitVersion, range);
  const entries = readChangelog(kitRoot);
  const changelog = entries ? changesBetween(entries, range, kitVersion) : null;
  const files = createVirtualFiles(root);
  const migrations = pendingMigrations(range, kitVersion, migrationsFolder);
  const done = await runMigrations(migrations, { files, config: raw, root });
  const failed = done.find((d) => d.error);
  const newRange = `^${kitVersion}`;
  const configRel = path.relative(root, configFile).split(path.sep).join("/");
  if (!failed && range !== newRange) {
    const next = setKitRange(files.read(configRel), newRange);
    if (next !== null) files.write(configRel, next);
  }
  const diffs = files.changes().map((c) => ({ file: c.file, diff: unifiedDiff(c.file, c.before, c.after) }));
  let applied = false;
  if (apply && !failed) {
    files.apply();
    applied = true;
  }
  return { range, kit: kitVersion, compatible, changelog, migrations: done, diffs, newRange, applied, error: failed || null };
}

export async function run({ ctx, values }) {
  const { root, configFile } = findProject({ project: ctx.globals.project });
  const raw = await importConfig(configFile);
  if (!ctx.globals.lang && LANGUAGES.includes(raw?.language)) ctx.setLanguage(raw.language);
  const r = await planUpgrade({ root, configFile, raw, apply: !!values.apply });
  if (ctx.json) {
    ctx.print(JSON.stringify(r, null, 2));
    return r.error ? EXIT.CHECK : EXIT.OK;
  }
  const p = ctx.paint;
  ctx.print(p.bold(ctx.t("cli.upgrade.title", { range: r.range, kit: r.kit, file: CONFIG_FILE })));
  ctx.print(r.compatible ? `${p.ok("✔")} ${ctx.t("cli.upgrade.compatible")}` : `${p.warn("⚠")} ${ctx.t("cli.upgrade.incompatible", { range: r.range, kit: r.kit })}`);

  ctx.print(`\n${p.bold(ctx.t("cli.upgrade.changelog"))}`);
  if (r.changelog === null) ctx.print(`${p.warn("⚠")} ${ctx.t("cli.upgrade.noChangelog", { folder: KIT_ROOT })}`);
  else if (!r.changelog.length) ctx.print(`  ${ctx.t("cli.upgrade.noChanges")}`);
  else for (const e of r.changelog) ctx.print(`  ${p.bold(e.heading)}\n${e.body.split("\n").map((l) => "    " + l).join("\n")}`);

  ctx.print(`\n${p.bold(ctx.t("cli.upgrade.migrations"))}`);
  if (!r.migrations.length) ctx.print(`  ${ctx.t("cli.upgrade.noMigration")}`);
  for (const m of r.migrations) {
    const title = ctx.i18n.has(`cli.migration.${m.version}`) ? ctx.t(`cli.migration.${m.version}`) : "";
    if (m.error) ctx.error("upgrade.migrationFailed", { version: m.version, error: m.error });
    else ctx.print(`  ${p.ok("✔")} ${m.version}${title ? ` — ${title}` : ""}`);
  }

  if (r.diffs.length) {
    ctx.print(`\n${p.bold(ctx.t("cli.upgrade.diff", { n: r.diffs.length }))}`);
    for (const d of r.diffs)
      ctx.print(
        d.diff
          .split("\n")
          .map((l) => (l.startsWith("+") && !l.startsWith("+++") ? p.ok(l) : l.startsWith("-") && !l.startsWith("---") ? p.fail(l) : l.startsWith("@@") ? p.cmd(l) : l))
          .join("\n")
      );
  }
  if (r.error) return EXIT.CHECK;
  if (!r.diffs.length) ctx.print(`\n${p.ok("✔")} ${ctx.t("cli.upgrade.upToDate", { range: r.range })}`);
  else if (r.applied) ctx.print(`\n${p.ok("✔")} ${ctx.t("cli.upgrade.applied", { n: r.diffs.length, range: r.newRange })}`);
  else ctx.print(`\n${ctx.t("cli.upgrade.dryRun", { command: BRAND.command })}`);
  return EXIT.OK;
}
