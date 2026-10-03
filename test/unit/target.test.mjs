// Capture target (capture.target: local, demo, production): the configuration rule (production is read-only only,
// also against <PREFIX>_READONLY), the production banner and confirmation of `capture` (interactive yes / no; without a
// terminal, --yes or exit code 2), `demo` refused, the production line of `connect`, the doctor line and the guided
// mode's banner. No browser is ever started: the launcher is a stub (`launch` of createContext).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { runCli } from "../../cli/doc-kit.mjs";
import { readOnlyMode } from "../../engine/capture/capture.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { demoConfig, demoCopy, tempDir } from "../tools/helpers.mjs";

/** Runs the CLI; `input`: lines typed at the questions; `launch`: browser launcher (a stub). */
async function cli(args, { input, env = {}, launch } = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env,
    launch,
    ...(input ? { stdin: Readable.from([input.map((l) => l + "\n").join("")]), interactive: true } : {}),
  });
  return { code, out, err };
}

/** A launcher that records its call and stops right there, like an unreachable application (exit code 3). */
function stubLaunch() {
  const calls = [];
  const launch = async (options) => {
    calls.push(options);
    throw new KitError(EXIT.ENVIRONMENT, "capture.unreachable", { url: "stub", error: "no browser in the unit tests" });
  };
  return { calls, launch };
}

/**
 * A copy of the demo project with a production target, a public app (auth none unless given) and a plan of 2 entries.
 * One folder per configuration: the commands import doc.config.mjs once per path (module cache).
 */
function productionProject(capture = {}, { auth = "none" } = {}) {
  const dir = demoCopy();
  const config = {
    kit: "*",
    product: { name: "Acme Orders" },
    version: { file: "version.txt", pattern: "^([\\d.]+)" },
    app: { url: "https://orders.acme.example" },
    auth: { adapter: auth },
    capture: { target: "production", plans: "captures/plans-prod", forbidden: ["^/orders/\\d+/approval$"], ...capture },
  };
  fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);
  fs.mkdirSync(path.join(dir, "captures", "plans-prod"), { recursive: true });
  const entry = (id, route) => ({ id, title: id, route, zones: [{ css: "header" }, { css: "nav" }, { css: "main" }] });
  fs.writeFileSync(
    path.join(dir, "captures", "plans-prod", "prod.mjs"),
    `export const CAPTURES = ${JSON.stringify([entry("prod-orders", "/orders"), entry("prod-settings", "/settings")], null, 2)};\n`,
  );
  return dir;
}

describe("configuration", () => {
  test("default local; production with readOnly false → validation error (2); a false READONLY variable → 2", async () => {
    assert.equal((await demoConfig()).capture.target, "local");
    for (const target of ["local", "demo", "production"])
      assert.equal((await demoConfig((c) => ((c.capture.target = target), c))).capture.target, target);
    await assert.rejects(
      demoConfig((c) => ((c.capture.target = "staging"), c)),
      (e) =>
        e instanceof KitError &&
        e.code === EXIT.USAGE &&
        e.details.some((d) => d.path === "capture.target" && d.key === "enum"),
    );
    await assert.rejects(
      demoConfig((c) => Object.assign(c, { capture: { ...c.capture, target: "production", readOnly: false } })),
      (e) =>
        e instanceof KitError &&
        e.code === EXIT.USAGE &&
        e.details.some((d) => d.path === "capture.readOnly" && d.key === "productionReadOnly"),
    );
    for (const readOnly of ["auto", true])
      assert.equal(
        (await demoConfig((c) => Object.assign(c, { capture: { ...c.capture, target: "production", readOnly } })))
          .capture.readOnly,
        readOnly,
      );
    // readOnly false stays allowed on a local or demo copy.
    assert.equal(
      (await demoConfig((c) => Object.assign(c, { capture: { ...c.capture, target: "demo", readOnly: false } })))
        .capture.readOnly,
      false,
    );

    const dir = productionProject();
    const writable = productionProject({ readOnly: false });
    try {
      const { calls, launch } = stubLaunch();
      const r = await cli(["capture", "--project", dir, "--yes"], { env: { ACME_ORDERS_READONLY: "0" }, launch });
      assert.equal(r.code, 2);
      assert.match(
        r.err,
        /^✖ ACME_ORDERS_READONLY turns read-only off, but capture\.target is "production"\n {2}→ unset ACME_ORDERS_READONLY/,
      );
      const invalid = await cli(["capture", "--project", writable, "--yes"], { launch });
      assert.equal(invalid.code, 2);
      assert.match(invalid.err, /capture\.readOnly: read-only cannot be turned off on production/);
      assert.equal(calls.length, 0);
    } finally {
      for (const d of [dir, writable]) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  test("effective read-only: production always, otherwise auto follows the session", () => {
    assert.equal(readOnlyMode({ target: "production", readOnly: "auto" }, false), true);
    assert.equal(readOnlyMode({ target: "local", readOnly: "auto" }, false), false);
    assert.equal(readOnlyMode({ target: "local", readOnly: "auto" }, true), true);
    assert.equal(readOnlyMode({ target: "demo", readOnly: true }, false), true);
    assert.equal(readOnlyMode({ target: "local", readOnly: false }, true), false);
  });
});

describe("capture on production", () => {
  test("without a terminal: --yes required (2, nothing launched); with --yes: the banner, read-only without a session, then the run", async () => {
    const dir = productionProject();
    try {
      const { calls, launch } = stubLaunch();
      const refused = await cli(["capture", "--project", dir], { launch });
      assert.equal(refused.code, 2);
      assert.match(refused.out, /^PRODUCTION — read-only · 2 screenshots · https:\/\/orders\.acme\.example\n$/);
      assert.match(
        refused.err,
        /^✖ capture on production not confirmed \(no terminal to ask\)\n {2}→ add --yes to confirm a production capture\n$/,
      );
      assert.equal((await cli(["capture", "--project", dir, "--json"], { launch })).code, 2, "--json needs --yes too");
      assert.equal(calls.length, 0, "no browser before the confirmation");

      const yes = await cli(["capture", "prod-orders", "--project", dir, "--yes"], { launch });
      assert.equal(yes.code, 3, "the stub stops the run like an unreachable application");
      assert.match(
        yes.out,
        /^PRODUCTION — read-only · 1 screenshot · https:\/\/orders\.acme\.example\n1 capture · https:\/\/orders\.acme\.example · session: none · read-only: on\n/,
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].headless, true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("in a terminal: the question defaults to No (Enter declines, exit code 0); y runs; -y asks nothing", async () => {
    const dir = productionProject();
    try {
      const { calls, launch } = stubLaunch();
      const enter = await cli(["capture", "--project", dir], { input: [""], launch });
      assert.equal(enter.code, 0);
      assert.match(
        enter.out,
        /^PRODUCTION — read-only · 2 screenshots · https:\/\/orders\.acme\.example\n\? Capture 2 screens on production now\? \(y\/N\) › \nNothing was captured\.\n$/,
      );
      const no = await cli(["capture", "--project", dir, "--lang", "fr"], { input: ["n"], launch });
      assert.match(
        no.out,
        /^PRODUCTION — lecture seule · 2 captures · https:\/\/orders\.acme\.example\n\? Capturer 2 écrans sur la production maintenant \? \(o\/N\) › n\nRien n'a été capturé\.\n$/,
      );
      assert.equal(calls.length, 0);
      const yes = await cli(["capture", "--project", dir], { input: ["y"], launch });
      assert.equal(yes.code, 3);
      assert.match(yes.out, /› y\n2 captures · .* · read-only: on\n/);
      const short = await cli(["capture", "--project", dir, "-y"], { input: [], launch });
      assert.doesNotMatch(short.out, /\?/);
      assert.equal(calls.length, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a local or demo target asks nothing (no banner)", async () => {
    const dir = productionProject({ target: "demo" });
    try {
      const { calls, launch } = stubLaunch();
      const r = await cli(["capture", "--project", dir], { launch });
      assert.equal(r.code, 3);
      assert.doesNotMatch(r.out, /PRODUCTION/);
      assert.match(r.out, /^2 captures · .* · session: none · read-only: off\n/);
      assert.equal(calls.length, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("demo, connect, doctor and the guided mode with a production target", () => {
  test("demo is refused (2) and runs nothing; connect prints the production line first", async () => {
    let dir = productionProject({ setup: "captures/setup.mjs" });
    try {
      const marker = path.join(dir, "ran.txt");
      fs.writeFileSync(
        path.join(dir, "captures", "setup.mjs"),
        `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marker)}, "x");\n`,
      );
      const demo = await cli(["demo", "--project", dir]);
      assert.equal(demo.code, 2);
      assert.match(
        demo.err,
        /^✖ capture\.target is "production" in doc\.config\.mjs: a demo data script never runs against production \(https:\/\/orders\.acme\.example\)\n {2}→ prepare the demo data on a local or demo copy/,
      );
      assert.ok(!fs.existsSync(marker), "the setup script never ran");

      fs.rmSync(dir, { recursive: true, force: true });
      dir = productionProject({}, { auth: "manual" });
      const { calls, launch } = stubLaunch();
      const connect = await cli(["connect", "--project", dir], { launch });
      assert.equal(connect.code, 3);
      assert.match(
        connect.out,
        /^PRODUCTION — https:\/\/orders\.acme\.example: sign in with your own account; the session saved gives access to production\.\nA Chromium window is open/,
      );
      assert.equal(calls[0].headless, false, "connect opens a visible window (the stub opened none)");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("doctor: the target line; ⚠ production without any forbidden route; nothing with capture.mode none", async () => {
    const claude = tempDir("doc-kit-claude-");
    const dir = productionProject();
    const config = path.join(dir, "doc.config.mjs");
    const doctor = async () => (await cli(["doctor", "--project", dir], { env: { CLAUDE_CONFIG_DIR: claude } })).out;
    try {
      assert.match(
        await doctor(),
        /^✔ capture target: PRODUCTION, read-only \(https:\/\/orders\.acme\.example\); 1 forbidden route$/m,
      );
      fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace(/"forbidden": \[[^\]]*\]/, '"forbidden": []'));
      const out = await doctor();
      assert.match(
        out,
        /^⚠ capture target: PRODUCTION, read-only \(https:\/\/orders\.acme\.example\) — no forbidden route declared: check pages that write on render\n {2}→ read the code of each detail page/m,
      );
      fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace('"target": "production"', '"target": "local"'));
      assert.match(await doctor(), /^✔ capture target: local application \(https:\/\/orders\.acme\.example\)$/m);
      fs.writeFileSync(
        config,
        fs.readFileSync(config, "utf8").replace('"target": "local"', '"target": "local", "mode": "none"'),
      );
      assert.doesNotMatch(await doctor(), /capture target/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(claude, { recursive: true, force: true });
    }
  });

  test("guided mode: the production banner before connect (whose question says a browser opens) and before capture", async () => {
    const signIn = productionProject({}, { auth: "manual" });
    const dir = productionProject();
    try {
      const r = await cli(["--project", signIn], { input: ["n"] });
      assert.equal(r.code, 0);
      assert.match(
        r.out,
        /no session to capture the application yet\.\nPRODUCTION — read-only · https:\/\/orders\.acme\.example\n\? Run doc-kit connect now\? A browser window opens: sign in there, then press Enter here\. \(Y\/n\) › n\n/,
      );
      fs.rmSync(path.join(dir, "images", "zones"), { recursive: true });
      const capture = await cli(["--project", dir]);
      assert.match(
        capture.out,
        /no screenshot yet\.\nPRODUCTION — read-only · https:\/\/orders\.acme\.example\n\nNext step: doc-kit capture\n/,
      );
      // Confirmed after the banner: capture runs without asking again (the stub stops it, exit code 3).
      const { calls, launch } = stubLaunch();
      const run = await cli(["--project", dir], { input: ["y"], launch });
      assert.equal(run.code, 3);
      assert.equal((run.out.match(/^\? /gm) || []).length, 1, run.out);
      assert.match(
        run.out,
        /\? Run doc-kit capture now\? \(Y\/n\) › y\n\nPRODUCTION — read-only · 2 screenshots · https:\/\/orders\.acme\.example\n2 captures · /,
      );
      assert.equal(calls.length, 1);
    } finally {
      for (const d of [signIn, dir]) fs.rmSync(d, { recursive: true, force: true });
    }
  });
});
