// The `secrets` and `security` sources read the application only (SECURITY.md, confinement): `git ls-files` lists a
// committed link as a file, and a folder of the index may be a junction on disk. A link that leads to a file of the
// operator (~/.aws/credentials) is never read, so a report never tells what kind of secret the operator's machine
// holds. A file link needs a privilege on Windows (developer mode): when it cannot be made, the junction still
// checks the sources, and the fake file system below checks the reader itself — never a silent skip.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { collectSecrets } from "../../engine/facts/secrets.mjs";
import { collectSecurity } from "../../engine/facts/security.mjs";
import { confinedReader } from "../../engine/facts/common.mjs";
import { tempDir } from "../tools/helpers.mjs";

/** A secret-shaped text (a password in a URL) and an insecure setting, written in parts (push protection). */
const SECRET = "postgres://user:" + "SuperSecret" + "Pass1@db.example.com:5432/app";
const INSECURE = "rejectUnauthorized" + ": false";
const TEXT = `const dsn = "${SECRET}";\nconst agent = { ${INSECURE} };\n`;

/** `git ls-files` listing these paths (the seam of the CLI context, never a real git). */
const listing = (files) => (bin, args) =>
  bin === "git" && args[0] === "ls-files" ? { status: 0, stdout: files.join("\n") + "\n" } : null;

/** Removes a link or a junction on its own, never what it points to. */
function unlinkQuietly(link) {
  try {
    fs.unlinkSync(link);
  } catch {
    try {
      fs.rmdirSync(link);
    } catch {
      // not created
    }
  }
}

describe("the secrets and security sources never read through a link out of the application", () => {
  test("a junction to a folder outside, and a file link when the system allows it: never read; the file beside is", (t) => {
    const dir = tempDir("doc-kit-confine-");
    const app = path.join(dir, "app");
    const outside = path.join(dir, "outside");
    const junction = path.join(app, "linked");
    const fileLink = path.join(app, "leak");
    try {
      fs.mkdirSync(app);
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "credentials"), TEXT);
      fs.writeFileSync(path.join(app, "inside.js"), TEXT);
      fs.symlinkSync(outside, junction, "junction");
      let withFileLink = true;
      try {
        fs.symlinkSync(path.join(outside, "credentials"), fileLink, "file");
      } catch (e) {
        withFileLink = false;
        t.diagnostic(`no file link on this system (${e.code}): the junction and the fake file system check it`);
      }
      const exec = listing(["inside.js", "linked/credentials", ...(withFileLink ? ["leak"] : [])]);
      assert.deepEqual(collectSecrets(app, exec), [{ file: "inside.js", rule: "credentialsUrl" }]);
      const security = collectSecurity(app, exec);
      assert.ok(security.length > 0, "the file of the application is read");
      assert.deepEqual([...new Set(security.map((i) => i.file))], ["inside.js"]);
    } finally {
      // The links first, on their own: removing the folder must never walk into what they point to.
      unlinkQuietly(fileLink);
      unlinkQuietly(junction);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the reader, on a fake file system: a file link out of the folder is never read, the file beside is", () => {
    const app = path.resolve("/srv/app");
    const at = (...parts) => path.join(app, ...parts);
    /** What realpathSync.native gives: links resolved; a path it does not know does not exist. */
    const real = {
      [app]: app,
      [at("inside.js")]: at("inside.js"),
      [at("sub", "ok.js")]: at("sub", "ok.js"),
      [at("big.js")]: at("big.js"),
      [at("folder")]: at("folder"),
      [at("leak")]: path.resolve("/home/me/.aws/credentials"), // a committed file link
      [at("twin")]: path.resolve("/srv/app-other/x.js"), // a folder that starts with the same name
      [at("linked", "credentials")]: path.resolve("/home/me/.aws/credentials"), // through a junction
      [at("self")]: app, // the folder itself
    };
    const opened = [];
    const io = {
      realpathSync: {
        native: (p) => {
          if (Object.hasOwn(real, p)) return real[p];
          throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
        },
      },
      statSync: (p) => ({ isFile: () => !p.endsWith("folder"), size: p.endsWith("big.js") ? 11 : 10 }),
      readFileSync: (p) => (opened.push(p), `text of ${path.basename(p)}`),
    };
    const read = confinedReader(app, { maxSize: 10, io });
    assert.equal(read("inside.js"), "text of inside.js");
    assert.equal(read("sub/ok.js"), "text of ok.js");
    for (const rel of [
      "leak",
      "twin",
      "linked/credentials",
      "self",
      "folder",
      "big.js",
      "missing.js",
      "../app-other/x.js",
    ])
      assert.equal(read(rel), null, rel);
    assert.deepEqual(opened, [at("inside.js"), at("sub", "ok.js")], "only the two files inside were opened");
    // Without the folder itself (gone), nothing is read.
    assert.equal(confinedReader(path.resolve("/srv/none"), { maxSize: 10, io })("inside.js"), null);
  });
});
