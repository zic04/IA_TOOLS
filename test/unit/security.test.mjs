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
import { GENERIC, trackedByGit } from "../../engine/check/secrets.mjs";
import { git, isTracked } from "../../engine/dev/environment.mjs";
import { safeGitArgs, isSafeRef, riskyGitConfig, parseGitConfig, resolveOnPath } from "../../engine/util/safe-git.mjs";
import { defaultExec } from "../../cli/common.mjs";
import { isLocalHost } from "../../engine/dev/server.mjs";
import { checkExistence, createRegistryClient, privateRegistries } from "../../engine/facts/network.mjs";
import { KIT_ROOT, demoCopy, tempDir, noExec } from "../tools/helpers.mjs";
import { MEASURABLE_MS } from "../tools/growth.mjs";

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

  test("one network gateway (RULES.md S12): no file but engine/facts/network.mjs names a public registry", () => {
    // Every request to a package registry or vulnerability database goes through createRegistryClient, which
    // refuses a private package (AUDIT.md S13). Naming a registry's address anywhere else would bypass it.
    const HOSTS = /\bhttps?:\/\/(?:registry\.npmjs\.(?:org|com)|registry\.yarnpkg\.com|pypi\.org|api\.osv\.dev)\b/;
    assert.deepEqual(
      offending(HOSTS, (f) => f === "engine/facts/network.mjs"),
      [],
    );
  });

  test("facts --network sends nothing the configuration does not list (RULES.md S12, SECURITY.md › Network)", async () => {
    // A package a lock proves public and nothing declares private: still never asked while unlisted, whoever asks
    // (checkExistence, the client itself); asked once listed. The minimal pairs: facts-network-allow.test.mjs.
    const dir = tempDir("doc-kit-security-allow-");
    try {
      const item = { name: "react", ecosystem: "npm", version: "18.3.1", direct: true, public: true };
      const urls = [];
      const fetch = async (url) => (
        urls.push(url),
        { ok: true, status: 200, json: async () => ({ version: "19.0.0" }) }
      );
      for (const allow of [undefined, [], ["npm:React"], ["npm:*"]]) {
        const registries = privateRegistries(dir, { items: [item], allow });
        const [out] = await checkExistence([item], fetch, { registries });
        assert.equal(out.unlisted, true, JSON.stringify(allow));
        await assert.rejects(createRegistryClient({ fetch, registries }).describe(item), /network gateway/);
      }
      assert.deepEqual(urls, [], "nothing sent");
      const listed = privateRegistries(dir, { items: [item], allow: ["npm:react"] });
      await checkExistence([item], fetch, { registries: listed });
      assert.deepEqual(urls, ["https://registry.npmjs.org/react/latest"], "the control: listed, asked once");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("git only through the hardened path (engine/util/safe-git.mjs): no direct spawn of git", () => {
    assert.deepEqual(offending(/spawn(Sync)?\(\s*["']git["']/), []);
    // One launcher (spawnHardened): no other file looks git up on the PATH or hardens its arguments itself, so no
    // other file can start git without the configuration check, the hardened arguments and the cleaned environment.
    assert.deepEqual(
      offending(/resolveOnPath\(\s*["']git["']|\bsafeGitArgs\(|\bgitEnv\(/, (f) => f === "engine/util/safe-git.mjs"),
      [],
    );
    const launcher = files.find(({ f }) => f === "engine/util/safe-git.mjs").text;
    for (const step of ["riskyGitConfig(dir)", "safeGitArgs(args)", "gitEnv(env, untrusted)", "shell: false"])
      assert.ok(launcher.includes(step), `spawnHardened: ${step}`);
  });

  test("git writes only in engine/inputs/repos.mjs (RULES.md S2): clone, fetch and checkout of the sources, hardened", () => {
    // Every other git command of the kit is read-only; the shared repositories of the sources are the one exception.
    const WRITE = /(\[|^)\s*["'](clone|fetch|checkout|pull|push|reset|merge|rebase|commit|stash|init|am)["']\s*,/;
    assert.deepEqual(
      offending(WRITE, (f) => f === "engine/inputs/repos.mjs"),
      [],
    );
    const repos = files.find(({ f }) => f === "engine/inputs/repos.mjs").text;
    for (const setting of [
      "core.hooksPath=",
      "core.symlinks=false",
      "core.fsmonitor=false",
      "protocol.ext.allow=never",
      "protocol.file.allow=never",
      "submodule.recurse=false",
      "transfer.fsckObjects=true",
      "--no-recurse-submodules",
      "--end-of-options",
      'GIT_TERMINAL_PROMPT: "0"',
      "isSafeRepoUrl(",
      "isSafeRef(",
    ])
      assert.ok(repos.includes(setting), `engine/inputs/repos.mjs: ${setting}`);
  });
});

describe("no catastrophic backtracking on untrusted text (ReDoS)", () => {
  // Run in a worker (test/tools/redos-worker.mjs): an expression that never ends blocks its thread, so the test
  // terminates the worker after a timeout and names the check that was running.
  const BUDGET_MS = 300;
  const GROWTH_RATIO = 8;
  // The time from which a ratio is trusted: the harness measures a suspect step longer until it reaches it.
  const GROWTH_MIN_MS = MEASURABLE_MS;
  // A hang detector, not a budget, re-armed at each check's start: one check (its growth steps included) takes a few
  // seconds; the whole run, every reader registered, two to three minutes on a loaded machine.
  const TIMEOUT_MS = 60_000;
  test(`every scanner of untrusted text stays under ${BUDGET_MS} ms on adversarial input`, async () => {
    const worker = new Worker(new URL("../tools/redos-worker.mjs", import.meta.url));
    const results = [];
    let canary = null;
    let running = null;
    const outcome = await new Promise((resolve) => {
      let timer = null;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => resolve({ hang: running }), TIMEOUT_MS);
      };
      arm();
      worker.on("message", (m) => {
        if (m.start) {
          running = m.start;
          arm();
        } else if (m.canary) canary = m.canary;
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
    // Four times the input, more than eight times the time (and long enough to measure): quadratic, whatever its
    // time at the size above — a quadratic scanner with a small constant would block on a large file. Measured from
    // N to 4N and from 4N to 16N, and further (up to 256N) while a step under the floor may hide a quadratic growth,
    // so that a constant of a few milliseconds, or a fast machine, does not hide one: the canary, a scanner written to
    // be quadratic, proves it (test/tools/growth.mjs, test/unit/redos-growth.test.mjs).
    const quadratic = (steps) => steps.find((g) => g.ms >= GROWTH_MIN_MS && g.ratio > GROWTH_RATIO);
    assert.ok(quadratic(canary || []), `the canary was not seen as quadratic: ${JSON.stringify(canary)}`);
    const grown = results
      .map((r) => [r.name, quadratic(r.growth)])
      .filter(([, g]) => g)
      .map(([name, g]) => `${name}: ×${g.ratio.toFixed(1)} (${g.ms.toFixed(0)} ms) on ${JSON.stringify(g.input)}…`);
    assert.deepEqual(grown, []);
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
  test("safeGitArgs: no file system monitor, no pager, no git in a submodule; diff, show and log without external diff or textconv", () => {
    assert.deepEqual(safeGitArgs(["ls-files"]), [
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.pager=cat",
      "-c",
      "diff.ignoreSubmodules=dirty",
      "-c",
      "diff.submodule=short",
      "-c",
      "submodule.recurse=false",
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
    let dir2;
    try {
      fs.mkdirSync(path.join(dir, ".git"));
      const write = (text) => fs.writeFileSync(path.join(dir, ".git", "config"), text);
      write(
        '[core]\n\tfsmonitor = false\n\tpager = less\n[filter "lfs"]\n\tclean = git-lfs clean -- %f\n\tprocess = git-lfs filter-process\n[remote "origin"]\n\turl = x\n',
      );
      assert.deepEqual(riskyGitConfig(path.join(dir)), []);
      dir2 = tempDir("doc-kit-git-");
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
      // The CLI's process launcher refuses git there, without starting any process (safe-git.test.mjs: its spawn).
      const r = defaultExec("git", ["ls-files"], { cwd: path.join(dir2, "app") });
      assert.equal(r.status, 128);
      assert.equal(r.refused.length, 5);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      if (dir2) fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  test("the engine's own git (git, isTracked, trackedByGit without an exec) is refused there too, without starting any process", () => {
    // A repository made by hand: a git started there answers "true" to the work-tree question, so null proves that
    // none was started. Its core.fsmonitor names a program, which the hardening would override anyway.
    const dir = tempDir("doc-kit-git-");
    try {
      for (const d of ["objects", "refs"]) fs.mkdirSync(path.join(dir, ".git", d), { recursive: true });
      fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
      fs.writeFileSync(path.join(dir, ".git", "config"), '[core]\n\tfsmonitor = "touch pwned"\n');
      assert.deepEqual(riskyGitConfig(dir), ["core.fsmonitor = touch pwned"]);
      assert.equal(git(dir, ["rev-parse", "--is-inside-work-tree"]), null);
      assert.equal(isTracked(dir, path.join(dir, "session.json")), null);
      assert.equal(trackedByGit(path.join(dir, "session.json")), false);
      assert.ok(!fs.existsSync(path.join(dir, "pwned")));
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
        exec: noExec,
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

  test("Terraform state and variables, PuTTY and Apple keys, VPN profiles, encrypted files, credentials, an environment's settings and a session of any size are left out; their neighbours are kept", async () => {
    const docs = demoCopy();
    const target = path.join(tempDir("doc-kit-export-"), "copy");
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(docs, rel)), { recursive: true });
      fs.writeFileSync(path.join(docs, rel), text);
    };
    try {
      const secrets = [
        "infra/terraform.tfstate",
        "infra/terraform.tfstate.backup",
        "keys/deploy.ppk",
        "vpn/office.ovpn",
        "backup.tar.gpg",
        "credentials.json",
        "config/appsettings.Production.json",
        "config/appsettings.Production.json.bak",
        "infra/terraform.tfvars",
        "keys/AuthKey_ABC123.p8",
        "web/.htpasswd",
        "client_secret.json",
        "deploy/kubeconfig",
      ];
      const neighbours = [
        "content/tfstate.md",
        "keys/ppk-howto.md",
        "vpn/ovpn.md",
        "gpg-keys.md",
        "credentials.example.json",
        "config/appsettings.json",
        "infra/terraform.tfvars.example",
        "keys/p8.md",
        "web/.htaccess",
        "client_secret.md",
        "deploy/kubeconfig.md",
      ];
      for (const f of [...secrets, ...neighbours]) write(f, "{}");
      // A session holding megabytes of local storage (it was read whole only up to 2 MB, so not recognised), and
      // data files as large, or named like one, that are not sessions.
      const large = "x".repeat(3 * 1024 * 1024);
      const origins = [{ origin: "https://app.example.org", localStorage: [{ name: "cache", value: large }] }];
      write(
        "captures/large-session.json",
        JSON.stringify({ cookies: [{ name: "sid", value: "v" }], origins }, null, 2),
      );
      write("captures/origins-first.json", JSON.stringify({ origins, cookies: [] }));
      write("content/large-data.json", JSON.stringify({ title: "Cookies", cookies: [large] }));
      write("content/cookies.json", JSON.stringify({ cookies: ["analytics"] }));
      // Data over 64 KB that merely starts with a "cookies" list (SEC-12): not a session.
      const recipes = Array.from({ length: 2000 }, (_, i) => ({ id: i, flavour: "chocolate chip" }));
      write("content/recipes.json", JSON.stringify({ cookies: recipes }, null, 2));
      let err = "";
      const code = await runCli(["export", target, "--project", docs], {
        stdout: { write: () => {} },
        stderr: { write: (s) => (err += s) },
        env: {},
        exec: noExec,
      });
      assert.equal(code, 0, err);
      for (const f of [...secrets, "captures/large-session.json", "captures/origins-first.json"])
        assert.ok(!fs.existsSync(path.join(target, f)), `${f} left out`);
      for (const f of [...neighbours, "content/large-data.json", "content/cookies.json", "content/recipes.json"])
        assert.ok(fs.existsSync(path.join(target, f)), `${f} kept`);
    } finally {
      fs.rmSync(docs, { recursive: true, force: true });
      fs.rmSync(path.dirname(target), { recursive: true, force: true });
    }
  });
});
