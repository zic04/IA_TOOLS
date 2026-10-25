// doctor: one line per check (✔ ⚠ ✖ + → the fix), exit codes 0 / 1 / 2 / 3, --json, --network.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy, tempDir, noExec } from "../tools/helpers.mjs";

let claude;
before(() => {
  claude = tempDir("doc-kit-claude-"); // never the real ~/.claude
});
after(() => fs.rmSync(claude, { recursive: true, force: true }));

/** A Chromium found, by default: the result never depends on the machine running the tests (AUDIT.md M7). */
const CHROMIUM_OK = async () => ({
  ok: true,
  path: "/opt/chromium/chrome",
  command: "npx playwright install chromium",
});

async function cli(args, env = {}, io = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: { CLAUDE_CONFIG_DIR: claude, ...env },
    chromium: CHROMIUM_OK,
    exec: noExec,
    ...io,
  });
  return { code, out, err };
}
const line = (out, re) => out.split("\n").find((l) => re.test(l));

/** A copy of the demo project with a configuration written for the test. */
function project(config) {
  const dir = demoCopy();
  if (config)
    fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);
  return dir;
}
const base = { kit: "*", product: { name: "Acme Orders" }, version: { file: "version.txt", pattern: "^([\\d.]+)" } };

describe("doctor", () => {
  test("a healthy project: every line ✔ or ⚠, exit code 0", async () => {
    const dir = project();
    try {
      const r = await cli(["doctor", "--project", dir]);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /^doc-kit \d+\.\d+\.\d+ doctor — /);
      assert.match(r.out, /^✔ Node\.js \d+\.\d+\.\d+ \(required: >=20\)$/m);
      assert.match(r.out, /^✔ kit dependencies: marked [\d.]+, playwright [\d.]+$/m);
      assert.match(r.out, /^✔ Chromium for Playwright: \/opt\/chromium\/chrome$/m);
      assert.match(r.out, /^⚠ Claude Code skill not installed \(optional\)\n {2}→ doc-kit skill install$/m);
      assert.match(r.out, /^✔ kit \d+\.\d+\.\d+ accepted by the project \(\^0\.4\.0\)$/m);
      assert.match(r.out, /^✔ doc\.config\.mjs valid$/m);
      assert.match(r.out, /^✔ table of contents: content\/toc\.json$/m);
      assert.match(r.out, /^✔ documented version 1\.4\.0 \(read in version\.txt\)$/m);
      assert.match(r.out, /^✔ \.doc-kit\/ and dist\/ are excluded from git$/m);
      assert.match(r.out, /^⚠ no session yet \(\.doc-kit\/session\.json\)\n {2}→ doc-kit connect$/m);
      assert.match(r.out, /^✔ theme contrasts: \d+ pairs at WCAG level/m);
      assert.match(r.out, /\d+ OK · \d+ warnings? · 0 problems: ready\.\n$/);
      for (const l of r.out
        .split("\n")
        .slice(2)
        .filter((x) => x && !/^ {2}→ /.test(x) && !/^\d+ OK/.test(x)))
        assert.match(l, /^[✔⚠✖] /, l);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("stale facts (ARCHITECTURE.md §6.9/§6.10): a facts/<source>.json whose recorded commit differs from the application's current HEAD, read via the commit seam (never a real git call in the test)", async () => {
    const dir = project();
    try {
      const stale = await cli(["doctor", "--project", dir], {}, { commit: () => "deadbeef" });
      assert.equal(stale.code, 0, stale.out); // a warning, never a failure
      const l = line(stale.out, /^⚠ facts behind the application's HEAD: /);
      assert.ok(l, stale.out);
      for (const source of ["agents", "api", "db", "dependencies", "env", "secrets", "tests"])
        assert.ok(l.includes(source), l);
      assert.match(stale.out, /^ {2}→ run doc-kit facts --source /m);

      // The commit the demo's facts recorded: the application at that commit is up to date.
      const recorded = JSON.parse(fs.readFileSync(path.join(dir, "facts", "env.json"), "utf8")).commit;
      const fresh = await cli(["doctor", "--project", dir], {}, { commit: () => recorded });
      assert.match(fresh.out, /^✔ facts: at the application's current HEAD$/m);
      assert.doesNotMatch(fresh.out, /facts behind the application's HEAD/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("paths: version file, coverage source, masking file; contrasts; session age and expiry", async () => {
    const dir = project({
      ...base,
      version: { file: "../nowhere/package.json" },
      coverage: [{ adapter: "next-app-router", app: "../nowhere/app" }],
      masking: { env: ["../nowhere/.env"] },
      theme: { colors: { brand: "#9db8ff", "on-brand": "#ffffff" } },
    });
    try {
      const r = await cli(["doctor", "--project", dir]);
      assert.equal(r.code, 0, "warnings only");
      assert.match(
        r.out,
        /^⚠ version file not found: \.\.\/nowhere\/package\.json \(the site shows 0\.0\.0\)\n {2}→ fix version\.file/m,
      );
      assert.match(r.out, /^⚠ coverage source not found \(next-app-router, app\): \.\.\/nowhere\/app$/m);
      assert.match(r.out, /^⚠ masking file not found: \.\.\/nowhere\/\.env/m);
      assert.match(line(r.out, /^⚠ \d+ colour pairs? below/), /light on-brand on brand [\d.]+ < 4\.5/);

      fs.mkdirSync(path.join(dir, ".doc-kit"));
      const session = path.join(dir, ".doc-kit", "session.json");
      fs.writeFileSync(
        session,
        JSON.stringify({ cookies: [{ name: "sid", value: "x", expires: Date.now() / 1000 + 3600 }], origins: [] }),
      );
      assert.match(
        (await cli(["doctor", "--project", dir])).out,
        /^✔ session \.doc-kit\/session\.json, saved 1 minute ago$/m,
      );
      const old = new Date(Date.now() - 3 * 86400000);
      fs.utimesSync(session, old, old);
      assert.match(
        (await cli(["doctor", "--project", dir])).out,
        /^⚠ session \.doc-kit\/session\.json saved 3 days ago: it may have expired\n {2}→ doc-kit connect/m,
      );
      fs.writeFileSync(session, JSON.stringify({ cookies: [{ name: "sid", value: "x", expires: 1000 }], origins: [] }));
      assert.match((await cli(["doctor", "--project", dir])).out, /^⚠ session \.doc-kit\/session\.json expired/m);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a version 0.0.0 or 1.0.0 contradicted by version.txt, VERSION or CHANGELOG.md → ⚠ “version never incremented?”", async () => {
    const dir = project({ ...base, version: { file: "app/package.json" }, app: { dir: "app" } });
    try {
      fs.mkdirSync(path.join(dir, "app"));
      fs.writeFileSync(
        path.join(dir, "app", "package.json"),
        JSON.stringify({ name: "acme-orders-frontend", version: "1.0.0" }),
      );
      fs.writeFileSync(path.join(dir, "app", "version.txt"), "1.0.152\n");
      let r = await cli(["doctor", "--project", dir]);
      assert.equal(r.code, 0, "a warning, not a failure");
      assert.match(
        r.out,
        /^⚠ documented version 1\.0\.0 \(read in app\/package\.json\), but app\/version\.txt says 1\.0\.152: version never incremented\?\n {2}→ point version\.file/m,
      );
      assert.match(r.out, /^✔ application folder \(app\.dir\): app$/m);
      fs.rmSync(path.join(dir, "app", "version.txt"));
      fs.writeFileSync(
        path.join(dir, "app", "CHANGELOG.md"),
        "# Changelog\n\n## [Unreleased]\n\n## [2.3.0] - 2026-09-01\n\n## [2.2.0] - 2026-08-01\n",
      );
      r = await cli(["doctor", "--project", dir, "--lang", "fr"]);
      assert.match(
        r.out,
        /^⚠ version documentée 1\.0\.0 \(lue dans app\/package\.json\), mais app\/CHANGELOG\.md indique 2\.3\.0 : version jamais incrémentée \?/m,
      );
      fs.writeFileSync(path.join(dir, "app", "CHANGELOG.md"), "# Changelog\n\n## [1.0.0] - 2026-01-01\n");
      assert.match(
        (await cli(["doctor", "--project", dir])).out,
        /^✔ documented version 1\.0\.0 \(read in app\/package\.json\)$/m,
        "nothing contradicts it",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("capture.mode none: no session warning, no plans folder expected; app.dir not found → ⚠", async () => {
    const dir = project({ ...base, app: { dir: "../nowhere" }, capture: { mode: "none", plans: "no-plans" } });
    try {
      const r = await cli(["doctor", "--project", dir]);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /^✔ no session needed \(capture\.mode: none, no screenshot\)$/m);
      assert.doesNotMatch(r.out, /no session yet|capture plans folder not found/);
      assert.match(r.out, /^⚠ application folder not found \(app\.dir\): \.\.\/nowhere\n {2}→ fix app\.dir/m);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("capture.forbidden on an application that is not on a loopback address and calls another local port → ⚠ (SECURITY.md › Read-only captures)", async () => {
    const env = [
      "API_URL=http://192.168.1.20:8000/api",
      "ASSETS=http://192.168.1.20:3000/static",
      "DATABASE_URL=postgres://localhost:5432/orders",
      "ANALYTICS_URL=https://stats.example.com",
      "TILES_URL=http://localhost:9000",
    ].join("\n");
    const config = (app, capture = {}) => ({
      ...base,
      app: { url: app },
      masking: { env: [".env.local"] },
      capture: { forbidden: ["^/orders/\\d+/approval$"], ...capture },
    });
    const run = async (c, lang = "en") => {
      const dir = project(c);
      try {
        fs.writeFileSync(path.join(dir, ".env.local"), env);
        return await cli(["doctor", "--project", dir, "--lang", lang]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };
    const warned = await run(config("http://192.168.1.20:3000"));
    assert.equal(warned.code, 0, "a warning only");
    assert.match(
      warned.out,
      /^⚠ capture\.forbidden with http:\/\/192\.168\.1\.20:3000, not a loopback address: during captures, Chromium blocks the pages' calls to 192\.168\.1\.20:8000, localhost:9000 \(a local address, an API on another port\)\n {2}→ point app\.url at localhost or 127\.0\.0\.1/m,
    );
    assert.match(
      (await run(config("http://192.168.1.20:3000"), "fr")).out,
      /^⚠ capture\.forbidden avec http:\/\/192\.168\.1\.20:3000, qui n'est pas une adresse de bouclage : pendant les captures, Chromium bloque les appels des pages vers 192\.168\.1\.20:8000, localhost:9000/m,
    );
    // The same project, one thing changed: no warning.
    for (const [why, c] of [
      ["a loopback application (the kit lets the calls through)", config("http://localhost:3000")],
      [
        "no forbidden route (the browser loads the pages itself)",
        config("http://192.168.1.20:3000", { forbidden: [] }),
      ],
      [
        "production (a local address is not the application's)",
        config("http://192.168.1.20:3000", { target: "production" }),
      ],
    ])
      assert.doesNotMatch((await run(c)).out, /Chromium blocks/, why);
  });

  test("messages in the project's language (config.language), even with an invalid configuration; --lang wins", async () => {
    const fr = project({ ...base, language: "fr" });
    const broken = project({ ...base, language: "fr", capture: { storgae: {} } });
    try {
      const r = await cli(["doctor", "--project", fr], { DOC_KIT_LANG: "en" });
      assert.equal(r.code, 0, r.out);
      assert.match(
        r.out,
        /^✔ Node\.js \d+\.\d+\.\d+ \(requis : >=20\)$/m,
        "the environment checks, before the configuration is read",
      );
      assert.match(r.out, /^✔ doc\.config\.mjs valide$/m);
      assert.match(r.out, /avertissements? · 0 problème : prêt\.\n$/);
      assert.match((await cli(["doctor", "--project", fr, "--lang", "en"])).out, /^✔ doc\.config\.mjs valid$/m);
      const invalid = await cli(["doctor", "--project", broken]);
      assert.equal(invalid.code, 2);
      assert.match(invalid.out, /^✖ doc\.config\.mjs : 1 erreur de configuration\n {4}capture\.storgae: clé inconnue/m);
    } finally {
      fs.rmSync(fr, { recursive: true, force: true });
      fs.rmSync(broken, { recursive: true, force: true });
    }
  });

  test("Chromium missing → ✖ with the exact install command, exit code 3 (through the seam, whatever the machine)", async () => {
    const dir = project();
    try {
      const chromium = async () => ({
        ok: false,
        path: null,
        command: 'node "/kit/node_modules/playwright/cli.js" install chromium',
      });
      const r = await cli(["doctor", "--project", dir], {}, { chromium });
      assert.equal(r.code, 3, r.out); // an environment problem
      assert.match(
        r.out,
        /^✖ Chromium for Playwright is not installed \(needed by connect, capture, view, check tables\)\n {2}→ node "\/kit\/node_modules\/playwright\/cli\.js" install chromium$/m,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test(".gitignore without .doc-kit/ → ✖ and exit code 1", async () => {
    const dir = project();
    try {
      fs.writeFileSync(path.join(dir, ".gitignore"), "dist/\n");
      const r = await cli(["doctor", "--project", dir]);
      assert.equal(r.code, 1);
      assert.match(
        r.out,
        /^✖ \.doc-kit\/ is not excluded from git: the session could be committed\n {2}→ add the line \.doc-kit\/ to \.gitignore$/m,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("git through the context's launcher: check-ignore and ls-files answer the .gitignore and session checks; a refused git warns", async () => {
    const dir = project();
    try {
      fs.mkdirSync(path.join(dir, ".doc-kit"));
      fs.writeFileSync(
        path.join(dir, ".doc-kit", "session.json"),
        JSON.stringify({ cookies: [{ name: "sid", value: "x", expires: Date.now() / 1000 + 3600 }], origins: [] }),
      );
      const calls = [];
      /** A repository whose git ignores everything or nothing, and tracks the session or not. */
      const repository =
        ({ ignored, tracked }) =>
        (bin, args, options) => {
          calls.push([bin, args, options]);
          const status = (yes) => ({ status: yes ? 0 : 1, stdout: "", stderr: "" });
          if (bin !== "git") return null;
          if (args[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n", stderr: "" };
          if (args[0] === "check-ignore") return status(ignored);
          return args[0] === "ls-files" ? status(tracked) : null;
        };
      const r = await cli(["doctor", "--project", dir], {}, { exec: repository({ ignored: true, tracked: true }) });
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /^✔ \.doc-kit\/ and dist\/ are excluded from git$/m);
      assert.match(r.out, /^✖ the session \.doc-kit\/session\.json is tracked by git: it contains sign-in cookies$/m);
      assert.deepEqual(
        // git's calls (`claude --version` aside: the Claude Code check, its own test below).
        calls.filter(([bin, args]) => bin === "git" && args[0] !== "rev-parse"),
        [
          ["git", ["check-ignore", "-q", "--no-index", ".doc-kit/session.json"], { cwd: dir }],
          ["git", ["check-ignore", "-q", "--no-index", "dist/site.html"], { cwd: dir }],
          ["git", ["ls-files", "--error-unmatch", "--", path.join(".doc-kit", "session.json")], { cwd: dir }],
        ],
      );
      // The minimal pair: the same project, git ignores nothing (the copy's .gitignore says otherwise) and the
      // session is not tracked.
      const no = await cli(["doctor", "--project", dir], {}, { exec: repository({ ignored: false, tracked: false }) });
      assert.match(no.out, /^✖ \.doc-kit\/ is not excluded from git: the session could be committed$/m);
      assert.doesNotMatch(no.out, /is tracked by git/);
      // git refused (a configuration that names a program, SECURITY.md): the warning of the context, once per
      // folder (the project's; app.dir has its own), and the copy's own .gitignore read instead.
      const refused = { status: 128, stdout: "", stderr: "", refused: ["core.fsmonitor = evil"] };
      const r2 = await cli(["doctor", "--project", dir], {}, { exec: (bin) => (bin === "git" ? refused : null) });
      const warnings = r2.err.split("\n").filter((l) => l.startsWith(`⚠ git not run in ${dir}:`));
      assert.deepEqual(warnings, [
        `⚠ git not run in ${dir}: its configuration names a program that git could run (core.fsmonitor = evil)`,
      ]);
      assert.match(r2.out, /^✔ \.doc-kit\/ and dist\/ are excluded from git$/m);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the former content/sommaire.json is not a table of contents (ARCHITECTURE.md §6.7) → ✖ and exit code 1", async () => {
    const dir = project();
    try {
      fs.renameSync(path.join(dir, "content/toc.json"), path.join(dir, "content/sommaire.json"));
      const r = await cli(["doctor", "--project", dir]);
      assert.equal(r.code, 1);
      assert.match(r.out, /^✖ table of contents not found: content\/toc\.json\n {2}→ create it/m);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("invalid configuration → 2 (details), incompatible kit → 3 (upgrade), no project → 2", async () => {
    const dir = project({ ...base, capture: { storgae: {} } });
    try {
      const invalid = await cli(["doctor", "--project", dir]);
      assert.equal(invalid.code, 2);
      assert.match(
        invalid.out,
        /^✖ doc\.config\.mjs: 1 configuration error\n {4}capture\.storgae: unknown key\n {2}→ fix the keys/m,
      );
      fs.writeFileSync(
        path.join(dir, "doc.config.mjs"),
        `export default ${JSON.stringify({ ...base, kit: "^9.0.0" })};`,
      );
      const old = await cli(["doctor", "--project", dir]);
      assert.equal(old.code, 3);
      assert.match(
        old.out,
        /^✖ the project requires kit \^9\.0\.0, the installed kit is [\d.]+\n {2}→ doc-kit upgrade shows what changes/m,
      );
      assert.match(old.out, /^✔ doc\.config\.mjs valid$/m, "the rest of the configuration is still checked");
      const none = tempDir();
      try {
        const r = await cli(["doctor", "--project", none]);
        assert.equal(r.code, 2);
        assert.match(
          r.out,
          /^✖ no documentation project \(doc\.config\.mjs\) found from .*\n {2}→ create one with doc-kit init/m,
        );
        assert.match(r.out, /^✔ Node\.js/m, "the environment is still checked");
      } finally {
        fs.rmSync(none, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--json and --network (application reachable, then not)", async () => {
    const server = http.createServer((req, res) => res.writeHead(302, { location: "/login" }).end());
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}`;
    const dir = project({ ...base, app: { url } });
    try {
      const r = await cli(["doctor", "--project", dir, "--network", "--json"]);
      const j = JSON.parse(r.out);
      assert.equal(j.code, 0);
      assert.deepEqual(
        j.checks.find((c) => c.id === "network"),
        { id: "network", status: "ok", category: "env", text: `${url} answers (HTTP 302)` },
      );
      await new Promise((r) => server.close(r));
      const down = await cli(["doctor", "--project", dir, "--network", "--lang", "fr"]);
      assert.equal(down.code, 3);
      assert.match(
        down.out,
        new RegExp(`^✖ ${url.replace(/\./g, "\\.")} ne répond pas \\(.+\\)\\n {2}→ démarrez l'application`, "m"),
      );
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Claude Code on the PATH: older than 2.1.295 warns (the agents' guard would not run); none found, nothing", async () => {
    const dir = tempDir("doc-kit-doctor-claude-"); // no project: the environment checks still run
    try {
      /** A launcher with a `claude` that answers `out` (status 0), and nothing else on the PATH. */
      const calls = [];
      const claudeSays =
        (out, status = 0) =>
        (bin, args) => {
          calls.push([bin, args]);
          return bin === "claude" ? { status, stdout: out, stderr: "" } : null;
        };
      const run = (exec, lang = "en") => cli(["doctor", "--project", dir, "--lang", lang], {}, { exec });
      const old = await run(claudeSays("2.1.294 (Claude Code)\n"));
      assert.match(
        old.out,
        /^⚠ Claude Code 2\.1\.294 is older than 2\.1\.295: the agents' guard does not run .*\n {2}→ update Claude Code \(claude update\), then start a new session$/m,
      );
      assert.deepEqual(
        calls.find(([bin]) => bin === "claude"),
        ["claude", ["--version"]],
      );
      const oldFr = await run(claudeSays("2.0.9\n"), "fr");
      assert.match(
        oldFr.out,
        /^⚠ Claude Code 2\.0\.9 est antérieur à 2\.1\.295 : la garde des agents ne s'exécute pas/m,
      );
      assert.match(
        oldFr.out,
        /\n {2}→ mettez Claude Code à jour \(claude update\), puis ouvrez une nouvelle session$/m,
      );
      // The minimal pair: the first version that knows the hook's form, and a later one.
      for (const version of ["2.1.295", "2.1.310", "3.0.0"]) {
        const r = await run(claudeSays(`${version} (Claude Code)\n`));
        assert.match(
          r.out,
          new RegExp(
            `^✔ Claude Code ${version.split(".").join("\\.")} \\(the agents' guard needs 2\\.1\\.295 or later\\)$`,
            "m",
          ),
        );
        assert.doesNotMatch(r.out, /is older than/);
      }
      // No claude on the PATH, a claude that fails or gives no version: not a word of it.
      for (const exec of [noExec, claudeSays("2.1.0", 1), claudeSays("Claude Code\n")]) {
        const r = await run(exec);
        assert.doesNotMatch(r.out, /Claude Code \d|Claude Code .*older/, r.out);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
