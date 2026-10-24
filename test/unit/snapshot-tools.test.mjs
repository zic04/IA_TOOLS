// The rules of the snapshot machinery (test/tools/snapshot.mjs, used by test/snapshot/): a snapshot is written only
// with UPDATE=1, a missing one fails instead of being created, a difference says where, and the machine leaves no
// trace in a snapshot (the control proves the matcher sees one).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSnapshot, isUpdate, machineTraces, snapshotName, SNAPSHOT_FILES } from "../tools/snapshot.mjs";

test("only UPDATE=1 regenerates: not 0, not an empty value, not true, not absent", () => {
  assert.equal(isUpdate({ UPDATE: "1" }), true);
  for (const value of ["0", "", "true", "yes", " 1", undefined])
    assert.equal(isUpdate({ UPDATE: value }), false, String(value));
  assert.equal(isUpdate({}), false);
});

test("a missing snapshot fails and writes nothing, unless UPDATE=1 asks for it", () => {
  const missing = compareSnapshot({ name: "a.html", actual: "<p>x</p>", expected: null, update: false });
  assert.equal(missing.action, "fail");
  assert.match(missing.message, /^snapshot a\.html is missing \(UPDATE=1 to create it/);
  assert.equal(compareSnapshot({ name: "a.html", actual: "<p>x</p>", expected: null, update: true }).action, "write");
});

test("the same text is accepted; a difference fails with its position and both sides; UPDATE=1 writes", () => {
  assert.deepEqual(compareSnapshot({ name: "a", actual: "same", expected: "same", update: false }), { action: "ok" });
  const differs = compareSnapshot({ name: "a.html", actual: "abcXdef", expected: "abcYdef", update: false });
  assert.equal(differs.action, "fail");
  assert.match(
    differs.message,
    /^snapshot a\.html differs at 3:\n {2}expected «abcYdef»\n {2}actual {3}«abcXdef»\n\(UPDATE=1 to accept\)$/,
  );
  assert.equal(compareSnapshot({ name: "a", actual: "new", expected: "old", update: true }).action, "write");
});

test("a text that only grows (or shrinks) is a difference too", () => {
  assert.equal(compareSnapshot({ name: "a", actual: "abc", expected: "abcd", update: false }).action, "fail");
  assert.equal(compareSnapshot({ name: "a", actual: "abcd", expected: "abc", update: false }).action, "fail");
});

test("names: one snapshot per language, named after it", () => {
  assert.deepEqual(SNAPSHOT_FILES, ["demo-docs.en.html", "demo-docs.fr.html"]);
  assert.equal(snapshotName("fr"), "demo-docs.fr.html");
});

test("positive control: machine traces are seen (kit folder, temporary folder, a Windows or a POSIX home)", () => {
  const traces = machineTraces({ roots: ["/work/doc-kit", "C:\\Users\\me\\AppData\\Local\\Temp", ""] });
  const seen = (text) => traces.some((re) => re.test(text));
  assert.ok(seen('<a href="/work/doc-kit/examples">'));
  assert.ok(seen("path C:\\Users\\me\\AppData\\Local\\Temp\\x"));
  assert.ok(seen("file C:\\Users\\someone\\docs"));
  assert.ok(seen('src="/home/alice/app/index.js"'));
  assert.ok(seen("cwd=/Users/bob/app"));
  assert.ok(seen("/var/folders/ab/cd/T/doc-kit"));
  assert.ok(!seen("<p>See /api/orders and C is a letter; Users are listed in /use/orders</p>"));
});
