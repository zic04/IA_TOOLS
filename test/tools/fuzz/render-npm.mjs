// The npm files of a generated case, as tagged lines (lines.mjs): package.json (and its workspace members), then one
// lock — package-lock.json v1, v2 or v3, yarn.lock v1 — written as its tool writes it unless a style says otherwise
// (the neutral rewrites of R-EQ: key order, indentation, escapes, host case…). pnpm-lock.yaml and a yarn berry lock are
// rendered for the invariants only: they never prove a name. Every negative instance is tagged with its group, and a
// JSON one carries its witness (what JSON.parse must still find there).
import { HOST, tarball } from "../locks.mjs";
import { docOf, jsonLines, shuffled, withLines, groupIds, declarationDocs } from "./lines.mjs";
import { OTHER, PUBLIC, versionOf, isNegative } from "./model.mjs";
import { baseOf, V3_TWINS, V1_TWINS, ROOT_LINKS, YARN_RESOLVED2, YARN_TWINS } from "./spellings-npm.mjs";

const SHA = "0".repeat(40);

/** An npm tarball on the public registry as a style writes it: Yarn's host, the host in capitals, a scope's %2f. */
function publicTarball(name, version, style) {
  let url = tarball(name, { host: style.yarnHost ? HOST.yarn : HOST.npm, version });
  if (style.scopeEnc && name.startsWith("@")) url = url.replace(`/${name}/-/`, `/${name.replace("/", "%2f")}/-/`);
  if (style.hostCase) url = url.replace(/^https:\/\/[^/]+/, (h) => h.toUpperCase());
  return url;
}

/** The URL a negative kind names, or a public tarball (the target of a second `resolved`, of a twin). */
const corpTarball = (name, version) => tarball(name, { host: HOST.corpNpm, version });
const gitUrl = (name) => `git+ssh://git@git.corp.internal/corp/${baseOf(name)}.git`;

/** The ranges package.json and a lock's root declare: `^1.0.0`, or a TAINT's place. */
function declared(model) {
  const prod = {};
  const dev = {};
  for (const p of model.packages) if (p.direct || p.spec) (p.dev ? dev : prod)[p.name] = p.spec ?? `^${versionOf(0)}`;
  return { prod, dev };
}

/** package.json and the package.json of each own workspace member (packages/m<i>). */
function manifests(model, style, next, groups) {
  const { prod, dev } = declared(model);
  const pkg = {
    name: "app",
    version: "1.0.0",
    private: true,
    ...(model.own.length ? { workspaces: ["packages/*"] } : {}),
    ...(Object.keys(prod).length ? { dependencies: prod } : {}),
    ...(Object.keys(dev).length ? { devDependencies: dev } : {}),
  };
  const specGroups = new Map();
  for (const p of model.packages)
    if (p.spec) {
      const id = next();
      const section = p.dev ? "devDependencies" : "dependencies";
      specGroups.set(`${section}\0${p.name}`, id);
      groups.push({
        id,
        kind: "neg",
        eco: "npm",
        name: p.name,
        rel: "package.json",
        witness: [{ path: [section], field: p.name, equals: p.spec }],
      });
    }
  const main = docOf("package.json", "json");
  const tagOf = (path) =>
    path.length === 2 && specGroups.has(`${path[0]}\0${path[1]}`)
      ? { tag: "neg", group: specGroups.get(`${path[0]}\0${path[1]}`) }
      : path.length === 1
        ? { tag: "direct" }
        : null;
  for (const l of jsonLines(pkg, { indent: style.indent ?? "  ", tagOf })) main.add(l.text, l);
  const docs = [main.doc];
  model.own.forEach((name, i) => {
    const rel = `packages/m${i}/package.json`;
    const id = next();
    groups.push({ id, kind: "own", eco: "npm", name, rel, witness: [{ path: [], field: "name", equals: name }] });
    const member = docOf(rel, "json");
    for (const l of jsonLines({ name, version: "1.0.0" }, { tagOf: () => ({ tag: "own", group: id }) }))
      member.add(l.text, l);
    docs.push(member.doc);
  });
  return docs;
}

/** The dependencies an entry of a lock lists (each `^1.0.0`). */
const depsOf = (p) => (p.deps.length ? Object.fromEntries(p.deps.map((d) => [d, "^1.0.0"])) : undefined);

/** A package-lock v2/v3 entry of one instance, and the witness of a negative one. */
function entryV3(p, inst, k, style) {
  const version = versionOf(k);
  const extra = { ...(p.dev ? { dev: true } : {}), ...(depsOf(p) ? { dependencies: depsOf(p) } : {}) };
  const lic = style.extras ? { license: "MIT", engines: { node: ">=18" } } : {};
  const integrity = "sha512-AAAA";
  switch (inst.kind) {
    case PUBLIC:
      return { version, resolved: publicTarball(p.name, version, style), integrity, ...lic, ...extra };
    case "bundled":
      return { version, inBundle: true, ...extra };
    case "private":
      return { version, resolved: corpTarball(p.name, version), integrity, ...extra };
    case "other":
      return { version, resolved: tarball(OTHER, { version }), integrity, ...extra };
    case "file":
      return { version, resolved: `file:../corp-${baseOf(p.name)}-${version}.tgz`, integrity, ...extra };
    case "git":
      return { version, resolved: `${gitUrl(p.name)}#${SHA}`, ...extra };
    case "alias":
      return { name: OTHER, version, resolved: tarball(OTHER, { version }), integrity, ...extra };
    case "link":
      return { resolved: `../corp-${baseOf(p.name)}`, link: true };
    default: // "none": no `resolved`
      return { version, integrity, ...extra };
  }
}

/** What JSON.parse must still find at an entry for its negative evidence to be there. */
function witnessOf(entry, path) {
  if (entry.link) return [{ path, field: "link", equals: true }];
  if (entry.name === OTHER) return [{ path, field: "name", equals: OTHER }];
  if (typeof entry.resolved === "string") return [{ path, field: "resolved", equals: entry.resolved }];
  if (typeof entry.version === "string" && !/^\d/.test(entry.version))
    return [{ path, field: "version", equals: entry.version }];
  return [{ path, field: "resolved", missing: true }];
}

/** Sorted keys, as npm writes a lock (its `packages`, its `dependencies`). */
const sortedObject = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** package-lock.json v2/v3: the root entry, the members, every instance at its location, the hosts of nested ones. */
function lockV3(model, style, ctx, next, groups, lockfileVersion) {
  const { prod, dev } = declared(model);
  const packages = {
    "": {
      name: "app",
      version: "1.0.0",
      ...(model.own.length ? { workspaces: ["packages/*"] } : {}),
      ...(Object.keys(prod).length ? { dependencies: prod } : {}),
      ...(Object.keys(dev).length ? { devDependencies: dev } : {}),
    },
  };
  const tags = new Map([['""', { tag: "direct" }]]);
  const top = new Set(model.packages.filter((p) => p.instances.some((i) => i.depth === 1)).map((p) => p.name));
  model.own.forEach((name, i) => {
    packages[`packages/m${i}`] = { name, version: "1.0.0" };
    tags.set(JSON.stringify(`packages/m${i}`), { tag: "direct" });
    if (!top.has(name)) {
      packages[`node_modules/${name}`] = { resolved: `packages/m${i}`, link: true };
      tags.set(JSON.stringify(`node_modules/${name}`), { tag: "direct" });
    }
  });
  const hosts = new Set();
  for (const p of model.packages)
    p.instances.forEach((inst, k) => {
      const nested = inst.depth > 1 && inst.twin === undefined;
      const loc =
        inst.twin !== undefined
          ? V3_TWINS[inst.twin % V3_TWINS.length][1](p.name, ctx)
          : nested
            ? `node_modules/fuzz-host${k}/node_modules/${p.name}`
            : `node_modules/${p.name}`;
      if (nested) hosts.add(k);
      const entry = entryV3(p, inst, k, style);
      packages[loc] = entry;
      if (!isNegative(inst)) return;
      const id = next();
      tags.set(JSON.stringify(loc), { tag: "neg", group: id });
      const witness = witnessOf(entry, ["packages", loc]);
      if (inst.kind === "link") {
        packages[`../corp-${baseOf(p.name)}`] = { name: p.name, version: versionOf(k) };
        tags.set(JSON.stringify(`../corp-${baseOf(p.name)}`), { tag: "neg", group: id });
      }
      groups.push({ id, kind: "neg", eco: "npm", name: p.name, rel: "package-lock.json", witness });
    });
  for (const k of hosts) {
    const host = `fuzz-host${k}`;
    packages[`node_modules/${host}`] ??= { version: "1.0.0", resolved: publicTarball(host, "1.0.0", style) };
  }
  const lock = { name: "app", version: "1.0.0", lockfileVersion, requires: true, packages: sortedObject(packages) };
  const tagOf = (path) =>
    path.length === 2 && path[0] === "packages" ? (tags.get(JSON.stringify(path[1])) ?? null) : null;
  return jsonDoc("package-lock.json", lock, style, tagOf);
}

/** A JSON lock as a style writes it: its keys shuffled at every level, its indentation, its escapes. */
function jsonDoc(rel, value, style, tagOf) {
  const d = docOf(rel, "json", { lock: true });
  for (const l of jsonLines(shuffled(value, style.shuffle ?? 0), {
    indent: style.indent ?? "  ",
    escape: style.escape ?? 0,
    tagOf,
  }))
    d.add(l.text, l);
  return d.doc;
}

/** A package-lock v1 entry of one instance. */
function entryV1(p, inst, k, style, ctx) {
  const version = versionOf(k);
  const integrity = "sha512-AAAA";
  const extra = { ...(p.dev ? { dev: true } : {}), ...(depsOf(p) ? { requires: depsOf(p) } : {}) };
  switch (inst.kind) {
    case PUBLIC:
      return { version, resolved: publicTarball(p.name, version, style), integrity, ...extra };
    case "bundled":
      return { version, bundled: true, ...extra };
    case "private":
      return { version, resolved: corpTarball(p.name, version), integrity, ...extra };
    case "other":
      return { version, resolved: tarball(OTHER, { version }), integrity, ...extra };
    case "file":
      return { version: `file:../corp-${baseOf(p.name)}`, ...extra };
    case "git":
      return { version: `${gitUrl(p.name)}#${SHA}`, from: gitUrl(p.name), ...extra };
    case "alias":
      return { version: `npm:${OTHER}@${version}`, resolved: tarball(OTHER, { version }), integrity, ...extra };
    case "rootLink": {
      const spec = ROOT_LINKS[(inst.spell ?? 0) % ROOT_LINKS.length][1](ctx);
      const field = inst.field ?? "version";
      return {
        ...(field === "version" ? {} : { version }),
        [field]: spec,
        // A copy bundled in the link, which neither proves nor disproves by itself: only where npm places it does.
        dependencies: { [p.name]: { version: "9.0.0", bundled: true } },
      };
    }
    default:
      return { version, integrity, ...extra };
  }
}

/** package-lock.json v1: the nested `dependencies` tree, the own members as `file:` links. */
function lockV1(model, style, ctx, next, groups) {
  const deps = {};
  const tags = new Map();
  const top = new Set(model.packages.filter((p) => p.instances.some((i) => i.depth === 1)).map((p) => p.name));
  model.own.forEach((name, i) => {
    if (!top.has(name)) deps[name] = { version: `file:packages/m${i}` };
  });
  model.packages.forEach((p, pi) =>
    p.instances.forEach((inst, k) => {
      const entry = entryV1(p, inst, k, style, ctx);
      let path;
      if (inst.kind === "rootLink") path = [`fuzz-link-${pi}-${k}`];
      else if (inst.twin !== undefined) path = [V1_TWINS[inst.twin % V1_TWINS.length][1](p.name)];
      else if (inst.depth === 1) path = [p.name];
      else path = [`fuzz-host${k}`, "dependencies", p.name];
      if (path.length === 3) {
        deps[path[0]] ??= { version: "1.0.0", resolved: publicTarball(path[0], "1.0.0", style), dependencies: {} };
        deps[path[0]].dependencies[p.name] = entry;
      } else deps[path[0]] = entry;
      if (!isNegative(inst)) return;
      const id = next();
      tags.set(JSON.stringify(["dependencies", ...path]), { tag: "neg", group: id });
      const at = ["dependencies", ...path];
      const witness =
        inst.kind === "rootLink"
          ? [
              { path: at, field: inst.field ?? "version", equals: entry[inst.field ?? "version"] },
              { path: [...at, "dependencies", p.name], field: "resolved", missing: true },
            ]
          : witnessOf(entry, at);
      witness.push({ path: [], field: "packages", falsy: true });
      groups.push({ id, kind: "neg", eco: "npm", name: p.name, rel: "package-lock.json", witness });
    }),
  );
  for (const v of Object.values(deps)) if (v.dependencies) v.dependencies = sortedObject(v.dependencies);
  const lock = { name: "app", version: "1.0.0", lockfileVersion: 1, requires: true, dependencies: sortedObject(deps) };
  return jsonDoc("package-lock.json", lock, style, (path) => tags.get(JSON.stringify(path)) ?? null);
}

/** A yarn.lock key as Yarn 1 writes it: quoted when it must be (stringify.js shouldWrapKey), or always with `all`. */
const yarnKey = (s, all = false) =>
  all || /^(?:true|false)/.test(s) || /[:\s\\",[\]]/.test(s) || !/^[a-zA-Z]/.test(s) ? JSON.stringify(s) : s;

/** The lines of one yarn.lock block: its header, then its fields turned by a style (Yarn reads them in any order). */
function yarnBlockLines(header, fields, style) {
  const turn = (style.fieldOrder ?? 0) % Math.max(fields.length, 1);
  return [`${header}:`, ...[...fields.slice(turn), ...fields.slice(0, turn)].flat()];
}

/** The fields of a block taken from `url` (its version, resolved, integrity, dependencies), each a list of lines. */
function yarnFields(p, version, url, style) {
  const fields = [[`  version "${version}"`]];
  if (url) fields.push([`  resolved "${url}${style.noHash ? "" : `#${SHA}`}"`]);
  if (style.integrity !== "none")
    fields.push([style.integrity === "quoted" ? '  integrity "sha512-AAAA"' : "  integrity sha512-AAAA"]);
  if (p.deps.length) fields.push(["  dependencies:", ...p.deps.map((d) => `    ${yarnKey(d)} "^1.0.0"`)]);
  return fields;
}

/** The blocks of one instance in a yarn.lock (most kinds one block; a public one split in two by a style). */
function yarnInstance(p, inst, k, style) {
  const version = versionOf(k);
  const spec = (range) => yarnKey(`${p.name}@${range}`, style.quoteAll);
  const pub = publicTarball(p.name, version, { ...style, yarnHost: !style.npmHost });
  const fields = (url) => yarnFields(p, version, url, style);
  switch (inst.kind) {
    case PUBLIC:
      if (style.ranges === "merged")
        return [yarnBlockLines(`${spec(`^${version}`)}, ${spec(`~${version}`)}`, fields(pub), style)];
      if (style.ranges === "split")
        return [
          yarnBlockLines(spec(`^${version}`), fields(pub), style),
          yarnBlockLines(spec(`~${version}`), fields(pub), style),
        ];
      return [yarnBlockLines(spec(`^${version}`), fields(pub), style)];
    case "private":
      return [yarnBlockLines(spec(`^${version}`), fields(corpTarball(p.name, version)), style)];
    case "other":
      return [yarnBlockLines(spec(`^${version}`), fields(tarball(OTHER, { host: HOST.yarn, version })), style)];
    case "file":
      return [yarnBlockLines(spec(`file:../corp-${baseOf(p.name)}`), fields(null), style)];
    case "git":
      return [yarnBlockLines(spec(gitUrl(p.name)), fields(`${gitUrl(p.name)}#${SHA}`), style)];
    case "alias":
      return [
        yarnBlockLines(spec(`npm:${OTHER}@^${version}`), fields(tarball(OTHER, { host: HOST.yarn, version })), style),
      ];
    case "link":
      return [yarnBlockLines(spec(`link:../corp-${baseOf(p.name)}`), [['  version "0.0.0"']], style)];
    case "twin": {
      const twin = YARN_TWINS[(inst.spell ?? 0) % YARN_TWINS.length][1](p.name);
      return [yarnBlockLines(yarnKey(`${twin}@^9.0.0`, style.quoteAll), fields(corpTarball(twin, "9.0.0")), style)];
    }
    case "resolved2": {
      const url = inst.target === "other" ? tarball(OTHER, { host: HOST.yarn, version }) : corpTarball(p.name, version);
      const extra = YARN_RESOLVED2[(inst.spell ?? 0) % YARN_RESOLVED2.length].replace("%s", url);
      return [[...yarnBlockLines(spec(`^${version}`), fields(pub), style), extra]];
    }
    case "conflict": {
      const ours = yarnBlockLines(spec(`^${version}`), fields(pub), style);
      const theirs = yarnBlockLines(spec(`^${version}`), fields(corpTarball(p.name, version)), style);
      return [["<<<<<<< HEAD", ...ours, "=======", ...theirs, ">>>>>>> theirs"]];
    }
    default: // "none": no `resolved`
      return [yarnBlockLines(spec(`^${version}`), fields(null), style)];
  }
}

/** yarn.lock v1: Yarn 1's header comment, then every instance's blocks in a style's order, blank lines between. */
function yarnLock(model, style, next, groups) {
  const blocks = [];
  for (const p of model.packages)
    p.instances.forEach((inst, k) => {
      const group = isNegative(inst) ? next() : null;
      if (group) groups.push({ id: group, kind: "neg", eco: "npm", name: p.name, rel: "yarn.lock" });
      for (const lines of yarnInstance(p, inst, k, style)) blocks.push({ lines, group });
    });
  const order = style.order
    ? blocks
        .map((b, i) => [(i * 2654435761 + style.order) >>> 0, b])
        .sort((a, b) => a[0] - b[0])
        .map(([, b]) => b)
    : blocks;
  const d = docOf("yarn.lock", "yarn", { lock: true });
  if (!style.noHeader) {
    d.add("# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.");
    d.add("# yarn lockfile v1");
    d.add("");
  }
  for (const b of order) {
    for (let i = 0; i < (style.gap ?? 1); i++) d.add("");
    for (const text of b.lines) d.add(text, b.group ? { tag: "neg", group: b.group } : {});
  }
  return d.doc;
}

/** pnpm-lock.yaml (invariants only: pnpm writes no registry, it never proves a name). */
function pnpmLock(model) {
  const d = docOf("pnpm-lock.yaml", "yaml", { lock: true });
  const q = (s) => (s.startsWith("@") ? `'${s}'` : s);
  const { prod, dev } = declared(model);
  for (const l of ["lockfileVersion: '9.0'", "", "importers:", "", "  .:"]) d.add(l);
  for (const [section, names] of [
    ["dependencies", prod],
    ["devDependencies", dev],
  ]) {
    if (!Object.keys(names).length) continue;
    d.add(`    ${section}:`, { tag: "direct" });
    for (const [n, spec] of Object.entries(names))
      for (const l of [`      ${q(n)}:`, `        specifier: ${spec}`, `        version: 1.0.0`])
        d.add(l, { tag: "direct" });
  }
  for (const l of ["", "packages:", ""]) d.add(l);
  for (const p of model.packages)
    p.instances.forEach((inst, k) => {
      d.add(`  ${q(`${p.name}@${versionOf(k)}`)}:`);
      d.add(
        inst.kind === "private"
          ? `    resolution: {tarball: ${corpTarball(p.name, versionOf(k))}}`
          : "    resolution: {integrity: sha512-AAAA}",
      );
    });
  return d.doc;
}

/** A yarn berry lock (invariants only: its `__metadata`, resolutions through the configured registry). */
function berryLock(model) {
  const d = docOf("yarn.lock", "yarn", { lock: true });
  for (const l of [
    '# This file is generated by running "yarn install" inside your project.',
    "",
    "__metadata:",
    "  version: 8",
    "  cacheKey: 10c0",
    "",
  ])
    d.add(l);
  for (const p of model.packages)
    p.instances.forEach((inst, k) => {
      const v = versionOf(k);
      const resolution =
        inst.kind === "private" ? `${p.name}@https://npm.corp.internal/${p.name}.tgz` : `${p.name}@npm:${v}`;
      for (const l of [
        `"${p.name}@npm:^${v}":`,
        `  version: ${v}`,
        `  resolution: "${resolution}"`,
        "  checksum: 10c0/00",
        "  languageName: node",
        "  linkType: hard",
        "",
      ])
        d.add(l);
    });
  return d.doc;
}

/** The neutral rewrites a JSON lock may be written with (R-EQ): each draw stored in the case's style. */
const jsonStyle = (r) => ({
  shuffle: r.chance(0.6) ? r.u32() || 1 : 0,
  indent: r.pick(["  ", "  ", "    ", "\t", " "]),
  escape: r.chance(0.4) ? r.u32() || 1 : 0,
  hostCase: r.chance(0.2),
  yarnHost: r.chance(0.2),
  scopeEnc: r.chance(0.3),
  extras: r.chance(0.3),
});

/** A renderer of one lock format: the manifests, then its lock. */
const npmRender = (lock) => (model, style, ctx) => {
  const next = groupIds();
  const groups = [];
  const docs = [
    ...manifests(model, style, next, groups),
    lock(model, style, ctx, next, groups),
    ...declarationDocs(model.decls, next, groups),
  ];
  return { docs, groups: withLines(docs, groups) };
};

const NEG_V3 = Object.freeze(["private", "other", "file", "git", "alias", "link", "none"]);
const NEG_V1 = Object.freeze(["private", "other", "file", "git", "alias", "none"]);
const NEG_YARN = Object.freeze(["private", "other", "file", "git", "alias", "link", "none"]);

/** The npm formats under test: their kinds, their neutral styles, their renderers. */
export const NPM_FORMATS = Object.freeze({
  "npm-v3": {
    id: "npm-v3",
    eco: "npm",
    lock: "package-lock.json",
    kinds: { eco: "npm", negative: NEG_V3, neutral: ["bundled"] },
    style: (r) => ({ ...jsonStyle(r), v2: r.chance(0.2) }),
    render: npmRender((m, s, c, n, g) => lockV3(m, s, c, n, g, s.v2 ? 2 : 3)),
  },
  "npm-v2": {
    id: "npm-v2",
    eco: "npm",
    lock: "package-lock.json",
    kinds: { eco: "npm", negative: NEG_V3, neutral: ["bundled"] },
    style: jsonStyle,
    render: npmRender((m, s, c, n, g) => lockV3(m, s, c, n, g, 2)),
  },
  "npm-v1": {
    id: "npm-v1",
    eco: "npm",
    lock: "package-lock.json",
    kinds: { eco: "npm", negative: NEG_V1, neutral: ["bundled"] },
    style: jsonStyle,
    render: npmRender(lockV1),
  },
  yarn: {
    id: "yarn",
    eco: "npm",
    lock: "yarn.lock",
    kinds: { eco: "npm", negative: NEG_YARN, neutral: [] },
    style: (r) => ({
      noHeader: r.chance(0.2),
      gap: 1 + r.int(3),
      order: r.chance(0.5) ? r.u32() || 1 : 0,
      quoteAll: r.chance(0.3),
      fieldOrder: r.chance(0.4) ? 1 + r.int(4) : 0,
      integrity: r.pick(["plain", "plain", "quoted", "none"]),
      noHash: r.chance(0.2),
      npmHost: r.chance(0.3),
      scopeEnc: r.chance(0.3),
      ranges: r.pick(["one", "one", "merged", "split"]),
    }),
    render: npmRender((m, s, c, n, g) => yarnLock(m, s, n, g)),
  },
  pnpm: {
    id: "pnpm",
    eco: "npm",
    lock: "pnpm-lock.yaml",
    invariantsOnly: true,
    kinds: { eco: "npm", negative: ["private"], neutral: [] },
    style: () => ({}),
    render: npmRender((m) => pnpmLock(m)),
  },
  berry: {
    id: "berry",
    eco: "npm",
    lock: "yarn.lock",
    invariantsOnly: true,
    kinds: { eco: "npm", negative: ["private"], neutral: [] },
    style: () => ({}),
    render: npmRender((m) => berryLock(m)),
  },
});
