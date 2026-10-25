// init: detection of the application (framework, routes folder, port, name, NextAuth, Python), the skeleton
// written with its variables, the questions (interactive), the refusals (non-empty folder, no terminal).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { runCli } from "../../cli/doc-kit.mjs";
import {
  detectApp,
  humanize,
  scriptPort,
  coverageLiteral,
  metadataTitle,
  productBase,
  VERSION_TEXT_PATTERN,
  isLoopback,
  localOrDemo,
} from "../../cli/commands/init.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";
import { build } from "../../engine/build/build.mjs";
import { satisfies } from "../../engine/project/semver.mjs";
import { BRAND } from "../../engine/brand.mjs";
import { SPACE_PRESETS } from "../../engine/dev/skeleton.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

/** Runs the CLI; `input`: lines typed at the questions (then the input ends); `steps`: follow-up steps of init. */
async function cli(args, { input, env = {}, steps } = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env,
    steps,
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
    "package.json": {
      name: "acme-orders",
      version: "2.4.0",
      scripts: { dev: "next dev -p 3100" },
      dependencies: { next: "15.0.0", "next-auth": "5.0.0" },
    },
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
      "frontend/package.json": {
        name: "frontend",
        dependencies: { "react-router-dom": "7.0.0" },
        devDependencies: { vite: "6.0.0" },
      },
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
    assert.equal(
      coverageLiteral("react-router", "../../frontend/src/App.tsx"),
      '[{ adapter: "react-router", file: "../../frontend/src/App.tsx" }]',
    );
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
      const next = r.out
        .split("Next steps:\n")[1]
        .split("\n\n")[0]
        .split("\n")
        .map((l) => l.trim());
      assert.deepEqual(next.slice(1), ["npm install", "doc-kit connect", "doc-kit capture", "doc-kit dev"]);
      assert.match(next[0], /^cd .*docs[\\/]manual"?$/);

      const files = allFiles(docs);
      assert.ok(files.length >= 20, files.join(", "));
      for (const f of files)
        assert.doesNotMatch(
          fs.readFileSync(path.join(docs, f), "utf8"),
          /\{\{(name|slug|language|appUrl|auth|coverage|appDir|kitPath)\}\}/,
          f,
        );
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
      const r = await cli(["init", app, "--dir", "documentation"], {
        input: ['Acme "Q" Orders', "2", "http://localhost:3200/", "1", "3", "2", "o"],
      });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /\? Product name \(Acme Orders\) › Acme "Q" Orders/);
      assert.match(r.out, /\? Language of the documentation\n {2}1\) English\n {2}2\) French/);
      assert.match(r.out, /3\) nextauth/);
      // Once French is chosen, the questions go on in French.
      assert.match(r.out, /\? Adresse de l'application \(http:\/\/localhost:3100\) › http:\/\/localhost:3200\/\n/);
      assert.match(r.out, /\? Créer le projet \? \(O\/n\) › o/);
      // The audiences (ARCHITECTURE.md §6.1a): the second preset, users and product.
      assert.match(
        r.out,
        /\? Pour qui est la documentation \? \(ses espaces\)\n {2}1\) use, product, admin, develop — /,
      );
      assert.match(r.out, /\n {2}2\) use, product — les utilisateurs et les responsables produit \(sans code\)\n/);
      assert.match(r.out, /\n {2}5\) none — une seule documentation pour tous, sans espace\n {2}\(1\) › 2\n/);
      assert.match(r.out, /Espaces +use, product\n/);
      const docs = path.join(app, "documentation");
      assert.ok(fs.existsSync(path.join(docs, "content", "utiliser", "prise-en-main.md")));
      assert.ok(!fs.existsSync(path.join(docs, "content", "reprendre")), "the Develop pages left out");
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(docs, "content", "toc.json"), "utf8")).spaces, [
        "use",
        "product",
      ]);
      assert.match(r.out, /doc-kit connect/, "a sign-in is needed: connect is listed");
      linkKit(docs);
      const c = await loadConfig(docs);
      assert.equal(c.product.name, 'Acme "Q" Orders');
      assert.equal(c.language, "fr");
      assert.equal(c.app.url, "http://localhost:3200");
      assert.equal(c.auth.adapter, "nextauth");
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(docs, "content", "toc.json"), "utf8")).title.includes('Acme "Q" Orders'),
        true,
      );
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
      assert.match(
        busy.err,
        /^✖ the folder .* already exists and is not empty\n {2}→ choose another folder with --dir/,
      );
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
    const app = fakeApp({
      "pyproject.toml": '[tool.x]\ntarget-version = "py311"\n[project]\nname = "acme-api"\nversion = "3.1.4"\n',
    });
    try {
      const r = await cli([
        "init",
        app,
        "--yes",
        "--auth",
        "none",
        "--name",
        "Acme API",
        "--framework",
        "none",
        "--json",
      ]);
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
    "frontend/package.json": {
      name: "order-tracker-frontend",
      version: "1.0.0",
      scripts: { dev: "next dev" },
      dependencies: { next: "15.0.0" },
    },
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
    assert.equal(
      metadataTitle(
        "export const metadata: Metadata = {\n  title: { default: 'Acme Orders', template: '%s · Acme' },\n};",
      ),
      "Acme Orders",
    );
    assert.equal(
      metadataTitle('export const metadata = { openGraph: { title: "Nested" }, title: `Acme ${env}` };'),
      null,
      "a computed title is not a name",
    );
    assert.equal(
      metadataTitle('export const metadata = { description: "x" };\nconst other = { title: "Elsewhere" };'),
      null,
      "only the metadata object",
    );
    assert.equal(metadataTitle("export async function generateMetadata() { return { title: 'X' }; }"), null);
    for (const [raw, base] of [
      ["order-tracker-frontend", "order-tracker"],
      ["@acme/orders-web", "orders"],
      ["acme_ui", "acme"],
      ["acme-client", "acme"],
      ["acme-app", "acme"],
      ["frontend", "frontend"],
    ])
      assert.equal(productBase(raw), base, raw);
    // A generic front-end name gives way to the root package.json, then to the folder name.
    const app = fakeApp({
      "package.json": { name: "acme-orders", version: "3.0.1", private: true },
      "web/package.json": { name: "web", version: "0.0.0", dependencies: { vite: "6.0.0" } },
    });
    try {
      const d = detectApp(app);
      assert.equal(d.packageDir, path.join(app, "web"));
      assert.deepEqual([d.name, d.nameSource.file], ["Acme Orders", "package.json"]);
      assert.deepEqual(
        [d.version.file, d.version.value],
        ["package.json", "3.0.1"],
        "the root package.json before the front end's",
      );
      fs.writeFileSync(path.join(app, "VERSION"), "v4.2.0\n");
      assert.deepEqual(
        [detectApp(app).version.file, detectApp(app).version.value],
        ["VERSION", "4.2.0"],
        "VERSION at the root first",
      );
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
      assert.ok(
        r.out.indexOf("Récapitulatif") < r.out.indexOf("fichiers écrits"),
        "the recap is printed before the files are written",
      );
      // Next steps: no connect, no capture.
      const next = r.out
        .split("Étapes suivantes :\n")[1]
        .split("\n\n")[0]
        .split("\n")
        .map((l) => l.trim());
      assert.deepEqual(next.slice(1), ["npm install", "doc-kit dev"]);

      const config = fs.readFileSync(path.join(docs, "doc.config.mjs"), "utf8");
      assert.match(
        config,
        /^\/\/ Configuration du site de documentation du produit Acme Orders/,
        "comments in the project's language",
      );
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
        assert.doesNotMatch(
          text,
          /^\s*:::(?:ecran|screen)\{|^\s*::(?:avant-apres|before-after)\{|doc-kit:(?:capture|end)/m,
          f,
        );
      }
      const home = fs.readFileSync(path.join(docs, "content", "home.md"), "utf8");
      assert.doesNotMatch(home, /Écrans interactifs|pastilles/);
      assert.match(home, /Écrans décrits élément par élément/);
      assert.match(
        fs.readFileSync(path.join(docs, "content", "utiliser", "prise-en-main.md"), "utf8"),
        /\| Élément \| Ce qu'il montre \|\n\|---\|---\|\n\| \*\*Barre du haut\*\* \|/,
      );
      // French: no elision trap around the product name, fictional example routes only.
      const all = allFiles(docs)
        .map((f) => fs.readFileSync(path.join(docs, f), "utf8"))
        .join("\n");
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
      assert.match(
        fs.readFileSync(path.join(docs, "doc.config.mjs"), "utf8"),
        /^\/\/ Configuration of the Acme Orders documentation site/,
      );
      assert.ok(fs.existsSync(path.join(docs, "captures", "plans", "example.mjs")));
      assert.match(
        fs.readFileSync(path.join(docs, "content", "use", "getting-started.md"), "utf8"),
        /:::screen\{capture="home"/,
      );
      assert.match(fs.readFileSync(path.join(docs, "content", "home.md"), "utf8"), /\[!TIP\] Interactive screens/);
      assert.match(
        fs.readFileSync(path.join(docs, "content", "administer", "users.md"), "utf8"),
        /\[\[route \/example\/users\]\]/,
      );
    } finally {
      remove(app);
    }
  });

  test("interactive: the sources, declared after the answers (ARCHITECTURE.md §6.19), written to inputs.json", async () => {
    const app = separateFrontApp();
    const infra = path.join(app, "infra");
    fs.mkdirSync(infra);
    fs.writeFileSync(path.join(app, "DAT.docx"), "not read by init");
    try {
      const r = await cli(["init", app], {
        input: [
          ...["", "1", "", "3", "", "y"], // name, language, URL, no screenshots, the four spaces, confirm
          "y", // declare the sources now
          `${infra}, https://u:p@github.com/a/b.git`, // a credential in an address: refused, asked again
          `${infra}, https://github.com/acme/orders-infra.git`,
          "", // other code
          "prod=https://orders.acme.example, staging=https://staging.acme.example",
          path.join(app, "DAT.docx"),
          "https://acme.atlassian.net/wiki/spaces/ORD/pages/1",
          "https://acme.sharepoint.com/sites/orders",
          "https://acme.atlassian.net/jira/software/projects/ORD",
        ],
      });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /Declare the other sources now/);
      assert.match(r.out, /⚠ one of these is neither a folder that exists here nor a repository address/);
      // The answer typed is echoed like any input; the kit's own warning never repeats it.
      const warning = r.out.split("\n").find((l) => l.includes("⚠ one of these"));
      assert.doesNotMatch(warning, /u:p@/, "the credential typed is never shown by the kit");
      const inputs = JSON.parse(fs.readFileSync(path.join(app, "docs", "manual", "inputs.json"), "utf8"));
      assert.deepEqual(inputs, {
        code: [
          { name: "infra", path: "../../infra", role: "infra" },
          { name: "orders-infra", repo: "https://github.com/acme/orders-infra.git", role: "infra" },
        ],
        app: [
          { env: "prod", url: "https://orders.acme.example" },
          { env: "staging", url: "https://staging.acme.example" },
        ],
        documents: [
          { file: "../../DAT.docx", kind: "dat" },
          { url: "https://acme.atlassian.net/wiki/spaces/ORD/pages/1", kind: "spec" },
        ],
        workspaces: [{ tool: "sharepoint", url: "https://acme.sharepoint.com/sites/orders" }],
        backlog: { tool: "jira", url: "https://acme.atlassian.net/jira/software/projects/ORD" },
      });
      assert.match(r.out, /✔ \d+ files written/);
    } finally {
      remove(app);
    }
  });

  test("interactive: the capture-target question; with “no screenshots”, the sign-in question is skipped", async () => {
    const app = separateFrontApp();
    try {
      const r = await cli(["init", app], { input: ["", "1", "", "3", "", "y"] });
      assert.equal(r.code, 0, r.err);
      assert.match(
        r.out,
        /\? Where will the screenshots be taken\?\n {2}1\) local or demo application\n {2}2\) production, read-only\n {2}3\) no screenshots\n/,
      );
      assert.doesNotMatch(r.out, /How do people sign in/);
      assert.doesNotMatch(r.out, /Open the browser now/, "no follow-up without screenshots");
      assert.match(r.out, /Summary\n {2}Folder/);
      assert.match(r.out, /Sign-in +manual \(not used without screenshots\)/);
      assert.doesNotMatch(r.out, /Capture target/);
      assert.match(fs.readFileSync(path.join(app, "docs", "manual", "doc.config.mjs"), "utf8"), /mode: "none"/);
    } finally {
      remove(app);
    }
  });
});

/** Follow-up steps of init that only record their calls: no npm, no browser (`steps` of createContext). */
function stubSteps(codes = {}) {
  const calls = [];
  const step = (name) => async (ctx, folder, values) => {
    calls.push(values ? `${name} ${JSON.stringify(values)}` : name);
    return codes[name] ?? 0;
  };
  return { calls, steps: { install: step("install"), connect: step("connect"), capture: step("capture") } };
}

describe("capture target (local, demo, production) and the follow-up of init", () => {
  test("interactive, French: production → its URL, the safety reminders, readOnly true; then the browser, then a test screenshot", async () => {
    const app = nextApp();
    try {
      const { calls, steps } = stubSteps();
      const r = await cli(["init", app], {
        input: ["", "2", "", "2", "https://commandes.acme.example/", "1", "", "o", "n", "o", "o"],
        steps,
      });
      assert.equal(r.code, 0, r.err);
      assert.match(
        r.out,
        /\? Où prendre les captures \?\n {2}1\) application locale ou de démo\n {2}2\) production, en lecture seule\n {2}3\) aucune capture\n/,
      );
      // The local address detected from the dev script is never offered as the production's.
      assert.match(r.out, /\? Adresse de la production › https:\/\/commandes\.acme\.example\/\n/);
      assert.match(
        r.out,
        /⚠ Production, en lecture seule — avant la première capture :\n {2}· la lecture seule bloque .*PAS une écriture faite par le serveur.*capture\.forbidden ;\n {2}· le fichier de session \(\.doc-kit\/session\.json\) .*doc-kit connect --forget\) ;\n {2}· les captures montrent des données réelles/,
      );
      assert.match(r.out, /Cible des captures +production — lecture seule/);
      assert.match(r.out, /\? Ouvrir le navigateur maintenant pour vous connecter \? \(O\/n\) › o\n/);
      assert.match(
        r.out,
        /\? Prendre une première capture de test avec --preview, sur la production, en lecture seule \(https:\/\/commandes\.acme\.example\) \? \(O\/n\) › o\n/,
      );
      assert.deepEqual(calls, ["install", "connect", 'capture {"preview":true,"yes":true}']);
      // Done steps leave the list of the next ones.
      const next = r.out
        .split("Étapes suivantes :\n")[1]
        .split("\n\n")[0]
        .split("\n")
        .map((l) => l.trim());
      assert.deepEqual(next.slice(1), ["doc-kit dev"]);
      const docs = path.join(app, "docs", "manual");
      linkKit(docs);
      const c = await loadConfig(docs);
      assert.deepEqual(
        [c.app.url, c.capture.mode, c.capture.target, c.capture.readOnly],
        ["https://commandes.acme.example", "app", "production", true],
      );
    } finally {
      remove(app);
    }
  });

  test("interactive, local: declining the browser asks nothing more; a failed connect stops the follow-up with its exit code", async () => {
    const app = nextApp();
    try {
      let { calls, steps } = stubSteps();
      let r = await cli(["init", app, "--lang", "en"], { input: ["", "", "1", "1", "", "y", "n", "n"], steps });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /Capture target +local — the application on this machine/);
      assert.doesNotMatch(r.out, /Production, read-only — before/);
      assert.match(r.out, /\? Open the browser now to sign in\? \(Y\/n\) › n\n/);
      assert.doesNotMatch(r.out, /test screenshot/);
      assert.deepEqual(calls, []);
      assert.deepEqual(
        r.out
          .split("Next steps:\n")[1]
          .split("\n\n")[0]
          .split("\n")
          .map((l) => l.trim())
          .slice(1),
        ["npm install", "doc-kit connect", "doc-kit capture", "doc-kit dev"],
      );
      assert.match(
        fs.readFileSync(path.join(app, "docs", "manual", "doc.config.mjs"), "utf8"),
        /target: "local",[\s\S]*readOnly: "auto",/,
      );

      ({ calls, steps } = stubSteps({ connect: 3 }));
      r = await cli(["init", app, "--lang", "en", "--dir", "second"], {
        input: ["", "", "1", "1", "", "y", "", ""],
        steps,
      });
      assert.equal(r.code, 3, "the follow-up's exit code");
      assert.deepEqual(calls, ["install", "connect"], "no screenshot after a failed sign-in");
      assert.match(r.out, /The project is written: go on with the steps below/);
      assert.deepEqual(
        r.out
          .split("Next steps:\n")[1]
          .split("\n\n")[0]
          .split("\n")
          .map((l) => l.trim())
          .slice(1),
        ["doc-kit connect", "doc-kit capture", "doc-kit dev"],
      );
    } finally {
      remove(app);
    }
  });

  test("interactive, auth none on a demo URL: target demo, no browser question, a test screenshot; input closed → no", async () => {
    const app = nextApp();
    try {
      const { calls, steps } = stubSteps();
      const r = await cli(["init", app, "--lang", "en", "--auth", "none"], {
        input: ["", "https://demo.acme.example", "1", "", "y"],
        steps,
      });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /Capture target +demo — a demo copy/);
      assert.doesNotMatch(r.out, /Open the browser/);
      assert.match(r.out, /\? Take a first test screenshot with --preview\? \(Y\/n\) › \n/, "the input ends: no");
      assert.deepEqual(calls, []);
      assert.match(fs.readFileSync(path.join(app, "docs", "manual", "doc.config.mjs"), "utf8"), /target: "demo",/);
    } finally {
      remove(app);
    }
  });

  test("--target and --yes: production needs --url, never opens a browser, prints the reminders; refusals (2)", async () => {
    const app = nextApp();
    try {
      const { calls, steps } = stubSteps();
      assert.equal((await cli(["init", app, "--yes", "--target", "production"], { steps })).code, 2);
      const noUrl = await cli(["init", app, "--yes", "--target", "production"]);
      assert.match(noUrl.err, /--target production needs the address of the production\n {2}→ add --url https:\/\//);
      const bad = await cli(["init", app, "--yes", "--target", "staging"]);
      assert.equal(bad.code, 2);
      assert.match(bad.err, /--target: invalid value “staging”\n {2}→ expected: local \| demo \| production/);
      const both = await cli(["init", app, "--yes", "--target", "demo", "--capture", "none"]);
      assert.equal(both.code, 2);
      assert.match(both.err, /--capture none takes none/);
      assert.ok(!fs.existsSync(path.join(app, "docs")), "nothing written");

      const r = await cli(
        ["init", app, "--yes", "--lang", "en", "--target", "production", "--url", "https://orders.acme.example"],
        { steps, input: ["y", "y", "y"] },
      );
      assert.equal(r.code, 0, r.err);
      assert.deepEqual(calls, [], "--yes never runs a follow-up step, even with a terminal");
      assert.doesNotMatch(r.out, /\?/, "no question");
      assert.match(r.out, /Capture target +production — read-only/);
      assert.match(r.out, /⚠ Production, read-only — before the first screenshot:/);
      assert.deepEqual(
        r.out
          .split("Next steps:\n")[1]
          .split("\n\n")[0]
          .split("\n")
          .map((l) => l.trim())
          .slice(1),
        ["npm install", "doc-kit connect", "doc-kit capture", "doc-kit dev"],
      );
      const config = fs.readFileSync(path.join(app, "docs", "manual", "doc.config.mjs"), "utf8");
      assert.match(config, /target: "production",[\s\S]*readOnly: true,/);

      const j = JSON.parse((await cli(["init", app, "--yes", "--json", "--dir", "local", "--target", "local"])).out);
      assert.equal(j.target, "local");
    } finally {
      remove(app);
    }
  });

  test("helpers: loopback addresses, local or demo", () => {
    // The kit's one loopback definition (isLoopbackUrl): a dev server shown on 0.0.0.0 is local too.
    const local = ["http://localhost:3000", "http://app.localhost", "http://127.0.0.1:4173", "http://[::1]:8080"];
    for (const u of [...local, "http://0.0.0.0:5173"]) assert.equal(isLoopback(u), true, u);
    for (const u of ["https://orders.acme.example", "http://10.0.0.5", "not a url"])
      assert.equal(isLoopback(u), false, u);
    assert.equal(localOrDemo("http://localhost:3000"), "local");
    assert.equal(localOrDemo("https://demo.acme.example"), "demo");
  });
});

describe("the spaces of the skeleton (--spaces, ARCHITECTURE.md §6.1a)", () => {
  const PRESET_JOURNEYS = { all: 4, product: 2, takeover: 2, use: 1, none: 4 };
  for (const language of ["en", "fr"])
    for (const [preset, spaces] of Object.entries(SPACE_PRESETS))
      test(`${language}, ${preset}: the skeleton cut to its spaces builds without an error (draft)`, async () => {
        const app = nextApp();
        try {
          const option = spaces.length ? spaces.join(",") : "none";
          const r = await cli(["init", app, "--yes", "--lang", language, "--spaces", option]);
          assert.equal(r.code, 0, r.err);
          const docs = path.join(app, "docs", "manual");
          const content = path.join(docs, "content");
          const toc = JSON.parse(fs.readFileSync(path.join(content, "toc.json"), "utf8"));
          assert.deepEqual(toc.spaces, spaces.length ? spaces : undefined);
          const pages = toc.sections.flatMap((s) => s.groups.flatMap((g) => g.pages.map((p) => p.id)));
          // Every page has its file, and every page file its page.
          const md = allFiles(content)
            .filter((f) => f.endsWith(".md") && f !== "home.md")
            .map((f) => f.split(path.sep).join("/").replace(/\.md$/, ""));
          assert.deepEqual(md.sort(), [...pages].sort());
          assert.equal(toc.journeys.length, PRESET_JOURNEYS[preset]);
          for (const j of toc.journeys)
            if (spaces.length) assert.ok(spaces.includes(j.space), j.title);
            else assert.equal(j.space, undefined, j.title);
          linkKit(docs);
          const b = build({ project: { root: docs }, config: await loadConfig(docs), options: { draft: true } });
          assert.deepEqual(b.errors, []);
          // Only the skeleton's own warnings: guidance to replace, diagrams and captures to make, and in an export
          // the links to another space (said, expected there).
          const own = (w) => ["template", "diagram", "capture"].includes(w.kind) || w.key === "space.excludedLinks";
          assert.deepEqual(
            b.warnings.filter((w) => !own(w)),
            [],
          );
        } finally {
          remove(app);
        }
      });

  test("only Develop: the operating part of Administer goes with it; the recap and the JSON say the spaces", async () => {
    const app = nextApp();
    try {
      const r = await cli(["init", app, "--yes", "--spaces", "develop"]);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /Spaces +develop\n/);
      const toc = JSON.parse(fs.readFileSync(path.join(app, "docs", "manual", "content", "toc.json"), "utf8"));
      assert.deepEqual(
        toc.sections.map((s) => [s.id, s.space]),
        [
          ["operate", "develop"],
          ["take-over", "develop"],
        ],
      );
      assert.ok(fs.existsSync(path.join(app, "docs", "manual", "content", "take-over", "runbook.md")));
      const none = await cli(["init", app, "--yes", "--dir", "none", "--spaces", "none"]);
      assert.match(none.out, /Spaces +none \(one documentation for everyone\)\n/);
      const j = JSON.parse(
        (await cli(["init", app, "--yes", "--json", "--dir", "j", "--spaces", "develop,admin"])).out,
      );
      assert.deepEqual(j.spaces, ["admin", "develop"], "in the skeleton's order");
      const all = JSON.parse((await cli(["init", app, "--yes", "--json", "--dir", "all"])).out);
      assert.deepEqual(all.spaces, ["use", "product", "admin", "develop"], "by default, the four");
    } finally {
      remove(app);
    }
  });

  test("interactive, --spaces given: the question is not asked", async () => {
    const app = nextApp();
    try {
      const { steps } = stubSteps();
      const r = await cli(["init", app, "--lang", "en", "--auth", "none", "--spaces", "use"], {
        input: ["", "", "1", "y"], // name, URL, local, confirm
        steps,
      });
      assert.equal(r.code, 0, r.err);
      assert.doesNotMatch(r.out, /Who is the documentation for/);
      assert.match(r.out, /Spaces +use\n/);
      const toc = JSON.parse(fs.readFileSync(path.join(app, "docs", "manual", "content", "toc.json"), "utf8"));
      assert.deepEqual(toc.spaces, ["use"]);
    } finally {
      remove(app);
    }
  });

  test("interactive: the five choices in their order; changing the answers keeps the spaces chosen as the default", async () => {
    const app = nextApp();
    try {
      const { steps } = stubSteps();
      const r = await cli(["init", app, "--lang", "en", "--auth", "none"], {
        input: [
          ...["", "", "1", "4", "n", "y"], // name, URL, local, users alone, do not create, change the answers
          ...["", "", "", "", "y"], // Enter at every question, then create
        ],
        steps,
      });
      assert.equal(r.code, 0, r.err);
      assert.match(
        r.out,
        new RegExp(
          [
            String.raw`\? Who is the documentation for\? \(its spaces\)`,
            String.raw` {2}1\) use, product, admin, develop — the four audiences: users, product, administrators, developers`,
            String.raw` {2}2\) use, product — users and product owners \(no code\)`,
            String.raw` {2}3\) admin, develop — a takeover: administrators, operators and developers`,
            String.raw` {2}4\) use — the users alone`,
            String.raw` {2}5\) none — one documentation for everyone, without spaces`,
            String.raw` {2}\(1\) › 4`,
          ].join("\n"),
        ),
      );
      const asked = r.out.split("? Who is the documentation for? (its spaces)");
      assert.equal(asked.length, 3, "asked once more after “Change the answers?”");
      assert.match(
        asked[2],
        /^\n(?: {2}\d\) .*\n){5} {2}\(4\) › \n/,
        "the second time, the choice made is the default",
      );
      assert.equal(r.out.match(/Spaces +use\n/g)?.length, 2);
      const toc = JSON.parse(fs.readFileSync(path.join(app, "docs", "manual", "content", "toc.json"), "utf8"));
      assert.deepEqual(toc.spaces, ["use"]);
    } finally {
      remove(app);
    }
  });

  test("refused: an unknown space, one twice, none with others, nothing (exit code 2), nothing written", async () => {
    const app = nextApp();
    try {
      for (const value of ["use,foo", "use,use", "none,use", ""]) {
        const r = await cli(["init", app, "--yes", "--spaces", value]);
        assert.equal(r.code, 2, value);
        assert.match(
          r.err,
          /^✖ --spaces “[^”]*”: expected none, or ids among use, product, admin, develop, each once\n {2}→ e\.g\. --spaces use,product; --spaces none: one documentation without spaces\n/,
        );
      }
      const fr = await cli(["init", app, "--yes", "--lang", "fr", "--spaces", "x"]);
      assert.match(fr.err, /^✖ --spaces « x » : attendu none, ou des identifiants parmi use, product, admin, develop/);
      assert.ok(!fs.existsSync(path.join(app, "docs")), "nothing written");
    } finally {
      remove(app);
    }
  });
});
