// The sources of a project (ARCHITECTURE.md §6.19): inputs.json (model, checks), the shared repositories (the git
// commands, through a fake exec: no real git, no network), the documents (ingest: formats, secrets, refusals, the
// index), their state, the `inputs` command in English and French, and the `inputs.*` bricks.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { tempDir } from "../tools/helpers.mjs";
import { zipFolder } from "../../engine/dev/zip.mjs";
import {
  isSafeRepoUrl,
  hasCredentials,
  nameOf,
  readInputs,
  addInput,
  writeInputs,
  pageFile,
} from "../../engine/inputs/model.mjs";
import { docxToMarkdown } from "../../engine/inputs/docx.mjs";
import { diagramToMarkdown } from "../../engine/inputs/diagrams.mjs";
import { cloneArgs, updateArgs, fetchRepos } from "../../engine/inputs/repos.mjs";
import { riskyGitConfig } from "../../engine/util/safe-git.mjs";
import { inputsStatus } from "../../engine/inputs/status.mjs";
import { htmlToText, formatOf } from "../../engine/inputs/ingest.mjs";
import { loadBricks } from "../../engine/bricks/registry.mjs";
import { planRun } from "../../engine/bricks/plan.mjs";

const dirs = [];
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const temp = (prefix = "doc-kit-inputs-") => {
  const d = tempDir(prefix);
  dirs.push(d);
  return d;
};

describe("inputs.json: the model", () => {
  test("a repository address the kit gives git: https without credentials, ssh, git@host:path — nothing else", () => {
    for (const ok of [
      "https://github.com/acme/orders.git",
      "https://dev.azure.com/acme/Orders/_git/orders-api",
      "https://gitlab.example.com:8443/team/orders",
      "ssh://git@github.com/acme/orders.git",
      "git@github.com:acme/orders.git",
    ])
      assert.equal(isSafeRepoUrl(ok), true, ok);
    for (const bad of [
      "https://user:token@github.com/acme/orders.git", // a token in the address
      "https://ghp_abc123@github.com/acme/orders.git",
      "https://acme@dev.azure.com/acme/Orders/_git/orders-api", // a user: git asks the credential manager instead
      "http://github.com/acme/orders.git", // not encrypted
      "ext::sh -c touch% /tmp/pwned", // a transport that runs a command
      "--upload-pack=touch /tmp/pwned", // an option
      "file:///etc", // a local path
      "git@github.com:-oProxyCommand=x", // an option after the colon
      "-oProxyCommand@evil:x", // an option as the user
      "-F@h:x",
      "ssh://-oProxyCommand@evil/x",
      "git@-oProxy:x", // an option as the host
      "https://-h/x",
      "https://github.com/acme/orders.git\nfoo",
      "https://github.com/acme/my orders.git",
      42,
    ])
      assert.equal(isSafeRepoUrl(bad), false, String(bad));
  });

  test("an address read as browsers and git read it: any slashes after the scheme, inside free text too", () => {
    for (const leak of [
      "https:/u:pw@h/x",
      "https:\\u:pw@h\\x",
      "HTTPS:\\\\\\\\u:pw@h",
      "https:u:pw@h/x",
      "https:////tok@h/x",
      "see https://u:pw@h/x for details",
      "https://app/;jsessionid=ABCDEF0123",
      "https://h/x?user=x&pass=Hunter2pw",
      // A name ending in key, code or auth with a generated value; blanks in the user-info; a stray first character.
      "https://api.contoso.com/orders?subscription-key=0123456789abcdef0123456789abcdef",
      "https://onedrive.live.com/redir?resid=ABC!123&authkey=%21AHf3kLmN7pQrStUvWx",
      "https://h/x?secretKey=9f8e7d6c5b4a39281706",
      "https://user:my pw@host/",
      "1https://user:pw@h/x",
    ])
      assert.equal(hasCredentials(leak), true, leak);
    for (const ok of [
      "Architecture: team@acme",
      "DAT v2: contact jdoe@acme.example",
      "Spec: orders@2024",
      "https://h/x?showPassword=false",
      "https://h/x?forgotPassword=1",
      "https://h/x?pageToken=2",
      "https://acme.sharepoint.com/:w:/r/sites/orders/Shared%20Documents/DAT.docx?d=w123&csf=1&web=1",
      "https://login.example.com/authorize?redirect_uri=https://app.contoso.com&login_hint=john@contoso.com",
      "https://h/x?monkey=ENG&postcode=75001",
    ])
      assert.equal(hasCredentials(ok), false, ok);
    let start = Date.now();
    hasCredentials("a:/".repeat(200_000) + "@" + "?x=1&".repeat(100_000));
    assert.ok(Date.now() - start < 1000, "linear on a hostile value");
    start = Date.now();
    hasCredentials("?" + "%=ab&".repeat(200_000));
    assert.ok(Date.now() - start < 1000, "parameter names decoded in one pass");
  });

  test("secret parameters by the end of their normalised name; ordinary ones (key=ENG, code=FR) accepted", () => {
    for (const name of ["accessToken", "authToken", "apiToken", "sessionToken", "access%5Ftoken", "to\u200bken", "jwt"])
      assert.equal(hasCredentials(`https://h/x?${name}=abc`), true, name);
    for (const name of ["bearer", "credential", "X-Amz-Signature", "client_secret"])
      assert.equal(hasCredentials(`https://h/x?a=1&${name}=abc`), true, name);
    assert.equal(
      hasCredentials("https://docs.google.com/spreadsheet/ccc?key=0AqZx3b9kLmN7pQrStUv"),
      true,
      "a generated key",
    );
    for (const ok of [
      "https://confluence.example.com/spaces/viewspace.action?key=ENG",
      "https://h/x?code=FR",
      "https://h/x?auth=sso",
      "https://dev.azure.com/acme/_git/r?path=/x&version=GBmain",
      "https://teams.microsoft.com/l/channel/19:abc@thread.tacv2/General",
      "https://acme.atlassian.net/jira/software/projects/ORD/boards/1?selectedIssue=ORD-12",
      "C:/Users/me/docs/spec@v2.docx",
      "C:\\Users\\me\\spec@v2.docx",
    ])
      assert.equal(hasCredentials(ok), false, ok);
    assert.equal(hasCredentials("https:\\\\u:SECRET@h\\wiki\\x"), true, "backslashes are slashes");
  });

  test("credentials and secrets in any form; a plain ssh user, an ordinary query, a path are fine", () => {
    for (const yes of [
      "git+https://T@github.com/a",
      "  https://u@h/x",
      '"https://t@h/x"',
      "<https://t@h/x>",
      "git://T@h/x",
      "https://h/x?private_token=abc",
      "https://h/x#access_token=abc",
      "https://h/x?SIG=abcdefabcdefabcdefabcdef",
      "https://h/x?password=hunter2",
    ])
      assert.equal(hasCredentials(yes), true, yes);
    for (const no of [
      "https://acme.sharepoint.com/sites/orders?pageId=12&spaceKey=ORD",
      "https://h/x?key=",
      "docs/DAT v2.docx",
      "C:\\docs\\DAT.docx",
    ])
      assert.equal(hasCredentials(no), false, no);
  });

  test("credentials: any user of an http(s) address, a password anywhere; never a plain ssh user", () => {
    for (const yes of [
      "https://u:p@github.com/a",
      "https://ghp_x@github.com/a",
      "http://x@y.z/",
      "ssh://git:pw@h/a",
      "u:pw@h:a",
    ])
      assert.equal(hasCredentials(yes), true, yes);
    for (const no of [
      "https://github.com/a/b.git",
      "ssh://git@github.com/a.git",
      "git@github.com:a/b.git",
      "https://h/a@b",
    ])
      assert.equal(hasCredentials(no), false, no);
  });

  test("names: the last part of the address or the path, without .git, as letters, digits and dashes", () => {
    assert.equal(nameOf("https://github.com/acme/Orders_API.git"), "orders-api");
    assert.equal(nameOf("git@github.com:acme/infra.git"), "infra");
    assert.equal(nameOf("../infra/terraform/"), "terraform");
    assert.equal(nameOf("C:\\work\\Back Office"), "back-office");
    assert.equal(nameOf("///"), "code");
    assert.equal(nameOf("-a--b-"), "a-b");
    assert.equal(nameOf("x".repeat(62) + "--y"), "x".repeat(62) + "-");
    // Linear: 500,000 characters of "a-a-a…" (a string grown by += and read with endsWith was quadratic).
    const start = performance.now();
    assert.equal(nameOf("a-".repeat(250_000)), "a-".repeat(31) + "a");
    assert.ok(performance.now() - start < 200);
  });

  test("add: each kind, the tool guessed from the address; a duplicate, an unsafe address, a bad branch refused", () => {
    let inputs = {};
    inputs = addInput(inputs, "code", { value: "https://github.com/acme/orders.git", branch: "main" });
    inputs = addInput(inputs, "code", { value: "../infra", role: "infra" });
    inputs = addInput(inputs, "app", { value: "https://orders.example.com", readOnly: true });
    inputs = addInput(inputs, "app", { value: "https://staging.orders.example.com", env: "staging" });
    inputs = addInput(inputs, "document", { value: "docs/DAT v2.docx", kind: "dat", title: "DAT v2.3" });
    inputs = addInput(inputs, "document", { value: "https://acme.atlassian.net/wiki/spaces/ORD/pages/1" });
    inputs = addInput(inputs, "workspace", { value: "https://acme.sharepoint.com/sites/orders" });
    inputs = addInput(inputs, "workspace", { value: "https://www.notion.so/acme/Orders" });
    inputs = addInput(inputs, "backlog", { value: "https://dev.azure.com/acme/Orders/_backlogs" });
    assert.deepEqual(inputs, {
      code: [
        { name: "orders", repo: "https://github.com/acme/orders.git", branch: "main", role: "app" },
        { name: "infra", path: "../infra", role: "infra" },
      ],
      app: [
        { env: "prod", url: "https://orders.example.com", readOnly: true },
        { env: "staging", url: "https://staging.orders.example.com" },
      ],
      documents: [
        { file: "docs/DAT v2.docx", kind: "dat", title: "DAT v2.3" },
        { url: "https://acme.atlassian.net/wiki/spaces/ORD/pages/1", kind: "other" },
      ],
      workspaces: [
        { tool: "sharepoint", url: "https://acme.sharepoint.com/sites/orders" },
        { tool: "notion", url: "https://www.notion.so/acme/Orders" },
      ],
      backlog: { tool: "azure", url: "https://dev.azure.com/acme/Orders/_backlogs" },
    });
    const key = (fn) => {
      try {
        fn();
      } catch (e) {
        return [e.key, e.code];
      }
      return null;
    };
    assert.deepEqual(
      key(() => addInput(inputs, "code", { value: "../other/infra" })),
      ["inputs.duplicate", 2],
    );
    assert.deepEqual(
      key(() => addInput(inputs, "code", { value: "https://u:p@github.com/a/b.git" })),
      ["inputs.credentials", 2],
    );
    assert.deepEqual(
      key(() => addInput(inputs, "code", { value: "git@-oProxy:x" })),
      ["inputs.repoUrl", 2],
    );
    assert.deepEqual(
      key(() => addInput(inputs, "code", { value: "https://github.com/a/c.git", branch: "--upload-pack=x" })),
      ["inputs.branch", 2],
    );
    assert.deepEqual(
      key(() => addInput(inputs, "app", { value: "https://u:p@x.example" })),
      ["inputs.credentials", 2],
    );
    assert.deepEqual(
      key(() => addInput(inputs, "app", { value: "https://x.example", env: "prod" })),
      ["inputs.duplicate", 2],
    );
    assert.deepEqual(
      key(() => addInput(inputs, "planet", { value: "x" })),
      ["inputs.unknownKind", 2],
    );
  });

  test("read: none is an empty set; not JSON, against the schema, or unsafe: a usage error naming the file", () => {
    const root = temp();
    assert.deepEqual(readInputs(root), { inputs: {}, exists: false });
    const write = (v) =>
      fs.writeFileSync(path.join(root, "inputs.json"), typeof v === "string" ? v : JSON.stringify(v));
    write("{ broken");
    assert.throws(
      () => readInputs(root),
      (e) => e.key === "inputs.invalid" && e.code === 2,
    );
    write({ code: [{ name: "x", path: "a", repo: "https://github.com/a/b.git" }] });
    assert.throws(
      () => readInputs(root),
      (e) => e.key === "inputs.invalid" && e.details.length > 0,
    );
    write({ code: [{ name: "x", repo: "ext::sh -c id" }] });
    assert.throws(
      () => readInputs(root),
      (e) => e.key === "inputs.repoUrl",
    );
    write("\uFEFF" + JSON.stringify({ app: [{ env: "prod", url: "https://a.example" }] }));
    assert.equal(readInputs(root).inputs.app[0].env, "prod", "a byte order mark is accepted");
    writeInputs(root, { backlog: { tool: "jira", url: "https://a.atlassian.net/jira" }, code: [] });
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "inputs.json"), "utf8"))), [
      "code",
      "backlog",
    ]);
  });
});

describe("shared repositories (git through a fake exec)", () => {
  test("the clone: hardened from its creation, the address and the branch after --end-of-options", () => {
    assert.deepEqual(
      cloneArgs({ repo: "https://github.com/a/b.git", branch: "main", depth: 50 }, "/p/repos/b", "/p/no-hooks"),
      [
        "clone",
        "--quiet",
        "--no-recurse-submodules",
        ...[
          "--config",
          "core.hooksPath=/p/no-hooks",
          "--config",
          "core.symlinks=false",
          "--config",
          "core.fsmonitor=false",
        ],
        ...["--config", "protocol.ext.allow=never", "--config", "protocol.file.allow=never"],
        ...["--config", "submodule.recurse=false", "--config", "transfer.fsckObjects=true"],
        ...["--branch", "main", "--single-branch", "--depth", "50"],
        "--end-of-options",
        "https://github.com/a/b.git",
        "/p/repos/b",
      ],
    );
    // The update gives the same settings again (git -c): a clone whose configuration changed since stays hardened.
    const top = [
      ...["-c", "core.hooksPath=/p/no-hooks", "-c", "core.symlinks=false", "-c", "core.fsmonitor=false"],
      ...["-c", "protocol.ext.allow=never", "-c", "protocol.file.allow=never"],
      ...["-c", "submodule.recurse=false", "-c", "transfer.fsckObjects=true"],
    ];
    assert.deepEqual(updateArgs({ branch: "main" }, "/p/no-hooks"), [
      [...top, "fetch", "--quiet", "--prune", "--no-recurse-submodules", "--end-of-options", "origin"],
      [...top, "checkout", "--quiet", "--force", "--detach", "--end-of-options", "origin/main"],
    ]);
    assert.equal(updateArgs({}, "/p/no-hooks").at(-1).at(-1), "origin/HEAD");
  });

  /** A fake git: records each call; `answer(args)` gives its result; a clone writes .git/config like git does. */
  function fakeGit(answer = () => ({ status: 0, stdout: "", stderr: "" })) {
    const calls = [];
    const exec = (bin, args, options) => {
      calls.push({ bin, args, cwd: options.cwd, env: options.env, timeout: options.timeout });
      const r = answer(args);
      if (r && r.status === 0 && args[0] === "clone") {
        const dir = args.at(-1);
        fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
        fs.writeFileSync(path.join(dir, ".git", "config"), `[remote "origin"]\n\turl = ${args.at(-2)}\n`);
      }
      return r;
    };
    return { calls, exec };
  }
  const repo = { name: "orders", repo: "https://github.com/acme/orders.git", role: "app" };

  test("first fetch clones, the next one updates; never a prompt; the commit of each", () => {
    const root = temp();
    const git = fakeGit();
    const env = { PATH: "/usr/bin" };
    const first = fetchRepos({ root, inputs: { code: [repo] }, exec: git.exec, commit: () => "c0ffee1234", env });
    assert.deepEqual(first, [
      { name: "orders", action: "clone", ok: true, folder: ".doc-kit/inputs/repos/orders", commit: "c0ffee1234" },
    ]);
    assert.equal(git.calls[0].bin, "git");
    assert.equal(git.calls[0].args[0], "clone");
    assert.equal(git.calls[0].cwd, path.resolve(root, ".doc-kit/inputs/repos"));
    assert.equal(git.calls[0].env.GIT_TERMINAL_PROMPT, "0");
    assert.equal(git.calls[0].env.GIT_LFS_SKIP_SMUDGE, "1");
    assert.equal(git.calls[0].env.PATH, "/usr/bin", "the user's environment, for their own git settings");
    assert.ok(git.calls[0].timeout > 0);
    assert.ok(fs.existsSync(path.join(root, ".doc-kit/inputs/no-hooks")), "the empty hooks folder exists");
    const second = fetchRepos({ root, inputs: { code: [repo] }, exec: git.exec, commit: () => "feedbeef77", env });
    assert.equal(second[0].action, "update");
    assert.deepEqual(
      git.calls.slice(1).map((c) => [c.args.find((a) => a === "fetch" || a === "checkout"), c.cwd]),
      [
        ["fetch", path.resolve(root, ".doc-kit/inputs/repos/orders")],
        ["checkout", path.resolve(root, ".doc-kit/inputs/repos/orders")],
      ],
    );
  });

  test("a folder that is not a clone of that address is fetched again from scratch", () => {
    const root = temp();
    const dir = path.join(root, ".doc-kit/inputs/repos/orders");
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".git", "config"),
      '[remote "origin"]\n\turl = https://github.com/other/thing.git\n',
    );
    fs.writeFileSync(path.join(dir, "stale.txt"), "old");
    const git = fakeGit();
    const r = fetchRepos({ root, inputs: { code: [repo] }, exec: git.exec, commit: () => null, env: {} });
    assert.equal(r[0].action, "clone");
    assert.ok(!fs.existsSync(path.join(dir, "stale.txt")));
  });

  test("git missing, a risky configuration, git failing: said per repository; an unsafe entry never reaches git", () => {
    const root = temp();
    const run = (answer, code = [repo]) =>
      fetchRepos({ root, inputs: { code }, exec: fakeGit(answer).exec, commit: () => null, env: {} })[0].error;
    assert.deepEqual(
      run(() => null),
      { key: "inputs.noGit", vars: {} },
    );
    assert.deepEqual(
      run(() => ({ status: 128, refused: ["core.fsmonitor = evil"] })),
      {
        key: "inputs.gitConfig",
        vars: { name: "orders", keys: "core.fsmonitor = evil", folder: ".doc-kit/inputs/repos/orders" },
      },
    );
    assert.deepEqual(
      run(() => ({ status: 128, stdout: "", stderr: "\nfatal: repository not found\nmore\n" })),
      {
        key: "inputs.git",
        vars: { name: "orders", code: 128, error: "fatal: repository not found" },
      },
    );
    const git = fakeGit();
    const r = fetchRepos({
      root,
      inputs: {
        code: [
          { name: "evil", repo: "ext::sh -c id" },
          { name: "b", repo: repo.repo, branch: "-x" },
        ],
      },
      exec: git.exec,
      commit: () => null,
      env: {},
    });
    assert.deepEqual(
      r.map((x) => x.error.key),
      ["inputs.repoUrl", "inputs.branch"],
    );
    assert.equal(git.calls.length, 0, "git never called with an unchecked entry");
  });

  test("a key written on its section's line, or after a carriage return, is read as git reads it", () => {
    const root = temp();
    fs.mkdirSync(path.join(root, ".git"));
    // The read-only path (facts, sync on the application folder) refuses it too.
    fs.writeFileSync(path.join(root, ".git", "config"), "[core] fsmonitor = touch /tmp/x\n[include]\rpath = evil\n");
    assert.deepEqual(riskyGitConfig(root), ["core.fsmonitor = touch /tmp/x", "include.path = evil"]);
  });

  test("an update is refused when the clone's own configuration names a program a fetch would run", () => {
    const root = temp();
    const dir = path.join(root, ".doc-kit/inputs/repos/orders");
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    for (const setting of [
      "[core]\n\tsshCommand = touch /tmp/x",
      "[credential]\n\thelper = !evil",
      "[core]\n\tgitProxy = evil",
      "[core] sshCommand = on the header line",
      "[core]\n\talternateRefsCommand = evil",
      "[core]\n\tworktree = /elsewhere",
    ]) {
      fs.writeFileSync(path.join(dir, ".git", "config"), `[remote "origin"]\n\turl = ${repo.repo}\n${setting}\n`);
      const git = fakeGit();
      const r = fetchRepos({ root, inputs: { code: [repo] }, exec: git.exec, commit: () => null, env: {} });
      assert.equal(r[0].error.key, "inputs.gitConfig", setting);
      assert.equal(git.calls.length, 0, "git never run");
    }
  });

  test("a name that is a path never reaches the folder removed: nothing outside the clones is touched", () => {
    const root = temp();
    const victim = path.join(root, "victim");
    fs.mkdirSync(victim);
    fs.writeFileSync(path.join(victim, "precious.txt"), "keep");
    const git = fakeGit();
    for (const name of ["../../../victim", "..", "a/b", "A"]) {
      const r = fetchRepos({
        root,
        inputs: { code: [{ ...repo, name }] },
        exec: git.exec,
        commit: () => null,
        env: {},
      });
      assert.equal(r[0].error.key, "inputs.name", name);
    }
    assert.ok(fs.existsSync(path.join(victim, "precious.txt")));
    assert.equal(git.calls.length, 0);
    const control = fetchRepos({
      root,
      inputs: { code: [repo] },
      exec: fakeGit(() => ({ status: 1, stdout: "", stderr: "\u001b[31mfatal:\u0007 no\r\n" })).exec,
      commit: () => null,
      env: {},
    });
    assert.equal(control[0].error.vars.error, " [31mfatal:  no", "control characters of the remote removed");
  });
});

describe("documents: formats and the HTML reader", () => {
  test("the format of a file, from its extension", () => {
    assert.deepEqual(
      ["a.DOCX", "b.pdf", "c.md", "d.txt", "e.htm", "f.drawio", "g.drawio.xml", "h.puml", "i.mmd", "j.xlsx"].map(
        formatOf,
      ),
      ["docx", "pdf", "markdown", "text", "html", "drawio", "drawio", "puml", "mermaid", null],
    );
  });

  test("HTML: its text, headings kept, scripts, styles and comments dropped; linear on hostile input", () => {
    const html =
      "<html><head><title>x</title><style>p{}</style></head><body><h1>Orders</h1><!-- note --><p>The &amp; list</p>" +
      "<script>alert(1)</script><ul><li>One</li><li>Two</li></ul><h2>Sign-in</h2><p>SSO&nbsp;only</p></body></html>";
    assert.equal(htmlToText(html), "# Orders\n\nThe & list\n\n- One\n- Two\n\n## Sign-in\n\nSSO only");
    const start = Date.now();
    htmlToText("<".repeat(200_000) + "<script" + "a".repeat(200_000));
    assert.ok(Date.now() - start < 1000);
  });
});

describe("the readers stay bounded on hostile documents", () => {
  test("a table bomb (spans, then thousands of rows) is refused, never built", () => {
    const parts = temp("doc-kit-bomb-");
    fs.mkdirSync(path.join(parts, "word"));
    const wide = '<w:tc><w:tcPr><w:gridSpan w:val="64"/></w:tcPr><w:p/></w:tc>';
    // Each row its own text: the archive compresses like a real document (no ratio refusal before the table is read).
    const rows = Array.from(
      { length: 4000 },
      (_, i) => `<w:tr><w:tc><w:p><w:r><w:t>r${i * 7919}</w:t></w:r></w:p></w:tc></w:tr>`,
    ).join("");
    fs.writeFileSync(
      path.join(parts, "word", "document.xml"),
      `<w:document xmlns:w="w"><w:body><w:tbl><w:tr>${wide}${wide}</w:tr>${rows}</w:tbl></w:body></w:document>`,
    );
    const file = path.join(parts, "bomb.docx");
    zipFolder(path.join(parts, "word"), file, "word");
    const start = Date.now();
    assert.throws(
      () => docxToMarkdown(fs.readFileSync(file)),
      (e) => e.key === "inputs.refused" && e.vars.reason === "tooLarge",
    );
    assert.ok(Date.now() - start < 2000);
  });

  test("paragraphs nested deep inside each other: linear, whatever their depth", () => {
    const parts = temp("doc-kit-nested-");
    fs.mkdirSync(path.join(parts, "word"));
    const depth = 250;
    // Varied words: the archive compresses like a real document (no ratio refusal before the paragraphs are read).
    const words = Array.from({ length: 200_000 }, (_, i) => `word${(i * 7919) % 100_003}`).join(" ");
    const text = `<w:r><w:t>${words}</w:t></w:r>`;
    const body = "<w:p>".repeat(depth) + text + "</w:p>".repeat(depth);
    fs.writeFileSync(
      path.join(parts, "word", "document.xml"),
      `<w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`,
    );
    const file = path.join(parts, "nested.docx");
    zipFolder(path.join(parts, "word"), file, "word");
    const start = Date.now();
    const r = docxToMarkdown(fs.readFileSync(file));
    assert.ok(Date.now() - start < 2000, `${Date.now() - start} ms`);
    assert.ok(r.markdown.startsWith("word0 word7919"));
  });

  test("Mermaid groups and draw.io labels: linear, whatever their size", () => {
    const group = (p) => Array.from({ length: 3000 }, (_, i) => `${p}${i}`).join(" & ");
    let start = Date.now();
    const m = diagramToMarkdown(`graph TD\n${group("A")} --> ${group("B")}\n`, "mermaid");
    assert.ok(Date.now() - start < 2000, "a group of 3000 × 3000 stops at the cap of links");
    assert.ok(m.links.length <= 5000);
    const label = "&lt;b&gt;x&lt;/b&gt;".repeat(100_000);
    const edges = Array.from({ length: 1000 }, (_, i) => `<mxCell id="e${i}" edge="1" source="a" target="b"/>`).join(
      "",
    );
    const drawio = `<mxfile><diagram><mxGraphModel><root><mxCell id="a" vertex="1" value="${label}"/><mxCell id="b" vertex="1" value="B"/>${edges}</root></mxGraphModel></diagram></mxfile>`;
    start = Date.now();
    diagramToMarkdown(drawio, "drawio");
    assert.ok(Date.now() - start < 2000, "each label read once, and cut");
  });
});

describe("the state of the sources", () => {
  test("folders present or missing, repositories fetched or not, documents by their index", () => {
    const root = temp();
    fs.mkdirSync(path.join(root, "infra"));
    fs.writeFileSync(path.join(root, "notes.md"), "# Notes\n");
    fs.writeFileSync(path.join(root, "old.md"), "# Old\n");
    const dir = path.join(root, ".doc-kit/inputs/repos/orders");
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".git", "config"), `[remote "origin"]\n\turl = ${repo().repo}\n`);
    fs.mkdirSync(path.join(root, ".doc-kit/inputs/docs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".doc-kit/inputs/docs/index.json"),
      JSON.stringify({ documents: [{ source: "old.md", hash: "0000", output: ".doc-kit/inputs/docs/old.md" }] }),
    );
    const inputs = {
      code: [
        { name: "infra", path: "infra", role: "infra" },
        { name: "gone", path: "gone" },
        repo(),
        { name: "lib", repo: "https://github.com/acme/lib.git" },
      ],
      documents: [
        { file: "notes.md" },
        { file: "old.md" },
        { file: "absent.docx" },
        { url: "https://x.atlassian.net/wiki/p" },
      ],
    };
    const s = inputsStatus({ root, inputs, commit: () => "c0ffee1234" });
    assert.deepEqual(
      s.code.map((c) => [c.name, c.state]),
      [
        ["infra", "present"],
        ["gone", "missing"],
        ["orders", "fetched"],
        ["lib", "notFetched"],
      ],
    );
    assert.equal(s.code[2].commit, "c0ffee1234");
    assert.deepEqual(
      s.documents.map((d) => d.state),
      ["notIngested", "stale", "missing", "external"],
    );
  });
  function repo() {
    return { name: "orders", repo: "https://github.com/acme/orders.git" };
  }
});

describe("doc-kit inputs (CLI)", () => {
  function project() {
    const dir = temp("doc-kit-inputs-project-");
    fs.writeFileSync(path.join(dir, "doc.config.mjs"), 'export default { product: { name: "Shop" } };\n');
    fs.mkdirSync(path.join(dir, "content"));
    fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Shop", sections: [] }));
    return dir;
  }
  async function cli(args, io = {}) {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      env: { DOC_KIT_NO_BROWSER: "1" },
      commit: () => "c0ffee1234",
      exec: () => null,
      ...io,
    });
    return { code, out, err };
  }

  test("status with no source, add of each kind, status again (text and --json)", async () => {
    const dir = project();
    let r = await cli(["inputs", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /No source declared in inputs\.json yet/);
    r = await cli(["inputs", "add", "code", "https://github.com/acme/orders.git", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.match(
      r.out,
      /Added to inputs\.json: code https:\/\/github\.com\/acme\/orders\.git\n→ fetch it: doc-kit inputs fetch orders/,
    );
    await cli(["inputs", "add", "document", "DAT.docx", "--kind", "dat", "--project", dir]);
    await cli(["inputs", "add", "workspace", "https://acme.atlassian.net/wiki/spaces/ORD", "--project", dir]);
    r = await cli(["inputs", "--project", dir]);
    assert.match(r.out, /Sources of the project \(inputs\.json\)/);
    assert.match(r.out, /✖ orders \(application\) https:\/\/github\.com\/acme\/orders\.git — not fetched yet/);
    assert.match(r.out, /✖ DAT\.docx \(technical architecture document\) — not found/);
    assert.match(r.out, /· confluence: https:\/\/acme\.atlassian\.net\/wiki\/spaces\/ORD/);
    assert.match(r.out, /→ fetch the repositories: doc-kit inputs fetch/);
    const json = JSON.parse((await cli(["inputs", "status", "--project", dir, "--json"])).out);
    assert.equal(json.code[0].state, "notFetched");
    assert.equal(json.workspaces[0].tool, "confluence");
  });

  test("fetch through the context's exec; git missing: exit code 1 and what to do", async () => {
    const dir = project();
    await cli(["inputs", "add", "code", "https://github.com/acme/orders.git", "--project", dir]);
    const calls = [];
    const exec = (bin, args, options) => {
      calls.push(args[0]);
      fs.mkdirSync(path.join(args.at(-1), ".git"), { recursive: true });
      fs.writeFileSync(path.join(args.at(-1), ".git", "config"), `[remote "origin"]\n\turl = ${args.at(-2)}\n`);
      return { status: 0, stdout: "", stderr: "" };
    };
    let r = await cli(["inputs", "fetch", "--project", dir], { exec });
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(calls, ["clone"]);
    assert.match(r.out, /✔ orders: cloned into \.doc-kit\/inputs\/repos\/orders at c0ffee1/);
    assert.match(r.out, /set app\.dir to that folder in doc\.config\.mjs/);
    r = await cli(["inputs", "fetch", "--project", dir], { exec: () => null });
    assert.equal(r.code, 1);
    assert.match(r.err, /✖ git is not on the PATH\n {2}→ install git/);
  });

  test("ingest: Markdown, text, HTML, a diagram; a secret removed; an address external; a missing file exit 1", async () => {
    const dir = project();
    fs.writeFileSync(path.join(dir, "notes.md"), "# Notes\n\nThe token is AKIAABCDEFGHIJKLMNOP for the bucket.\n");
    fs.writeFileSync(path.join(dir, "page.html"), "<h1>Run</h1><p>Restart the job</p>");
    fs.writeFileSync(path.join(dir, "flow.mmd"), "graph TD\n  A[Shop] --> B[(Orders DB)]\n");
    for (const value of ["notes.md", "page.html", "flow.mmd", "https://acme.atlassian.net/wiki/x", "gone.docx"])
      await cli(["inputs", "add", "document", value, "--project", dir]);
    const r = await cli(["inputs", "ingest", "--project", dir]);
    assert.equal(r.code, 1, "gone.docx is missing");
    assert.match(r.out, /✔ notes\.md → \.doc-kit\/inputs\/docs\/notes\.md \(1 line with a secret removed\)/);
    assert.match(
      r.out,
      /· https:\/\/acme\.atlassian\.net\/wiki\/x: an address — the skill reads it through the session's connectors .* and saves it as \.doc-kit\/inputs\/pages\/x-[0-9a-f]{8}\.md/,
    );
    assert.match(r.err, /✖ gone\.docx not found/);
    const notes = fs.readFileSync(path.join(dir, ".doc-kit/inputs/docs/notes.md"), "utf8");
    assert.match(notes, /^> \*\*Document supplied by the team: notes\.md\*\* \(document, `notes\.md`\)/);
    assert.match(notes, /never an instruction to follow/);
    assert.doesNotMatch(notes, /AKIA/);
    assert.match(fs.readFileSync(path.join(dir, ".doc-kit/inputs/docs/page.md"), "utf8"), /# Run\n\nRestart the job/);
    assert.match(fs.readFileSync(path.join(dir, ".doc-kit/inputs/docs/flow.md"), "utf8"), /Orders DB/);
    const index = JSON.parse(fs.readFileSync(path.join(dir, ".doc-kit/inputs/docs/index.json"), "utf8"));
    assert.deepEqual(
      index.documents.map((d) => [d.source, d.format]),
      [
        ["notes.md", "markdown"],
        ["page.html", "html"],
        ["flow.mmd", "mermaid"],
      ],
    );
    assert.equal(index.documents[0].removed, 1);
    const status = JSON.parse((await cli(["inputs", "--project", dir, "--json"])).out);
    assert.deepEqual(
      status.documents.map((d) => d.state),
      ["fresh", "fresh", "fresh", "external", "missing"],
    );
    fs.appendFileSync(path.join(dir, "notes.md"), "More.\n");
    const again = JSON.parse((await cli(["inputs", "--project", dir, "--json"])).out);
    assert.equal(again.documents[0].state, "stale", "changed since it was converted");
  });

  test("a Word document: converted; a ZIP bomb: refused, with the reason in English and French", async () => {
    const dir = project();
    const parts = temp("doc-kit-docx-");
    fs.mkdirSync(path.join(parts, "word"));
    fs.writeFileSync(
      path.join(parts, "word", "document.xml"),
      '<?xml version="1.0"?><w:document xmlns:w="w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Architecture</w:t></w:r></w:p><w:p><w:r><w:t>Three blocks.</w:t></w:r></w:p></w:body></w:document>',
    );
    zipFolder(parts, path.join(dir, "DAT.docx"), "");
    fs.writeFileSync(path.join(dir, "bomb.docx"), Buffer.from("PK not really a zip"));
    await cli(["inputs", "add", "document", "DAT.docx", "--kind", "dat", "--project", dir]);
    await cli(["inputs", "add", "document", "bomb.docx", "--project", dir]);
    const r = await cli(["inputs", "ingest", "--project", dir]);
    assert.equal(r.code, 1);
    const dat = fs.readFileSync(path.join(dir, ".doc-kit/inputs/docs/dat.md"), "utf8");
    assert.match(dat, /# Architecture\n\nThree blocks\./);
    assert.match(r.err, /✖ bomb\.docx: refused — /);
    const fr = await cli(["inputs", "ingest", "bomb.docx", "--project", dir, "--lang", "fr"]);
    assert.match(fr.err, /✖ bomb\.docx : refusé — /);
    const index = JSON.parse(fs.readFileSync(path.join(dir, ".doc-kit/inputs/docs/index.json"), "utf8"));
    assert.deepEqual(
      index.documents.map((d) => d.source).sort(),
      ["DAT.docx", "bomb.docx"],
      "ingesting one document keeps the other's entry",
    );
  });

  test("a credential is never shown: refused by add, in a hand-written inputs.json (inputs, bricks), and by init", async () => {
    const dir = project();
    for (const args of [
      ["code", "https://user:ghp_SECRET123@github.com/a/b.git"],
      ["app", "https://admin:Hunter2SECRET@orders.example.com"],
      ["document", "https://u:SECRETpw@acme.atlassian.net/wiki/x"],
      // Forms a first check missed: another scheme, spaces, quotes, angle brackets, a secret parameter.
      ["code", "git+https://SECRETtok@github.com/a/b.git"],
      ["document", " https://SECRETtok@acme.atlassian.net/wiki/x"],
      ["document", '"https://SECRETtok@acme.atlassian.net/wiki/x"'],
      ["workspace", "<https://SECRETtok@acme.sharepoint.com/sites/x>"],
      ["backlog", "git://SECRETtok@gitlab.example.com/x"],
      ["app", "https://orders.example.com/?private_token=SECRETtok"],
      ["document", "https://acme.atlassian.net/wiki/x#access_token=SECRETtok"],
      // Backslashes (rewritten with slashes in inputs.json), a camelCase parameter, a title carrying an address.
      ["document", "https:\\\\u:SECRETpw@acme.atlassian.net\\wiki\\x.docx"],
      ["code", "https:\\\\u:SECRETpw@github.com\\a\\b"],
      ["workspace", "https://acme.sharepoint.com/sites/x?accessToken=SECRETtok"],
      ["document", "notes.md", "--title", "https://u:SECRETpw@acme.example/x"],
      ["document", "https:/u:SECRETpw@acme.atlassian.net/wiki/x.docx"],
      ["document", "https:\\u:SECRETpw@acme.atlassian.net\\wiki\\x.docx"],
      ["app", "https://orders.example.com/;jsessionid=SECRET0123ABC"],
    ]) {
      const r = await cli(["inputs", "add", ...args, "--project", dir]);
      assert.equal(r.code, 2);
      assert.match(r.err, /with a user, a password or a token is refused/);
      assert.doesNotMatch(r.out + r.err, /SECRET/);
    }
    fs.writeFileSync(
      path.join(dir, "inputs.json"),
      JSON.stringify({ code: [{ name: "x", repo: "https://u:SECRET9@github.com/a/b" }] }),
    );
    for (const command of [["inputs"], ["bricks"], ["inputs", "fetch"]]) {
      const r = await cli([...command, "--project", dir]);
      assert.equal(r.code, 2, command.join(" "));
      assert.match(r.err, /inputs\.json: code\[0\]\.repo: an address or a path with a user, a password or a token/);
      assert.doesNotMatch(r.out + r.err, /SECRET/);
    }
  });

  test("two documents of the same name keep their own outputs, also when only one is converted again", async () => {
    const dir = project();
    for (const sub of ["a", "b"]) {
      fs.mkdirSync(path.join(dir, sub));
      fs.writeFileSync(path.join(dir, sub, "DAT.md"), `# DAT of ${sub}\n`);
      await cli(["inputs", "add", "document", `${sub}/DAT.md`, "--project", dir]);
    }
    await cli(["inputs", "ingest", "--project", dir]);
    const read = (name) => fs.readFileSync(path.join(dir, ".doc-kit/inputs/docs", name), "utf8");
    assert.match(read("dat.md"), /DAT of a/);
    assert.match(read("dat-2.md"), /DAT of b/);
    fs.appendFileSync(path.join(dir, "b", "DAT.md"), "More.\n");
    await cli(["inputs", "ingest", "b/DAT.md", "--project", dir]);
    assert.match(read("dat.md"), /DAT of a/, "a's output is never written over");
    assert.match(read("dat-2.md"), /More\./, "b keeps its own output name");
    const status = JSON.parse((await cli(["inputs", "--project", dir, "--json"])).out);
    assert.deepEqual(
      status.documents.map((d) => [d.file, d.state, d.output]),
      [
        ["a/DAT.md", "fresh", ".doc-kit/inputs/docs/dat.md"],
        ["b/DAT.md", "fresh", ".doc-kit/inputs/docs/dat-2.md"],
      ],
    );
  });

  test("a new document listed before one already converted never takes its output name", async () => {
    const dir = project();
    fs.mkdirSync(path.join(dir, "a"));
    fs.mkdirSync(path.join(dir, "b"));
    fs.writeFileSync(path.join(dir, "b", "DAT.md"), "# DAT of b\n");
    await cli(["inputs", "add", "document", "b/DAT.md", "--project", dir]);
    await cli(["inputs", "ingest", "--project", dir]);
    fs.writeFileSync(path.join(dir, "a", "DAT.md"), "# DAT of a\n");
    const inputs = JSON.parse(fs.readFileSync(path.join(dir, "inputs.json"), "utf8"));
    inputs.documents.unshift({ file: "a/DAT.md", kind: "other" });
    fs.writeFileSync(path.join(dir, "inputs.json"), JSON.stringify(inputs));
    await cli(["inputs", "ingest", "--project", dir]);
    const status = JSON.parse((await cli(["inputs", "--project", dir, "--json"])).out);
    assert.deepEqual(
      status.documents.map((d) => [d.file, d.output]),
      [
        ["a/DAT.md", ".doc-kit/inputs/docs/dat-2.md"],
        ["b/DAT.md", ".doc-kit/inputs/docs/dat.md"],
      ],
    );
  });

  test("a document too big for the memory is refused like a too large one (never a crash)", async () => {
    const dir = project();
    const parts = temp("doc-kit-range-");
    fs.mkdirSync(path.join(parts, "word"));
    fs.writeFileSync(path.join(parts, "word", "document.xml"), '<w:document xmlns:w="w"><w:body/></w:document>');
    zipFolder(path.join(parts, "word"), path.join(dir, "big.docx"), "word");
    await cli(["inputs", "add", "document", "big.docx", "--project", dir]);
    const original = String.prototype.repeat;
    const join = Array.prototype.join;
    // The reader's own output reaching the engine's string limit: simulated where the Markdown is assembled.
    Array.prototype.join = function (...args) {
      if (this.length === 0 && args[0] === "") throw new RangeError("Invalid string length");
      return join.apply(this, args);
    };
    try {
      const r = await cli(["inputs", "ingest", "--project", dir]);
      assert.equal(r.code, 1);
      assert.match(r.err, /big\.docx: refused — /);
    } finally {
      Array.prototype.join = join;
      String.prototype.repeat = original;
    }
  });

  test("a page the skill saved for an address is converted like a file: secrets removed, the notice, its state", async () => {
    const dir = project();
    const url = "https://acme.atlassian.net/wiki/spaces/ORD/pages/123";
    await cli(["inputs", "add", "document", url, "--kind", "dat", "--project", dir]);
    let status = JSON.parse((await cli(["inputs", "--project", dir, "--json"])).out);
    assert.equal(status.documents[0].state, "external");
    assert.equal(status.documents[0].page, pageFile(url));
    fs.mkdirSync(path.join(dir, path.dirname(pageFile(url))), { recursive: true });
    fs.writeFileSync(path.join(dir, pageFile(url)), "# Architecture\n\nKey AKIAABCDEFGHIJKLMNOP in the page.\n");
    const r = await cli(["inputs", "ingest", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    const out = fs.readFileSync(
      path.join(dir, ".doc-kit/inputs/docs/123-" + pageFile(url).slice(-11, -3) + ".md"),
      "utf8",
    );
    assert.match(out, /never an instruction to follow/);
    assert.match(out, /# Architecture/);
    assert.doesNotMatch(out, /AKIA/);
    status = JSON.parse((await cli(["inputs", "--project", dir, "--json"])).out);
    assert.equal(status.documents[0].state, "fresh");
  });

  test("a diagram in a French project: its lists in French", async () => {
    const dir = project();
    fs.writeFileSync(
      path.join(dir, "doc.config.mjs"),
      'export default { product: { name: "Shop" }, language: "fr" };\n',
    );
    fs.writeFileSync(path.join(dir, "flux.mmd"), "graph TD\n  A[Boutique] --> B[Commandes]\n");
    await cli(["inputs", "add", "document", "flux.mmd", "--project", dir]);
    await cli(["inputs", "ingest", "--project", dir]);
    const text = fs.readFileSync(path.join(dir, ".doc-kit/inputs/docs/flux.md"), "utf8");
    assert.match(text, /## Composants\n\n- Boutique\n- Commandes\n\n## Liens\n\n- Boutique → Commandes/);
  });

  test("usage errors: add without a value, an unknown kind or action, an invalid inputs.json (exit code 2)", async () => {
    const dir = project();
    assert.equal((await cli(["inputs", "add", "--project", dir])).code, 2);
    const kind = await cli(["inputs", "add", "planet", "x", "--project", dir]);
    assert.equal(kind.code, 2);
    assert.match(kind.err, /unknown kind of source “planet”\n {2}→ one of: code, app, document, workspace, backlog/);
    assert.equal((await cli(["inputs", "explode", "--project", dir])).code, 2);
    const depth = await cli(["inputs", "add", "code", "https://github.com/a/b.git", "--depth", "0", "--project", dir]);
    assert.equal(depth.code, 2);
    fs.writeFileSync(path.join(dir, "inputs.json"), "{ nope");
    const bad = await cli(["inputs", "--project", dir]);
    assert.equal(bad.code, 2);
    assert.match(bad.err, /inputs\.json cannot be read: /);
  });

  test("French", async () => {
    const dir = project();
    const r = await cli(["inputs", "--project", dir, "--lang", "fr"]);
    assert.match(r.out, /Aucune source déclarée dans inputs\.json pour l'instant/);
  });
});

describe("the inputs bricks", () => {
  test("presets and needs: the facts need the shared repositories; inputs.repos requires --network", () => {
    const r = loadBricks();
    assert.deepEqual(r.presets.inputs, ["inputs.repos", "inputs.docs"]);
    assert.deepEqual(r.byId.get("inputs.repos").requires, ["network"]);
    for (const b of r.bricks.filter((x) => x.kind === "facts")) assert.deepEqual(b.needs, ["inputs.repos"], b.id);
  });

  test("the plan keeps the order of the bricks: the sources before the facts, each inputs action once", () => {
    const r = loadBricks();
    const statuses = new Map([...r.byId.keys()].map((id) => [id, { state: "missing", why: [] }]));
    const plan = planRun({ registry: r, statuses, names: ["facts.env", "inputs"], flags: { network: true } });
    assert.deepEqual(
      plan.commands.map((c) => [c.command, c.positionals ?? null]),
      [
        ["inputs", ["fetch"]],
        ["inputs", ["ingest"]],
        ["facts", null],
      ],
    );
  });

  test("states: a repository not fetched, a document not converted; bricks run inputs.docs converts", async () => {
    const dir = temp("doc-kit-inputs-bricks-");
    fs.writeFileSync(path.join(dir, "doc.config.mjs"), 'export default { product: { name: "Shop" } };\n');
    fs.mkdirSync(path.join(dir, "content"));
    fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Shop", sections: [] }));
    fs.writeFileSync(path.join(dir, "notes.md"), "# Notes\n");
    writeInputs(dir, {
      code: [{ name: "orders", repo: "https://github.com/acme/orders.git" }],
      documents: [{ file: "notes.md" }],
    });
    const run = async (args) => {
      let out = "";
      const code = await runCli([...args, "--project", dir], {
        stdout: { write: (s) => (out += s) },
        stderr: { write: () => {} },
        env: {},
        commit: () => null,
        exec: () => null,
      });
      return { code, out };
    };
    let json = JSON.parse((await run(["bricks", "--json"])).out);
    const state = (id) => json.bricks.find((b) => b.id === id);
    assert.equal(state("inputs.repos").state, "missing");
    assert.equal(state("inputs.repos").why[0].text, "the repository orders is not fetched yet");
    assert.equal(state("inputs.docs").state, "missing");
    assert.equal(state("facts.env").state, "missing");
    const r = await run(["bricks", "run", "inputs.docs"]);
    assert.equal(r.code, 0);
    assert.ok(fs.existsSync(path.join(dir, ".doc-kit/inputs/docs/notes.md")));
    json = JSON.parse((await run(["bricks", "--json"])).out);
    assert.equal(state("inputs.docs").state, "fresh");
    const skipped = await run(["bricks", "run", "inputs.repos"]);
    assert.match(skipped.out, /inputs\.repos skipped: needs the option --network/);
  });
});
