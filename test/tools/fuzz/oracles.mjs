// The oracles of the property tests of the lock proof (critic's design, §1–§3): what may never be sent, read from how
// the case was built — the tags of its rendering and the model —, never from the kit's code. Deliberately independent
// of engine/core/packages.mjs (an oracle that shares the code it checks would agree with its mistakes): the coarse key
// here is coarser than the kit's, so that a twin the kit misses still collides.
import path from "node:path";
import { PUBLIC, isNegative } from "./model.mjs";
import { logicalText } from "./lines.mjs";

/** The four lock files whose items may carry `public: true` (a proof): any other file proves nothing. */
export const PROOF_LOCKS = Object.freeze(new Set(["package-lock.json", "yarn.lock", "poetry.lock", "uv.lock"]));

/** A pip name as PEP 503 compares names (case and runs of `-_.` aside). */
export const pep503 = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[-_.]+/g, "-");

/** The identity of a package: an npm name exactly, a pip name as PEP 503 says. */
export const identity = (eco, name) => `${eco} ${eco === "pip" ? pep503(name) : name}`;

/**
 * The coarse key of a name: NFKC, lower case, trailing dots and spaces dropped (one folder on Windows and macOS),
 * then PEP 503 for pip. Two names with one coarse key are one name to the oracle.
 */
export function coarse(eco, name) {
  let k = String(name).normalize("NFKC").toLowerCase();
  let end = k.length;
  while (end > 0 && (k[end - 1] === "." || k[end - 1] === " ")) end--;
  k = k.slice(0, end);
  return `${eco} ${eco === "pip" ? k.replace(/[-_.]+/g, "-").replace(/-$/, "") : k}`;
}

/** How many `"""` and `'''` a text holds (a matched pair may legitimately swallow evidence into a string). */
const triples = (text) => (text.match(/"""|'''/g) ?? []).length;

/** Whether JSON.parse — npm's own reading — still finds every witness of a JSON group in the text. */
function witnessed(doc, witness) {
  let root;
  try {
    root = JSON.parse(logicalText(doc));
  } catch {
    return false;
  }
  return witness.every(({ path: keys, field, equals, missing, falsy }) => {
    let at = root;
    for (const k of keys) {
      if (at === null || typeof at !== "object" || !Object.hasOwn(at, k)) return false;
      at = at[k];
    }
    if (at === null || typeof at !== "object") return false;
    if (missing) return !Object.hasOwn(at, field);
    if (falsy) return !at[field];
    return Object.hasOwn(at, field) && at[field] === equals;
  });
}

/**
 * Whether a planted group is still intact (critic's design, "Intactness"): every line of it present, byte for byte;
 * a JSON group still witnessed by JSON.parse; in a TOML file, as many triple quotes as when it was rendered.
 * @param {import("./lines.mjs").Group} group
 * @param {Map<string, import("./lines.mjs").Doc>} now      the files after the operators
 * @param {Map<string, import("./lines.mjs").Doc>} rendered the files as rendered
 */
export function intact(group, now, rendered) {
  const doc = now.get(group.rel);
  if (!doc || !group.lines.length) return false;
  const texts = new Map(doc.lines.map((l) => [l.id, l.text]));
  if (!group.lines.every(([id, text]) => texts.get(id) === text)) return false;
  if (doc.kind === "json" && group.witness) return witnessed(doc, group.witness);
  if (doc.kind === "toml") return triples(logicalText(doc)) === triples(logicalText(rendered.get(group.rel)));
  return true;
}

/**
 * What may never be sent for a case (I2′): a predicate on `(eco, name)`, by coarse key — the names whose planted
 * negative group is intact, the own names, every npm name under an intact npm registry, the `@corp` names under its
 * scope's, every pip name under an intact pip index, the names `[tool.uv.sources]` takes elsewhere, and (`built`:
 * no edit anywhere among the operators) the direct names the model gives no public instance.
 * @param {import("./model.mjs").Model} model  the model as rendered (its operators applied)
 * @param {import("./lines.mjs").Rendering} rendering
 * @param {import("./lines.mjs").Doc[]} docs  the files after the text operators
 * @param {{ built?: boolean }} [o]
 * @returns {{ forbidden: (eco: string, name: string) => string|null }} the reason, or null when it may be sent
 */
export function mustNotSend(model, rendering, docs, { built = true } = {}) {
  const now = new Map(docs.map((d) => [d.rel, d]));
  const rendered = new Map(rendering.docs.map((d) => [d.rel, d]));
  const names = new Map();
  const decls = new Set();
  for (const g of rendering.groups) {
    if (!intact(g, now, rendered)) continue;
    if (g.kind === "decl" && g.decl !== "uvSource") decls.add(g.decl);
    else names.set(coarse(g.eco, g.name), `${g.kind} group ${g.id}${g.decl ? ` (${g.decl})` : ""}`);
  }
  if (built)
    for (const p of model.packages)
      if (p.direct && !p.instances.some((i) => i.kind === PUBLIC) && !names.has(coarse(model.eco, p.name)))
        names.set(coarse(model.eco, p.name), "a direct name with no public instance");
  return {
    forbidden(eco, name) {
      const why = names.get(coarse(eco, name));
      if (why) return why;
      if (eco === "npm" && decls.has("npmAll")) return "npm registry declared";
      if (eco === "npm" && decls.has("npmScope") && name.toLowerCase().startsWith("@corp/"))
        return "@corp scope declared";
      if (eco === "pip" && decls.has("pipAll")) return "pip index declared";
      return null;
    },
  };
}

/** Whether a declaration of a model keeps a name back (R-DECL's `affected(D)`, R-MODEL). */
export function declaredPrivate(model, eco, name) {
  return model.decls.some(
    (d) =>
      (d.kind === "npmAll" && eco === "npm") ||
      (d.kind === "npmScope" && eco === "npm" && name.toLowerCase().startsWith("@corp/")) ||
      (d.kind === "pipAll" && eco === "pip") ||
      (d.kind === "uvSource" && eco === "pip" && coarse(eco, d.name) === coarse(eco, name)),
  );
}

/**
 * What a clean model's canonical rendering must send (R-MODEL): every direct name — declared with a registry range —
 * whose every instance is public or neutral, one of them public, that is no own name and no declaration keeps back.
 * As identities (npm exact, pip PEP 503), sorted.
 * @param {import("./model.mjs").Model} model
 */
export function expected(model) {
  const own = new Set(model.own.map((n) => coarse(model.eco, n)));
  const out = new Set();
  for (const p of model.packages) {
    if (!p.direct || p.spec) continue;
    if (!p.instances.some((i) => i.kind === PUBLIC) || p.instances.some(isNegative)) continue;
    if (own.has(coarse(model.eco, p.name)) || declaredPrivate(model, model.eco, p.name)) continue;
    out.add(identity(model.eco, p.name));
  }
  return [...out].sort();
}

const NPM_SHAPE = /^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i;
const PIP_SHAPE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const ECOSYSTEMS = new Set(["npm", "pip"]);

/**
 * The invariants that hold for any bytes (critic's design, §1, I1–I5): the first one broken, or null.
 * @param {{ sent: Array<{ eco: string, name: string }>, urls: string[], items: any[], out: any[], unreadable: any[],
 *   registries: any, gateway: string[] }} ev  one evaluation (runner.mjs)
 * @param {string[]} written  the files written, relative to the application
 * @returns {{ id: string, name?: string, detail: string }|null}
 */
export function invariants(ev, written) {
  const { items, sent } = ev;
  for (const s of sent) {
    // I1: a sent name is proven by a lock that may prove, under its own identity.
    const proof = items.some(
      (i) =>
        i.public === true &&
        PROOF_LOCKS.has(path.posix.basename(i.manifest)) &&
        identity(i.ecosystem, i.name) === identity(s.eco, s.name),
    );
    if (!proof) return { id: "I1", name: identity(s.eco, s.name), detail: `sent with no proof: ${s.eco} ${s.name}` };
    // I5: a name the public registry cannot hold never leaves the machine.
    const shape = s.eco === "npm" ? NPM_SHAPE.test(s.name) && s.name.length <= 214 : PIP_SHAPE.test(s.name);
    if (!shape)
      return {
        id: "I5",
        name: identity(s.eco, s.name),
        detail: `sent a name of no registry's shape: ${JSON.stringify(s.name)}`,
      };
  }
  for (const i of items) {
    if (i.public === true && !PROOF_LOCKS.has(path.posix.basename(String(i.manifest))))
      return { id: "I1", name: identity(i.ecosystem, i.name), detail: `public in ${i.manifest}, which proves nothing` };
    if (i.public === true && i.local)
      return { id: "I1", name: identity(i.ecosystem, i.name), detail: "both local and public" };
    // I4: every item well-formed.
    if (typeof i.name !== "string" || !i.name || i.name.includes("://") || !ECOSYSTEMS.has(i.ecosystem))
      return { id: "I4", detail: `malformed item ${JSON.stringify(i)}` };
    if (!written.includes(i.manifest)) return { id: "I4", detail: `an item of a file never written: ${i.manifest}` };
  }
  for (const u of ev.unreadable)
    if (!written.includes(u.file)) return { id: "I4", detail: `unreadable: a file never written: ${u.file}` };
  return privacy(ev) ?? gateway(ev);
}

/** I2: no sent name shares a coarse key with an item the kit itself reads as local, private, or own. */
function privacy({ items, out, sent, registries }) {
  const kept = new Map();
  for (const i of items) if (i.local) kept.set(coarse(i.ecosystem, i.name), `local in ${i.manifest}`);
  for (const o of out) if (o.private) kept.set(coarse(o.ecosystem, o.name), `private in ${o.manifest}`);
  for (const s of sent) {
    const why = kept.get(coarse(s.eco, s.name));
    if (why) return { id: "I2", name: identity(s.eco, s.name), detail: `sent ${s.eco} ${s.name}, ${why}` };
    for (const n of registries.names ?? [])
      if (coarse(s.eco, n) === coarse(s.eco, s.name))
        return {
          id: "I2",
          name: identity(s.eco, s.name),
          detail: `sent ${s.eco} ${s.name}, an own or private name (${n})`,
        };
  }
  return null;
}

/**
 * I3: the gateway — one item out for each item in, every direct item sent or kept back for one reason, a non-direct
 * one unchanged; each URL once, as many as the packages sent; createRegistryClient agreeing with the filter.
 */
function gateway({ items, out, urls, gateway: errors }) {
  if (out.length !== items.length) return { id: "I3", detail: `${out.length} items out for ${items.length} in` };
  const sentIds = new Set();
  for (let k = 0; k < items.length; k++) {
    const [i, o] = [items[k], out[k]];
    if (!i.direct) {
      if (o !== i) return { id: "I3", detail: `a non-direct item changed: ${i.name}` };
      continue;
    }
    const flags = [o.private === true, o.unproven === true, o.unlisted === true].filter(Boolean).length;
    if (flags > 1 || (flags === 1 && o.exists !== null) || (flags === 0 && o.exists !== true))
      return {
        id: "I3",
        name: identity(i.ecosystem, i.name),
        detail: `direct item judged twice or not at all: ${JSON.stringify(o)}`,
      };
    if (!flags) sentIds.add(identity(i.ecosystem, i.name));
  }
  if (new Set(urls).size !== urls.length) return { id: "I3", detail: `a URL requested twice: ${urls}` };
  if (urls.length !== sentIds.size) return { id: "I3", detail: `${urls.length} requests for ${sentIds.size} packages` };
  if (errors.length) return { id: "I3", detail: errors[0] };
  return null;
}
