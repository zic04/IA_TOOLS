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

test("::facts{source} that is not a plain name (a path that climbs, a slash, a dot): facts.source, never read", () => {
  for (const source of ["../../..", "../../secret", "a/b", "env.json", "Env", "a b", "a\\b"]) {
    const reads = [];
    const files = { [`facts/${source}.json`]: '{"items":[{"x":1}]}' };
    const signals = [];
    const directives = createFactDirectives({
      exists: (f) => (reads.push(f), f in files),
      read: (f) => (reads.push(f), files[f]),
      paths: { facts: "facts" },
      t: (key) => key,
      signal: (strict, key, vars) => signals.push({ strict, key, vars }),
      changes: [],
    });
    assert.equal(directives.render({ kind: "facts", a: { source } }), "", source);
    assert.deepEqual(signals, [{ strict: true, key: "facts.source", vars: { source } }], source);
    assert.deepEqual(reads, [], `${source}: no file is looked at`);
  }
  const { render, signals } = renderer({ "facts/env.json": '{"items":[{"name":"A"}]}' });
  assert.match(render("facts", { source: "env" }), /<table data-generated="facts">/, "a plain name is read");
  assert.deepEqual(signals, []);
});

test("::health counts packages, not items: a package named by a manifest and by its lock is one", () => {
  const items = [
    { name: "react", version: null, spec: "^18", ecosystem: "npm", direct: true, dev: false, manifest: "package.json" },
    { name: "react", version: "18.3.1", ecosystem: "npm", direct: true, dev: false, manifest: "yarn.lock" },
    { name: "left-pad", version: "1.3.0", ecosystem: "npm", direct: false, dev: false, manifest: "yarn.lock" },
  ];
  const { render } = renderer({ "facts/dependencies.json": JSON.stringify({ source: "dependencies", items }) });
  assert.match(render("health"), /render\.health\.direct<\/span><strong>1</);
});

test("::health: my_lib and My-Lib are one pip package (PEP 503), two npm ones", () => {
  const item = (name, ecosystem) => ({ name, version: "1.0.0", ecosystem, direct: true, dev: false, manifest: "m" });
  const count = (items) =>
    renderer({ "facts/dependencies.json": JSON.stringify({ source: "dependencies", items }) })
      .render("health")
      .match(/render\.health\.direct<\/span><strong>(\d+)</)?.[1];
  assert.equal(count([item("my_lib", "pip"), item("My-Lib", "pip")]), "1");
  assert.equal(count([item("my_lib", "npm"), item("my-lib", "npm")]), "2");
});
