// The engine's git helpers take the process launcher of the CLI context (RULES.md S2, M4): `git`, `isIgnored` and
// `isTracked` (engine/dev/environment.mjs), `trackedByGit` (engine/check/secrets.mjs). The commands that use them
// pass `ctx.exec` (`check secrets`, `export`, the audit's secrets measure; `doctor` in doctor.test.mjs): a spy or a
// fake answers here, and no real git is started.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { git, isIgnored, isTracked } from "../../engine/dev/environment.mjs";
import { trackedByGit } from "../../engine/check/secrets.mjs";
import { measureSecrets } from "../../engine/audit/optional.mjs";
import { loadProject } from "../../engine/project/load.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy, tempDir } from "../tools/helpers.mjs";

/** A spy launcher: every call recorded as [bin, args, options], answered by `answer(args)`. */
function spy(answer) {
  const calls = [];
  return {
    calls,
    exec: (bin, args, options) => {
      calls.push([bin, args, options]);
      return answer(args);
    },
  };
}
const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
const INSIDE = ok("true\n");
/** What defaultExec answers on a repository whose configuration names a program. */
const REFUSED = { status: 128, stdout: "", stderr: "", refused: ["core.fsmonitor = evil"] };
const isInsideQuestion = (args) => args[0] === "rev-parse" && args[1] === "--is-inside-work-tree";
/** A repository: "true" to the work-tree question, `then` to the command. */
const repository = (then) => spy((args) => (isInsideQuestion(args) ? INSIDE : then));

// Never created nor read: the launcher answers for git.
const ROOT = path.resolve("no-such-folder", "project");

describe("git(cwd, args, { exec })", () => {
  test("asks whether cwd is in a work tree, then runs the command, both in cwd; returns { status, stdout } trimmed", () => {
    const s = repository(ok("  0123abc\n"));
    assert.deepEqual(git(ROOT, ["rev-parse", "HEAD"], { exec: s.exec }), { status: 0, stdout: "0123abc" });
    assert.deepEqual(s.calls, [
      ["git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT }],
      ["git", ["rev-parse", "HEAD"], { cwd: ROOT }],
    ]);
  });

  test("a non-zero status of the command is an answer (check-ignore: not ignored)", () => {
    const s = repository({ status: 1, stdout: "", stderr: "" });
    assert.deepEqual(git(ROOT, ["check-ignore", "-q", "x"], { exec: s.exec }), { status: 1, stdout: "" });
  });

  test("null, and nothing more is asked, when the work-tree question gets null, a refused result, “false” or a failure", () => {
    for (const [why, answer] of [
      ["git missing", null],
      ["refused", REFUSED],
      ["not a work tree", ok("false\n")],
      ["not a repository", { status: 128, stdout: "", stderr: "fatal: not a git repository" }],
    ]) {
      const s = spy(() => answer);
      assert.equal(git(ROOT, ["rev-parse", "HEAD"], { exec: s.exec }), null, why);
      assert.equal(s.calls.length, 1, why);
    }
  });

  test("null when the command itself gets null or a refused result; the same status 128 without `refused` is an answer", () => {
    assert.equal(git(ROOT, ["ls-files"], { exec: repository(null).exec }), null);
    assert.equal(git(ROOT, ["ls-files"], { exec: repository(REFUSED).exec }), null);
    assert.deepEqual(git(ROOT, ["ls-files"], { exec: repository({ status: 128, stdout: "", stderr: "" }).exec }), {
      status: 128,
      stdout: "",
    });
  });
});

describe("isTracked and isIgnored with a fake launcher", () => {
  const SESSION = path.join(ROOT, ".doc-kit", "session.json");

  test("isTracked: ls-files --error-unmatch of the path relative to root; true, false, or null when git cannot tell", () => {
    const s = repository(ok(".doc-kit/session.json\n"));
    assert.equal(isTracked(ROOT, SESSION, { exec: s.exec }), true);
    assert.deepEqual(s.calls[1], [
      "git",
      ["ls-files", "--error-unmatch", "--", path.join(".doc-kit", "session.json")],
      { cwd: ROOT },
    ]);
    assert.equal(isTracked(ROOT, SESSION, { exec: repository({ status: 1, stdout: "", stderr: "" }).exec }), false);
    assert.equal(isTracked(ROOT, SESSION, { exec: () => null }), null);
    assert.equal(isTracked(ROOT, SESSION, { exec: () => REFUSED }), null);
  });

  test("isIgnored: git's answer wins over the .gitignore; without git, the .gitignore is read", () => {
    const dir = tempDir("doc-kit-ignore-");
    try {
      fs.writeFileSync(path.join(dir, ".gitignore"), ".doc-kit/\n");
      const s = repository(ok());
      assert.equal(isIgnored(dir, ".doc-kit/session.json", { exec: s.exec }), true);
      assert.deepEqual(s.calls[1], [
        "git",
        ["check-ignore", "-q", "--no-index", ".doc-kit/session.json"],
        { cwd: dir },
      ]);
      // The minimal pair: the same folder, git says "not ignored".
      const no = repository({ status: 1, stdout: "", stderr: "" });
      assert.equal(isIgnored(dir, ".doc-kit/session.json", { exec: no.exec }), false);
      // git missing or refused (status 128 is no "not ignored"): the project's own .gitignore.
      assert.equal(isIgnored(dir, ".doc-kit/session.json", { exec: () => null }), true);
      assert.equal(isIgnored(dir, ".doc-kit/session.json", { exec: () => REFUSED }), true);
      assert.equal(isIgnored(dir, "dist/site.html", { exec: () => REFUSED }), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("trackedByGit: one ls-files of the file's name, in its folder; false when git is missing or refused", () => {
    const s = spy(() => ok("session.json\n"));
    assert.equal(trackedByGit(SESSION, { exec: s.exec }), true);
    assert.deepEqual(s.calls, [
      ["git", ["ls-files", "--error-unmatch", "--", "session.json"], { cwd: path.join(ROOT, ".doc-kit") }],
    ]);
    assert.equal(trackedByGit(SESSION, { exec: () => ({ status: 1, stdout: "", stderr: "" }) }), false);
    assert.equal(trackedByGit(SESSION, { exec: () => null }), false);
    assert.equal(trackedByGit(SESSION, { exec: () => REFUSED }), false);
  });
});

/** A copy of the demo project with a session file. */
function withSession() {
  const dir = demoCopy();
  fs.mkdirSync(path.join(dir, ".doc-kit"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".doc-kit", "session.json"), JSON.stringify({ cookies: [], origins: [] }));
  return dir;
}
/** A launcher whose git says the session file is tracked (`status` 0) or not (1); nothing else answers. */
const lsFiles = (status) => spy((args) => (args[0] === "ls-files" ? { status, stdout: "", stderr: "" } : null));

async function cli(args, exec, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env,
    exec,
  });
  return { code, out, err };
}

describe("the commands pass the context's launcher", () => {
  test("check secrets: a launcher saying “tracked” gives the sessionTracked finding, in English and French; a refused git warns", async () => {
    const dir = withSession();
    try {
      const tracked = lsFiles(0);
      const r = await cli(["check", "secrets", "--project", dir], tracked.exec);
      assert.equal(r.code, 1, r.err);
      assert.match(
        r.err,
        /^✖ the session file is tracked by git: \.doc-kit\/session\.json\n {2}→ remove it from git \(git rm --cached\)/m,
      );
      assert.deepEqual(
        tracked.calls.filter(([bin]) => bin === "git"),
        [["git", ["ls-files", "--error-unmatch", "--", "session.json"], { cwd: path.join(dir, ".doc-kit") }]],
      );
      const fr = await cli(["check", "secrets", "--project", dir, "--lang", "fr"], lsFiles(0).exec);
      assert.match(fr.err, /^✖ le fichier de session est suivi par git : \.doc-kit\/session\.json$/m);
      // The minimal pair: the same project, git says "not tracked".
      const clean = await cli(["check", "secrets", "--project", dir], lsFiles(1).exec);
      assert.equal(clean.code, 0, clean.err);
      assert.doesNotMatch(clean.err, /tracked by git/);
      // git refused (a configuration that names a program): the context's warning, in the folder of the session.
      const refused = await cli(["check", "secrets", "--project", dir], () => REFUSED);
      assert.equal(refused.code, 0, refused.err);
      assert.match(
        refused.err,
        /^⚠ git not run in .*\.doc-kit: its configuration names a program that git could run \(core\.fsmonitor = evil\)$/m,
      );
      assert.ok(refused.err.includes(`git not run in ${path.join(dir, ".doc-kit")}:`), refused.err);
      assert.doesNotMatch(refused.err, /tracked by git/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("audit: the secrets measure asks the launcher, directly and through the CLI (blocking › secrets)", async () => {
    const dir = withSession();
    try {
      const { config } = await loadProject({ project: dir, env: {} });
      const measure = (exec) => measureSecrets({ project: { root: dir }, config, data: null, env: {}, exec });
      assert.deepEqual((await measure(lsFiles(0).exec)).findings, [
        { where: ".doc-kit/session.json", kind: "sessionTracked" },
      ]);
      assert.deepEqual((await measure(lsFiles(1).exec)).findings, []);
      // Through the CLI: `blocking › secrets` counts it.
      const blocking = async (status) => {
        const r = await cli(["audit", "--project", dir, "--json"], lsFiles(status).exec, { DOC_KIT_NO_BROWSER: "1" });
        assert.equal(r.code, 0, r.err);
        return JSON.parse(r.out).indicators.blocking.secrets;
      };
      assert.equal(await blocking(0), 1);
      assert.equal(await blocking(1), 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("export: EXPORT.json takes the source's HEAD from the launcher; null when git has no answer", async () => {
    const dir = demoCopy();
    const out = tempDir("doc-kit-export-");
    try {
      const head = "0123456789abcdef0123456789abcdef01234567";
      const s = spy((args) => (isInsideQuestion(args) ? INSIDE : args[1] === "HEAD" ? ok(`${head}\n`) : null));
      const r = await cli(["export", path.join(out, "with"), "--project", dir], s.exec);
      assert.equal(r.code, 0, r.err);
      const commit = (name) => JSON.parse(fs.readFileSync(path.join(out, name, "EXPORT.json"), "utf8")).source.commit;
      assert.equal(commit("with"), head);
      assert.deepEqual(s.calls, [
        ["git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir }],
        ["git", ["rev-parse", "HEAD"], { cwd: dir }],
      ]);
      // The minimal pair: no repository there.
      assert.equal((await cli(["export", path.join(out, "without"), "--project", dir], () => null)).code, 0);
      assert.equal(commit("without"), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
