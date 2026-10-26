// The tools of a documentation project (engine/core/project-tools.mjs, SECURITY.md): the one rule of a write of the
// kit into the application (pathJudge's writable, assertWritable) — never through a link or a junction of it, nor
// onto one, nor onto a file with other names — and the documented version every command reads with the tools
// (projectVersion): behind a junction of the application, never read. Real links and junctions in temporary folders
// (a junction on Windows needs no privilege), the commands run in-process, each case with its minimal pair.
import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { assertWritable } from "../../engine/core/project-tools.mjs";
import { pathJudge } from "../../engine/core/confine.mjs";
import { demoCopy, tempDir, noExec } from "../tools/helpers.mjs";

const folderLink = process.platform === "win32" ? "junction" : "dir";

/** Removes a link or a junction on its own: removing the folder must never walk into what it points to. */
function unlink(p) {
  try {
    fs.unlinkSync(p);
  } catch {
    if (fs.lstatSync(p, { throwIfNoEntry: false })) fs.rmdirSync(p);
  }
}

async function cli(args) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: {},
    exec: noExec,
  });
  return { code, out, err };
}

/** Where the path `p` really lands, links followed: its nearest existing folder's real path, then the rest. */
function lands(p) {
  const abs = path.resolve(p);
  for (let q = abs; ; q = path.dirname(q)) {
    try {
      return path.join(fs.realpathSync.native(q), path.relative(q, abs));
    } catch {
      if (path.dirname(q) === q) return abs;
    }
  }
}

/**
 * What `fn` writes or reads that lands in `folder`: a spy on every write function of `fs` (the target, and the
 * destination of a rename or a copy) and on readFileSync, each path judged where it really lands.
 */
async function touching(folder, fn) {
  const base = fs.realpathSync.native(folder);
  const inside = (p) => typeof p === "string" && (lands(p) === base || lands(p).startsWith(base + path.sep));
  const writers = ["writeFileSync", "appendFileSync", "mkdirSync", "renameSync", "copyFileSync", "rmSync", "cpSync"];
  const spies = [...writers, "readFileSync"].map((name) => [name, mock.method(fs, name)]);
  try {
    const result = await fn();
    const of = (names) =>
      spies
        .filter(([name]) => names.includes(name))
        .flatMap(([name, spy]) =>
          spy.mock.calls.flatMap((c) => c.arguments.slice(0, name === "renameSync" || name.startsWith("c") ? 2 : 1)),
        )
        .filter(inside)
        .map((p) => path.basename(p));
    return { result, writes: of(writers), reads: of(["readFileSync"]) };
  } finally {
    for (const [, spy] of spies) spy.mock.restore();
  }
}

describe("the one rule of a write into the application (pathJudge's writable, assertWritable)", () => {
  test("never through a link or a junction, out or in, nor onto one, nor onto a hard link; a folder not there yet is made", () => {
    const dir = tempDir("doc-kit-writable-");
    const app = path.join(dir, "app");
    const outside = path.join(dir, "outside");
    const links = [path.join(app, "out"), path.join(app, "in"), path.join(app, "broken")];
    try {
      fs.mkdirSync(path.join(app, "plain"), { recursive: true });
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(app, "plain", "x.txt"), "inside");
      fs.writeFileSync(path.join(outside, "f.txt"), "outside");
      fs.symlinkSync(outside, links[0], folderLink); // out of the application
      fs.symlinkSync(path.join(app, "plain"), links[1], folderLink); // one that stays in it
      fs.symlinkSync(path.join(outside, "missing"), links[2], folderLink); // one that leads nowhere
      fs.linkSync(path.join(outside, "f.txt"), path.join(app, "hard.txt")); // another name of a file outside
      const judge = pathJudge();
      const writable = (rel, o) => judge.writable(app, path.join(app, rel), o);
      // Refused: through a link (out, in, nowhere), onto one, onto a hard link, a file where a folder is, and back.
      for (const rel of ["out/f.txt", "out/new/y.txt", "in/x.txt", "broken/x.txt", "broken", "hard.txt", "plain"])
        assert.equal(writable(rel), false, rel);
      assert.equal(writable("out", { folder: true }), false, "a folder that is a junction");
      assert.equal(writable("plain/x.txt", { folder: true }), false, "a file where a folder is to be");
      // The minimal pairs: through the application's folders, a file there or not, folders not there yet.
      for (const rel of ["plain/x.txt", "plain/new.txt", "new/deeper/y.txt"]) assert.equal(writable(rel), true, rel);
      assert.equal(writable("plain", { folder: true }), true);
      assert.equal(writable("new/deeper", { folder: true }), true);
      // Not in the application: not judged; and the exception the commands give.
      assert.equal(judge.writable(app, path.join(outside, "f.txt")), null);
      assert.doesNotThrow(() => assertWritable([app], path.join(outside, "f.txt")));
      assert.throws(() => assertWritable([app], path.join(outside, "f.txt"), { within: true }), {
        key: "write.throughLink",
        code: 2,
      });
      assert.throws(() => assertWritable([app], path.join(app, "out", "f.txt"), { shown: "out/f.txt" }), {
        key: "write.throughLink",
        code: 2,
        vars: { file: "out/f.txt" },
      });
      assert.equal(fs.readFileSync(path.join(outside, "f.txt"), "utf8"), "outside", "nothing written");
    } finally {
      for (const link of links) unlink(link);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("inventory --features --write: the features file in the application", () => {
  /** A documentation project whose features file is ../app/feat/features.json: `feat` a folder, or a junction out. */
  function project(behind) {
    const base = tempDir("doc-kit-features-write-");
    const docs = path.join(base, "docs");
    const feat = path.join(base, "app", "feat");
    const outside = path.join(base, "outside", "feat");
    fs.mkdirSync(path.join(docs, "content"), { recursive: true });
    fs.mkdirSync(path.join(docs, "facts"));
    fs.writeFileSync(
      path.join(docs, "doc.config.mjs"),
      'export default { product: { name: "Acme" }, language: "en", app: { url: "http://x", dir: "../app" }, auth: { adapter: "none" }, coverage: [{ adapter: "local:routes.mjs" }, { adapter: "features", file: "../app/feat/features.json" }] };',
    );
    fs.writeFileSync(
      path.join(docs, "routes.mjs"),
      'export default { name: "routes", options: {}, async inventory() { return { available: true, families: [{ name: "Routes", items: [{ id: "/orders" }] }] }; } };',
    );
    const toc = { title: "T", sections: [{ id: "s", title: "S", groups: [{ pages: [{ id: "s/p", title: "P" }] }] }] };
    fs.writeFileSync(path.join(docs, "content", "toc.json"), JSON.stringify(toc));
    fs.mkdirSync(behind ? outside : feat, { recursive: true });
    fs.mkdirSync(path.dirname(feat), { recursive: true });
    if (behind) {
      fs.writeFileSync(path.join(outside, "features.json"), '[{"id":"F-09","title":"Outside"}]');
      fs.symlinkSync(outside, feat, folderLink);
    }
    return {
      docs,
      feat,
      outside,
      remove: () => {
        if (behind) unlink(feat);
        fs.rmSync(base, { recursive: true, force: true });
      },
    };
  }

  test("behind a junction of the application: refused (exit code 2, en and fr), nothing written outside", async () => {
    const p = project(true);
    try {
      for (const extra of [[], ["--force"]]) {
        const { result, writes, reads } = await touching(path.dirname(p.outside), () =>
          cli(["inventory", "--features", "--write", ...extra, "--project", p.docs]),
        );
        assert.equal(result.code, 2, result.out + result.err);
        assert.match(result.err, /features\.json lies in the application behind a link or a junction/);
        assert.deepEqual(writes, [], "nothing written outside");
        assert.deepEqual(reads, [], "nothing read outside");
      }
      const fr = await cli(["inventory", "--features", "--write", "--lang", "fr", "--project", p.docs]);
      assert.equal(fr.code, 2);
      assert.match(fr.err, /est dans l’application derrière un lien ou une jonction/);
      assert.equal(
        fs.readFileSync(path.join(p.outside, "features.json"), "utf8"),
        '[{"id":"F-09","title":"Outside"}]',
        "the outside file is unchanged",
      );
    } finally {
      p.remove();
    }
  });

  test("in a folder of the application: written (the minimal pair)", async () => {
    const p = project(false);
    try {
      const { result, writes } = await touching(p.feat, () =>
        cli(["inventory", "--features", "--write", "--project", p.docs]),
      );
      assert.equal(result.code, 0, result.out + result.err);
      assert.deepEqual(writes, ["features.json"]);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p.feat, "features.json"), "utf8")), [
        { id: "F-01", title: "Orders", routes: ["/orders"] },
      ]);
    } finally {
      p.remove();
    }
  });
});

describe("the documented version, read with the project's tools by every command (projectVersion)", () => {
  /** A copy of the demo whose version file is ../demo-app/meta/version.txt (9.9.9): `meta` a folder, or a junction. */
  function demo(behind) {
    const base = tempDir("doc-kit-version-file-");
    const dir = demoCopy(path.join(base, "demo-docs"));
    const meta = path.join(base, "demo-app", "meta");
    const folder = behind ? path.join(base, "outside", "meta") : meta;
    const configFile = path.join(dir, "doc.config.mjs");
    const text = fs.readFileSync(configFile, "utf8");
    fs.writeFileSync(configFile, text.replace('file: "version.txt"', 'file: "../demo-app/meta/version.txt"'));
    fs.mkdirSync(folder, { recursive: true });
    fs.mkdirSync(path.dirname(meta), { recursive: true });
    fs.writeFileSync(path.join(folder, "version.txt"), "9.9.9\n");
    if (behind) fs.symlinkSync(folder, meta, folderLink);
    return {
      dir,
      folder,
      remove: () => {
        if (behind) unlink(meta);
        fs.rmSync(base, { recursive: true, force: true });
      },
    };
  }
  /** The built page of the demo (its dist folder's HTML). */
  const built = (dir) => {
    const dist = path.join(dir, "dist");
    const html = fs.readdirSync(dist).find((f) => f.endsWith(".html"));
    return fs.readFileSync(path.join(dist, html), "utf8");
  };

  for (const behind of [true, false])
    test(`build, check images and audit: a version file ${behind ? "behind a junction of the application, never read: the fallback" : "in a folder of the application, read (the minimal pair)"}`, async () => {
      const d = demo(behind);
      try {
        const { result, reads } = await touching(d.folder, async () => ({
          build: await cli(["build", "--project", d.dir, "--date", "2026-01-01"]),
          images: await cli(["check", "images", "--project", d.dir, "--json"]),
          audit: await cli(["audit", "--project", d.dir, "--json"]),
        }));
        for (const [name, r] of Object.entries(result)) assert.ok(r.code <= 1, `${name}: ${r.code} ${r.err}`);
        const html = built(d.dir);
        if (behind) {
          assert.deepEqual(reads, [], "nothing outside the application is read");
          assert.ok(!html.includes("9.9.9"), "the fallback is the version of the site");
          assert.ok(!result.audit.out.includes("9.9.9"));
        } else {
          assert.ok(reads.length >= 3 && reads.every((f) => f === "version.txt"), JSON.stringify(reads));
          assert.ok(html.includes("9.9.9"), "the version of the site");
        }
      } finally {
        d.remove();
      }
    });
});
