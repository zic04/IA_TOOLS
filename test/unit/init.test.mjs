// init: detection of the application (framework, routes folder, port, name, NextAuth, Python), the skeleton
// written with its variables, the questions (interactive), the refusals (non-empty folder, no terminal).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { runCli } from "../../cli/doc-kit.mjs";
import { detectApp, humanize, scriptPort, coverageLiteral, metadataTitle, productBase, VERSION_TEXT_PATTERN } from "../../cli/commands/init.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";
import { build } from "../../engine/build/build.mjs";
import { satisfies } from "../../engine/project/semver.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

/** Runs the CLI; `input`: lines typed at the questions (then the input ends). */
async function cli(args, { input, env = {} } = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env,
    ...(input ? { stdin: Readable.from([input.map((l) => l + "\n").join("")]), interactive: true } : {}),
  });
  return { code, out, err };
}

/** A fictional application folder. */
function fakeApp(files) {
  const dir = tempDir("doc-kit-app-");
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}
const nextApp = () =>
  fakeApp({
    "package.json": { name: "acme-orders", version: "2.4.0", scripts: { dev: "next dev -p 3100" }, dependencies: { next: "15.0.0", "next-auth": "5.0.0" } },
    "src/app/page.tsx": "export default function Page() { return null; }",
    "src/app/orders/page.tsx": "export default function Page() { return null; }",
  });

/** Links the kit into a project (what `npm install` does), so that doc.config.mjs can import doc-kit/config. */
const links = [];
function linkKit(project) {
  fs.mkdirSync(path.join(project, "node_modules"), { recursive: true });
  const link = path.join(project, "node_modules", BRAND.packageName);
  fs.symlinkSync(KIT_ROOT, link, "junction");
  links.push(link);
}
/** Removes a temporary folder; the links to the kit are removed first (never followed). */
function remove(dir) {
  for (const link of links.splice(0)) if (fs.existsSync(link)) fs.unlinkSync(link);
  fs.rmSync(dir, { recursive: true, force: true });
}
async function loadConfig(project) {
  const raw = (await import(pathToFileURL(path.join(project, "doc.config.mjs")).href + "?t=" + Date.now())).default;
  return prepareConfig(raw, { env: {} });
}
const allFiles = (dir) =>
  fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => !f.startsWith("node_modules") && fs.statSync(path.join(dir, f)).isFile());

describe("detection", () => {
  test("Next.js App Router in src/app, port of the dev script, NextAuth, name", () => {
    const app = nextApp();
    try {
      const d = detectApp(app);
      assert.equal(d.framework, "next-app-router");
      assert.equal(d.appPath, "src/app");
      assert.equal(d.port, 3100);
      assert.equal(d.portSource, "dev");
      assert.equal(d.url, "http://localhost:3100");
      assert.equal(d.nextAuth, true);
      assert.equal(d.name, "Acme Orders");
    } finally {
      remove(app);
    }
  });

  test("monorepo: React Router + Vite front end in frontend/, Python back end, generic package name", () => {
    const app = fakeApp({
      "frontend/package.json": { name: "frontend", dependencies: { "react-router-dom": "7.0.0" }, devDependencies: { vite: "6.0.0" } },
      "frontend/src/App.tsx": "export default function App() { return null; }",
      "frontend/vite.config.ts": "export default { server: { port: 4000 } };",
      "backend/pyproject.toml": '[project]\nname = "api"\nversion = "0.9.3"\n',
    });
    try {
      const d = detectApp(app);
      assert.equal(d.framework, "react-router");
      assert.equal(d.frameworkLabel, "React Router (Vite)");
      assert.equal(d.appPath, "src/App.tsx");
      assert.equal(d.packageDir, path.join(app, "frontend"));
      assert.equal(d.port, 4000);
      assert.equal(d.python, "backend/pyproject.toml");
      assert.equal(d.name, humanize(path.basename(app)), "generic package name → folder name");
    } finally {
      remove(app);
    }
  });

  test("helpers: humanize, port of a script, coverage literal", () => {
    assert.equal(humanize("@acme/orders-web"), "Orders Web");
    assert.equal(scriptPort("vite --port=5174"), 5174);
    assert.equal(scriptPort("PORT=8080 node server.js"), 8080);
    assert.equal(scriptPort("next dev"), null);
    assert.equal(coverageLiteral("next-app-router", "../../app"), '[{ adapter: "next-app-router", app: "../../app" }]');
    assert.equal(coverageLiteral("react-router", "../../frontend/src/App.tsx"), '[{ adapter: "react-router", file: "../../frontend/src/App.tsx" }]');
    assert.equal(coverageLiteral(null, null), "[]");
  });
});

describe("init", () => {
  test("--yes: writes the skeleton, fills every variable, the project loads and builds (draft)", async () => {
    const app = nextApp();
    try {
      const r = await cli(["init", app, "--yes"]);
      assert.equal(r.code, 0, r.err);
      const docs = path.join(app, "docs", "manual");
      assert.match(r.out, /Next\.js \(App Router\) · routes in src\/app · NextAuth/);
      assert.match(r.out, /3100 \(from the “dev” script\)/);
      // Exactly the next commands.
      const next = r.out.split("Next steps:\n")[1].split("\n\n")[0].split("\n").map((l) => l.trim());
      assert.deepEqual(next.slice(1), ["npm install", "doc-kit connect", "doc-kit capture", "doc-kit dev"]);
      assert.match(next[0], /^cd .*docs[\\/]manual"?$/);

      const files = allFiles(docs);
      assert.ok(files.length >= 20, files.join(", "));
      for (const f of files) assert.doesNotMatch(fs.readFileSync(path.join(docs, f), "utf8"), /\{\{(name|slug|language|appUrl|auth|coverage|appDir|kitPath)\}\}/, f);
      const config = fs.readFileSync(path.join(docs, "doc.config.mjs"), "utf8");
      assert.match(config, /coverage: \[\{ adapter: "next-app-router", app: "\.\.\/\.\.\/src\/app" \}\]/);
      assert.match(config, /file: "\.\.\/\.\.\/package\.json"/);
      assert.match(config, /env: \[\]/, "no .env file in the application: nothing to mask");
      assert.match(config, /mode: "app"/);
      assert.match(config, /app: \{ url: "http:\/\/localhost:3100", dir: "\.\.\/\.\." \}/);
      const range = /kit: "([^"]+)"/.exec(config)[1];
      assert.ok(satisfies(BRAND.version, range), `range ${range} accepts kit ${BRAND.version}`);
      const pkg = JSON.parse(fs.readFileSync(path.join(docs, "package.json"), "utf8"));
      assert.equal(path.resolve(docs, pkg.dependencies[BRAND.packageName].replace(/^file:/, "")), KIT_ROOT);

      linkKit(docs);
      const c = await loadConfig(docs);
      assert.equal(c.product.name, "Acme Orders");
      assert.equal(c.app.url, "http://localhost:3100");
      assert.equal(c.auth.adapter, "manual");
      const b = build({ project: { root: docs }, config: c, options: { draft: true, date: "2026-01-01" } });
      assert.deepEqual(b.errors, []);
      assert.ok(b.stats.pages >= 9);
      assert.equal(b.data.meta.version, "2.4.0", "version read in the application's package.json");
    } finally {
      remove(app);
    }
  });

  test("questions: name, language, URL, sign-in, confirmation (French project)", async () => {
    const app = nextApp();
    try {
      const r = await cli(["init", app, "--dir", "documentation"], { input: ['Acme "Q" Orders', "2", "http://localhost:3200/", "1", "3", "o"] });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /\? Product name \(Acme Orders\) › Acme "Q" Orders/);
      assert.match(r.out, /\? Language of the documentation\n {2}1\) English\n {2}2\) French/);
      assert.match(r.out, /3\) nextauth/);
      // Once French is chosen, the questions go on in French.
      assert.match(r.out, /\? Adresse de l'application \(http:\/\/localhost:3100\) › http:\/\/localhost:3200\/\n/);
      assert.match(r.out, /\? Créer le projet \? \(O\/n\) › o/);
      const docs = path.join(app, "documentation");
      assert.ok(fs.existsSync(path.join(docs, "content", "utiliser", "prise-en-main.md")));
      assert.match(r.out, /doc-kit connect/, "a sign-in is needed: connect is listed");
      linkKit(docs);
      const c = await loadConfig(docs);
      assert.equal(c.product.name, 'Acme "Q" Orders');
      assert.equal(c.language, "fr");
      assert.equal(c.app.url, "http://localhost:3200");
      assert.equal(c.auth.adapter, "nextauth");
      assert.equal(JSON.parse(fs.readFileSync(path.join(docs, "content", "toc.json"), "utf8")).title.includes('Acme "Q" Orders'), true);
    } finally {
      remove(app);
    }
  });

  test("refusals: non-empty folder (1), missing application folder (2), no terminal without --yes (2), invalid options (2)", async () => {
    const app = nextApp();
    try {
      fs.mkdirSync(path.join(app, "docs", "manual"), { recursive: true });
      fs.writeFileSync(path.join(app, "docs", "manual", "notes.txt"), "x");
      const busy = await cli(["init", app, "--yes"]);
      assert.equal(busy.code, 1);
      assert.match(busy.err, /^✖ the folder .* already exists and is not empty\n {2}→ choose another folder with --dir/);
      assert.equal(fs.readdirSync(path.join(app, "docs", "manual")).length, 1, "nothing written");
      assert.equal((await cli(["init", path.join(app, "nope"), "--yes"])).code, 2);
      const tty = await cli(["init", app, "--dir", "other"]);
      assert.equal(tty.code, 2);
      assert.match(tty.err, /no terminal to ask the questions\n {2}→ add --yes/);
      assert.equal((await cli(["init", app, "--yes", "--framework", "angular"])).code, 2);
      assert.equal((await cli(["init", app, "--yes", "--url", "localhost"])).code, 2);
    } finally {
      remove(app);
    }
  });

  test("Python-only application: version read in pyproject.toml, auth none: no connect step, --framework none", async () => {
    const app = fakeApp({ "pyproject.toml": '[tool.x]\ntarget-version = "py311"\n[project]\nname = "acme-api"\nversion = "3.1.4"\n' });
    try {
      const r = await cli(["init", app, "--yes", "--auth", "none", "--name", "Acme API", "--framework", "none", "--json"]);
      assert.equal(r.code, 0, r.err);
      const j = JSON.parse(r.out);
      assert.equal(j.url, "http://localhost:8000");
      assert.deepEqual(j.next.slice(1), ["npm install", "doc-kit capture", "doc-kit dev"]);
      const docs = j.folder;
      linkKit(docs);
      const c = await loadConfig(docs);
      assert.equal(c.coverage.length, 0);
      const b = build({ project: { root: docs }, config: c, options: { draft: true } });
      assert.equal(b.data.meta.version, "3.1.4");
    } finally {
      remove(app);
    }
  });

  test("refusals: --capture other than app or none (2)", async () => {
    const app = nextApp();
    try {
      const r = await cli(["init", app, "--yes", "--capture", "some"]);
      assert.equal(r.code, 2);
      assert.match(r.err, /--capture: invalid value “some”\n {2}→ expected: app \| none/);
      assert.ok(!fs.existsSync(path.join(app, "docs")), "nothing written");
    } finally {
      remove(app);
    }
  });
});

/**
 * The layout of the pilot application: a root with version.txt and .env (no package.json), a separate Next.js
 * front end whose package is named "<x>-frontend" (version frozen at 1.0.0) with the product name in the root
 * layout's metadata, its own .env.local, and a Python API next to it.
 */
const separateFrontApp = () =>
  fakeApp({
    "version.txt": "1.0.152\n",
    ".env": "SERVICE_ACCOUNT_SECRET=0123456789abcdef\n",
    ".env.example": "SERVICE_ACCOUNT_SECRET=\n",
    "frontend/package.json": { name: "order-tracker-frontend", version: "1.0.0", scripts: { dev: "next dev" }, dependencies: { next: "15.0.0" } },
    "frontend/.env.local": "NEXT_PUBLIC_API_URL=http://api.acme.example\n",
    "frontend/src/app/layout.tsx":
      'import type { Metadata } from "next";\n\nexport const metadata: Metadata = {\n  openGraph: { title: "Not this one" },\n  title: "Acme Orders",\n  description: "Orders, approvals, invoices",\n};\n\nexport default function RootLayout({ children }) {\n  return children;\n}\n',
    "frontend/src/app/page.tsx": "export default function Page() { return null; }",
    "frontend/src/app/orders/page.tsx": "export default function Page() { return null; }",
    "api/requirements.txt": "fastapi\n",
    "api/main.py": "app = None\n",
  });

describe("init on an application with a separate front end (pilot layout)", () => {
  test("detection: the name from the layout's metadata, the version from version.txt, the .env files at the root and in the front end", () => {
    const app = separateFrontApp();
    try {
      const d = detectApp(app);
      assert.equal(d.packageDir, path.join(app, "frontend"));
      assert.equal(d.framework, "next-app-router");
      assert.equal(d.name, "Acme Orders");
      assert.deepEqual(d.nameSource, { kind: "layout", file: "frontend/src/app/layout.tsx" });
      assert.deepEqual(d.version, { file: "version.txt", pattern: VERSION_TEXT_PATTERN, value: "1.0.152" });
      assert.deepEqual(d.envFiles, [".env", "frontend/.env.local"], "existing files only, never *.example");
      assert.equal(d.python, "api/requirements.txt");
    } finally {
      remove(app);
    }
  });

  test("name and version helpers: metadata.title forms, front-end suffixes, version sources in order", () => {
    assert.equal(metadataTitle('export const metadata = { title: "Acme Orders" };'), "Acme Orders");
    assert.equal(metadataTitle("export const metadata: Metadata = {\n  title: { default: 'Acme Orders', template: '%s · Acme' },\n};"), "Acme Orders");
    assert.equal(metadataTitle('export const metadata = { openGraph: { title: "Nested" }, title: `Acme ${env}` };'), null, "a computed title is not a name");
    assert.equal(metadataTitle('export const metadata = { description: "x" };\nconst other = { title: "Elsewhere" };'), null, "only the metadata object");
    assert.equal(metadataTitle("export async function generateMetadata() { return { title: 'X' }; }"), null);
    for (const [raw, base] of [["order-tracker-frontend", "order-tracker"], ["@acme/orders-web", "orders"], ["acme_ui", "acme"], ["acme-client", "acme"], ["acme-app", "acme"], ["frontend", "frontend"]]) assert.equal(productBase(raw), base, raw);
    // A generic front-end name gives way to the root package.json, then to the folder name.
    const app = fakeApp({ "package.json": { name: "acme-orders", version: "3.0.1", private: true }, "web/package.json": { name: "web", version: "0.0.0", dependencies: { vite: "6.0.0" } } });
    try {
      const d = detectApp(app);
      assert.equal(d.packageDir, path.join(app, "web"));
      assert.deepEqual([d.name, d.nameSource.file], ["Acme Orders", "package.json"]);
      assert.deepEqual([d.version.file, d.version.value], ["package.json", "3.0.1"], "the root package.json before the front end's");
      fs.writeFileSync(path.join(app, "VERSION"), "v4.2.0\n");
      assert.deepEqual([detectApp(app).version.file, detectApp(app).version.value], ["VERSION", "4.2.0"], "VERSION at the root first");
    } finally {
      remove(app);
    }
  });

  test("--yes --capture none --lang fr: the recap before writing, the no-screenshot skeleton, French comments, a draft build", async () => {
    const app = separateFrontApp();
    try {
      const r = await cli(["init", app, "--yes", "--capture", "none", "--lang", "fr"]);
      assert.equal(r.code, 0, r.err);
      const docs = path.join(app, "docs", "manual");
      // The recap comes first, with every value and where it was found.
      const recap = r.out.split("Récapitulatif\n")[1].split("\n✔")[0];
      assert.match(recap, /Nom du produit +Acme Orders \(metadata\.title de frontend\/src\/app\/layout\.tsx\)/);
      assert.match(recap, /Identifiant +acme-orders/);
      assert.match(recap, /Langue +fr — français/);
      assert.match(recap, /Version +1\.0\.152 \(lue dans version\.txt\)/);
      assert.match(recap, /Captures +none — aucune capture/);
      assert.match(recap, /Couverture +next-app-router: frontend\/src\/app/);
      assert.match(recap, /\.env masqués +\.env, frontend\/\.env\.local/);
      assert.match(recap, /Application +.*\(app\.dir: \.\.\/\.\.\)/);
      assert.match(recap, /Pour renommer le produit ensuite : product\.name dans doc\.config\.mjs, puis le titre/);
      assert.ok(r.out.indexOf("Récapitulatif") < r.out.indexOf("fichiers écrits"), "the recap is printed before the files are written");
      // Next steps: no connect, no capture.
      const next = r.out.split("Étapes suivantes :\n")[1].split("\n\n")[0].split("\n").map((l) => l.trim());
      assert.deepEqual(next.slice(1), ["npm install", "doc-kit dev"]);

      const config = fs.readFileSync(path.join(docs, "doc.config.mjs"), "utf8");
      assert.match(config, /^\/\/ Configuration du site de documentation du produit Acme Orders/, "comments in the project's language");
      assert.doesNotMatch(config, /Precedence, from strongest/);
      assert.match(config, /mode: "none"/);
      assert.match(config, /file: "\.\.\/\.\.\/version\.txt"/);
      assert.match(config, /env: \["\.\.\/\.\.\/\.env", "\.\.\/\.\.\/frontend\/\.env\.local"\]/);
      assert.match(config, /app: \{ url: "http:\/\/localhost:3000", dir: "\.\.\/\.\." \}/);
      assert.match(config, /coverage: \[\{ adapter: "next-app-router", app: "\.\.\/\.\.\/frontend\/src\/app" \}\]/);

      // No example plan, no screenshot block, no "interactive screens" callout, no variant marker left.
      assert.ok(!fs.existsSync(path.join(docs, "captures", "plans", "example.mjs")));
      for (const f of allFiles(docs).filter((x) => x.endsWith(".md"))) {
        const text = fs.readFileSync(path.join(docs, f), "utf8");
        assert.doesNotMatch(text, /^\s*:::(?:ecran|screen)\{|^\s*::(?:avant-apres|before-after)\{|doc-kit:(?:capture|end)/m, f);
      }
      const home = fs.readFileSync(path.join(docs, "content", "home.md"), "utf8");
      assert.doesNotMatch(home, /Écrans interactifs|pastilles/);
      assert.match(home, /Écrans décrits élément par élément/);
      assert.match(fs.readFileSync(path.join(docs, "content", "utiliser", "prise-en-main.md"), "utf8"), /\| Élément \| Ce qu'il montre \|\n\|---\|---\|\n\| \*\*Barre du haut\*\* \|/);
      // French: no elision trap around the product name, fictional example routes only.
      const all = allFiles(docs).map((f) => fs.readFileSync(path.join(docs, f), "utf8")).join("\n");
      assert.doesNotMatch(all, /\bde Acme Orders|\bde \*\*Acme Orders|(?<!application )Acme Orders est construite/);
      // No script calls `doc-kit capture` in a project without screenshots.
      const pkg = JSON.parse(fs.readFileSync(path.join(docs, "package.json"), "utf8"));
      assert.equal(pkg.scripts.captures, undefined);
      assert.doesNotMatch(pkg.scripts.all, /capture/);
      assert.doesNotMatch(all, /\[\[route \/admin/);

      linkKit(docs);
      const c = await loadConfig(docs);
      assert.equal(c.capture.mode, "none");
      assert.equal(c.app.dir, "../..");
      const b = build({ project: { root: docs }, config: c, options: { draft: true, date: "2026-01-01" } });
      assert.deepEqual(b.errors, []);
      assert.equal(b.data.meta.version, "1.0.152");
    } finally {
      remove(app);
    }
  });

  test("an English project keeps the English comments and the screenshot variant; --json gives the recap's values", async () => {
    const app = separateFrontApp();
    try {
      const r = await cli(["init", app, "--yes", "--lang", "en", "--json"]);
      assert.equal(r.code, 0, r.err);
      const j = JSON.parse(r.out);
      assert.equal(j.name, "Acme Orders");
      assert.deepEqual(j.nameSource, { kind: "layout", file: "frontend/src/app/layout.tsx" });
      assert.deepEqual(j.version, { file: "../../version.txt", value: "1.0.152" });
      assert.deepEqual(j.masking, ["../../.env", "../../frontend/.env.local"]);
      assert.equal(j.appDir, "../..");
      assert.equal(j.capture, "app");
      assert.deepEqual(j.next.slice(1), ["npm install", "doc-kit connect", "doc-kit capture", "doc-kit dev"]);
      const docs = j.folder;
      assert.match(fs.readFileSync(path.join(docs, "doc.config.mjs"), "utf8"), /^\/\/ Configuration of the Acme Orders documentation site/);
      assert.ok(fs.existsSync(path.join(docs, "captures", "plans", "example.mjs")));
      assert.match(fs.readFileSync(path.join(docs, "content", "use", "getting-started.md"), "utf8"), /:::screen\{capture="home"/);
      assert.match(fs.readFileSync(path.join(docs, "content", "home.md"), "utf8"), /\[!TIP\] Interactive screens/);
      assert.match(fs.readFileSync(path.join(docs, "content", "administer", "users.md"), "utf8"), /\[\[route \/example\/users\]\]/);
    } finally {
      remove(app);
    }
  });

  test("interactive: the capture-mode question; with none, the sign-in question is skipped", async () => {
    const app = separateFrontApp();
    try {
      const r = await cli(["init", app], { input: ["", "1", "", "2", "y"] });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /\? Will the documentation show screenshots of the application\?\n {2}1\) yes — /);
      assert.doesNotMatch(r.out, /How do people sign in/);
      assert.match(r.out, /Summary\n {2}Folder/);
      assert.match(r.out, /Sign-in +manual \(not used without screenshots\)/);
      assert.match(fs.readFileSync(path.join(app, "docs", "manual", "doc.config.mjs"), "utf8"), /mode: "none"/);
    } finally {
      remove(app);
    }
  });
});
