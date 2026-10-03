// doc-kit optimize with Chromium (AUDIT.md M8): the heavy screenshots of the demo are re-encoded, a new version is
// kept only when it is at least 20 % lighter, and what is written is still a WebP image of the same size.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { webpSize } from "../../engine/capture/webp.mjs";
import { demoCopy } from "../tools/helpers.mjs";

async function cli(args) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) } });
  return { code, out, err };
}

describe("optimize: re-encoding the heavy screenshots", () => {
  test("every image above the threshold is tried; the lighter ones are written, the others left as they were", async () => {
    const dir = demoCopy();
    try {
      const folder = path.join(dir, "images");
      const webps = fs.readdirSync(folder).filter((f) => f.endsWith(".webp"));
      const before = Object.fromEntries(webps.map((f) => [f, fs.readFileSync(path.join(folder, f))]));
      const r = await cli(["optimize", "--threshold", "1", "--quality", "0.1", "--json", "--project", dir]);
      assert.equal(r.code, 0, r.err);
      const result = JSON.parse(r.out);
      assert.equal(result.heavy, webps.length, "every demo screenshot is above 1 KB");
      assert.ok(result.lighter.length >= 1, "quality 0.1 makes at least one screenshot 20 % lighter");
      let saved = 0;
      for (const f of webps) {
        const after = fs.readFileSync(path.join(folder, f));
        const entry = result.lighter.find((l) => l.file === f);
        if (!entry) {
          assert.deepEqual(after, before[f], `${f}: not 20 % lighter, left untouched`);
          continue;
        }
        assert.ok(after.length < before[f].length * 0.8, `${f}: at least 20 % lighter`);
        assert.equal(after.subarray(0, 4).toString(), "RIFF");
        assert.equal(after.subarray(8, 12).toString(), "WEBP");
        assert.deepEqual(webpSize(after), webpSize(before[f]), `${f}: same dimensions`);
        saved += before[f].length - after.length;
      }
      assert.equal(result.saved, saved);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
