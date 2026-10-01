// Guided mode (`doc-kit` alone): the situation detected (init, install, doctor, connect, capture, menu), the
// suggestion printed without a terminal (exit code 0), the step run after confirmation.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { runCli, detectSituation } from "../../cli/doc-kit.mjs";
import { demoCopy, tempDir } from "../tools/helpers.mjs";

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
const withSession = (dir) => {
  fs.mkdirSync(path.join(dir, ".doc-kit"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".doc-kit", "session.json"), '{"cookies":[],"origins":[]}');
};

describe("situation", () => {
  test("no project → init; dependencies missing → install; unusable configuration → doctor", async () => {
    const empty = tempDir();
    const dir = demoCopy();
    try {
      assert.deepEqual(await detectSituation({ project: empty, env: {} }), { step: "init", folder: empty });
      assert.equal((await detectSituation({ cwd: empty, env: {} })).step, "init");
      fs.writeFileSync(path.join(dir, "doc.config.mjs"), 'import { defineConfig } from "doc-kit/config";\nexport default defineConfig({ product: { name: "X" } });\n');
      assert.equal((await detectSituation({ project: dir, env: {} })).step, "install");
      fs.writeFileSync(path.join(dir, "doc.config.mjs"), 'export default { product: { name: "X" }, capture: { storgae: {} } };\n');
      const s = await detectSituation({ project: dir, env: {} });
      assert.equal(s.step, "doctor");
      assert.equal(s.error.key, "config.invalid");
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no session (sign-in needed) → connect; no screenshot → capture; otherwise → menu; auth none skips connect", async () => {
    const dir = demoCopy();
    try {
      assert.equal((await detectSituation({ project: dir, env: {} })).step, "connect");
      withSession(dir);
      assert.equal((await detectSituation({ project: dir, env: {} })).step, "menu");
      fs.rmSync(path.join(dir, "images", "zones"), { recursive: true });
      assert.equal((await detectSituation({ project: dir, env: {} })).step, "capture");
      fs.rmSync(path.join(dir, ".doc-kit"), { recursive: true });
      const config = path.join(dir, "doc.config.mjs");
      fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace(/auth: \{[^}]*\},/, 'auth: { adapter: "none" },'));
      assert.equal((await detectSituation({ project: dir, env: {} })).step, "capture");
      // The session file named by the environment.
      assert.equal((await detectSituation({ project: dir, env: { DOC_KIT_SESSION: "elsewhere.json" } })).step, "capture");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("guided mode", () => {
  test("without a terminal: prints the next step, runs nothing, exit code 0; --json", async () => {
    const dir = demoCopy();
    try {
      const r = await cli(["--project", dir]);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /^doc-kit \d+\.\d+\.\d+ — guided mode\nAcme Orders: the project is ready, but there is no session to capture the application yet\.\n\nNext step: doc-kit connect\n\(no terminal: nothing was run\)\n$/);
      withSession(dir);
      const menu = await cli(["--project", dir, "--lang", "fr"]);
      assert.match(menu.out, /Acme Orders : le projet est en place\.\n\nÉtape suivante : doc-kit dev · doc-kit audit · doc-kit build · doc-kit doctor/);
      const j = JSON.parse((await cli(["--project", dir, "--json"])).out);
      assert.equal(j.step, "menu");
      assert.deepEqual(j.next, ["doc-kit dev", "doc-kit audit", "doc-kit build", "doc-kit doctor"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("interactive: declining runs nothing; the menu runs the chosen command", async () => {
    const dir = demoCopy();
    try {
      const no = await cli(["--project", dir], { input: ["n"] });
      assert.equal(no.code, 0);
      assert.match(no.out, /\? Run doc-kit connect now\? \(Y\/n\) › n\nWhen you are ready: doc-kit connect\n$/);
      withSession(dir);
      const doctor = await cli(["--project", dir], { input: ["4"], env: { CLAUDE_CONFIG_DIR: dir } });
      assert.match(doctor.out, /\? What do you want to do\?\n {2}1\) doc-kit dev/);
      assert.match(doctor.out, /doc-kit \d+\.\d+\.\d+ doctor — /, "doctor ran");
      assert.equal(doctor.code, 0);
      const quit = await cli(["--project", dir], { input: ["5"] });
      assert.equal(quit.code, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("interactive, no project: confirms, then init asks its questions (answers typed ahead are kept)", async () => {
    const app = tempDir("doc-kit-app-");
    try {
      fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "acme-orders", dependencies: { next: "15.0.0" } }));
      fs.mkdirSync(path.join(app, "app"));
      const r = await cli(["--project", app], { input: ["y", "", "1", "", "2", "y"] });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /No documentation project in .*\.\n\? Run doc-kit init .* now\? \(Y\/n\) › y\n/);
      assert.match(r.out, /\? Product name \(Acme Orders\) › \n/);
      assert.match(r.out, /✔ \d+ files written in /);
      const config = fs.readFileSync(path.join(app, "docs", "manual", "doc.config.mjs"), "utf8");
      assert.match(config, /auth: \{ adapter: "none" \}/);
      assert.match(config, /coverage: \[\{ adapter: "next-app-router", app: "\.\.\/\.\.\/app" \}\]/);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});
