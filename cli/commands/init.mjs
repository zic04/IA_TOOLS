// init [app-dir] [--dir docs/manual] [--name] [--lang en|fr] [--url] [--framework next|react-router|none] [--auth] [--yes]
// Creates the documentation project of an application (ARCHITECTURE.md §2.1): <app-dir>/docs/manual/ by default.
//   - detects the framework (package.json: next → next-app-router, with app/ or src/app/; react-router →
//     react-router), a Python back end (pyproject.toml, requirements.txt), the port of the dev script, the name;
//   - asks the name, the language, the application URL and the sign-in method, then confirms
//     (--yes: the detected values and the options, no question);
//   - writes templates/project/common + templates/project/<language>, variables filled;
//   - refuses a non-empty folder (exit code 1); prints the next commands.
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { KIT_ROOT } from "../../engine/project/find.mjs";
import { productSlug } from "../../engine/project/defaults.mjs";
import { satisfies } from "../../engine/project/semver.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { slash } from "../../engine/dev/environment.mjs";
import { prompterOf, shownPath } from "../common.mjs";

export const options = {
  dir: { type: "string" },
  name: { type: "string" },
  url: { type: "string" },
  framework: { type: "string" },
  auth: { type: "string" },
  yes: { type: "boolean", short: "y" },
};

export const DEFAULT_DIR = "docs/manual";
export const FRAMEWORKS = ["next", "react-router", "none"];
export const AUTH_ADAPTERS = ["manual", "none", "nextauth"];
const SUBFOLDERS = ["frontend", "front", "web", "client", "ui", "app", "apps/web"];
const BACKENDS = ["", "backend", "back", "api", "server"];
const GENERIC_NAMES = /^(app|web|client|frontend|front|ui|site|www|my-app|project|monorepo|root)$/i;
const ROUTER_FILES = ["src/App.tsx", "src/App.jsx", "src/App.ts", "src/App.js", "src/router.tsx", "src/routes.tsx", "src/main.tsx", "src/main.jsx", "app/routes.ts"];

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};
const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();

/** "acme-orders" → "Acme Orders"; "@acme/orders-web" → "Orders Web". */
export function humanize(name) {
  return String(name)
    .replace(/^@[^/]+\//, "")
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Port of a dev script: -p 3001, --port 3001, --port=3001, PORT=3001. */
export function scriptPort(script) {
  const m = /(?:^|\s)(?:-p|--port)[\s=]+(\d{2,5})\b/.exec(script || "") || /\bPORT=(\d{2,5})\b/.exec(script || "");
  return m ? Number(m[1]) : null;
}

/**
 * What can be read from the application folder, without running anything.
 * @returns {{ appDir, packageDir: string|null, name: string, framework: "next-app-router"|"react-router"|null,
 *   frameworkLabel: string|null, appPath: string|null, url: string, port: number, portSource: string|null,
 *   nextAuth: boolean, python: string|null }}
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

  const raw = pkg?.productName || pkg?.displayName || pkg?.name;
  const folderName = path.basename(path.resolve(appDir));
  r.name = humanize(raw && !GENERIC_NAMES.test(String(raw).replace(/^@[^/]+\//, "")) ? raw : folderName) || "My App";
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

/** Escapes a value for the file it goes into (JSON and JS strings: double-quoted escaping). */
function escapeFor(file, value) {
  return /\.(json|mjs|js)$/.test(file) ? JSON.stringify(String(value)).slice(1, -1) : String(value);
}

/**
 * Writes the project skeleton into `target` (must be missing or empty).
 * @param {{ target: string, language: "en"|"fr", vars: Record<string,string>, raw?: string[] }} p
 *   raw: variables inserted as they are (JavaScript literals such as {{coverage}})
 * @returns {string[]} written files, relative to target, with forward slashes, sorted
 */
export function scaffold({ target, language, vars, raw = ["coverage"], kitVersion = BRAND.version }) {
  if (fs.existsSync(target) && fs.readdirSync(target).length) throw new KitError(EXIT.CHECK, "init.notEmpty", { folder: target });
  const written = [];
  for (const layer of ["common", language]) {
    const base = path.join(KIT_ROOT, "templates", "project", layer);
    for (const rel of fs.readdirSync(base, { recursive: true }).map(String).sort()) {
      const src = path.join(base, rel);
      if (fs.statSync(src).isDirectory()) continue;
      const dest = path.join(target, rel);
      let text = fs.readFileSync(src, "utf8");
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

/** Python-only application: the version is read in pyproject.toml rather than in a package.json. */
function adjustVersionSource(file, detected, appDirFromDocs) {
  if (detected.packageDir || !detected.python || !detected.python.endsWith("pyproject.toml")) return;
  let text = fs.readFileSync(file, "utf8");
  // In doc.config.mjs: pattern: "(?:^|\\n)version\\s*=\\s*\"([^\"]+)\"" (first `version = "…"` at a line start).
  const pattern = JSON.stringify('(?:^|\\n)version\\s*=\\s*"([^"]+)"');
  text = text
    .replace(/(file:\s*")[^"]*package\.json(")/, (m, a, b) => `${a}${appDirFromDocs}/${detected.python}${b}`)
    .replace(/(pattern:\s*)"(?:[^"\\\n]|\\.)*"/, (m, a) => `${a}${pattern}`);
  fs.writeFileSync(file, text);
}

const URL_RE = /^https?:\/\/[^\s/]+/;

export async function run({ ctx, values, positionals }) {
  const appDir = path.resolve(process.cwd(), positionals[0] || ".");
  if (!fs.existsSync(appDir) || !fs.statSync(appDir).isDirectory()) throw new KitError(EXIT.USAGE, "init.appMissing", { folder: appDir });
  if (values.framework !== undefined && !FRAMEWORKS.includes(values.framework))
    throw new KitError(EXIT.USAGE, "option.value", { option: "framework", value: values.framework, expected: FRAMEWORKS.join(" | ") });
  if (values.auth !== undefined && !AUTH_ADAPTERS.includes(values.auth) && !/^(api-me|local:.+)$/.test(values.auth))
    throw new KitError(EXIT.USAGE, "option.value", { option: "auth", value: values.auth, expected: [...AUTH_ADAPTERS, "api-me", "local:<file>"].join(" | ") });
  if (values.url !== undefined && !URL_RE.test(values.url)) throw new KitError(EXIT.USAGE, "option.value", { option: "url", value: values.url, expected: "http(s)://host[:port]" });
  if (!values.yes && !ctx.interactive) throw new KitError(EXIT.USAGE, "init.notInteractive");

  const detected = detectApp(appDir);
  if (values.framework === "none") Object.assign(detected, { framework: null, appPath: null });
  else if (values.framework === "next") Object.assign(detected, { framework: "next-app-router", appPath: detected.framework === "next-app-router" ? detected.appPath : "app" });
  else if (values.framework === "react-router")
    Object.assign(detected, { framework: "react-router", appPath: detected.framework === "react-router" && detected.appPath ? detected.appPath : "src/App.tsx" });
  const target = path.resolve(appDir, values.dir || DEFAULT_DIR);
  if (fs.existsSync(target) && fs.readdirSync(target).length) throw new KitError(EXIT.CHECK, "init.notEmpty", { folder: target });

  const envLang = String(ctx.env.LC_ALL || ctx.env.LC_MESSAGES || ctx.env.LANG || "");
  let answers = {
    name: values.name || detected.name,
    language: ctx.globals.lang || (envLang.startsWith("fr") ? "fr" : "en"),
    url: (values.url || detected.url).replace(/\/+$/, ""),
    auth: values.auth || "manual",
  };

  const p = ctx.paint;
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
      if (!values.name) answers.name = await prompt.ask(ctx.t("cli.init.ask.name"), answers.name, (v) => (v.trim() ? null : "init.ask.nameEmpty"));
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
      if (!values.auth) {
        const choices = [
          { value: "manual", label: ctx.t("cli.init.auth.manual") },
          { value: "none", label: ctx.t("cli.init.auth.none") },
        ];
        if (detected.nextAuth) choices.push({ value: "nextauth", label: ctx.t("cli.init.auth.nextauth") });
        answers.auth = await prompt.choose(ctx.t("cli.init.ask.auth"), choices, answers.auth);
      }
      ctx.print(`\n${p.bold(ctx.t("cli.init.summary"))}`);
      ctx.print(`  ${ctx.t("cli.init.summaryLine", { folder: shownPath(target), name: answers.name, language: answers.language, url: answers.url, auth: answers.auth })}`);
      if (await prompt.confirm(ctx.t("cli.init.ask.confirm"), true)) break;
      if (!(await prompt.confirm(ctx.t("cli.init.ask.again"), true))) {
        ctx.print(ctx.t("cli.init.cancelled"));
        return EXIT.OK;
      }
      values = { ...values, name: undefined };
    }
  }

  const docsToApp = relativeSlash(target, detected.packageDir || appDir);
  const appPathFromDocs = detected.appPath ? relativeSlash(target, path.join(detected.packageDir || appDir, detected.appPath)) : null;
  const vars = {
    name: answers.name,
    slug: productSlug(answers.name),
    language: answers.language,
    appUrl: answers.url,
    auth: answers.auth,
    coverage: coverageLiteral(detected.framework, appPathFromDocs),
    appDir: docsToApp,
    kitPath: relativeSlash(target, KIT_ROOT),
  };
  const files = scaffold({ target, language: answers.language, vars });
  adjustVersionSource(path.join(target, "doc.config.mjs"), detected, docsToApp);

  const next = [`cd ${shownPath(target)}`, "npm install"];
  if (answers.auth !== "none") next.push(`${BRAND.command} connect`);
  next.push(`${BRAND.command} capture`, `${BRAND.command} dev`);
  if (ctx.json) {
    ctx.print(JSON.stringify({ folder: target, files, framework: detected.framework, appPath: appPathFromDocs, ...answers, next }, null, 2));
    return EXIT.OK;
  }
  ctx.print(`${values.yes ? "" : "\n"}${p.ok("✔")} ${ctx.t("cli.init.done", { n: files.length, folder: shownPath(target) })}`);
  ctx.print(`\n${p.bold(ctx.t("cli.init.next"))}`);
  for (const c of next) ctx.print(`  ${p.cmd(c)}`);
  ctx.print(`\n${p.dim(ctx.t("cli.init.hint"))}`);
  return EXIT.OK;
}
