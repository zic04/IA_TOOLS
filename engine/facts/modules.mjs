// `modules` source (ETUDE-CAPTURES.md, developer overview): the application's own import graph — which file
// imports which, how many files depend on each one (fan-in), how many it depends on (fan-out), and the import
// cycles. JavaScript/TypeScript and Python, with the resolvers of `sync` (engine/sync/imports.mjs); packages are
// left out.
//   item: { file, imports, importedBy, cycle }   cycle: the id of the cycle the file belongs to, or null
//   summary: { files, edges, cycles: [[file, …], …], orphans }   orphans: files nothing imports and that import
//   nothing (entry points are not told apart: a page or a route file is often one)
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "./common.mjs";
import { jsSpecifiers, pySpecifiers, resolveJs, resolvePy, loadTsconfig } from "../sync/imports.mjs";

const CODE = /\.(m?[jt]sx?|cjs|py)$/;
/** Files read at most (a large repository stays bounded). */
export const MODULES_LIMIT = 5000;

/** Strongly connected components of more than one file (Tarjan, iterative), each sorted, largest first. */
export function cyclesOf(edges) {
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const on = new Set();
  const stack = [];
  const out = [];
  for (const start of edges.keys()) {
    if (idx.has(start)) continue;
    const work = [[start, 0]];
    while (work.length) {
      const [v, i] = work.at(-1);
      if (i === 0) {
        idx.set(v, index);
        low.set(v, index++);
        stack.push(v);
        on.add(v);
      }
      const next = [...(edges.get(v) || [])];
      if (i < next.length) {
        work.at(-1)[1]++;
        const w = next[i];
        if (!idx.has(w)) work.push([w, 0]);
        else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        continue;
      }
      work.pop();
      if (work.length) {
        const u = work.at(-1)[0];
        low.set(u, Math.min(low.get(u), low.get(v)));
      }
      if (low.get(v) === idx.get(v)) {
        const comp = [];
        let w;
        do {
          w = stack.pop();
          on.delete(w);
          comp.push(w);
        } while (w !== v);
        if (comp.length > 1) out.push(comp.sort());
      }
    }
  }
  return out.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/** Import graph of a list of files (relative to appDir): Map file → Set of local files it imports. */
export function importGraph(appDir, files) {
  const edges = new Map();
  const tsconfigs = new Map();
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(appDir, file), "utf8");
    } catch {
      continue;
    }
    const out = new Set();
    if (file.endsWith(".py")) {
      for (const spec of pySpecifiers(text)) {
        const r = resolvePy(spec, file, appDir);
        if (r && r !== file) out.add(r);
      }
    } else {
      const dir = path.posix.dirname(file);
      if (!tsconfigs.has(dir)) tsconfigs.set(dir, loadTsconfig(appDir, file));
      for (const spec of jsSpecifiers(text)) {
        const r = resolveJs(spec, file, appDir, tsconfigs.get(dir));
        if (r && r !== file) out.add(r);
      }
    }
    edges.set(file, out);
  }
  return edges;
}

/** The `modules` source. */
export function collectModules(appDir) {
  const files = listFiles(appDir).filter((f) => CODE.test(f)).slice(0, MODULES_LIMIT);
  const edges = importGraph(appDir, files);
  const importedBy = new Map();
  for (const [from, tos] of edges) for (const to of tos) importedBy.set(to, (importedBy.get(to) || 0) + 1);
  const cycles = cyclesOf(edges);
  const cycleOf = new Map();
  cycles.forEach((c, i) => c.forEach((f) => cycleOf.set(f, i + 1)));
  const items = [...edges.keys()]
    .map((file) => ({ file, imports: edges.get(file).size, importedBy: importedBy.get(file) || 0, cycle: cycleOf.get(file) ?? null }))
    .sort((a, b) => b.importedBy - a.importedBy || b.imports - a.imports || a.file.localeCompare(b.file));
  const edgeCount = [...edges.values()].reduce((n, s) => n + s.size, 0);
  const orphans = items.filter((i) => !i.imports && !i.importedBy).length;
  return { items, summary: { files: items.length, edges: edgeCount, cycles, orphans } };
}
