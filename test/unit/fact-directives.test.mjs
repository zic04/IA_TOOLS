// The directives drawn from the facts (engine/build/fact-directives.mjs), called directly: the dispatch table, and
// the edge cases the Markdown engine's own tests do not reach.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFactDirectives } from "../../engine/build/fact-directives.mjs";

/** A renderer over an in-memory project: `files` maps a path to its text; every signal is recorded. */
function renderer(files) {
  const signals = [];
  const directives = createFactDirectives({
    exists: (f) => f in files,
    read: (f) => files[f],
    paths: { facts: "facts" },
    t: (key) => key,
    signal: (strict, key, vars) => signals.push({ strict, key, vars }),
    changes: [],
  });
  return { render: (kind, a = {}) => directives.render({ kind, a }), signals };
}

test("a directive that is not drawn from the facts is left to the Markdown engine (null)", () => {
  const { render, signals } = renderer({});
  for (const kind of ["capture", "diagram", "features", "usage"]) assert.equal(render(kind), null, kind);
  assert.deepEqual(signals, []);
});

test("::health with no facts at all: the strict facts.missing, then nothing — even when quality.json is falsy", () => {
  for (const quality of [undefined, "0", "false", '""']) {
    const { render, signals } = renderer(quality === undefined ? {} : { "facts/quality.json": quality });
    assert.equal(render("health"), "", `quality.json = ${quality}`);
    assert.deepEqual(
      signals.map((s) => [s.strict, s.key]),
      [[true, "facts.missing"]],
      `quality.json = ${quality}: no developer.empty on top`,
    );
  }
});

test("::facts with no source: facts.missing names facts/.json, as before the move", () => {
  const { render, signals } = renderer({});
  assert.equal(render("facts"), "");
  assert.deepEqual(signals, [{ strict: true, key: "facts.missing", vars: { source: "", file: "facts/.json" } }]);
});
