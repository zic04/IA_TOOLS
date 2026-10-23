// The corpus of lock files written by the tools themselves (test/fixtures/locks/<format>/<case>/): each case holds
// the application as its tool left it (app/, and the folders beside it that app/ links to), the tool's own reading of
// the lock (reading.json), how it was written (case.json) and the kit's reading of it (expected.json).
//
// The tool's reading is the oracle: a name is proven when every entry of it, as the tool reads the lock, comes from
// the public registry under its own name — npm's own reader (arborist's loadVirtual) for package-lock.json and for
// the yarn.lock npm writes, `uv export` for uv.lock. The kit may prove fewer names than the oracle (a case lists
// them in case.json's `missed`, with why), never more.
//
// test/unit/facts-deps-real-locks.test.mjs reads the corpus; test/tools/regen-locks.mjs rewrites the readings.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { checkExistence, privateRegistries } from "../../engine/facts/network.mjs";
import { packageKey } from "../../engine/core/packages.mjs";
import { sentName } from "./deps-apps.mjs";
import { KIT_ROOT } from "./helpers.mjs";

export const CORPUS = path.join(KIT_ROOT, "test", "fixtures", "locks");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sorted = (list) => [...list].sort();

/** Every case of the corpus: `{ id, format, dir, app, kase, reading, expected }` (expected null before a first regen). */
export function corpusCases() {
  const cases = [];
  for (const format of fs.readdirSync(CORPUS).sort()) {
    if (!fs.statSync(path.join(CORPUS, format)).isDirectory()) continue;
    for (const label of fs.readdirSync(path.join(CORPUS, format)).sort()) {
      const dir = path.join(CORPUS, format, label);
      const expected = path.join(dir, "expected.json");
      cases.push({
        id: `${format}/${label}`,
        format,
        dir,
        app: path.join(dir, "app"),
        kase: readJson(path.join(dir, "case.json")),
        reading: readJson(path.join(dir, "reading.json")),
        expected: fs.existsSync(expected) ? readJson(expected) : null,
      });
    }
  }
  return cases;
}

/** One item as the golden writes it: `manifest ecosystem name@version` and its flags. */
const itemLine = (i) =>
  [
    `${i.manifest} ${i.ecosystem} ${i.name}@${i.version ?? ""}`,
    ...["direct", "dev", "public", "local"].filter((f) => i[f]),
  ].join(" ");

/**
 * The kit's reading of a case: every item (one line each), the names `--network` sends (the person's configuration
 * left out: no home, no variable), the files it could not read, and the names its locks prove.
 */
export async function kitReading(app) {
  const unreadable = [];
  const items = collectDependencies(app, unreadable);
  const urls = [];
  await checkExistence(items, async (url) => (urls.push(url), { ok: true, status: 200, json: async () => ({}) }), {
    registries: privateRegistries(app, { items, env: {} }),
  });
  return {
    items: items.map(itemLine),
    sent: sorted(new Set(urls.map(sentName))),
    unreadable,
  };
}

/**
 * The names the kit proves (`public: true` on an item, whatever reader set it), as `ecosystem key` (npm exact, pip
 * PEP 503).
 */
export function kitProven(app) {
  const proven = collectDependencies(app).filter((i) => i.public === true);
  return sorted(new Set(proven.map((i) => `${i.ecosystem} ${packageKey(i.ecosystem, i.name)}`)));
}

/** The lock files of a case's application, by their path: their SHA-256 (what its reading.json was made of). */
export function lockDigests(app) {
  const out = {};
  for (const rel of fs.readdirSync(app, { recursive: true }).map(String).sort()) {
    const name = path.basename(rel);
    if (!["package-lock.json", "yarn.lock", "uv.lock", "poetry.lock"].includes(name)) continue;
    out[rel.split(path.sep).join("/")] = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(app, rel)))
      .digest("hex");
  }
  return out;
}

/** npm's public tarball of `name` at `version`, as the registry names it (and Yarn's mirror of it). */
const ownTarball = (name, version, host = "https://registry.npmjs.org") =>
  `${host}/${name}/-/${name.split("/").pop()}-${version}.tgz`;

/** `byName` of a list: name → its entries. */
function grouped(entries, keysOf) {
  const byName = new Map();
  for (const e of entries)
    for (const key of new Set(keysOf(e).filter(Boolean))) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(e);
    }
  return byName;
}

/** The oracles, by the reading's kind (case.json `reading`): the names the tool's own reading proves. */
export const ORACLES = Object.freeze({
  // arborist's nodes: a name is proven when every node placed under it is its own public tarball. A bundled copy
  // (inside another package's tarball, no `resolved` of its own) neither proves nor disproves.
  arborist(reading) {
    const proven = [];
    for (const [name, nodes] of grouped(reading, (n) => [n.name, n.packageName])) {
      const placed = nodes.filter(
        (n) =>
          (n.name === name || n.link || n.workspace || !n.location.includes("node_modules")) &&
          !(n.inBundle && !n.resolved),
      );
      if (
        placed.length &&
        placed.every(
          (n) => !n.link && n.name === name && n.packageName === name && n.resolved === ownTarball(name, n.version),
        )
      )
        proven.push(`npm ${name}`);
    }
    return sorted(proven);
  },
  // npm's reading of a yarn.lock (arborist's YarnLock): every entry of the name its own tarball, on npm's registry
  // or Yarn's mirror of it, never an alias.
  "npm-yarn-lock"(reading) {
    const proven = [];
    for (const [name, entries] of grouped(reading, (e) => [e.name]))
      if (
        entries.every(
          (e) =>
            !e.range.startsWith("npm:") &&
            (e.resolved === ownTarball(name, e.version) ||
              e.resolved?.split("#")[0] === ownTarball(name, e.version, "https://registry.yarnpkg.com")),
        )
      )
        proven.push(`npm ${name}`);
    return sorted(proven);
  },
  // `uv export`: every package of the name from PyPI's index, its files all on PyPI's file host.
  "uv-export"(reading) {
    const proven = [];
    for (const [key, packages] of grouped(reading, (p) => [packageKey("pip", p.name)]))
      if (
        packages.every(
          (p) =>
            p.index === "https://pypi.org/simple" &&
            p.files.length &&
            p.files.every((u) => String(u).startsWith("https://files.pythonhosted.org/packages/")),
        )
      )
        proven.push(`pip ${key}`);
    return sorted(proven);
  },
});
