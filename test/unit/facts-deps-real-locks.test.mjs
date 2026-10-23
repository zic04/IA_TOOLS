// The kit on lock files the tools themselves wrote (test/fixtures/locks, test/tools/lock-corpus.mjs): npm 11 (package-
// lock v1, v2, v3, and the yarn.lock npm writes) and uv 0.11 — some with their hosts rewritten or derived from another
// case and read back by the tool (case.json `generated` says so) —, each against the tool's own reading of its lock.
// The hand-written forms of the other test files say what the kit does on a form; this corpus says the forms are
// the ones the tools write.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { corpusCases, kitReading, kitProven, lockDigests, ORACLES, CORPUS } from "../tools/lock-corpus.mjs";
import { packageKey } from "../../engine/core/packages.mjs";
import { KIT_ROOT } from "../tools/helpers.mjs";

const CASES = corpusCases();
/** A name as the gateway sends it ("pip FastAPI"), as an oracle names it ("pip fastapi"). */
const oracleKey = (sent) => {
  const [ecosystem, ...name] = sent.split(" ");
  return `${ecosystem} ${packageKey(ecosystem, name.join(" "))}`;
};

describe("a lock its tool wrote: the kit proves and sends no name the tool's own reading does not prove", () => {
  for (const c of CASES)
    test(c.id, async () => {
      const oracle = new Set(ORACLES[c.kase.reading](c.reading));
      const limit = c.kase.limit?.name;
      assert.deepEqual(
        kitProven(c.app).filter((n) => !oracle.has(n)),
        [],
        `${c.id}: proven by the kit, not by ${c.kase.reading}`,
      );
      const { sent } = await kitReading(c.app);
      assert.deepEqual(
        sent.filter((n) => !oracle.has(oracleKey(n)) && n !== limit),
        [],
        `${c.id}: sent, not proven by ${c.kase.reading}`,
      );
    });
});

describe("a lock its tool wrote: the kit proves every name the tool's reading proves, but those the case lists", () => {
  for (const c of CASES)
    test(c.id, () => {
      const kit = new Set(kitProven(c.app));
      const missed = ORACLES[c.kase.reading](c.reading).filter((n) => !kit.has(n));
      assert.deepEqual(missed, Object.keys(c.kase.missed).sort(), `${c.id}: missed (case.json lists why)`);
    });
});

describe("the kit's reading of each lock is the one written (node test/tools/regen-locks.mjs rewrites it)", () => {
  for (const c of CASES)
    test(c.id, async () => {
      assert.ok(c.expected, `${c.id}: no expected.json — run node test/tools/regen-locks.mjs`);
      assert.deepEqual(await kitReading(c.app), c.expected);
    });
});

describe("the corpus", () => {
  test("each reading is of the lock as it is (node test/tools/regen-locks.mjs --readings rewrites them)", () => {
    for (const c of CASES) assert.deepEqual(lockDigests(c.app), c.kase.readingOf, `${c.id}: a lock changed since`);
  });

  test("each format the proof reads has a lock its tool wrote that proves names, and one that proves none", () => {
    const FORMATS = {
      "package-lock v1": (c) => c.format === "npm" && c.id.includes("/v1-"),
      "package-lock v2": (c) => c.format === "npm" && c.id.includes("/v2-"),
      "package-lock v3": (c) => c.format === "npm" && c.id.includes("/v3-"),
      "yarn.lock v1": (c) => c.format === "yarn-v1",
      "uv.lock": (c) => c.format === "uv",
    };
    for (const [format, of] of Object.entries(FORMATS)) {
      const proving = CASES.filter(of).map((c) => kitProven(c.app).length);
      assert.ok(
        proving.some((n) => n > 0),
        `${format}: a case that proves names`,
      );
      if (format !== "package-lock v2")
        assert.ok(
          proving.some((n) => n === 0),
          `${format}: a case that proves none`,
        );
    }
  });

  test("a case that stands for a documented limit names the sentence SECURITY.md writes, and sends its name", () => {
    const security = fs.readFileSync(path.join(KIT_ROOT, "SECURITY.md"), "utf8").replace(/\s+/g, " ");
    const limits = CASES.filter((c) => c.kase.limit);
    assert.ok(limits.length > 0);
    for (const c of limits) {
      assert.ok(security.includes(c.kase.limit.securityMd), `${c.id}: "${c.kase.limit.securityMd}" in SECURITY.md`);
      assert.ok(c.expected.sent.includes(c.kase.limit.name), `${c.id}: the limit is that ${c.kase.limit.name} is sent`);
    }
  });

  test("no path of the machine, no loopback address and no binary in the corpus", () => {
    // A drive path is the one case.json says was written so (uv's flat index, `C:/ci`); any other is a machine's.
    const LEAK = /(?<![\w+.-])[A-Za-z]:[\\/](?!ci\/)|\/(?:home|Users)\/|127\.0\.0\.1|localhost/i;
    const BINARY = /\.(?:tgz|whl|zip|gz|exe|dll)$/i;
    const found = [];
    for (const rel of fs.readdirSync(CORPUS, { recursive: true })) {
      const file = path.join(CORPUS, rel);
      if (fs.statSync(file).isDirectory()) continue;
      if (BINARY.test(rel) || LEAK.test(fs.readFileSync(file, "utf8"))) found.push(String(rel));
    }
    assert.deepEqual(found, []);
  });
});
