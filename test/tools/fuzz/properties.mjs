// The properties of the lock proof (critic's design, §1–§2), for a family of formats (render-npm.mjs NPM_FORMATS,
// render-python.mjs PY_FORMATS): each one `{ id, title, count, gen, check, format, after? }`, run by runner.mjs on a
// fixed seed in npm test (test/unit/facts-deps-properties-*.test.mjs) and on random seeds by soak.mjs. Every
// evaluation is checked against the invariants (I1–I5) and the ground truth (I2′) before its own relation.
import path from "node:path";
import { fmix32, rng } from "./prng.mjs";
import { GEN_VERSION, PUBLIC, genModel } from "./model.mjs";
import { drawAny, drawLeStack, drawReject, drawTaint, rejectCatalogue, taintGrammar, DECLS, modelOf } from "./ops.mjs";
import { mustNotSend, invariants, expected, identity, coarse, declaredPrivate } from "./oracles.mjs";
import { materialize, sentSet } from "./runner.mjs";

/** The salt of each property's own draws: the base of case `i` is the same for every property (and read once). */
const salt = (id) => [...id].reduce((h, c) => fmix32(h ^ c.charCodeAt(0)), 0x51ed);

/** One evaluation of a case: its files, what the kit did with them, the invariants and the ground truth checked. */
async function evaluate(c, format, sandbox) {
  const mat = materialize(c, format, sandbox);
  const ev = await sandbox.evaluate(mat.files);
  // As built: no edit anywhere, no line a shrink dropped (either may legitimately turn a block into a public one).
  const built = !(c.ops ?? []).some((o) => o.op.startsWith("any-")) && !c.drop?.length;
  const failure = invariants(ev, Object.keys(mat.files)) ?? truth(mat, ev, built) ?? onlyInvariants(c, format, ev);
  return { mat, ev, failure, sent: sentSet(ev, identity) };
}

/** I2′: no name the case's intact evidence keeps back is sent. */
function truth(mat, ev, built) {
  const { forbidden } = mustNotSend(mat.model, mat.rendering, mat.docs, { built });
  for (const s of ev.sent) {
    const why = forbidden(s.eco, s.name);
    if (why) return { id: "I2′", name: identity(s.eco, s.name), detail: `sent ${s.eco} ${s.name}: ${why}` };
  }
  return null;
}

/** A lock that never proves (pnpm-lock.yaml, berry's yarn.lock, Pipfile.lock): no item of it is public. */
function onlyInvariants(c, format, ev) {
  if (!format.invariantsOnly) return null;
  const rel = c.sub ? `${c.sub}/${format.lock}` : format.lock;
  const proven = ev.items.find((i) => i.manifest === rel && i.public === true);
  return proven
    ? { id: "I1", name: identity(proven.ecosystem, proven.name), detail: `${format.id} proves ${proven.name}` }
    : null;
}

/** The case a probe of a relation is compared with: its probe operators out, its `reset` fields back. */
const fromOf = (c) => ({
  ...c,
  ...(c.reset ?? {}),
  ops: (c.ops ?? []).filter((o) => !o.probe),
  reset: undefined,
});

/** `a ⊆ b` of two sorted lists, or the first element of `a` not in `b`. */
const notIn = (a, b) => a.find((x) => !b.includes(x)) ?? null;

/** The base of case `i` of a family: its format, a model drawn from the case's seed, canonical style, no operator. */
const baseOf = (formats, i, seed) => {
  const format = formats[i % formats.length];
  return { gen: GEN_VERSION, format: format.id, model: genModel(rng(seed), format.kinds), style: {}, ops: [] };
};

/** A sub-folder the whole application may be moved to (R-RELOCATE: at most three folders deep). */
const SUBS = ["sub", "sub/a", "sub/a/b"];

/**
 * The properties of one family of formats.
 * @param {Record<string, any>} all  the family's formats, by id
 * @param {{ counts?: Record<string, number> }} [o]  how many cases a property runs, by its id, instead of its own count
 */
export function propertiesOf(all, { counts = {} } = {}) {
  const formats = Object.values(all);
  const locks = formats.filter((f) => !f.invariantsOnly);
  const format = (c) => all[c.format];
  const n = (id, d) => counts[id] ?? d;
  const eco = formats[0].eco;
  const toml = (f) => f.lock.endsWith(".lock") && f.eco === "pip";
  /** A taint of a format's grammar fit for a base of R-LE (no multi-line string: L1–L6 are monotone without). */
  const leGrammar = (f) => taintGrammar(f).filter((t) => !/multi-line/.test(t.label));

  const base = {
    id: "invariants",
    title: "I1–I5 and I2′ hold on generated locks under any stack of operators",
    count: n("invariants", 2 * formats.length),
    format,
    gen(r, i, seed) {
      const c = baseOf(formats, i, seed);
      const f = format(c);
      const d = rng(fmix32(seed ^ salt("invariants")));
      if (d.chance(0.5)) c.style = f.style(d);
      const grammar = taintGrammar(f);
      for (let k = d.int(4); k > 0; k--) {
        const pick = d.int(10);
        if (pick < 3 && grammar.length) c.ops.push(drawTaint(d, grammar));
        else if (pick < 4)
          c.ops.push({
            op: "decl",
            kind: d.pick([...DECLS.npm, ...DECLS.pip].filter((x) => x !== "uvSource" || eco === "pip")),
            pkg: d.u32(),
          });
        else if (pick < 5) c.ops.push(drawReject(d, rejectCatalogue(f)));
        else c.ops.push(drawAny(d, toml(f)));
      }
      if (d.chance(0.15)) c.sub = d.pick(SUBS);
      return c;
    },
    async check(c, sandbox) {
      return (await evaluate(c, format(c), sandbox)).failure;
    },
  };

  const model = {
    id: "R-MODEL",
    title: "R-MODEL: a model's canonical rendering sends exactly what the model says (and most bases send a name)",
    // 16 bases at least: the non-vacuity guard judges a ratio, which a handful of bases cannot tell.
    count: n("R-MODEL", Math.max(16, 4 * locks.length)),
    format,
    gen: (r, i, seed) => baseOf(locks, i, seed),
    async check(c, sandbox, stats) {
      const { failure, sent } = await evaluate(c, format(c), sandbox);
      stats.bases = (stats.bases ?? 0) + 1;
      if (sent.length) stats.sending = (stats.sending ?? 0) + 1;
      if (failure) return failure;
      const want = expected(modelOf(c));
      const extra = notIn(sent, want);
      const missing = notIn(want, sent);
      if (extra || missing)
        return { id: "R-MODEL", name: extra ?? missing, detail: `sent [${sent}], the model says [${want}]` };
      return null;
    },
    after(stats) {
      // Non-vacuity (critic's design, §1): a kit that proves nothing passes every soundness property.
      if (!stats.bases) return null; // no lock among the formats run (soak.mjs --only pnpm)
      const ratio = (stats.sending ?? 0) / stats.bases;
      return ratio >= 0.7
        ? null
        : `non-vacuity: only ${Math.round(ratio * 100)} % of the bases send a name (70 % at least)`;
    },
  };

  /**
   * A relation between a probe and the case it was made from (`fromOf`): both evaluated, then `relate(probe, from,
   * c)`. Data only, so that a shrunk probe still knows its own base: the probe's operators are marked `probe`, and
   * `reset` holds the fields the base has instead (its canonical style, its place).
   */
  const relation = (id, title, count, make, relate) => ({
    id,
    title,
    count: n(id, count * locks.length),
    format,
    gen(r, i, seed) {
      const c = baseOf(locks, i, seed);
      return make(c, format(c), rng(fmix32(seed ^ salt(id))));
    },
    async check(c, sandbox) {
      const probe = await evaluate(c, format(c), sandbox);
      if (probe.failure) return probe.failure;
      const from = await evaluate(fromOf(c), format(c), sandbox);
      if (from.failure) return from.failure;
      return relate(probe, from, c);
    },
  });
  const probing = (ops) => ops.map((o) => ({ ...o, probe: true }));
  const equal = (id) => (probe, from) =>
    probe.sent.join() === from.sent.join()
      ? null
      : {
          id,
          name: notIn(probe.sent, from.sent) ?? notIn(from.sent, probe.sent) ?? undefined,
          detail: `sent [${probe.sent}], the base sends [${from.sent}]`,
        };
  const eq = relation(
    "R-EQ",
    "R-EQ: a neutral rewrite the tool reads alike sends the same names",
    2,
    (c, f, d) => {
      const text = [
        ...(d.chance(0.4) ? [{ op: "crlf", file: d.u32() }] : []),
        ...(d.chance(0.3) ? [{ op: "bom", file: d.u32() }] : []),
      ];
      return { ...c, style: f.style(d), ops: probing(text), reset: { style: {} } };
    },
    equal("R-EQ"),
  );

  const taint = relation(
    "R-TAINT",
    "R-TAINT: a name taken from elsewhere is never sent, and nothing new is",
    2,
    // Against the canonical base (read once for R-MODEL): the styles have R-EQ of their own.
    (c, f, d) => ({ ...c, ops: probing([drawTaint(d, taintGrammar(f))]) }),
    (probe, from, c) => {
      for (const op of c.ops.filter((o) => o.op === "taint" && o.probe && c.model.packages.length)) {
        const key = coarse(c.model.eco, c.model.packages[op.pkg % c.model.packages.length].name);
        const sent = probe.ev.sent.find((s) => coarse(s.eco, s.name) === key);
        if (sent)
          return {
            id: "R-TAINT",
            name: identity(sent.eco, sent.name),
            detail: `sent ${sent.name}, taken from elsewhere (${JSON.stringify(op.taint)})`,
          };
      }
      return subset("R-TAINT")(probe, from);
    },
  );

  /** R-LE on one side of the application: the lock (its proof), or the manifests and declarations beside it. */
  const leOn = (target, id, title, count) =>
    relation(
      id,
      title,
      count,
      (c, f, d) => {
        const grammar = leGrammar(f);
        const tainted = d.chance(0.5) && grammar.length ? [drawTaint(d, grammar)] : [];
        const stack = probing(drawLeStack(d, 3, toml(f), target));
        return { ...c, style: d.chance(0.5) ? f.style(d) : {}, ops: [...tainted, ...stack] };
      },
      subset(id),
    );
  const le = leOn("lock", "R-LE", "R-LE: a perturbation of the lock (L1–L6, L5 once) never sends more names", 4);
  const leBeside = leOn(
    "manifest",
    "R-LE beside",
    "R-LE beside: a perturbation of the manifests beside the lock (L1–L6, L5 once) never sends more names",
    2,
  );

  const decl = relation(
    "R-DECL",
    "R-DECL: a declaration keeps back exactly its own names (an npm registry never hides a pip name, nor the reverse)",
    2,
    (c, f, d) => {
      const kinds = [...DECLS.npm, ...DECLS.pip].filter((k) => k !== "uvSource" || f.eco === "pip");
      return { ...c, ops: probing([{ op: "decl", kind: d.pick(kinds), pkg: d.u32() }]) };
    },
    (probe, from, c) => {
      const declared = modelOf(c);
      const want = from.sent.filter((s) => {
        const at = s.indexOf(" ");
        return !declaredPrivate(declared, s.slice(0, at), s.slice(at + 1));
      });
      return probe.sent.join() === want.join()
        ? null
        : {
            id: "R-DECL",
            name: notIn(probe.sent, want) ?? notIn(want, probe.sent) ?? undefined,
            detail: `sent [${probe.sent}], expected [${want}] (${JSON.stringify(c.ops)})`,
          };
    },
  );

  const relocate = relation(
    "R-RELOCATE",
    "R-RELOCATE: the application under sub/ (three folders deep at most), or beside unrelated files, sends the same",
    1,
    (c, f, d) => {
      const grammar = taintGrammar(f);
      const ops = d.chance(0.4) && grammar.length ? [drawTaint(d, grammar)] : [];
      const sub = d.chance(0.8) ? d.pick(SUBS) : "";
      return { ...c, ops, sub, unrelated: !sub || d.chance(0.5), reset: { sub: "", unrelated: false } };
    },
    equal("R-RELOCATE"),
  );

  const determinism = {
    id: "I4-determinism",
    title: "I4: two readings of the same files are deep-equal",
    count: n("I4-determinism", formats.length),
    format,
    gen: (r, i, seed) => {
      const c = base.gen(r, i, seed);
      return c;
    },
    async check(c, sandbox) {
      const { files } = materialize(c, format(c), sandbox);
      const [a, b] = [await sandbox.evaluate(files, { fresh: true }), await sandbox.evaluate(files, { fresh: true })];
      const view = (ev) =>
        JSON.stringify({
          items: ev.items,
          out: ev.out,
          unreadable: ev.unreadable,
          urls: [...ev.urls].sort(),
          names: [...(ev.registries.names ?? [])].sort(),
          proven: [...(ev.registries.proven ?? [])].sort(),
        });
      return view(a) === view(b) ? null : { id: "I4", detail: "two readings of the same files differ" };
    },
  };

  const odd = {
    id: "I5-odd",
    title: "I5: a name no public registry can hold is never sent, whatever tarball the lock names",
    count: n("I5-odd", locks.length),
    format,
    gen: (r, i, seed) => {
      const f = locks[i % locks.length];
      return { gen: GEN_VERSION, format: f.id, model: genModel(rng(seed), f.kinds, { odd: true }), style: {}, ops: [] };
    },
    async check(c, sandbox) {
      return (await evaluate(c, format(c), sandbox)).failure;
    },
  };

  return [base, model, eq, taint, le, leBeside, decl, relocate, determinism, odd];
}

/** The fixed base of the grammars (E): `target` and one other name, both declared, both public at the top. */
function fixedBase(f, target) {
  const pkg = (name) => ({ name, direct: true, dev: false, deps: [], instances: [{ kind: PUBLIC, depth: 1 }] });
  return { eco: f.eco, packages: [pkg(target), pkg(f.eco === "npm" ? "chalk" : "requests")], own: [], decls: [] };
}

/**
 * A grammar run as single operators on fixed bases: `productions` (each `{ label, ops }`), each case `{ ops }` of a
 * production pinned (shrinking never takes it out), checked by `judge(probe, from, c, target)` against the base.
 */
function grammar(f, id, title, all, judge, select) {
  const productions = all.filter((p) => select(`${id} ${f.id}`, p.label));
  if (!productions.length) return [];
  const targets = f.eco === "npm" ? ["corp-lib", "@acme/core"] : ["corp_lib", "Django"];
  const property = {
    id: `${id} ${f.id}`,
    title: `${title} (${f.id}, ${productions.length} productions)`,
    labels: productions.map((p) => p.label),
    count: productions.length,
    format: () => f,
    gen: (r, i) => {
      const p = productions[i];
      const model = fixedBase(f, p.name ?? targets[p.target ?? i % 2]);
      return {
        gen: GEN_VERSION,
        format: f.id,
        model,
        style: {},
        ops: p.ops.map((o) => ({ ...o, pin: true })),
        label: p.label,
      };
    },
    async check(c, sandbox) {
      const probe = await evaluate(c, f, sandbox);
      if (probe.failure) return probe.failure;
      const from = await evaluate({ ...c, ops: c.ops.filter((o) => o.base) }, f, sandbox);
      if (from.failure) return from.failure;
      return judge(probe, from, c, c.model.packages[0]?.name, sandbox);
    },
  };
  return [property];
}

/** TAINT (E), BESIDE (E): the base sends the target; the probe does not, and sends nothing the base does not. */
const keptBack = (id) => (probe, from, c, target) => {
  if (!target) return null;
  if (!from.sent.includes(identity(c.model.eco, target)))
    return { id: `${id} base`, detail: `${c.label}: the base does not send ${target}: [${from.sent}]` };
  const leak = probe.ev.sent.find((s) => coarse(s.eco, s.name) === coarse(c.model.eco, target));
  if (leak) return { id, name: identity(leak.eco, leak.name), detail: `${c.label}: ${leak.name} sent` };
  const extra = notIn(probe.sent, from.sent);
  return extra ? { id, name: extra, detail: `${c.label}: sends more than the base` } : null;
};

/**
 * The exhaustive grammars of a format (E), each production a single operator on a small fixed base: every taint of
 * its grammar (TAINT (E)), every rejection of its catalogue (I7, R-REJECT), and a conflict marker in each manifest
 * that holds a private declaration (BESIDE (E): the second net must not forget what it cannot read). `full`: every
 * pair of a grammar's axes and four places a rejection (soak.mjs); otherwise each production once, two places.
 * @param {any} f
 * @param {{ full?: boolean, select?: (id: string, label: string) => boolean }} [o]  select: the productions to run
 *   (the test files run the ones a todo names apart)
 */
export function grammarsOf(f, { full = false, select = () => true } = {}) {
  if (f.id === "npm-v2" && !full) return []; // v2's `packages` are v3's: its grammar runs in soak.mjs
  // A spec or an own member is written in package.json, the same beside every npm lock: once, beside v3's.
  const besideOnce = (t) => full || f.id === "npm-v3" || (t.taint.spec === undefined && !t.taint.own);
  const taints = taintGrammar(f, { full })
    .filter(besideOnce)
    .map((t) => ({ label: t.label, ops: [{ op: "taint", taint: t.taint, pkg: 0 }] }));
  // Where a rejection goes matters in a TOML lock (a table, an array) and in a yarn.lock (a header, a field), hardly in JSON.
  const places = full ? [0, 1, 7, 2654435761] : f.lock.endsWith(".json") ? [1] : [0, 2654435761];
  const rejects = rejectCatalogue(f).flatMap((r) =>
    places.map((at) => ({ label: `${r.label} at ${at}`, target: 0, ops: [{ op: "reject", what: r.what, at }] })),
  );
  // A private declaration in a manifest, then a conflict marker at its first line (L2): the manifest unreadable.
  const marker = (file) => ({ op: "L2", target: "manifest", file, at: 1, len: 0 });
  const beside = f.invariantsOnly
    ? []
    : f.eco === "npm"
      ? [
          {
            label: "own workspace member, its package.json unreadable",
            ops: [{ op: "taint", taint: { own: true }, pkg: 0, base: true }, marker(1)],
          },
          {
            label: "spec workspace:*, package.json unreadable",
            ops: [{ op: "taint", taint: { spec: 5 }, pkg: 0, base: true }, marker(0)],
          },
          {
            label: "spec file:, package.json unreadable",
            ops: [{ op: "taint", taint: { spec: 0 }, pkg: 0, base: true }, marker(0)],
          },
        ]
      : [
          {
            label: "own project name, pyproject.toml unreadable",
            ops: [{ op: "taint", taint: { own: true }, pkg: 0, base: true }, marker(0)],
          },
          {
            label: "[tool.uv.sources], pyproject.toml unreadable",
            ops: [{ op: "decl", kind: "uvSource", pkg: 0, base: true }, marker(0)],
          },
        ];
  const rejected = async (probe, from, c, target, sandbox) => {
    const lock = c.sub ? `${c.sub}/${f.lock}` : f.lock;
    const proven = probe.ev.items.find((i) => i.manifest === lock && i.public === true);
    if (proven)
      return {
        id: "I7",
        name: identity(proven.ecosystem, proven.name),
        detail: `${c.label}: the lock still proves ${proven.name}`,
      };
    // R-REJECT: what remains sent is what the rest of the application sends without the lock.
    const files = Object.entries(probe.mat.files).filter(([rel]) => path.posix.basename(rel) !== f.lock);
    const rest = await sandbox.evaluate(Object.fromEntries(files));
    const extra = notIn(probe.sent, sentSet(rest, identity));
    return extra
      ? { id: "R-REJECT", name: extra, detail: `${c.label}: sent ${extra} though the lock is refused` }
      : null;
  };
  return [
    ...grammar(
      f,
      "TAINT-E",
      "TAINT (E): every way of taking a name from elsewhere keeps it back",
      taints,
      keptBack("TAINT-E"),
      select,
    ),
    ...grammar(f, "I7-E", "I7 (E): a lock its tool refuses proves nothing", rejects, rejected, select),
    ...grammar(
      f,
      "BESIDE-E",
      "BESIDE (E): a manifest the kit cannot read never lets its private names out",
      beside,
      subset("BESIDE-E"),
      select,
    ),
    ...grammar(
      f,
      "DECL-E",
      "DECL (E): each declaration keeps back exactly its own names",
      declarations(f),
      declared,
      select,
    ),
  ];
}

/**
 * R-DECL's grammar: each declaration kind once, on a base holding the name it names (`@corp/ui` for the scope), the
 * other ecosystem's as well (an npm registry never hides a pip name, nor the reverse).
 */
function declarations(f) {
  if (f.invariantsOnly) return [];
  const kinds = [...DECLS.npm, ...DECLS.pip].filter((k) => k !== "uvSource" || f.eco === "pip");
  return kinds.map((kind) => ({
    label: kind,
    name: kind === "npmScope" && f.eco === "npm" ? "@corp/ui" : undefined,
    target: 0,
    ops: [{ op: "decl", kind, pkg: 0 }],
  }));
}

/** DECL (E): the base sends its names; the declaration takes away exactly those it declares private. */
function declared(probe, from, c) {
  if (!from.sent.length) return { id: "DECL-E base", detail: `${c.label}: the base sends nothing` };
  const m = modelOf(c);
  const want = from.sent.filter((s) => {
    const at = s.indexOf(" ");
    return !declaredPrivate(m, s.slice(0, at), s.slice(at + 1));
  });
  if (probe.sent.join() === want.join()) return null;
  return {
    id: "DECL-E",
    name: notIn(probe.sent, want) ?? notIn(want, probe.sent) ?? undefined,
    detail: `${c.label}: sent [${probe.sent}], expected [${want}]`,
  };
}

/** `a` sends nothing `b` does not (a relation's ⊆). */
const subset = (id) => (probe, from) => {
  const extra = notIn(probe.sent, from.sent);
  return extra ? { id, name: extra, detail: `sent [${probe.sent}], more than the base's [${from.sent}]` } : null;
};
