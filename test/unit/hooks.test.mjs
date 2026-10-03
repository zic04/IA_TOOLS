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
      fs.cpSync(demoCopy(), docs, { recursive: true });
      fs.mkdirSync(path.join(repo, ".git", "hooks"), { recursive: true });
      fs.writeFileSync(path.join(repo, ".git", "hooks", "post-merge"), "#!/bin/sh\necho mine\n");
      const exec = (bin, args) => {
        if (bin !== "git") return null;
        if (args.join(" ") === "rev-parse --show-toplevel") return { status: 0, stdout: repo + "\n" };
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
});
