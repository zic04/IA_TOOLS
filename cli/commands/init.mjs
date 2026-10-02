// init [app-dir] [--dir docs/manual] [--name] [--lang en|fr] [--url] [--framework next|react-router|none] [--auth]
//      [--capture app|none] [--yes]
// Creates the documentation project of an application (ARCHITECTURE.md §2.1): <app-dir>/docs/manual/ by default.
// <app-dir> is the application root; its front end may sit in a sub-folder (frontend/, web/…).
//   - detects the framework (package.json: next → next-app-router, with app/ or src/app/; react-router →
//     react-router), a Python back end (pyproject.toml, requirements.txt), the port of the dev script, the product
//     name (Next.js metadata.title, then package.json without its -frontend/-web… suffix), the version file
//     (version.txt or VERSION at the root, then the root package.json, then the front end's), the .env files;
//   - asks the name, the language, the application URL, the capture mode and the sign-in method
//     (--yes: the detected values and the options, no question);
//   - prints the recap of what it is about to write, with or without --yes, then confirms (without --yes);
//   - writes templates/project/common + templates/project/<language>, variables filled, the capture variant of
//     every .md file, and the example capture plan only in capture mode "app";
//   - refuses a non-empty folder (exit code 1); prints the next commands.
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { KIT_ROOT } from "../../engine/project/find.mjs";
import { productSlug } from "../../engine/project/defaults.mjs";
import { satisfies } from "../../engine/project/semver.mjs";
import { captureVariant, CAPTURE_MODES } from "../../engine/build/page-templates.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { slash } from "../../engine/dev/environment.mjs";
import { prompterOf, shownPath, absolutePath } from "../common.mjs";

export const options = {
  dir: { type: "string" },
  name: { type: "string" },
  url: { type: "string" },
  framework: { type: "string" },
  auth: { type: "string" },
  capture: { type: "string" },
  yes: { type: "boolean", short: "y" },
};

export const DEFAULT_DIR = "docs/manual";
export const FRAMEWORKS = ["next", "react-router", "none"];
export const AUTH_ADAPTERS = ["manual", "none", "nextauth"];
const SUBFOLDERS = ["frontend", "front", "web", "client", "ui", "app", "apps/web"];
const BACKENDS = ["", "backend", "back", "api", "server"];
const GENERIC_NAMES = /^(app|web|client|frontend|front|ui|site|www|my-app|project|monorepo|root)$/i;
/** Suffix of a front-end package name ("acme-orders-frontend" → "acme-orders"). */
const FRONT_SUFFIX = /[-_.](?:frontend|front|web|ui|client|app)$/i;
const ROUTER_FILES = ["src/App.tsx", "src/App.jsx", "src/App.ts", "src/App.js", "src/router.tsx", "src/routes.tsx", "src/main.tsx", "src/main.jsx", "app/routes.ts"];
const LAYOUT_FILES = ["app", "src/app"].flatMap((d) => ["tsx", "jsx", "ts", "js", "mjs"].map((x) => `${d}/layout.${x}`));
/** Files of the application root that hold only its version ("1.0.152"). */
export const VERSION_FILES = ["version.txt", "VERSION"];
/** Pattern of a version file: the first version-like word ("v1.2.3", "1.0.152"). */
export const VERSION_TEXT_PATTERN = "^\\s*v?(\\d[\\w.+-]*)";
const PACKAGE_PATTERN = '"version"\\s*:\\s*"([^"]+)"';
const PYPROJECT_PATTERN = '(?:^|\\n)version\\s*=\\s*"([^"]+)"';
/** Local environment files whose values are masked (never the *.example ones). */
const ENV_FILES = [".env", ".env.local"];

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};
const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();
const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

/** "acme-orders" → "Acme Orders"; "@acme/orders-web" → "Orders Web". */
export function humanize(name) {
  return String(name)
    .replace(/^@[^/]+\//, "")
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** A package name without its scope nor its front-end suffix: "@acme/orders-frontend" → "orders". */
export function productBase(name) {
  return String(name ?? "")
    .replace(/^@[^/]+\//, "")
    .replace(FRONT_SUFFIX, "");
}

/** Port of a dev script: -p 3001, --port 3001, --port=3001, PORT=3001. */
export function scriptPort(script) {
  const m = /(?:^|\s)(?:-p|--port)[\s=]+(\d{2,5})\b/.exec(script || "") || /\bPORT=(\d{2,5})\b/.exec(script || "");
  return m ? Number(m[1]) : null;
}

/** Depth of braces at each index of a JavaScript source, strings and comments skipped (rough, enough for an object literal). */
function braceDepths(source) {
  const depth = new Int32Array(source.length + 1);
  let d = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    depth[i] = d;
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < source.length && source[i] !== c; i++) {
        depth[i] = d;
        if (source[i] === "\\") depth[++i] = d;
      }
      depth[i] = d;
    } else if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") depth[i++] = d;
    } else if (c === "{") d++;
    else if (c === "}") d--;
  }
  depth[source.length] = d;
  return depth;
}

const unquote = (s) => s.replace(/\\(.)/g, "$1").trim();

/**
 * Title of the `metadata` exported by a Next.js layout: `title: "…"` or `title: { default: "…" }`, at the first
 * level of the object. A template literal with `${…}` is not a title. Null when there is none.
 */
export function metadataTitle(source) {
  const text = String(source ?? "");
  const start = /\bexport\s+const\s+metadata\b[^=]*=\s*\{/.exec(text);
  if (!start) return null;
  const open = start.index + start[0].length - 1;
  const depths = braceDepths(text);
  const base = depths[open] + 1;
  let close = open + 1;
  while (close < text.length && depths[close] >= base) close++;
  const key = /\btitle\s*:\s*/g;
  key.lastIndex = open;
  for (let m = key.exec(text); m && m.index < close; m = key.exec(text)) {
    if (depths[m.index] !== base) continue; // openGraph.title, twitter.title…
    const at = m.index + m[0].length;
    const literal = /^(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/.exec(text.slice(at));
    if (literal) return literal[1] === "`" && literal[2].includes("${") ? null : unquote(literal[2]) || null;
    if (text[at] === "{") {
      const end = text.indexOf("}", at);
      const def = /\bdefault\s*:\s*(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/.exec(text.slice(at, end < 0 ? undefined : end));
      return def && !(def[1] === "`" && def[2].includes("${")) ? unquote(def[2]) || null : null;
    }
    return null;
  }
  return null;
}

/**
 * Product name of the application, and where it was found: the Next.js root layout's `metadata.title`, then the
 * front end's package.json (productName, displayName, name: without scope or -frontend/-web… suffix), the root
 * package.json, then the folder name.
 * @returns {{ name: string, source: { kind: "layout"|"package"|"folder", file?: string, field?: string } }}
 */
export function detectName(appDir, packageDir) {
  const rel = (p) => slash(path.relative(appDir, p)) || ".";
  if (packageDir)
    for (const f of LAYOUT_FILES) {
      const file = path.join(packageDir, f);
      if (!isFile(file)) continue;
      const title = metadataTitle(fs.readFileSync(file, "utf8"));
      if (title) return { name: title, source: { kind: "layout", file: rel(file) } };
    }
  const dirs = [...new Set([packageDir, appDir].filter(Boolean))];
  for (const dir of dirs) {
    const pkg = readJson(path.join(dir, "package.json"));
    for (const field of ["productName", "displayName", "name"]) {
      const raw = typeof pkg?.[field] === "string" ? pkg[field].trim() : "";
      const base = productBase(raw);
      if (raw && base && !GENERIC_NAMES.test(base)) {
        const name = field === "name" ? humanize(base) : raw;
        return { name, source: { kind: "package", file: rel(path.join(dir, "package.json")), field } };
      }
    }
  }
  return { name: humanize(productBase(path.basename(path.resolve(appDir)))) || "My App", source: { kind: "folder" } };
}

/**
 * Version file of the application: version.txt or VERSION at its root, then the root package.json when it has
 * a version, then the front end's package.json, then the pyproject.toml of a Python-only application.
 * @returns {{ file: string, pattern: string, value: string|null }}  file relative to appDir (forward slashes)
 */
export function detectVersion(appDir, packageDir, python) {
  const rel = (p) => slash(path.relative(appDir, p)) || ".";
  const read = (file, pattern) => {
    try {
      return new RegExp(pattern).exec(fs.readFileSync(file, "utf8"))?.[1] ?? null;
    } catch {
      return null;
    }
  };
  for (const f of VERSION_FILES) {
    const file = path.join(appDir, f);
    if (isFile(file)) return { file: f, pattern: VERSION_TEXT_PATTERN, value: read(file, VERSION_TEXT_PATTERN) };
  }
  for (const dir of [...new Set([appDir, packageDir].filter(Boolean))]) {
    const file = path.join(dir, "package.json");
    const value = typeof readJson(file)?.version === "string" ? readJson(file).version : null;
    if (value) return { file: rel(file), pattern: PACKAGE_PATTERN, value };
  }
  if (!packageDir && python?.endsWith("pyproject.toml")) return { file: python, pattern: PYPROJECT_PATTERN, value: read(path.join(appDir, python), PYPROJECT_PATTERN) };
  return { file: rel(path.join(packageDir || appDir, "package.json")), pattern: PACKAGE_PATTERN, value: null };
}

/** The application's local .env files (.env, .env.local) at its root and in its front-end folder, relative to appDir. */
export function detectEnvFiles(appDir, packageDir) {
  return [...new Set([appDir, packageDir].filter(Boolean))].flatMap((dir) => ENV_FILES.map((f) => path.join(dir, f)).filter(isFile)).map((f) => slash(path.relative(appDir, f)));
}

/**
 * What can be read from the application folder, without running anything.
 * @returns {{ appDir, packageDir: string|null, name: string, nameSource: object, framework: "next-app-router"|"react-router"|null,
 *   frameworkLabel: string|null, appPath: string|null, url: string, port: number, portSource: string|null,
 *   nextAuth: boolean, python: string|null, version: { file, pattern, value }, envFiles: string[] }}
 */
export function detectApp(appDir) {
  const candidates = ["", ...SUBFOLDERS].map((d) => path.join(appDir, d)).filter((d) => fs.existsSync(path.join(d, "package.json")));
  const deps = (pkg) => ({ ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}), ...(pkg?.peerDependencies || {}) });
  const isWeb = (d) => {
    const x = deps(readJson(path.join(d, "package.json")));
    return "next" in x || "react-router" in x || "react-router-dom" in x || "@react-router/dev" in x || "vite" in x;
  };
  const packageDir = candidates.find(isWeb) || candidates[0] || null;
  const pkg = packageDir ? readJson(path.join(packageDir, "package.json")) : null;
  const d = deps(pkg);
  const r = { appDir, packageDir, framework: null, frameworkLabel: null, appPath: null, port: 3000, portSource: null, nextAuth: false, python: null };

  if ("next" in d) {
    const appFolder = ["app", "src/app"].find((x) => isDir(path.join(packageDir, x)));
    if (appFolder) Object.assign(r, { framework: "next-app-router", frameworkLabel: "Next.js (App Router)", appPath: appFolder });
    else r.frameworkLabel = isDir(path.join(packageDir, "pages")) || isDir(path.join(packageDir, "src/pages")) ? "Next.js (Pages Router)" : "Next.js";
    r.nextAuth = "next-auth" in d || "@auth/nextjs" in d;
  } else if ("react-router" in d || "react-router-dom" in d || "@react-router/dev" in d) {
    const file = ROUTER_FILES.find((x) => fs.existsSync(path.join(packageDir, x)));
    Object.assign(r, { framework: "react-router", frameworkLabel: "vite" in d ? "React Router (Vite)" : "React Router", appPath: file || null });
  } else if ("vite" in d) r.frameworkLabel = "Vite";

  // Port: the dev script, then the framework's default.
  const scripts = pkg?.scripts || {};
  for (const name of ["dev", "start", "serve"]) {
    const port = scriptPort(scripts[name]);
    if (port) {
      Object.assign(r, { port, portSource: name });
      break;
    }
  }
  if (!r.portSource) {
    if ("vite" in d && !("next" in d)) {
      r.port = 5173;
      for (const f of ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"]) {
        const m = fs.existsSync(path.join(packageDir, f)) && /\bport\s*:\s*(\d{2,5})/.exec(fs.readFileSync(path.join(packageDir, f), "utf8"));
        if (m) {
          Object.assign(r, { port: Number(m[1]), portSource: f });
          break;
        }
      }
    }
  }
  for (const b of BACKENDS) {
    const f = ["pyproject.toml", "requirements.txt"].find((x) => fs.existsSync(path.join(appDir, b, x)));
    if (f) {
      r.python = slash(path.join(b, f));
      break;
    }
  }
  if (!packageDir && r.python) r.port = 8000;
  r.url = `http://localhost:${r.port}`;

  const n = detectName(appDir, packageDir);
  r.name = n.name;
  r.nameSource = n.source;
  r.version = detectVersion(appDir, packageDir, r.python);
  r.envFiles = detectEnvFiles(appDir, packageDir);
  return r;
}

/** Relative path between two folders, with forward slashes ("." when equal); absolute across drives. */
export function relativeSlash(from, to) {
  const rel = path.relative(from, to);
  if (path.isAbsolute(rel)) return slash(to);
  return slash(rel) || ".";
}

/** Option of each coverage adapter that receives the routes source (adapters/coverage/<name>.mjs). */
export const COVERAGE_OPTION = { "next-app-router": "app", "react-router": "file" };

/** JavaScript literal of the coverage array, paths relative to the documentation folder. */
export function coverageLiteral(framework, appPathFromDocs) {
  if (!framework || !appPathFromDocs) return "[]";
  return `[{ adapter: ${JSON.stringify(framework)}, ${COVERAGE_OPTION[framework] || "app"}: ${JSON.stringify(appPathFromDocs)} }]`;
}

/** JavaScript literal of an array of strings, on one line: ["a", "b"]. */
const arrayLiteral = (list) => `[${list.map((x) => JSON.stringify(x)).join(", ")}]`;

/** Escapes a value for the file it goes into (JSON and JS strings: double-quoted escaping). */
function escapeFor(file, value) {
  return /\.(json|mjs|js)$/.test(file) ? JSON.stringify(String(value)).slice(1, -1) : String(value);
}

/** Files of the skeleton written only in capture mode "app". */
const CAPTURE_ONLY = new Set(["captures/plans/example.mjs"]);

/** The skeleton's package.json without the scripts that capture (capture mode "none": `capture` refuses to run). */
function withoutCaptureScripts(text) {
  const pkg = JSON.parse(text);
  const scripts = pkg.scripts || {};
  for (const [name, script] of Object.entries(scripts)) {
    const kept = String(script)
      .split("&&")
      .map((s) => s.trim())
      .filter((s) => !/\bcapture\b/.test(s));
    if (kept.length) scripts[name] = kept.join(" && ");
    else delete scripts[name];
  }
  return JSON.stringify(pkg, null, 2) + "\n";
}

/**
 * Writes the project skeleton into `target` (must be missing or empty).
 * @param {{ target: string, language: "en"|"fr", vars: Record<string,string>, raw?: string[], mode?: "app"|"none" }} p
 *   raw: variables inserted as they are (JavaScript literals such as {{coverage}}); mode: capture mode (§6.4 variants)
 * @returns {string[]} written files, relative to target, with forward slashes, sorted
 */
export function scaffold({ target, language, vars, raw = ["coverage", "maskingEnv", "versionFile", "versionPattern"], kitVersion = BRAND.version, mode = "app" }) {
  if (fs.existsSync(target) && fs.readdirSync(target).length) throw new KitError(EXIT.CHECK, "init.notEmpty", { folder: target });
  const written = [];
  for (const layer of ["common", language]) {
    const base = path.join(KIT_ROOT, "templates", "project", layer);
    for (const rel of fs.readdirSync(base, { recursive: true }).map(String).sort()) {
      const src = path.join(base, rel);
      if (fs.statSync(src).isDirectory()) continue;
      if (mode !== "app" && CAPTURE_ONLY.has(slash(rel))) continue;
      const dest = path.join(target, rel);
      let text = fs.readFileSync(src, "utf8");
      if (/\.md$/i.test(rel)) text = captureVariant(text, mode);
      if (mode === "none" && slash(rel) === "package.json") text = withoutCaptureScripts(text);
      text = text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? (raw.includes(k) ? vars[k] : escapeFor(rel, vars[k])) : m));
      // The skeleton's kit range must accept this kit (otherwise every command would stop with exit code 3).
      text = text.replace(/^(\s*kit:\s*")([^"]*)(")/m, (m, a, range, b) => (satisfies(kitVersion, range) ? m : `${a}^${kitVersion}${b}`));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text);
      written.push(slash(rel));
    }
  }
  return [...new Set(written)].sort();
}

const URL_RE = /^https?:\/\/[^\s/]+/;

/** Lines of the recap (label, value), in the message language. */
function recapLines(ctx, { target, appDir, detected, answers, nameFromDetection, docsToRoot }) {
  const p = ctx.paint;
  const s = detected.nameSource;
  const nameSource = !nameFromDetection
    ? ctx.t(answers.nameFromOption ? "cli.init.source.option" : "cli.init.source.answer")
    : s.kind === "layout"
      ? ctx.t("cli.init.source.layout", { file: s.file })
      : s.kind === "package"
        ? ctx.t("cli.init.source.package", { field: s.field, file: s.file })
        : ctx.t("cli.init.source.folder");
  const v = detected.version;
  const coverage = detected.framework && detected.appPath ? `${detected.framework}: ${slash(path.relative(appDir, path.join(detected.packageDir || appDir, detected.appPath)))}` : ctx.t("cli.init.coverage.none");
  return [
    ["folder", absolutePath(target)],
    ["name", `${answers.name} ${p.dim(`(${nameSource})`)}`],
    ["slug", productSlug(answers.name)],
    ["language", `${answers.language} — ${ctx.t(`cli.init.language.${answers.language}`)}`],
    ["url", answers.url],
    ["version", v.value ? ctx.t("cli.init.version.read", { version: v.value, file: v.file }) : ctx.t("cli.init.version.unread", { file: v.file })],
    ["capture", ctx.t(`cli.init.capture.${answers.capture}`)],
    ["auth", answers.capture === "none" ? `${answers.auth} ${p.dim(`(${ctx.t("cli.init.authUnused")})`)}` : answers.auth],
    ["coverage", coverage],
    ["masking", detected.envFiles.length ? detected.envFiles.join(", ") : ctx.t("cli.init.masking.none")],
    ["appDir", `${absolutePath(appDir)} ${p.dim(`(app.dir: ${docsToRoot})`)}`],
  ].map(([k, value]) => [ctx.t(`cli.init.recap.${k}`), value]);
}

export async function run({ ctx, values, positionals }) {
  const appDir = path.resolve(process.cwd(), positionals[0] || ".");
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) throw new KitError(EXIT.USAGE, "init.appMissing", { folder: appDir });
  if (values.framework !== undefined && !FRAMEWORKS.includes(values.framework))
    throw new KitError(EXIT.USAGE, "option.value", { option: "framework", value: values.framework, expected: FRAMEWORKS.join(" | ") });
  if (values.auth !== undefined && !AUTH_ADAPTERS.includes(values.auth) && !/^(api-me|local:.+)$/.test(values.auth))
    throw new KitError(EXIT.USAGE, "option.value", { option: "auth", value: values.auth, expected: [...AUTH_ADAPTERS, "api-me", "local:<file>"].join(" | ") });
  if (values.url !== undefined && !URL_RE.test(values.url)) throw new KitError(EXIT.USAGE, "option.value", { option: "url", value: values.url, expected: "http(s)://host[:port]" });
  if (values.capture !== undefined && !CAPTURE_MODES.includes(values.capture))
    throw new KitError(EXIT.USAGE, "option.value", { option: "capture", value: values.capture, expected: CAPTURE_MODES.join(" | ") });
  if (!values.yes && !ctx.interactive) throw new KitError(EXIT.USAGE, "init.notInteractive");

  const detected = detectApp(appDir);
  if (values.framework === "none") Object.assign(detected, { framework: null, appPath: null });
  else if (values.framework === "next") Object.assign(detected, { framework: "next-app-router", appPath: detected.framework === "next-app-router" ? detected.appPath : "app" });
  else if (values.framework === "react-router")
    Object.assign(detected, { framework: "react-router", appPath: detected.framework === "react-router" && detected.appPath ? detected.appPath : "src/App.tsx" });
  const target = path.resolve(appDir, values.dir || DEFAULT_DIR);
  if (fs.existsSync(target) && fs.readdirSync(target).length) throw new KitError(EXIT.CHECK, "init.notEmpty", { folder: target });

  const envLang = String(ctx.env.LC_ALL || ctx.env.LC_MESSAGES || ctx.env.LANG || "");
  const answers = {
    name: values.name || detected.name,
    nameFromOption: !!values.name,
    language: ctx.globals.lang || (envLang.startsWith("fr") ? "fr" : "en"),
    url: (values.url || detected.url).replace(/\/+$/, ""),
    capture: values.capture || "app",
    auth: values.auth || "manual",
  };

  const docsToApp = relativeSlash(target, detected.packageDir || appDir);
  const docsToRoot = relativeSlash(target, appDir);
  const p = ctx.paint;
  const printRecap = () => {
    const lines = recapLines(ctx, { target, appDir, detected, answers, nameFromDetection: answers.name === detected.name && !answers.nameFromOption, docsToRoot });
    const width = Math.max(...lines.map(([l]) => l.length)) + 2;
    ctx.print(`${values.yes ? "" : "\n"}${p.bold(ctx.t("cli.init.summary"))}`);
    for (const [label, value] of lines) ctx.print(`  ${label.padEnd(width)}${value}`);
    ctx.print(p.dim(`  ${ctx.t("cli.init.rename")}`));
  };

  if (!ctx.json) {
    ctx.print(`${p.bold(ctx.t("cli.init.title", { name: BRAND.name }))}\n`);
    const labels = ["cli.init.application", "cli.init.detected", "cli.init.port"].map((k) => ctx.t(k));
    const pad = (label) => label.padEnd(Math.max(...labels.map((l) => l.length)) + 2);
    ctx.print(`  ${pad(labels[0])}${appDir}`);
    const found = [
      detected.frameworkLabel,
      detected.appPath ? ctx.t("cli.init.routesIn", { path: slash(path.relative(appDir, path.join(detected.packageDir || appDir, detected.appPath))) }) : null,
      detected.nextAuth ? "NextAuth" : null,
      detected.python ? ctx.t("cli.init.python", { file: detected.python }) : null,
    ].filter(Boolean);
    ctx.print(`  ${pad(labels[1])}${found.length ? found.join(" · ") : ctx.t("cli.init.nothingDetected")}`);
    if (detected.portSource) ctx.print(`  ${pad(labels[2])}${ctx.t("cli.init.portFrom", { port: detected.port, source: detected.portSource })}`);
    if (detected.python && !detected.framework) ctx.print(`  ${p.warn("⚠")} ${ctx.t("cli.init.pythonNote")}`);
    ctx.print("");
  }

  if (!values.yes) {
    const prompt = prompterOf(ctx);
    for (;;) {
      if (!values.name) {
        answers.name = await prompt.ask(ctx.t("cli.init.ask.name"), answers.name, (v) => (v.trim() ? null : "init.ask.nameEmpty"));
        answers.nameFromOption = false;
      }
      if (!ctx.globals.lang) {
        answers.language = await prompt.choose(
          ctx.t("cli.init.ask.language"),
          [
            { value: "en", label: ctx.t("cli.init.language.en") },
            { value: "fr", label: ctx.t("cli.init.language.fr") },
          ],
          answers.language
        );
        // The project's language is also the language of its CLI messages: the rest is asked in it.
        ctx.setLanguage(answers.language);
      }
      if (!values.url) answers.url = (await prompt.ask(ctx.t("cli.init.ask.url"), answers.url, (v) => (URL_RE.test(v) ? null : "init.ask.urlInvalid"))).replace(/\/+$/, "");
      if (!values.capture)
        answers.capture = await prompt.choose(
          ctx.t("cli.init.ask.capture"),
          CAPTURE_MODES.map((m) => ({ value: m, label: ctx.t(`cli.init.capture.ask.${m}`) })),
          answers.capture
        );
      // The sign-in method only matters to capture the application.
      if (!values.auth && answers.capture === "app") {
        const choices = [
          { value: "manual", label: ctx.t("cli.init.auth.manual") },
          { value: "none", label: ctx.t("cli.init.auth.none") },
        ];
        if (detected.nextAuth) choices.push({ value: "nextauth", label: ctx.t("cli.init.auth.nextauth") });
        answers.auth = await prompt.choose(ctx.t("cli.init.ask.auth"), choices, answers.auth);
      }
      printRecap();
      if (await prompt.confirm(ctx.t("cli.init.ask.confirm"), true)) break;
      if (!(await prompt.confirm(ctx.t("cli.init.ask.again"), true))) {
        ctx.print(ctx.t("cli.init.cancelled"));
        return EXIT.OK;
      }
      values = { ...values, name: undefined, capture: undefined };
    }
  } else if (!ctx.json) printRecap();

  const appPathFromDocs = detected.appPath ? relativeSlash(target, path.join(detected.packageDir || appDir, detected.appPath)) : null;
  const fromDocs = (rel) => (docsToRoot === "." ? rel : `${docsToRoot}/${rel}`);
  const vars = {
    name: answers.name,
    slug: productSlug(answers.name),
    language: answers.language,
    appUrl: answers.url,
    auth: answers.auth,
    captureMode: answers.capture,
    coverage: coverageLiteral(detected.framework, appPathFromDocs),
    appDir: docsToApp,
    appRoot: docsToRoot,
    versionFile: JSON.stringify(fromDocs(detected.version.file)),
    versionPattern: JSON.stringify(detected.version.pattern),
    maskingEnv: arrayLiteral(detected.envFiles.map(fromDocs)),
    kitPath: relativeSlash(target, KIT_ROOT),
  };
  const files = scaffold({ target, language: answers.language, vars, mode: answers.capture });

  const next = [`cd ${shownPath(target)}`, "npm install"];
  if (answers.capture === "app") {
    if (answers.auth !== "none") next.push(`${BRAND.command} connect`);
    next.push(`${BRAND.command} capture`);
  }
  next.push(`${BRAND.command} dev`);
  if (ctx.json) {
    const { nameFromOption, ...shown } = answers;
    ctx.print(
      JSON.stringify(
        {
          folder: target,
          files,
          framework: detected.framework,
          appPath: appPathFromDocs,
          ...shown,
          slug: vars.slug,
          nameSource: nameFromOption ? { kind: "option" } : answers.name === detected.name ? detected.nameSource : { kind: "answer" },
          version: { file: fromDocs(detected.version.file), value: detected.version.value },
          masking: detected.envFiles.map(fromDocs),
          appDir: docsToRoot,
          next,
        },
        null,
        2
      )
    );
    return EXIT.OK;
  }
  ctx.print(`\n${p.ok("✔")} ${ctx.t("cli.init.done", { n: files.length, folder: shownPath(target) })}`);
  ctx.print(`\n${p.bold(ctx.t("cli.init.next"))}`);
  for (const c of next) ctx.print(`  ${p.cmd(c)}`);
  ctx.print(`\n${p.dim(ctx.t("cli.init.hint"))}`);
  return EXIT.OK;
}
