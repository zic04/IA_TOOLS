// Migrations of documentation projects, run by `doc-kit upgrade` (dry run by default, written with --apply).
// A migration is a file engine/migrations/<version>.mjs (the kit version that needs it):
//   export const version = "0.2.0";                     // equal to the file name
//   export async function migrate({ files, config, root }) {
//     // files.read(rel) · files.write(rel, text) · files.exists(rel) · files.list(dir) · files.remove(rel)
//     // paths are relative to the project, with forward slashes; nothing touches the disk until --apply
//   }
// Its title, shown by upgrade, is the i18n key cli.migration.<version>.
// The migrations that run are those newer than the lowest version the project's `kit` range allows (^0.1.0 →
// 0.1.0, ^0.4.0 || ^0.3.0 → 0.3.0, <1.0.0 → 0.0.0; all of them when it allows none) and not newer than the
// installed kit, in version order (engine/project/semver.mjs: npm's rules).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { KitError } from "../project/errors.mjs";
import { compareVersions, minVersion } from "../project/semver.mjs";

const FOLDER = path.dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = /^(\d+)\.(\d+)\.(\d+)\.mjs$/;

/**
 * Is a kit version past the project's range (newer than the lowest version it allows; any, when it allows none or
 * cannot be read) and not past the installed kit? Its migrations run and its changes are shown (`upgrade`).
 * @returns {(version: string) => boolean}
 */
export function sinceRange(range, kitVersion) {
  const base = minVersion(range);
  return (version) => (!base || compareVersions(version, base) > 0) && compareVersions(version, kitVersion) <= 0;
}

/** Available migrations: [{ version, file }], sorted. */
export function listMigrations(folder = FOLDER) {
  return fs
    .readdirSync(folder)
    .filter((f) => VERSION_FILE.test(f))
    .map((f) => ({ version: f.slice(0, -4), file: path.join(folder, f) }))
    .sort((a, b) => compareVersions(a.version, b.version));
}

/** Migrations to run between the project's range and the installed kit. */
export function pendingMigrations(range, kitVersion, folder = FOLDER) {
  const pending = sinceRange(range, kitVersion);
  return listMigrations(folder).filter((m) => pending(m.version));
}

/**
 * Virtual view of the project's files: reads go to the disk unless the file was changed; writes stay in memory.
 * `changes()` lists the changed files with their original and new contents.
 */
export function createVirtualFiles(root) {
  const changed = new Map(); // rel → string | null (removed)
  const abs = (rel) => path.join(root, ...String(rel).split("/"));
  const norm = (rel) => String(rel).split(path.sep).join("/").replace(/^\.\//, "");
  const original = (rel) => (fs.existsSync(abs(rel)) ? fs.readFileSync(abs(rel), "utf8") : null);
  return {
    read(rel) {
      rel = norm(rel);
      if (changed.has(rel)) {
        if (changed.get(rel) === null) throw new Error(`removed: ${rel}`);
        return changed.get(rel);
      }
      return fs.readFileSync(abs(rel), "utf8");
    },
    exists(rel) {
      rel = norm(rel);
      return changed.has(rel) ? changed.get(rel) !== null : fs.existsSync(abs(rel));
    },
    write(rel, text) {
      changed.set(norm(rel), String(text));
    },
    remove(rel) {
      changed.set(norm(rel), null);
    },
    list(dir = "") {
      dir = norm(dir);
      const base = abs(dir);
      const onDisk = fs.existsSync(base)
        ? fs
            .readdirSync(base, { recursive: true })
            .map((f) => norm(path.join(dir, String(f))))
            .filter((f) => fs.statSync(abs(f)).isFile())
        : [];
      const all = new Set(onDisk);
      for (const [rel, v] of changed)
        if (!dir || rel.startsWith(dir + "/")) v === null ? all.delete(rel) : all.add(rel);
      return [...all].sort();
    },
    /** [{ file, before: string|null, after: string|null }] — files whose content really changed. */
    changes() {
      return [...changed]
        .map(([file, after]) => ({ file, before: original(file), after }))
        .filter((c) => c.before !== c.after)
        .sort((a, b) => a.file.localeCompare(b.file));
    },
    /** Writes the changes to the disk. */
    apply() {
      for (const c of this.changes()) {
        if (c.after === null) fs.rmSync(abs(c.file), { force: true });
        else {
          fs.mkdirSync(path.dirname(abs(c.file)), { recursive: true });
          fs.writeFileSync(abs(c.file), c.after);
        }
      }
    },
  };
}

/**
 * Runs migrations on a virtual view (nothing written). Returns [{ version, error?, key?, vars? }]: a migration that
 * refuses a project throws a KitError, whose message key and variables `upgrade` shows in the project's language.
 * @returns {Promise<Array<{ version: string, error?: string, key?: string, vars?: object }>>}
 */
export async function runMigrations(migrations, { files, config, root }) {
  /** @type {Array<{ version: string, error?: string, key?: string, vars?: object }>} */
  const done = [];
  for (const m of migrations) {
    const mod = await import(pathToFileURL(m.file).href);
    if (mod.version !== m.version) {
      done.push({ version: m.version, error: `version "${mod.version}" ≠ file name` });
      break;
    }
    try {
      await mod.migrate({ files, config, root });
      done.push({ version: m.version });
    } catch (e) {
      done.push({
        version: m.version,
        error: e.message,
        ...(e instanceof KitError ? { key: e.key, vars: e.vars } : {}),
      });
      break;
    }
  }
  return done;
}

/** The lines of a text, each with its "\n" but a last one that has none (so that the two never compare equal). */
function linesOf(text) {
  if (!text) return [];
  const lines = text.split("\n").map((l) => l + "\n");
  const last = lines.pop().slice(0, -1);
  return last ? [...lines, last] : lines;
}

/**
 * Unified diff of two texts (3 lines of context), "" when equal: a patch as `diff -u` writes one, a last line with
 * no line break marked "\ No newline at end of file" (test/unit/upgrade.test.mjs applies it).
 */
export function unifiedDiff(file, before, after, context = 3) {
  const a = linesOf(before);
  const b = linesOf(after);
  // Common prefix and suffix, then a longest-common-subsequence table on the middle.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops = []; // [type, line] with type " ", "-", "+"
  for (let i = 0; i < start; i++) ops.push([" ", a[i]]);
  if (midA.length * midB.length > 4e6) {
    for (const l of midA) ops.push(["-", l]);
    for (const l of midB) ops.push(["+", l]);
  } else {
    const n = midA.length;
    const m = midB.length;
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        ops.push([" ", midA[i++]]);
        j++;
      } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) ops.push(["-", midA[i++]]);
      else ops.push(["+", midB[j++]]);
    }
  }
  for (let i = endA; i < a.length; i++) ops.push([" ", a[i]]);
  if (!ops.some((o) => o[0] !== " ")) return "";

  // Hunks.
  const lines = [
    `--- ${before === null ? "/dev/null" : "a/" + file}`,
    `+++ ${after === null ? "/dev/null" : "b/" + file}`,
  ];
  let lineA = 1;
  let lineB = 1;
  const positions = ops.map((o) => {
    const p = [lineA, lineB];
    if (o[0] !== "+") lineA++;
    if (o[0] !== "-") lineB++;
    return p;
  });
  // Changes closer than 2 × context lines share a hunk.
  const groups = [];
  ops.forEach((o, i) => {
    if (o[0] === " ") return;
    const g = groups.at(-1);
    if (g && i - g.last <= context * 2 + 1) g.last = i;
    else groups.push({ first: i, last: i });
  });
  for (const g of groups) {
    const from = Math.max(0, g.first - context);
    const to = Math.min(ops.length, g.last + context + 1);
    const hunk = ops.slice(from, to);
    const countA = hunk.filter((o) => o[0] !== "+").length;
    const countB = hunk.filter((o) => o[0] !== "-").length;
    lines.push(
      `@@ -${countA ? positions[from][0] : positions[from][0] - 1},${countA} +${countB ? positions[from][1] : positions[from][1] - 1},${countB} @@`,
    );
    for (const [t, l] of hunk)
      if (l.endsWith("\n")) lines.push(t + l.slice(0, -1));
      else lines.push(t + l, "\\ No newline at end of file");
  }
  return lines.join("\n");
}

/**
 * New source of doc.config.mjs with `kit` set to `range` (inserted after the opening of the exported object
 * when missing). null when the object cannot be found.
 */
export function setKitRange(source, range) {
  const literal = JSON.stringify(range);
  const key = /(^|[\s,{])(kit\s*:\s*)(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)/m;
  if (key.test(source)) return source.replace(key, (m, a, b) => `${a}${b}${literal}`);
  const object = /export\s+default\s+(?:defineConfig\s*\(\s*)?\{/.exec(source);
  if (!object) return null;
  const at = object.index + object[0].length;
  return `${source.slice(0, at)}\n  kit: ${literal},${source.slice(at)}`;
}
