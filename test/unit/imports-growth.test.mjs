// The `paths` of a tsconfig.json stay linear on what a crafted one holds (RULES.md S5): a key is a prefix, one `*` and
// a suffix, compared with the specifier (engine/facts/imports.mjs), never a regular expression built from the key, whose
// next `*` and `?` were quantifiers (`@*a*a*a*a*a*b` took 52 s for a specifier of 100 characters). Each specifier is
// built at a base size, then 4 and 16 times larger (assertLinear, test/tools/growth.mjs), no absolute time.
// test/tools/run-plan.mjs runs this file alone, after the others. The functional tests of the keys stay in
// sync-imports.test.mjs.
import { test, describe } from "node:test";
import fs from "node:fs";
import { tempDir } from "../tools/helpers.mjs";
import { resolveJs } from "../../engine/facts/imports.mjs";
import { assertLinear } from "../tools/growth.mjs";

describe("the paths of a tsconfig.json on a long specifier (RULES.md S5)", () => {
  /** The base size: each specifier is built again 4 and 16 times larger. */
  const SIZE = 12_500;
  // Many `*` (an invalid key) and `?` (a character of the key): each was a quantifier, and backtracked.
  const KEYS = ["@*a*a*a*a*a*b", "*a*a*a*a*a*b", "@?a?a?a?a?a?b*", "@*b", "@a*"];

  test("a key of many * or ? against a specifier of one long run", () => {
    const dir = tempDir("doc-kit-imports-growth-");
    try {
      for (const key of KEYS) {
        const tsconfig = { baseUrl: ".", paths: { [key]: ["./src/*"] } };
        assertLinear(`paths key ${key}`, {
          size: SIZE,
          build: (n) => "@" + "a".repeat(n),
          run: (spec) => resolveJs(spec, "main.js", dir, tsconfig),
        });
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
