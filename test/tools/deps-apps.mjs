// Small applications for the dependency and network tests (test/unit/facts-deps-*.test.mjs, facts-network-*.test.mjs):
// written under a new temporary folder, read by collectDependencies, then handed to the network gateway with a spy
// `fetch` (no request leaves the machine; the person's configuration is never read unless a test gives it).
//
// The words the tests use, once:
//   proven    an item a lock file marks `public: true` — the public registry served it (the only names sent);
//   unproven  a name no lock proves (a manifest alone, a lock that proves nothing): kept back, `unproven: true`;
//   local     an item a manifest or a lock took from elsewhere than a public registry (`local: true`);
//   private   a name the second net keeps back (a place, an own name, a declaration): `private: true`;
//   sent      the names `--network` asks a registry for, as "npm react" or "pip fastapi".
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { checkExistence, privateRegistries } from "../../engine/facts/network.mjs";
import { tempDir } from "./helpers.mjs";

/** Writes `files` (relative path → text, a Buffer written as its bytes, or JSON) under a new folder; its path. */
export function app(files, dir = tempDir("doc-kit-deps-")) {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    const bytes = typeof content === "string" || Buffer.isBuffer(content) ? content : JSON.stringify(content);
    fs.writeFileSync(path.join(dir, rel), bytes);
  }
  return dir;
}

/** Runs `fn(dir)` on an application made of `files`, its folder removed after. */
export async function withApp(files, fn) {
  const dir = app(files);
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

/**
 * The `ecosystem name` of a URL the gateway requested (npm's latest version's document, its encoded name decoded;
 * PyPI's JSON URL); any other URL is `? <url>`.
 */
export function sentName(url) {
  const npm = /^https:\/\/registry\.npmjs\.org\/([^/]+)\/latest$/.exec(url);
  if (npm) return `npm ${decodeURIComponent(npm[1])}`;
  const pip = /^https:\/\/pypi\.org\/pypi\/([^/]+)\/json$/.exec(url);
  return pip ? `pip ${pip[1]}` : `? ${url}`;
}

/**
 * What `--network` does for an application made of `files`: `sent`, the names it asks a registry for (sorted);
 * `kept`, why each other direct name stays back ("private" before "unproven" when manifests disagree); `items`, the
 * items read; `unreadable`, the files that could not be read; `urls`, the requests as made.
 * `proof`: "locks" (as it is: only what a lock proves) or "all" (every item marked proven: what keeps a name back is
 * then the second net alone). `env`: the person's variables (none by default); `home`: files written in a home folder
 * given as HOME and USERPROFILE. `answer(url)`: what the spy registry answers (by default a 200 with no body).
 * @param {Record<string, unknown>} files
 * @param {{ proof?: "locks"|"all", env?: Record<string, string>, home?: Record<string, unknown>,
 *   answer?: (url: string) => unknown }} [options]
 */
export async function network(
  files,
  { proof = "locks", env = {}, home, answer = () => ({ ok: true, status: 200 }) } = {},
) {
  const homeDir = home ? app(home) : null;
  try {
    return await withApp(files, async (dir) => {
      const unreadable = [];
      const items = collectDependencies(dir, unreadable);
      const judged = proof === "all" ? items.map((i) => ({ ...i, public: true })) : items;
      const fullEnv = homeDir ? { HOME: homeDir, USERPROFILE: homeDir, ...env } : env;
      const urls = [];
      const out = await checkExistence(judged, async (url) => (urls.push(url), answer(url)), {
        registries: privateRegistries(dir, { items: judged, env: fullEnv }),
      });
      const kept = {};
      for (const item of out) {
        if (!item.private && !item.unproven) continue;
        const key = `${item.ecosystem} ${item.name}`;
        if (kept[key] !== "private") kept[key] = item.private ? "private" : "unproven";
      }
      return { sent: [...new Set(urls.map(sentName))].sort(), kept, items, out, unreadable, urls };
    });
  } finally {
    if (homeDir) fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

/** Asserts `--network` sends exactly `expected` ("npm react", "pip fastapi") for `files`, every file read. */
export async function expectSent(files, expected, options = {}) {
  const result = await network(files, options);
  assert.deepEqual(result.sent, [...expected].sort(), options.label);
  if (!options.unreadable) assert.deepEqual(result.unreadable, [], `${options.label ?? ""} every file read`);
  return result;
}

/**
 * Asserts `--network` sends nothing for `files`, and keeps back each named direct item for its reason
 * (`{ "pip corp-lib": "private" }`): the item exists and was read, so that "nothing sent" never stands for "nothing
 * read". `unreadable`: the files expected unreadable (none by default).
 */
export async function expectNothingSent(files, kept, options = {}) {
  const result = await network(files, options);
  const label = options.label ?? JSON.stringify(Object.keys(files));
  assert.deepEqual(result.sent, [], label);
  for (const [key, reason] of Object.entries(kept)) assert.equal(result.kept[key], reason, `${label}: ${key}`);
  assert.deepEqual(result.unreadable, options.unreadable ?? [], `${label}: unreadable files`);
  return result;
}

/**
 * A minimal pair: `base` sends `name` ("npm corp-lib"), `changed` — the same files but for the rule under test — keeps
 * it back for `reason` ("unproven" by default). The base proves the change, not the default, is what keeps it back.
 */
export async function expectProofDropped({ base, changed, name, reason = "unproven", label, ...options }) {
  const before = await network(base, options);
  assert.ok(before.sent.includes(name), `${label ?? name}: the base sends ${name} (sent: ${before.sent})`);
  const after = await network(changed, options);
  assert.ok(!after.sent.includes(name), `${label ?? name}: no longer sent (sent: ${after.sent})`);
  assert.equal(after.kept[name], reason, `${label ?? name}: kept back as ${reason}`);
  return { before, after };
}

/** The private declarations `privateRegistries` reads for an application made of `files` (and a home, variables). */
export async function registriesOf(files, { env = {}, home } = {}) {
  const homeDir = home ? app(home) : null;
  try {
    return await withApp(files, (dir) =>
      privateRegistries(dir, { env: homeDir ? { HOME: homeDir, USERPROFILE: homeDir, ...env } : env }),
    );
  } finally {
    if (homeDir) fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

/**
 * The dependencies of an application made of `files`, by manifest then name — a reader that gives one name twice in a
 * manifest (an item hidden by another) fails the test.
 */
export function deps(files) {
  const dir = app(files);
  try {
    const out = {};
    for (const item of collectDependencies(dir)) {
      const byName = (out[item.manifest] ??= {});
      assert.ok(!(item.name in byName), `${item.manifest}: ${item.name} given twice`);
      byName[item.name] = item;
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
