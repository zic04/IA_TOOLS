// `doc-kit hooks`: git hooks that refresh facts and sync after a pull or a branch switch, added to (never
// replacing) existing hooks. No real git: the exec seam answers rev-parse.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hookBlock, withBlock, HOOKS } from "../../cli/commands/hooks.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy, tempDir } from "../tools/helpers.mjs";

describe("hooks", () => {
  test("withBlock: added to an empty or existing hook, replaced on reinstall, removed alone; post-checkout only on a branch switch", () => {
    const block = hookBlock("post-merge", "docs/manual");
    assert.match(block, /cd "\$\(git rev-parse --show-toplevel\)\/docs\/manual" && npx --no-install doc-kit facts/);
    assert.match(hookBlock("post-checkout", "docs/manual"), /^# >>> doc-kit.*\n\[ "\$3" = "1" \] && \(/m);
    const fresh = withBlock("", block);
    assert.ok(fresh.startsWith("#!/bin/sh\n\n# >>> doc-kit"));
    const existing = "#!/bin/sh\nnpm run lint\n";
    const both = withBlock(existing, block);
    assert.match(both, /^#!\/bin\/sh\nnpm run lint\n\n# >>> doc-kit/);
    assert.equal(withBlock(both, block), both, "a reinstall does not add a second block");
    assert.equal(withBlock(both, null).trim(), existing.trim(), "uninstall keeps the user's own hook");
    assert.equal(withBlock(fresh, null), "", "a hook that only held the block is removed");
  });

  test("CLI: install into the folder git names, status, uninstall; documentation outside the repository → 2", async () => {
    const repo = tempDir("doc-kit-hooks-");
    try {
      const docs = path.join(repo, "docs", "manual");
      demoCopy(docs);
      fs.mkdirSync(path.join(repo, ".git", "hooks"), { recursive: true });
      fs.writeFileSync(path.join(repo, ".git", "hooks", "post-merge"), "#!/bin/sh\necho mine\n");
      const exec = (bin, args) => {
        if (bin !== "git") return null;
        if (args.join(" ") === "rev-parse --show-toplevel") return { status: 0, stdout: repo + "\n" };
        if (args.join(" ") === "rev-parse --git-common-dir") return { status: 0, stdout: ".git\n" };
        if (args.join(" ") === "rev-parse --git-path hooks") return { status: 0, stdout: ".git/hooks\n" };
        return { status: 1, stdout: "" };
      };
      let out = "";
      const io = { stdout: { write: (s) => (out += s) }, stderr: { write: () => {} }, env: {}, exec };
      assert.equal(await runCli(["hooks", "install", "--project", docs, "--app", repo], io), 0);
      for (const hook of HOOKS)
        assert.match(fs.readFileSync(path.join(repo, ".git", "hooks", hook), "utf8"), /# >>> doc-kit/);
      assert.match(
        fs.readFileSync(path.join(repo, ".git", "hooks", "post-merge"), "utf8"),
        /^#!\/bin\/sh\necho mine\n/,
      );
      if (process.platform !== "win32")
        assert.equal(fs.statSync(path.join(repo, ".git", "hooks", "post-checkout")).mode & 0o111, 0o111);
      assert.match(out, /post-merge: refreshes the facts and the sync report/);
      out = "";
      assert.equal(await runCli(["hooks", "status", "--project", docs, "--app", repo, "--json"], io), 0);
      assert.deepEqual(
        JSON.parse(out).report.map((r) => r.installed),
        [true, true],
      );
      assert.equal(await runCli(["hooks", "uninstall", "--project", docs, "--app", repo], io), 0);
      assert.equal(
        fs.readFileSync(path.join(repo, ".git", "hooks", "post-merge"), "utf8").trim(),
        "#!/bin/sh\necho mine",
      );
      assert.ok(!fs.existsSync(path.join(repo, ".git", "hooks", "post-checkout")));
      assert.equal(await runCli(["hooks", "nope", "--project", docs], io), 2);
      const elsewhere = {
        ...io,
        exec: (bin, args) =>
          args.join(" ") === "rev-parse --show-toplevel"
            ? { status: 0, stdout: path.join(repo, "other") + "\n" }
            : exec(bin, args),
      };
      assert.equal(await runCli(["hooks", "install", "--project", docs, "--app", repo], elsewhere), 2);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("SEC-09: a hooks folder git names outside the repository (core.hooksPath, a link) is refused → 3; inside it, or in the common git folder of a worktree, it is used", async () => {
    const root = tempDir("doc-kit-hooks-");
    try {
      const repo = path.join(root, "repo");
      const docs = path.join(repo, "docs", "manual");
      demoCopy(docs);
      fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
      const outside = path.join(root, "outside");
      fs.mkdirSync(outside);
      const main = path.join(root, "main", ".git");
      fs.mkdirSync(main, { recursive: true });
      // A link to a folder: a junction on Windows (no privilege needed), a symbolic link elsewhere.
      const link = (target, at) => fs.symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
      link(outside, path.join(repo, "linked"));
      /** A run of `hooks install` where git names `hooks` (and `common`, the common git folder); its exit code and stderr. */
      const install = async (hooks, { common = ".git", lang = [] } = {}) => {
        let err = "";
        const exec = (bin, args) => {
          const asked = args.join(" ");
          if (asked === "rev-parse --show-toplevel") return { status: 0, stdout: `${repo}\n` };
          if (asked === "rev-parse --git-common-dir") return { status: 0, stdout: `${common}\n` };
          if (asked === "rev-parse --git-path hooks") return { status: 0, stdout: `${hooks}\n` };
          return { status: 1, stdout: "" };
        };
        const io = { stdout: { write() {} }, stderr: { write: (s) => (err += s) }, env: {}, exec };
        const code = await runCli(["hooks", "install", "--project", docs, "--app", repo, ...lang], io);
        return { code, err };
      };
      const written = (dir) => HOOKS.filter((hook) => fs.existsSync(path.join(dir, hook)));

      const away = await install(outside);
      assert.equal(away.code, 3);
      assert.match(away.err, /the hooks folder .*outside.* is outside the repository/);
      assert.match(away.err, /core\.hooksPath/);
      assert.match(
        (await install(outside, { lang: ["--lang", "fr"] })).err,
        /le dossier des hooks .* est hors du dépôt/,
      );
      assert.equal((await install("../outside")).code, 3, "a relative path that climbs out");
      assert.equal((await install("linked")).code, 3, "a folder of the repository that is a link to outside");
      assert.equal((await install("linked/hooks")).code, 3, "a folder under such a link, not created yet");
      assert.deepEqual(written(outside), [], "nothing written outside");

      // A hook that is itself a link to outside (a folder here, so that any system can make it): refused too.
      fs.mkdirSync(path.join(repo, ".git", "hooks"), { recursive: true });
      link(outside, path.join(repo, ".git", "hooks", "post-merge"));
      assert.equal((await install(".git/hooks")).code, 3, "a hook that is a link to outside");
      fs.rmSync(path.join(repo, ".git", "hooks", "post-merge"), { recursive: true, force: true });
      // A hook that is a link leading nowhere: a write would create its target, wherever that is.
      link(path.join(outside, "missing"), path.join(repo, ".git", "hooks", "post-checkout"));
      assert.equal((await install(".git/hooks")).code, 3, "a hook that is a link leading nowhere");
      assert.ok(!fs.existsSync(path.join(outside, "missing")));
      fs.rmSync(path.join(repo, ".git", "hooks", "post-checkout"), { recursive: true, force: true });
      // A hook that is a hard link to a file outside: a write there changes that file too.
      fs.writeFileSync(path.join(outside, "profile"), "#!/bin/sh\n");
      fs.linkSync(path.join(outside, "profile"), path.join(repo, ".git", "hooks", "post-merge"));
      assert.equal((await install(".git/hooks")).code, 3, "a hook that is a hard link");
      assert.equal(fs.readFileSync(path.join(outside, "profile"), "utf8"), "#!/bin/sh\n");
      fs.rmSync(path.join(repo, ".git", "hooks", "post-merge"));

      // Inside the repository, the one rule of a write into the application (assertWritable): never through a link
      // or a junction, even one that stays inside it, nor onto one → write.throughLink, exit code 2.
      const unlink = (p) => {
        try {
          fs.unlinkSync(p);
        } catch {
          fs.rmdirSync(p);
        }
      };
      fs.mkdirSync(path.join(repo, "real-hooks"));
      link(path.join(repo, "real-hooks"), path.join(repo, "inlink"));
      const through = await install("inlink");
      assert.equal(through.code, 2, "a folder of the repository that is a link inside it");
      assert.match(through.err, /lies in the application behind a link or a junction/);
      assert.equal((await install("inlink/sub")).code, 2, "a folder under such a link, not created yet");
      fs.mkdirSync(path.join(repo, "hooks2"));
      link(path.join(repo, "real-hooks"), path.join(repo, "hooks2", "post-merge"));
      const onto = await install("hooks2");
      assert.equal(onto.code, 2, `a hook that is a link inside the repository: ${onto.err}`);
      unlink(path.join(repo, "hooks2", "post-merge"));
      assert.deepEqual(written(path.join(repo, "real-hooks")), [], "nothing written through them");
      assert.ok(!fs.existsSync(path.join(repo, "real-hooks", "sub")));
      unlink(path.join(repo, "inlink"));
      assert.equal((await install("real-hooks")).code, 0, "the folder itself");
      assert.deepEqual(written(path.join(repo, "real-hooks")), HOOKS);

      // The minimal pairs: inside the repository (husky's .husky), or the hooks of a worktree in its common git folder.
      assert.equal((await install(".husky")).code, 0);
      assert.deepEqual(written(path.join(repo, ".husky")), HOOKS);
      assert.equal((await install(path.join(main, "hooks"), { common: main })).code, 0);
      assert.deepEqual(written(path.join(main, "hooks")), HOOKS);
      assert.equal((await install(path.join(main, "hooks"))).code, 3, "the same folder when it is not the common one");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
