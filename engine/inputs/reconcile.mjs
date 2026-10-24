// The DAT and the code (ARCHITECTURE.md §6.19, `doc-kit inputs reconcile`): a first pass of the reconciliation,
// deterministic, before an agent checks it (brief architecture-reconcile). The technologies each technical
// architecture document names (standard/technologies.json, word for word), found or not in the facts of the code;
// those the code shows that no document names; the addresses each one gives, declared as an address of the
// application or not. A trace in the facts is evidence, never proof: the agent checks each one. Pure but for the
// registry's loading; every scan reads its text once (RULES.md S5).
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../project/find.mjs";
import { validate } from "../project/validate.mjs";
import { DOCS_DIR } from "./model.mjs";
import { realInside, realPathOf } from "../core/confine.mjs";

/** The mentions kept per technology and the traces per source: the rest is counted, not listed. */
const MAX_MENTIONS = 20;
const MAX_TRACES = 5;
const MAX_HOSTS = 200;
/** A converted text read whole, at most this size (a conversion holds at most 16 million characters). */
export const MAX_DAT_BYTES = 64 * 1024 * 1024;

const registryCache = new Map();
/**
 * The technologies of the kit, read and checked once (a defect of the kit throws: tests catch it first).
 * @returns {Array<{ id: string, names: string[], [trace: string]: string[]|string }>}
 */
export function loadTechnologies(kitRoot = KIT_ROOT) {
  if (registryCache.has(kitRoot)) return registryCache.get(kitRoot);
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(kitRoot, rel), "utf8"));
  const data = read("standard/technologies.json");
  const { errors } = validate(data, read("schemas/technologies.schema.json"));
  if (errors.length)
    throw new Error(`standard/technologies.json: ${errors.map((e) => `${e.path} ${e.key}`).join("; ")}`);
  const ids = new Set();
  for (const t of data.technologies) {
    if (ids.has(t.id)) throw new Error(`standard/technologies.json: ${t.id} declared twice`);
    ids.add(t.id);
  }
  registryCache.set(kitRoot, data.technologies);
  return data.technologies;
}

const isWordChar = (ch) => /[\p{L}\p{N}+#]/u.test(ch);
const plain = (w) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The heading a Markdown line opens ("# Title"…"###### Title"), cut at 120 characters; null for another line. */
function headingOf(raw) {
  const line = raw.trimStart();
  let i = 0;
  while (line[i] === "#") i++;
  return i >= 1 && i <= 6 && (line[i] === " " || line[i] === "\t") ? line.slice(i).trim().slice(0, 120) : null;
}

/** Each line of a text with its number, read with indexOf: one line at a time, never the whole text in lines. */
function* linesOf(text) {
  const s = String(text ?? "");
  let from = 0;
  for (let n = 1; from <= s.length; n++) {
    const end = s.indexOf("\n", from);
    yield { line: n, text: s.slice(from, end < 0 ? s.length : end) };
    if (end < 0) return;
    from = end + 1;
  }
}

/**
 * The words of a text, one after the other, each with its line and the Markdown heading it sits under: letters,
 * digits, "+" and "#"; a "." between two of them joins them ("Node.js" → nodejs, "ASP.NET" → aspnet), a "-" does not
 * ("Kafka-based" → kafka, based); `w` without case or accents, `raw` as written. One line at a time, nothing kept but
 * the current word and heading.
 * @returns {Generator<{ w: string, raw: string, line: number, heading: string }>}
 */
function* wordStream(text) {
  let heading = "";
  for (const { line, text: l } of linesOf(text)) {
    heading = headingOf(l) ?? heading;
    let word = "";
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (isWordChar(ch)) {
        word += ch;
        continue;
      }
      if (ch === "." && word && i + 1 < l.length && isWordChar(l[i + 1])) continue;
      if (word) yield { w: plain(word), raw: word, line, heading };
      word = "";
    }
    if (word) yield { w: plain(word), raw: word, line, heading };
  }
}

/** The words of a text (wordStream), in a list. */
export const wordsOf = (text) => [...wordStream(text)];

/**
 * The names of the technologies by their first word, the longest first; a technology with `case: true` (a name that
 * is also a common word: React, Sentry, Stripe…) is matched only as written.
 */
function nameIndex(technologies) {
  const index = new Map();
  let longest = 1;
  for (const t of technologies)
    for (const name of t.names) {
      const words = wordsOf(name);
      if (!words.length) continue;
      const list = index.get(words[0].w) ?? index.set(words[0].w, []).get(words[0].w);
      list.push({ words: words.map((x) => (t.case ? x.raw : x.w)), exact: !!t.case, id: t.id, name });
      longest = Math.max(longest, words.length);
    }
  for (const list of index.values()) list.sort((a, b) => b.words.length - a.words.length);
  return { index, longest };
}

/**
 * The technologies a text names: technology id → { mentions: [{ line, heading, name }], more } — `name` as the
 * registry writes the one found; the longest name wins where two overlap, and its words are not read again; one
 * mention per line; MAX_MENTIONS kept, the others counted. Read as a stream: one line, and the next few words, kept.
 */
export function mentionsOf(text, technologies) {
  const { index, longest } = nameIndex(technologies);
  const found = new Map();
  const queue = [];
  /** The name that starts at the queue's head, if any; then the queue moves past it, or past one word. */
  const step = () => {
    const hit = (index.get(queue[0].w) ?? []).find((c) =>
      c.words.every((w, k) => (c.exact ? queue[k]?.raw : queue[k]?.w) === w),
    );
    if (!hit) return void queue.shift();
    const entry = found.get(hit.id) ?? found.set(hit.id, { mentions: [], more: 0, lines: new Set() }).get(hit.id);
    const { line, heading } = queue[0];
    if (!entry.lines.has(line)) {
      entry.lines.add(line);
      if (entry.mentions.length < MAX_MENTIONS) entry.mentions.push({ line, heading, name: hit.name });
      else entry.more++;
    }
    queue.splice(0, hit.words.length);
  };
  for (const word of wordStream(text)) {
    queue.push(word);
    if (queue.length >= longest) step();
  }
  while (queue.length) step();
  for (const entry of found.values()) delete entry.lines;
  return found;
}

/** The longest authority read (user name, host and port of an address): a longer one is cut there. */
const MAX_AUTHORITY = 512;
/** A character that ends the authority of an address. */
const endsAuthority = (ch) => ch === "/" || ch === "?" || ch === "#" || /\s/.test(ch);

/**
 * The hosts of the http(s) addresses of a text, each with its line (MAX_HOSTS at most). The authority of an address
 * (what follows "//", up to "/", "?", "#" or a space, MAX_AUTHORITY characters at most) is read whole; its host is what
 * follows its last "@" — a user name is never kept, whatever its characters — and only when it reads as a name
 * (letters, digits, dots and dashes: an IPv6 address or an odd name gives none). Linear: one line at a time, every
 * part bounded.
 */
export function hostsOf(text) {
  const out = [];
  const start = /\bhttps?:\/\//gi;
  for (const { line, text: l } of linesOf(text)) {
    for (const m of l.matchAll(start)) {
      if (out.length >= MAX_HOSTS) return out;
      const from = m.index + m[0].length;
      let end = from;
      while (end < l.length && end - from < MAX_AUTHORITY && !endsAuthority(l[end])) end++;
      // Cut by the limit, not ended: its "@" may lie beyond, so nothing of it is kept.
      if (end < l.length && !endsAuthority(l[end])) continue;
      const authority = l.slice(from, end);
      const name = /^[a-z0-9][a-z0-9.-]{0,252}/i.exec(authority.slice(authority.lastIndexOf("@") + 1))?.[0];
      if (name) out.push({ host: name.toLowerCase().replace(/\.+$/, ""), line });
    }
  }
  return out;
}

const lower = (s) => String(s ?? "").toLowerCase();
/** A package name against a pattern: exact, or a prefix when the pattern ends with "/", ":" or "." (case ignored). */
const packageMatches = (name, pattern) =>
  /[/:.]$/.test(pattern) ? lower(name).startsWith(lower(pattern)) : lower(name) === lower(pattern);
/**
 * The names an image reference answers to, without its tag or digest: whole ("registry:5000/team/postgres") and its
 * last part ("postgres"). One pass of indexOf; read once per item of the facts.
 */
const imageNamesCache = new WeakMap();
function imageNames(item) {
  if (imageNamesCache.has(item)) return imageNamesCache.get(item);
  const ref = lower(item.image);
  const at = ref.indexOf("@");
  const named = at < 0 ? ref : ref.slice(0, at);
  const slash = named.lastIndexOf("/");
  const colon = named.indexOf(":", slash + 1);
  const name = colon < 0 ? named : named.slice(0, colon);
  const names = [name, name.slice(slash + 1)];
  imageNamesCache.set(item, names);
  return names;
}

/**
 * The traces of one technology in the facts of the code: [{ source, what, file?, line? }], MAX_TRACES per source.
 * @param {any} tech   an entry of standard/technologies.json
 * @param {{ dependencies?: any[]|null, infra?: any[]|null, stack?: any|null, env?: any[]|null }} facts
 */
export function tracesOf(tech, facts) {
  const out = [];
  const add = (source, list) => out.push(...list.slice(0, MAX_TRACES).map((x) => ({ source, ...x })));
  const deps = facts.dependencies ?? [];
  const infra = facts.infra ?? [];
  add(
    "dependencies",
    deps
      .filter((d) => (tech.packages ?? []).some((p) => packageMatches(d.name, p)))
      .map((d) => ({ what: d.name, file: d.manifest })),
  );
  const at = (x) => ({ file: x.file, line: x.line });
  add(
    "infra",
    infra
      .filter(
        (x) =>
          (x.image && (tech.images ?? []).some((i) => imageNames(x).includes(lower(i)))) ||
          (tech.infra ?? []).some((t) => lower(x.type).includes(lower(t))) ||
          (tech.providers ?? []).includes(x.provider) ||
          (tech.files ?? []).some((f) => lower(x.file).endsWith(lower(f))),
      )
      .map((x) => ({ what: [x.type, x.name, x.image].filter(Boolean).join(" "), ...at(x) })),
  );
  const stacks = facts.stack?.stacks ?? [];
  const languages = facts.stack?.items ?? [];
  add("stack", [
    ...stacks.filter((s) => (tech.stacks ?? []).includes(s.id)).map((s) => ({ what: s.title ?? s.id })),
    ...languages
      .filter((l) => (tech.languages ?? []).includes(l.language) && l.lines > 0)
      .map((l) => ({ what: `${l.language} (${l.lines} lines)` })),
  ]);
  add(
    "env",
    (facts.env ?? [])
      .filter((e) => (tech.env ?? []).some((p) => String(e.name ?? "").startsWith(p)))
      .map((e) => ({ what: e.name, file: e.files?.[0] })),
  );
  return out;
}

const STATUS_ORDER = { datOnly: 0, codeOnly: 1, confirmed: 2 };

/**
 * The first pass of the reconciliation.
 * @param {{ documents: Array<{ source: string, title?: string, text: string }>, facts: object,
 *   technologies: any[], appHosts?: string[] }} p   appHosts: the hosts of the application's addresses (inputs.json
 *   `app`, config.app.url)
 * @returns {{ technologies: Array<{ id, name, status: "confirmed"|"datOnly"|"codeOnly", dat: object[], more: number,
 *   code: object[] }>, hosts: Array<{ host, declared: boolean, dat: object[] }> }}
 */
export function reconcile({ documents, facts, technologies, appHosts = [] }) {
  const cited = new Map();
  const hosts = new Map();
  for (const doc of documents) {
    for (const [id, m] of mentionsOf(doc.text, technologies)) {
      const entry = cited.get(id) ?? cited.set(id, { dat: [], more: 0 }).get(id);
      entry.dat.push(...m.mentions.map((x) => ({ doc: doc.source, ...x })));
      entry.more += m.more;
    }
    for (const { host, line } of hostsOf(doc.text)) {
      const entry = hosts.get(host) ?? hosts.set(host, []).get(host);
      if (entry.length < MAX_MENTIONS) entry.push({ doc: doc.source, line });
    }
  }
  const out = [];
  for (const tech of technologies) {
    const code = tracesOf(tech, facts);
    const said = cited.get(tech.id);
    if (!said && !code.length) continue;
    /** @type {"confirmed"|"datOnly"|"codeOnly"} */
    const status = said && code.length ? "confirmed" : said ? "datOnly" : "codeOnly";
    out.push({ id: tech.id, name: tech.names[0], status, dat: said?.dat ?? [], more: said?.more ?? 0, code });
  }
  out.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
  const known = new Set(appHosts.map(lower));
  return {
    technologies: out,
    hosts: [...hosts]
      .map(([host, dat]) => ({ host, declared: known.has(host), dat }))
      .sort((a, b) => Number(a.declared) - Number(b.declared) || a.host.localeCompare(b.host)),
  };
}

/** The facts sources the reconciliation reads (facts/<source>.json). */
export const RECONCILE_FACTS = Object.freeze(["dependencies", "infra", "stack", "env"]);

/** A path the index may give for a converted text: `.doc-kit/inputs/docs/<name>.md`, one plain segment. */
const isConversion = (output) => {
  const prefix = `${DOCS_DIR}/`;
  const name = typeof output === "string" && output.startsWith(prefix) ? output.slice(prefix.length) : "";
  return /^[\w.-]{1,200}\.md$/.test(name) && !name.startsWith(".");
};

/** The host of an address, or null. */
function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * The reconciliation of a project: its ingested DATs (`.doc-kit/inputs/docs/index.json`, kind `dat`), the facts of
 * its code (`<paths.facts>/<source>.json`), the addresses of the application (inputs.json `app`, config.app.url).
 * @param {{ root: string, config: any, inputs: any, index: { documents: any[] }, technologies?: any[] }} p
 * @returns {ReturnType<typeof reconcile> & { documents: Array<{ source: string, output: string }>,
 *   missing: string[] }}   missing: the facts sources without a file (their side of the code is not known)
 */
export function reconcileProject({ root, config, inputs, index, technologies = loadTechnologies() }) {
  const documents = [];
  const docsDir = realInside(realPathOf(root), path.join(root, ...DOCS_DIR.split("/")));
  for (const d of index.documents) {
    // Only a converted text of the folder of the conversions, whatever the index says.
    if (d.kind !== "dat" || !isConversion(d.output)) continue;
    const file = path.join(root, ...d.output.split("/"));
    // A plain file, never a link, of the size a conversion has at most, really in the folder of the conversions
    // (that folder itself really in the project: a junction or a link that leads out is never followed).
    const st = docsDir && fs.existsSync(file) ? fs.lstatSync(file) : null;
    if (st?.isFile() && st.size <= MAX_DAT_BYTES && realInside(docsDir, file))
      documents.push({ source: String(d.source), output: d.output, text: fs.readFileSync(file, "utf8") });
  }
  const facts = {};
  const missing = [];
  for (const source of RECONCILE_FACTS) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(root, config.paths.facts, `${source}.json`), "utf8"));
      facts[source] = source === "stack" ? data : Array.isArray(data?.items) ? data.items : null;
    } catch {
      facts[source] = null;
    }
    if (!facts[source]) missing.push(source);
  }
  const appHosts = [config.app?.url, ...(inputs.app ?? []).map((a) => a.url)].map(hostOf).filter(Boolean);
  const result = reconcile({ documents, facts, technologies, appHosts });
  return { documents: documents.map(({ source, output }) => ({ source, output })), missing, ...result };
}
