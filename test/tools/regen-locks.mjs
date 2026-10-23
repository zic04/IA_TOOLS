// Rewrites the readings of the lock corpus (test/fixtures/locks, see test/tools/lock-corpus.mjs). For developers only:
// never run by the tests.
//
//   node test/tools/regen-locks.mjs              the kit's reading of every case (expected.json), after a change
//                                                 of the readers that is meant to change it: review the diff
//   node test/tools/regen-locks.mjs --readings   the tools' own readings too (reading.json): npm's arborist, the one
//                                                 node's own npm ships, and `uv export` (uv and python on the PATH)
//   node test/tools/regen-locks.mjs --check      nothing written: exit code 1 when a reading is out of date
//
// The locks themselves are never rewritten here: each was written by its tool once, offline (case.json's `generated`
// says how), and a new case is the same — write it with the tool, then run this with --readings. Nothing of the
// corpus is executed: arborist and uv only read the lock (no install, no script, no network: `--offline --frozen`).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveOnPath } from "../../engine/util/safe-git.mjs";
import { corpusCases, kitReading, lockDigests } from "./lock-corpus.mjs";

const json = (value, indent = 1) => `${JSON.stringify(value, null, indent)}\n`;

/** node's own npm (beside the node binary): its arborist, never one from the corpus or the project. */
function npmModule(rel) {
  const bin = path.dirname(process.execPath);
  const roots = [path.join(bin, "node_modules", "npm"), path.join(bin, "..", "lib", "node_modules", "npm")];
  const root = roots.find((r) => fs.existsSync(path.join(r, "package.json")));
  if (!root) throw new Error("node's own npm not found beside the node binary");
  return createRequire(path.join(root, "package.json"))(rel);
}

/** arborist's reading of a package-lock.json: every node, its location, names, version, resolved and kind. */
async function arboristReading(app) {
  const Arborist = npmModule("@npmcli/arborist");
  const tree = await new Arborist({ path: app }).loadVirtual();
  // arborist gives an archive's path absolute (relative to the lock here, never a path of the machine) and a link's
  // relative to the link itself, as it stands.
  const fileOf = (resolved) =>
    resolved?.startsWith("file:") && path.isAbsolute(resolved.slice(5))
      ? `file:${path.relative(app, resolved.slice(5)).split(path.sep).join("/")}`
      : (resolved ?? null);
  return [...tree.inventory.values()]
    .filter((n) => n !== tree)
    .map((n) => ({
      location: n.location,
      name: n.name,
      packageName: n.packageName,
      version: n.version ?? null,
      resolved: fileOf(n.resolved),
      integrity: Boolean(n.integrity),
      link: n.isLink || undefined,
      target: n.isLink ? n.target?.location : undefined,
      inBundle: n.inBundle || undefined,
      dev: n.dev || undefined,
      optional: n.optional || undefined,
      peer: n.peer || undefined,
      workspace: n.isWorkspace || undefined,
    }))
    .sort((a, b) => (a.location < b.location ? -1 : 1));
}

/** npm's reading of a yarn.lock (arborist's YarnLock): every entry, its name, range, version and resolved. */
function npmYarnReading(app) {
  const YarnLock = npmModule("@npmcli/arborist/lib/yarn-lock.js");
  const lock = new YarnLock();
  lock.parse(fs.readFileSync(path.join(app, "yarn.lock"), "utf8"));
  return [...lock.entries].map(([spec, e]) => {
    // The name ends at the first "@" past a scope's: `my-lodash@npm:lodash@^4` is my-lodash, its range the alias.
    const at = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
    return {
      spec,
      name: spec.slice(0, at > 0 ? at : spec.length),
      range: spec.slice(at + 1),
      version: e.version,
      resolved: e.resolved ?? null,
      integrity: Boolean(e.integrity),
    };
  });
}

/** uv's reading of a uv.lock (`uv export` as pylock.toml, read by Python's own TOML reader): each package's origin. */
function uvReading(app, dir) {
  const uv = resolveOnPath("uv");
  const python = resolveOnPath("python3") ?? resolveOnPath("python");
  if (!uv || !python) throw new Error("uv and python are needed on the PATH for --readings");
  // The person's uv and pip settings are left out: the lock alone is read.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(UV_|PIP_)/i.test(k)));
  const exported = spawnSync(
    uv,
    [
      ...["export", "--format", "pylock.toml", "--frozen", "--offline", "--no-config"],
      ...["--all-groups", "--all-extras", "--all-packages", "--no-header", "--color", "never"],
    ],
    { cwd: app, env, encoding: "utf8", timeout: 120_000 },
  );
  if (exported.status !== 0) throw new Error(`uv export: ${exported.stderr.trim().split("\n").pop()}`);
  const script = [
    "import sys, tomllib, json",
    "d = tomllib.loads(sys.stdin.read())",
    "keys = ('name', 'version', 'index', 'directory', 'vcs', 'archive')",
    "def files(p):",
    "    out = [w.get('url') or w.get('path') for w in p.get('wheels', [])]",
    "    return out + ([p['sdist'].get('url') or p['sdist'].get('path')] if p.get('sdist') else [])",
    "print(json.dumps([{k: p.get(k) for k in keys} | {'files': files(p)} for p in d.get('packages', [])]))",
  ].join("\n");
  const read = spawnSync(python, ["-I", "-c", script], { input: exported.stdout, encoding: "utf8", timeout: 60_000 });
  if (read.status !== 0) throw new Error(`python: ${read.stderr.trim().split("\n").pop()}`);
  // The case's own folder, wherever the repository is: never a path of the machine in the corpus.
  return JSON.parse(read.stdout.split(pathToFileURL(dir).href).join("file:///<fixture>"));
}

const READERS = { arborist: arboristReading, "npm-yarn-lock": npmYarnReading, "uv-export": uvReading };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes("--check");
  const readings = process.argv.includes("--readings");
  let stale = 0;
  for (const c of corpusCases()) {
    const writes = [["expected.json", json(await kitReading(c.app))]];
    if (readings) {
      writes.push(["reading.json", json(await READERS[c.kase.reading](c.app, c.dir))]);
      // The lock the reading was made of, by its digest: a lock changed since makes the corpus test fail.
      writes.push(["case.json", json({ ...c.kase, readingOf: lockDigests(c.app) }, 2)]);
    }
    for (const [name, text] of writes) {
      const file = path.join(c.dir, name);
      if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) continue;
      stale++;
      console.log(
        `${check ? "out of date" : "written"}: ${path.relative(fileURLToPath(new URL("../..", import.meta.url)), file)}`,
      );
      if (!check) fs.writeFileSync(file, text);
    }
  }
  if (!stale) console.log("every reading is up to date");
  process.exitCode = check && stale ? 1 : 0;
}
