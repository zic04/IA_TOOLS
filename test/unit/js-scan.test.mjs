// The one JavaScript brace scanner (engine/util/js-scan.mjs, AUDIT.md M4), shared by facts quality, init and
// export. The cases below are those where the three former copies disagreed.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { skipToken, closingBrace, closingBraces, braceDepths } from "../../engine/util/js-scan.mjs";
import { rng } from "../tools/fuzz/prng.mjs";
import { metadataTitle } from "../../cli/commands/init.mjs";
import { freezeFallback } from "../../cli/commands/export.mjs";

describe("js-scan", () => {
  test("skipToken: strings, template literals, comments; nothing else", () => {
    assert.equal(skipToken(`"a\\"}" x`, 0), 6);
    assert.equal(skipToken("`a ${ { b: '}' } } c` x", 0), 21);
    assert.equal(skipToken("// }\nx", 0), 5);
    assert.equal(skipToken("/* } */x", 0), 7);
    assert.equal(skipToken("{ x }", 0), 0);
  });

  test("closingBrace: braces in strings, template substitutions and block comments are not counted", () => {
    assert.equal(closingBrace("{ '}' }", 0), 6);
    assert.equal(closingBrace("{ a: `${ '}' }` }", 0), 16);
    assert.equal(closingBrace("{ /* } */ }", 0), 10);
    assert.equal(closingBrace("{ a: `${`}`}` }", 0), 14);
    assert.equal(closingBrace("{ { }", 0), -1);
  });

  test("closingBrace with a limit: a brace closed at the limit or after it is not found", () => {
    assert.deepEqual([closingBrace("{ }", 0, 3), closingBrace("{ }", 0, 2)], [2, -1]);
    assert.equal(closingBrace("{ '}' }", 0, 6), -1, "the string skipped, the brace after the limit");
  });

  test("closingBraces: in one pass, what closingBrace gives for each brace of the code; none for one in a token", () => {
    const r = rng(0x5e03c18f);
    const tokens = ["{", "}", "{ }", "'}'", '"{"', "`${", "`", "${ { } }`", "// }\n", "/* { */", "x", "\n", "\\"];
    for (let k = 0; k < 500; k++) {
      const text = Array.from({ length: r.int(30) }, () => r.pick(tokens)).join("");
      const code = closingBraces(text);
      for (const [open, close] of code) {
        assert.equal(text[open], "{", JSON.stringify(text));
        assert.equal(close, closingBrace(text, open), `${JSON.stringify(text)} at ${open}`);
      }
      // A brace of the code is one braceDepths counts: one more after it than before.
      const depth = braceDepths(text);
      for (let i = 0; i < text.length; i++)
        if (text[i] === "{")
          assert.equal(code.has(i), depth[i + 1] === depth[i] + 1, `${JSON.stringify(text)} at ${i}`);
    }
  });

  test("braceDepths: the depth before each character, comments and strings at the depth around them", () => {
    const d = braceDepths("{ /* { */ a }");
    assert.deepEqual([d[0], d[2], d[5], d[10], d[12], d[13]], [0, 1, 1, 1, 1, 0]);
  });

  test("callers: a brace in a block comment no longer breaks init's metadata title, nor a template one export's fallback", () => {
    assert.equal(metadataTitle("export const metadata = {\n  /* { */\n  title: 'Acme Orders',\n};"), "Acme Orders");
    // A template literal nested in a substitution: the former export copy ended the outer one at the inner "`".
    const src = 'export default {\n  version: { file: `v${`}`}.txt`, fallback: "0.9.0" },\n};\n';
    assert.equal(
      freezeFallback(src, "1.2.0"),
      'export default {\n  version: { file: `v${`}`}.txt`, fallback: "1.2.0" },\n};\n',
    );
  });
});
