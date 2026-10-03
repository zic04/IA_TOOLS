// RULES.md M14 (AUDIT.md M13): the folders of engine/ import one another without a cycle. Shared pieces live in
// engine/core/ (hashes, text helpers, page templates, translated files) so that, from the bottom up, capture,
// check, facts, sync and build only ever import downwards. A folder cycle is reported with the files that close it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../tools/helpers.mjs";

const ENGINE = path.join(KIT_ROOT, "engine");
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g;

/** Folder of engine/ a file belongs to ("." for the files at the root of engine/). */
const folderOf = (file) => {
  const parts = path.relative(ENGINE, file).split(path.sep);
  return parts.length > 1 ? parts[0] : ".";
};

/** { folder: Map<imported folder, first importing file> } over every module of engine/. */
function folderGraph() {
  const graph = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else if (/\.(mjs|js)$/.test(e.name)) {
        const from = folderOf(file);
        if (!graph.has(from)) graph.set(from, new Map());
        for (const [, spec] of fs.readFileSync(file, "utf8").matchAll(SPECIFIER)) {
          const target = path.resolve(path.dirname(file), spec);
          if (!target.startsWith(ENGINE + path.sep)) continue;
          const to = folderOf(target);
          if (to !== from && !graph.get(from).has(to))
            graph.get(from).set(to, path.relative(KIT_ROOT, file).split(path.sep).join("/"));
        }
      }
    }
  };
  walk(ENGINE);
  return graph;
}

/** The cycles of a folder graph: its strongly connected components of more than one folder (Tarjan). */
function cycles(graph) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const order = new Map();
  const low = new Map();
  const found = [];
  const visit = (v) => {
    order.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v)?.keys() || []) {
      if (!order.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), order.get(w)));
    }
    if (low.get(v) === order.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) found.push(component.sort());
    }
  };
  for (const v of graph.keys()) if (!order.has(v)) visit(v);
  return found;
}

test("the cycle finder reports a folder cycle, and only a cycle", () => {
  const g = (edges) => new Map(Object.entries(edges).map(([k, v]) => [k, new Map(v.map((t) => [t, "x"]))]));
  assert.deepEqual(cycles(g({ build: ["sync"], sync: ["check"], check: ["build"], core: [] })), [
    ["build", "check", "sync"],
  ]);
  assert.deepEqual(cycles(g({ build: ["sync", "core"], sync: ["core"], core: [] })), []);
});

test("the folders of engine/ import one another without a cycle (RULES.md M14)", () => {
  const graph = folderGraph();
  assert.ok(graph.get("build")?.has("core"), "the scan sees the imports (build imports core)");
  const report = cycles(graph).map((component) =>
    component
      .flatMap((from) =>
        [...graph.get(from)].filter(([to]) => component.includes(to)).map(([to, file]) => `${from} → ${to} (${file})`),
      )
      .join("; "),
  );
  assert.deepEqual(report, [], "move the shared module to engine/core/, or import it from the lower folder");
});
