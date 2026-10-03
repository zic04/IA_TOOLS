// doc-kit optimize (cli/commands/optimize.mjs), the part without a browser (AUDIT.md M8): option checks, and a
// project with no image above the threshold is left untouched without launching Chromium. The re-encoding itself is
// in test/e2e/optimize.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy } from "../tools/helpers.mjs";

async function cli(args) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) } });
  return { code, out, err };
}

const images = (dir) =>
  Object.fromEntries(
    fs
      .readdirSync(path.join(dir, "images"))
      .filter((f) => f.endsWith(".webp"))
      .map((f) => [f, fs.readFileSync(path.join(dir, "images", f)).toString("base64")]),
  );

describe("optimize", () => {
  test("a threshold or a quality out of range is a usage error (exit code 2), with the expected value", async () => {
    const dir = demoCopy();
    try {
      for (const [option, value, expected] of [
        ["--threshold", "0", /number > 0 \(KB\)/],
        ["--threshold", "abc", /number > 0 \(KB\)/],
        ["--quality", "0", /between 0 and 1/],
        ["--quality", "1.5", /between 0 and 1/],
      ]) {
        const r = await cli(["optimize", option, value, "--project", dir]);
        assert.equal(r.code, 2, `${option} ${value}`);
        assert.match(r.err, new RegExp(`--${option.slice(2)}: invalid value “${value}”`));
        assert.match(r.err, expected);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no image above the threshold: nothing re-encoded, nothing written, no browser needed", async () => {
    const dir = demoCopy();
    try {
      const before = images(dir);
      const r = await cli(["optimize", "--threshold", "100000", "--json", "--project", dir]);
      assert.equal(r.code, 0, r.err);
      assert.deepEqual(JSON.parse(r.out), { heavy: 0, lighter: [], saved: 0 });
      assert.deepEqual(images(dir), before);
      const text = await cli(["optimize", "--threshold", "100000", "--project", dir]);
      assert.match(text.out, /0 image\(s\) above 100000 KB — total saving 0\.0 MB\./);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
