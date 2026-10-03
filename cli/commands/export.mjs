// export <target> [--with-dist] [--zip]
// Self-contained copy of the documentation project, rebuildable without the kit's repository:
//   - the project's files (without node_modules/, .doc-kit/ — session! —, .git/ at any depth, dist/ unless --with-dist,
//     .env files, keys and credentials, any browser session file, package-lock.json); --with-dist also takes the exports per space, wherever they are written;
//   - the engine vendored in vendor/doc-kit/ (engine, cli, adapters, i18n, schemas, templates, standard; no tests,
//     examples, skill, docs, ci), and package.json pointing to it ("file:./vendor/doc-kit");
//   - EXPORT.json (kit version, date, source) and a "standalone copy" section in README.md;
//   - the current documented version frozen as version.fallback (the version file usually stays behind);
//   - a warning for each configuration path that points outside the project (it will be missing in the copy).
// --zip also writes <target>.zip. The target must be missing or empty (exit code 1 otherwise).
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { KIT_ROOT, CONFIG_FILE } from "../../engine/project/find.mjs";
import { readProjectVersion } from "../../engine/project/version.mjs";
import { declaredSpaceIds, spaceOutput } from "../../engine/build/spaces.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { loadProjectFriendly, git, slash, kitPackage } from "../../engine/dev/environment.mjs";
import { zipFolder } from "../../engine/dev/zip.mjs";
import { sessionFile } from "../../engine/capture/session.mjs";
import { isStorageState } from "../../engine/check/secrets.mjs";
import { shownPath } from "../common.mjs";
import { closingBrace } from "../../engine/util/js-scan.mjs";

export { closingBrace };

export const options = {
  "with-dist": { type: "boolean" },
  zip: { type: "boolean" },
};

export const VENDOR = "vendor/doc-kit";
/** What the vendored engine contains (ARCHITECTURE.md §0: no tests, examples, skill, docs, ci). */
const VENDORED_FOLDERS = ["engine", "cli", "adapters", "i18n", "schemas", "templates", "standard"];
const VENDORED_FILES = ["package.json", "LICENSE", "README.md", "README.fr.md", "CHANGELOG.md", "ARCHITECTURE.md"];
const SKIPPED_FOLDERS = new Set(["node_modules", ".doc-kit", ".git"]);
/** Files never exported, at any depth: environment files, keys and certificates, credentials of tools. */
const SECRET_FILE =
  /^(\.env(\..*)?|\.envrc|\.npmrc|\.pypirc|\.netrc|\.git-credentials|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|jks|keystore|kdbx))$/i;

/** Text of a small file (a browser session is a few hundred kilobytes at most); "" when it is larger or unreadable. */
function readSmall(file) {
  try {
    return fs.statSync(file).size <= 2 * 1024 * 1024 ? fs.readFileSync(file, "utf8") : "";
  } catch {
    return "";
  }
}
const README_START = "<!-- doc-kit:export -->";
const README_END = "<!-- /doc-kit:export -->";

/**
 * Sets version.fallback in the source of doc.config.mjs (text change, comments kept).
 * @returns {string|null} the new source, or null when the configuration object cannot be found
 */
export function freezeFallback(source, version) {
  const literal = JSON.stringify(version);
  const key = /(^|[\s,{])version\s*:\s*\{/m.exec(source);
  if (key) {
    const open = key.index + key[0].length - 1;
    const close = closingBrace(source, open);
    if (close < 0) return null;
    const body = source.slice(open + 1, close);
    const fallback = /(\bfallback\s*:\s*)(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|[\w.]+)/;
    const next = fallback.test(body) ? body.replace(fallback, (m, a) => a + literal) : ` fallback: ${literal},${body}`;
    return source.slice(0, open + 1) + next + source.slice(close);
  }
  const object = /export\s+default\s+(?:defineConfig\s*\(\s*)?\{/.exec(source);
  if (!object) return null;
  const at = object.index + object[0].length;
  return `${source.slice(0, at)}\n  version: { fallback: ${literal} },${source.slice(at)}`;
}

/** Configuration paths that point outside the project: [{ key, path }]. */
function outsidePaths(root, config) {
  const out = [];
  const check = (key, value) => {
    if (typeof value !== "string" || !value || /^https?:/.test(value)) return;
    const rel = path.relative(root, path.resolve(root, value));
    if (rel.startsWith("..") || path.isAbsolute(rel)) out.push({ key, path: value });
  };
  for (const k of ["content", "images", "diagrams"]) check(`paths.${k}`, config.paths[k]);
  check("version.file", config.version.file);
  check("capture.plans", config.capture.plans);
  check("capture.setup", config.capture.setup);
  check("theme.logo", config.theme.logo);
  config.masking.env.forEach((f, i) => check(`masking.env[${i}]`, f));
  const walk = (value, key) => {
    if (typeof value === "string") {
      if (/[\\/]/.test(value)) check(key, value);
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${key}[${i}]`));
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) if (k !== "adapter") walk(v, `${key}.${k}`);
  };
  config.coverage.forEach((entry, i) => walk(entry, `coverage[${i}]`));
  return out;
}

/** Copies a folder's files, filtered; returns the copied files (relative, forward slashes). */
function copyTree(from, to, keep) {
  const copied = [];
  const visit = (rel) => {
    for (const d of fs.readdirSync(path.join(from, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, d.name) : d.name;
      if (!keep(r, d)) continue;
      if (d.isDirectory()) visit(r);
      else if (d.isFile()) {
        fs.mkdirSync(path.dirname(path.join(to, r)), { recursive: true });
        fs.copyFileSync(path.join(from, r), path.join(to, r));
        copied.push(slash(r));
      }
    }
  };
  visit("");
  return copied;
}

/**
 * Exports the project.
 * @returns {{ target, files: number, vendored: number, skipped: string[], warnings: object[], version, zip?: object }}
 */
export function exportProject({
  project,
  config,
  target,
  withDist = false,
  zip = false,
  now = new Date(),
  env = process.env,
}) {
  const root = project.root;
  if (path.resolve(target) === path.resolve(root)) throw new KitError(EXIT.USAGE, "export.self", { folder: target });
  if (fs.existsSync(target) && (!fs.statSync(target).isDirectory() || fs.readdirSync(target).length))
    throw new KitError(EXIT.CHECK, "export.notEmpty", { folder: target });
  /** @type {Array<{ key: string, vars: object }>} */
  const warnings = outsidePaths(root, config).map((w) => ({
    key: w.key.startsWith("coverage")
      ? "export.outside.coverage"
      : w.key === "version.file"
        ? "export.outside.version"
        : "export.outside.other",
    vars: { key: w.key, path: w.path },
  }));
  const version = readProjectVersion(root, config.version);
  const output = path.resolve(root, config.output);
  if (withDist && !fs.existsSync(output))
    warnings.push({ key: "export.noDist", vars: { file: slash(path.relative(root, output)), command: BRAND.command } });

  // 1. The project's own files.
  const targetAbs = path.resolve(target);
  const skipped = [];
  fs.mkdirSync(targetAbs, { recursive: true });
  // The session file (SECURITY.md: a secret) is never copied, wherever <PREFIX>_SESSION puts it.
  const session = sessionFile(root, config, env);
  const files = copyTree(root, targetAbs, (rel, d) => {
    if (path.join(root, rel) === targetAbs) return false; // a target inside the project is not copied into itself
    if (d.isDirectory()) {
      if (SKIPPED_FOLDERS.has(d.name)) return false;
      if (!withDist && rel === "dist") return false;
      return true;
    }
    if (d.name === "package-lock.json" || d.name.endsWith(".log")) {
      skipped.push(slash(rel));
      return false;
    }
    if (
      SECRET_FILE.test(d.name) ||
      path.join(root, rel) === session ||
      (d.name.endsWith(".json") && isStorageState(readSmall(path.join(root, rel))))
    ) {
      skipped.push(slash(rel));
      return false;
    }
    return true;
  });
  // An output outside dist/ (custom `output`, or `spaces.output` for the exports per space, ARCHITECTURE.md §6.1a)
  // is included with --with-dist too.
  const outputs = [
    output,
    ...(declaredSpaceIds(root, config) || []).map((space) => spaceOutput(root, config, space, output)),
  ];
  for (const file of withDist ? outputs.filter((f) => fs.existsSync(f)) : []) {
    const rel = path.relative(root, file);
    const dest =
      rel.startsWith("..") || path.isAbsolute(rel)
        ? path.join(targetAbs, "dist", path.basename(file))
        : path.join(targetAbs, rel);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
      files.push(slash(path.relative(targetAbs, dest)));
    }
  }

  // 2. The vendored engine.
  const vendor = path.join(targetAbs, ...VENDOR.split("/"));
  let vendored = 0;
  for (const folder of VENDORED_FOLDERS) {
    const src = path.join(KIT_ROOT, folder);
    if (!fs.existsSync(src)) continue;
    vendored += copyTree(
      src,
      path.join(vendor, folder),
      (rel, d) => d.name !== "node_modules" && d.name !== ".DS_Store",
    ).length;
  }
  for (const f of VENDORED_FILES) {
    const src = path.join(KIT_ROOT, f);
    if (!fs.existsSync(src)) continue;
    if (f === "package.json") {
      const pkg = kitPackage();
      delete pkg.scripts;
      delete pkg.devDependencies;
      fs.writeFileSync(path.join(vendor, f), JSON.stringify(pkg, null, 2) + "\n");
    } else fs.copyFileSync(src, path.join(vendor, f));
    vendored++;
  }

  // 3. package.json → the vendored engine.
  const pkgFile = path.join(targetAbs, "package.json");
  const pkg = fs.existsSync(pkgFile)
    ? JSON.parse(fs.readFileSync(pkgFile, "utf8"))
    : { name: `${config.product.slug}-documentation`, version: "1.0.0", private: true, type: "module" };
  if (pkg.devDependencies?.[BRAND.packageName]) delete pkg.devDependencies[BRAND.packageName];
  pkg.dependencies = { ...(pkg.dependencies || {}), [BRAND.packageName]: `file:./${VENDOR}` };
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");

  // 4. The documented version, frozen.
  const configFile = path.join(targetAbs, CONFIG_FILE);
  const frozen = freezeFallback(fs.readFileSync(configFile, "utf8"), version);
  if (frozen === null) warnings.push({ key: "export.fallbackNotFrozen", vars: { version } });
  else fs.writeFileSync(configFile, frozen);

  // 5. EXPORT.json and the README section, in the project's language.
  const commit = git(root, ["rev-parse", "HEAD"]);
  const info = {
    kit: { name: BRAND.packageName, version: BRAND.version },
    date: now.toISOString(),
    source: {
      product: config.product.name,
      path: slash(root),
      version,
      commit: commit?.status === 0 ? commit.stdout : null,
    },
    withDist,
  };
  fs.writeFileSync(path.join(targetAbs, "EXPORT.json"), JSON.stringify(info, null, 2) + "\n");
  const i18n = createI18n({ language: config.language, vars: { command: BRAND.command } });
  const section = `${README_START}\n${i18n.t("cli.export.readme", { kit: BRAND.version, date: now.toISOString().slice(0, 10), vendor: VENDOR, version })}\n${README_END}\n`;
  const readme = path.join(targetAbs, "README.md");
  const current = fs.existsSync(readme) ? fs.readFileSync(readme, "utf8") : `# ${config.product.name}\n`;
  const start = current.indexOf(README_START);
  const end = current.indexOf(README_END);
  const next =
    start >= 0 && end > start
      ? current.slice(0, start) + section + current.slice(end + README_END.length + 1)
      : `${current.replace(/\s*$/, "")}\n\n${section}`;
  fs.writeFileSync(readme, next);
  for (const f of ["EXPORT.json", "README.md", "package.json"]) if (!files.includes(f)) files.push(f);

  const result = { target: targetAbs, files: files.length, vendored, skipped, warnings, version };
  if (zip) result.zip = zipFolder(targetAbs, `${targetAbs}.zip`);
  return result;
}

export async function run({ ctx, values, positionals }) {
  if (!positionals[0]) throw new KitError(EXIT.USAGE, "export.noTarget", { command: BRAND.command });
  const { project, config } = await loadProjectFriendly(ctx);
  const target = path.resolve(process.cwd(), positionals[0]);
  const r = exportProject({
    project,
    config,
    target,
    withDist: !!values["with-dist"],
    zip: !!values.zip,
    env: ctx.env,
  });
  if (ctx.json) {
    ctx.print(JSON.stringify(r, null, 2));
    return EXIT.OK;
  }
  const p = ctx.paint;
  for (const w of r.warnings) {
    ctx.printErr(`${ctx.paintErr.warn("⚠")} ${ctx.t(`cli.${w.key}`, w.vars)}`);
    if (ctx.i18n.has(`cli.${w.key}.help`)) ctx.printErr(`  → ${ctx.t(`cli.${w.key}.help`, w.vars)}`);
  }
  if (r.skipped.length) ctx.print(`${p.dim("·")} ${ctx.t("cli.export.skipped", { list: r.skipped.join(", ") })}`);
  ctx.print(
    `${p.ok("✔")} ${ctx.t("cli.export.done", { folder: shownPath(r.target), files: r.files, vendored: r.vendored, kit: BRAND.version, version: r.version })}`,
  );
  if (r.zip)
    ctx.print(
      `${p.ok("✔")} ${ctx.t("cli.export.zip", { file: shownPath(r.zip.file), mb: (r.zip.bytes / 1024 / 1024).toFixed(1) })}`,
    );
  ctx.print(`\n${p.bold(ctx.t("cli.export.next"))}`);
  for (const c of [`cd ${shownPath(r.target)}`, "npm install", "npm run site"]) ctx.print(`  ${p.cmd(c)}`);
  return EXIT.OK;
}
