// The abstract model a generated lock is rendered from (test/tools/fuzz/render-*.mjs): the packages of an application,
// each declared or not by its manifest, each with its instances in the lock — `{ kind, depth }`, the kind saying where
// that copy came from (`public`: its own tarball or PyPI's registry; `bundled`, `pypi-explicit`: neutral forms that
// neither prove nor disprove; any other kind: negative evidence) —, the application's own names and the declarations
// planted beside it. The oracles (oracles.mjs) read the model and the tags of its rendering, never the kit's code.

/** Bumped whenever a change to the generators makes a seed build another case: a seed reproduces in one version. */
export const GEN_VERSION = 1;

/**
 * The names a model takes its packages from: public-looking ones, a company's (`corp-*`, a scope), pip names written
 * with `_` and `.`, and two names one substitution apart (`pkg-a1`, `pkg-a2`) so that one flipped character can turn a
 * name into another. Distinct under the oracles' coarse key: two packages of a model never share a folder.
 */
export const POOLS = Object.freeze({
  npm: Object.freeze([
    "chalk",
    "lodash",
    "react",
    "left-pad",
    "debug",
    "is-odd",
    "corp-lib",
    "corp-ui",
    "@corp/ui",
    "@acme/core",
    "pkg-a1",
    "pkg-a2",
  ]),
  pip: Object.freeze([
    "requests",
    "fastapi",
    "httpx",
    "Django",
    "corp_lib",
    "corp.auth",
    "my-lib",
    "typing_extensions",
    "pkg-a1",
    "pkg-a2",
  ]),
});

/**
 * Names no public registry can hold (I5): a fullwidth letter, a space, an accent, a leading `_` or `.`, a combining
 * mark, a trailing separator. A lock may still name them with a public tarball: such a proof is forged, and the name
 * must never leave the machine.
 */
export const ODD_POOLS = Object.freeze({
  npm: Object.freeze(["ｃorp-lib", "corp lib", "café", "_corp", ".corp", "corp-lib́"]),
  pip: Object.freeze(["café", "corp lib", "_corp", "corp-", "naïve_lib", "corp-lib́"]),
});

/** A package no model holds: the target of an alias and the owner of "another package's tarball". */
export const OTHER = "fuzz-other";

/** The kinds of instance that neither prove nor disprove a name, and the one that proves it. */
export const NEUTRAL = Object.freeze(new Set(["bundled", "pypi-explicit"]));
export const PUBLIC = "public";

/** Whether an instance is negative evidence: any kind but the public one and the neutral ones. */
export const isNegative = (instance) => instance.kind !== PUBLIC && !NEUTRAL.has(instance.kind);

/**
 * @typedef {{ kind: string, depth: number, spell?: number, field?: string, target?: string }} Instance
 * @typedef {{ name: string, direct: boolean, dev: boolean, deps: string[], instances: Instance[] }} Package
 * @typedef {{ kind: "npmAll"|"npmScope"|"pipAll"|"uvSource", name?: string }} Declaration
 * @typedef {{ eco: "npm"|"pip", packages: Package[], own: string[], decls: Declaration[] }} Model
 * @typedef {{ eco: "npm"|"pip", negative: readonly string[], neutral: readonly string[] }} Kinds
 */

/** The version of a package's instance `k`: each copy its own (`1.0.0`, `2.0.0`…). */
export const versionOf = (k) => `${k + 1}.0.0`;

/**
 * A model drawn from `r`: 1 to `max` packages of the pool, most of them declared (some as dev dependencies), each with
 * 0 to 3 instances — the first usually public and at the top of node_modules, the others nested, public, neutral or
 * negative —, now and then an own name taken from the packages. The bias keeps most models sending a name: a property
 * that holds because nothing is ever sent proves nothing (the non-vacuity guard counts them).
 * @param {import("./prng.mjs").Rng} r
 * @param {Kinds} kinds
 * @param {{ max?: number, odd?: boolean }} [o]  odd: one to three names of ODD_POOLS among the others
 * @returns {Model}
 */
export function genModel(r, kinds, { max = 8, odd = false } = {}) {
  let names = r.shuffle(POOLS[kinds.eco]).slice(0, 1 + r.int(max));
  if (odd) names = [...r.shuffle(ODD_POOLS[kinds.eco]).slice(0, 1 + r.int(3)), ...names.slice(0, 3)];
  const packages = names.map((name) => {
    const direct = r.chance(0.75);
    const count = r.chance(0.08) ? 0 : 1 + (r.chance(0.3) ? 1 + r.int(2) : 0);
    const instances = [];
    for (let k = 0; k < count; k++) {
      let kind = PUBLIC;
      if (k === 0 ? r.chance(0.2) : r.chance(0.45))
        kind = k > 0 && kinds.neutral.length && r.chance(0.3) ? r.pick(kinds.neutral) : r.pick(kinds.negative);
      // A declared package has its first copy at the top of node_modules, as npm installs it; nested copies below.
      const depth = k === 0 && (direct || r.chance(0.6)) ? 1 : 2;
      instances.push({ kind, depth: kind === "bundled" ? 2 : depth });
    }
    return { name, direct, dev: direct && r.chance(0.25), deps: [], instances };
  });
  for (const p of packages) if (r.chance(0.35)) p.deps = [r.pick(names)].filter((n) => n !== p.name);
  return { eco: kinds.eco, packages, own: r.chance(0.12) ? [r.pick(names)] : [], decls: [] };
}

/** A deep copy of a model (the operators and the shrinker change copies, never the case they were given). */
export const cloneModel = (model) => structuredClone(model);

/**
 * The smaller models the shrinker tries, simplest change first: one package less, one instance less, an own name or
 * a declaration less, then plainer packages (no dependency, not dev, a plain name). Each is a new model.
 * @param {Model} model
 * @returns {Model[]}
 */
export function smallerModels(model) {
  const out = [];
  const edit = (fn) => {
    const m = cloneModel(model);
    fn(m);
    out.push(m);
  };
  model.packages.forEach((_, i) => edit((m) => m.packages.splice(i, 1)));
  model.packages.forEach((p, i) => p.instances.forEach((_, k) => edit((m) => m.packages[i].instances.splice(k, 1))));
  model.own.forEach((_, i) => edit((m) => m.own.splice(i, 1)));
  model.decls.forEach((_, i) => edit((m) => m.decls.splice(i, 1)));
  model.packages.forEach((p, i) => {
    if (p.deps.length) edit((m) => (m.packages[i].deps = []));
    if (p.dev) edit((m) => (m.packages[i].dev = false));
  });
  return out;
}
