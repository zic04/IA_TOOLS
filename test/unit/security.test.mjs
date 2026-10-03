// Security rules of the kit (RULES.md, SECURITY.md), checked on every run of the tests so that a later version
// cannot bring a fixed problem back:
//   - the source never runs a shell, eval, new Function, or git without the hardened path;
//   - every expression that scans untrusted text (secrets, OWASP heuristics, routes, variables) stays fast on
//     adversarial input (no catastrophic backtracking: ReDoS);
//   - git: hardened options, references checked, risky repository configurations refused;
//   - dev server: only its own Host (DNS rebinding);
//   - export: never a session, a key or an environment file, at any depth.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { Worker } from "node:worker_threads";
import { GENERIC } from "../../engine/check/secrets.mjs";
import { safeGitArgs, isSafeRef, riskyGitConfig, parseGitConfig, resolveOnPath } from "../../engine/util/safe-git.mjs";
import { defaultExec } from "../../cli/common.mjs";
import { isLocalHost } from "../../engine/dev/server.mjs";
import { KIT_ROOT, demoCopy, tempDir } from "../tools/helpers.mjs";

/** Source files of the kit (what ships): engine, cli, adapters, skill scripts, templates. */
function sources() {
  const out = [];
  for (const dir of ["engine", "cli", "adapters", "skill", "templates"]) {
    for (const f of fs.readdirSync(path.join(KIT_ROOT, dir), { recursive: true })) {
      if (/\.(mjs|js|cjs)$/.test(String(f))) out.push(path.join(dir, String(f)).split(path.sep).join("/"));
    }
  }
  return out;
}

describe("source rules (RULES.md § Security)", () => {
  const files = sources().map((f) => ({ f, text: fs.readFileSync(path.join(KIT_ROOT, f), "utf8") }));
  const offending = (re, allowed = () => false) =>
    files.flatMap(({ f, text }) =>
      text
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => re.test(line) && !/^\s*(\/\/|\*)/.test(line) && !allowed(f, line))
        .map(({ n }) => `${f}:${n}`),
    );

  test("never a shell: no shell: true, no exec/execSync of child_process", () => {
    assert.deepEqual(offending(/shell:\s*true/), []);
    assert.deepEqual(offending(/\b(execSync|execFileSync)\s*\(|from\s+["']node:child_process["'].*\bexec\b/), []);
    // The only shell allowed: `npm install` without any argument from outside, on Windows (npm is a .cmd file).
    assert.deepEqual(
      offending(/shell:\s*[^f\s]/, (f, line) => /spawnSync\("npm", \["install"\]/.test(line)),
      [],
    );
  });

  test("never eval, never new Function", () => {
    assert.deepEqual(
      offending(/(^|[^.\w])eval\s*\(|new\s+Function\s*\(/, (f) => f === "engine/facts/security.mjs"),
      [],
    );
  });

  test("git only through the hardened path (engine/util/safe-git.mjs): no direct spawn of git", () => {
    assert.deepEqual(offending(/spawn(Sync)?\(\s*["']git["']/), []);
    // Each module that spawns a process itself, and calls git, hardens the arguments.
    for (const { f, text } of files.filter(({ text }) => /spawnSync\(bin/.test(text)))
      assert.match(text, /safeGitArgs\(/, f);
  });
});

describe("no catastrophic backtracking on untrusted text (ReDoS)", () => {
  // Run in a worker (test/tools/redos-worker.mjs): an expression that never ends blocks its thread, so the test
  // terminates the worker after a timeout and names the check that was running.
  const BUDGET_MS = 300;
  const TIMEOUT_MS = 60_000;
  test(`every scanner of untrusted text stays under ${BUDGET_MS} ms on adversarial input`, async () => {
    const worker = new Worker(new URL("../tools/redos-worker.mjs", import.meta.url));
    const results = [];
    let running = null;
    const outcome = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ hang: running }), TIMEOUT_MS);
      worker.on("message", (m) => {
        if (m.start) running = m.start;
        else if (m.done) {
          clearTimeout(timer);
          resolve({});
        } else results.push(m);
      });
      worker.on("error", (e) => {
        clearTimeout(timer);
        resolve({ error: e });
      });
    });
    await worker.terminate();
    assert.equal(outcome.error, undefined, String(outcome.error));
    assert.equal(
      outcome.hang,
      undefined,
      `${outcome.hang}: still running after ${TIMEOUT_MS / 1000} s (catastrophic backtracking)`,
    );
    assert.ok(results.length > 20, `${results.length} checks`);
    const slow = results
      .filter((r) => r.ms >= BUDGET_MS)
      .map((r) => `${r.name}: ${r.ms.toFixed(0)} ms on ${JSON.stringify(r.input)}…`);
    assert.deepEqual(slow, []);
  });

  test("the private key detector still finds a key (headers, indentation, blank lines)", () => {
    const key =
      "-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\n  MIIEowIBAAKCAQEA1234567890abcdefABCDEF  \n\nabcdefghijklmnopqrstuvwxyz0123456789+/==\n-----END RSA PRIVATE KEY-----\n";
    const d = GENERIC.find((x) => x.kind === "privateKey");
    d.re.lastIndex = 0;
    const m = d.re.exec(key);
    assert.ok(m && d.accept(m));
  });
});

describe("git on an untrusted repository (engine/util/safe-git.mjs)", () => {
  test("safeGitArgs: no file system monitor, no pager; diff, show and log without external diff or textconv", () => {
    assert.deepEqual(safeGitArgs(["ls-files"]), [
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.pager=cat",
      "--no-pager",
      "ls-files",
    ]);
    assert.deepEqual(safeGitArgs(["diff", "--relative", "x"]).slice(-5), [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--relative",
      "x",
    ]);
  });

  test("isSafeRef: hashes and revision expressions yes; options, spaces, colons no", () => {
    for (const r of ["abc123", "HEAD", "HEAD~2", "v1.0^", "main@{1}", "origin/main", "release-1.2"])
      assert.ok(isSafeRef(r), r);
    for (const r of ["--output=/tmp/x", "-p", "a b", "a:b", "", "a\nb", null, 42, "x".repeat(300)])
      assert.ok(!isSafeRef(r), String(r));
  });

  test("riskyGitConfig: commands named by the repository are found; Git LFS and harmless values are not", () => {
    const dir = tempDir("doc-kit-git-");
    try {
      fs.mkdirSync(path.join(dir, ".git"));
      const write = (text) => fs.writeFileSync(path.join(dir, ".git", "config"), text);
      write(
        '[core]\n\tfsmonitor = false\n\tpager = less\n[filter "lfs"]\n\tclean = git-lfs clean -- %f\n\tprocess = git-lfs filter-process\n[remote "origin"]\n\turl = x\n',
      );
      assert.deepEqual(riskyGitConfig(path.join(dir)), []);
      const dir2 = tempDir("doc-kit-git-");
      fs.mkdirSync(path.join(dir2, ".git"));
      fs.mkdirSync(path.join(dir2, "app"));
      fs.writeFileSync(
        path.join(dir2, ".git", "config"),
        '[core]\n\tfsmonitor = "touch /tmp/pwned"\n[diff "x"]\n\ttextconv = sh evil.sh\n[filter "y"]\n\tclean = ./clean.sh\n[diff]\n\texternal = ./d.sh\n[include]\n\tpath = ../other\n',
      );
      const found = riskyGitConfig(path.join(dir2, "app"));
      assert.deepEqual(
        found.map((l) => l.split(" = ")[0]),
        ["core.fsmonitor", "diff.x.textconv", "filter.y.clean", "diff.external", "include.path"],
      );
      // The CLI's process launcher refuses git there, without starting any process.
      const r = defaultExec("git", ["ls-files"], { cwd: path.join(dir2, "app") });
      assert.equal(r.status, 128);
      assert.equal(r.refused.length, 5);
      fs.rmSync(dir2, { recursive: true, force: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("parseGitConfig: sections, subsections, keys in any case, quoted values", () => {
    assert.deepEqual(parseGitConfig('[Core]\n  FSMonitor = "x y"\n# c\n[diff "A b"]\ntextconv=z\nbare\n'), [
      ["core.fsmonitor", "x y"],
      ["diff.A b.textconv", "z"],
      ["diff.A b.bare", "true"],
    ]);
  });

  test("resolveOnPath: never the folder read, never a relative PATH entry (Windows looks there first)", () => {
    const dir = tempDir("doc-kit-bin-");
    const bin = tempDir("doc-kit-bin-");
    try {
      // On Windows, a process started without a shell is a .com or .exe file.
      const file = process.platform === "win32" ? "tool.exe" : "tool";
      fs.writeFileSync(path.join(dir, file), "");
      fs.writeFileSync(path.join(bin, file), "");
      const env = { PATH: [".", dir, bin].join(path.delimiter) };
      assert.equal(resolveOnPath("tool", { env, exclude: [dir] }), path.join(bin, file));
      assert.equal(resolveOnPath("missing", { env, exclude: [] }), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });
});

describe("dev server: DNS rebinding", () => {
  test("only its own Host (localhost, 127.0.0.1, [::1], with its port) is served", () => {
    for (const h of ["127.0.0.1:4000", "localhost:4000", "LOCALHOST:4000", "[::1]:4000"])
      assert.ok(isLocalHost(h, 4000), h);
    for (const h of ["evil.test:4000", "127.0.0.1", "127.0.0.1:4001", "127.0.0.1.evil.test:4000", "", undefined])
      assert.ok(!isLocalHost(h, 4000), String(h));
  });
});

describe("export never carries a secret", () => {
  test("session files (anywhere, by name or by content), keys, credentials and .doc-kit/ at any depth are left out", async () => {
    const docs = demoCopy();
    const target = path.join(tempDir("doc-kit-export-"), "copy");
    try {
      fs.writeFileSync(
        path.join(docs, "my-session.json"),
        JSON.stringify({ cookies: [{ name: "sid", value: "x" }], origins: [] }),
      );
      fs.mkdirSync(path.join(docs, "content", ".doc-kit"), { recursive: true });
      fs.writeFileSync(path.join(docs, "content", ".doc-kit", "session.json"), "{}");
      for (const f of [".envrc", ".npmrc", "server.pem", "id_ed25519", "content/deploy.key"])
        fs.writeFileSync(path.join(docs, f), "secret");
      let err = "";
      const code = await runCli(["export", target, "--project", docs], {
        stdout: { write: () => {} },
        stderr: { write: (s) => (err += s) },
        env: { DOC_KIT_SESSION: "elsewhere.json" },
      });
      assert.equal(code, 0, err);
      for (const f of [
        "my-session.json",
        "content/.doc-kit",
        ".envrc",
        ".npmrc",
        "server.pem",
        "id_ed25519",
        "content/deploy.key",
      ])
        assert.ok(!fs.existsSync(path.join(target, f)), f);
      assert.ok(fs.existsSync(path.join(target, "content", "toc.json")));
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
      fs.rmSync(path.dirname(target), { recursive: true, force: true });
    }
  });
});
