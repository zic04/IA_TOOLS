#!/usr/bin/env node
// Consolidation file of the agents' reports (doc-kit skill).
//
//   node consolidation.mjs init --project <docDir> --codes a,b,c [--topic "…"] [--lang en|fr] [--output <file>] [--force]
//       creates the empty consolidation file (one section per writer) from assets/briefs/<lang>/consolidation.md;
//       a code may carry its title: --codes "ord=Journey of an order,inv=Journey of an invoice".
//   node consolidation.mjs duplicates --project <docDir> [--file <file>] [--findings <page-id>] [--no-findings] [--json]
//       lists the candidate findings that cite the same file:line (same file, overlapping line ranges),
//       and the findings already numbered on the findings page that cite those lines.
//
// Default file: <docDir>/.doc-kit/consolidation.md.
// Exit codes: 0 OK · 1 no candidate read (empty file or wrong format) · 2 usage or configuration.
import fs from "node:fs";
import path from "node:path";
import {
  ExitError,
  SKILL_ROOT,
  WORK_DIR,
  baseVariables,
  checkLanguage,
  fill,
  findProject,
  loadConfig,
  parseOptions,
  run,
  setMessageLanguage,
  t,
  useMessages,
  warn,
} from "./common.mjs";

useMessages("consolidation");

const START = "<!-- section:start -->";
const END = "<!-- section:end -->";
const DEFAULT_TOPIC = { en: "writers' reports", fr: "rapports des rédacteurs" };
const DEFAULT_TITLE = { en: "Writer", fr: "Rédacteur" };

// ─── init ──────────────────────────────────────────────────────────────────────────────────────────────────────

function readCodes(raw) {
  if (!raw) throw new ExitError(2, t("codesMissing"), t("codesMissing_todo"));
  const codes = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf("=");
      const code = (i < 0 ? s : s.slice(0, i)).trim();
      const title = i < 0 ? "" : s.slice(i + 1).trim();
      if (!/^[\w-]+$/.test(code)) throw new ExitError(2, t("codeInvalid", { code }), t("codeInvalid_todo"));
      return { code, title };
    });
  const seen = new Set();
  for (const { code } of codes) {
    if (seen.has(code)) throw new ExitError(2, t("codeDuplicate", { code }), t("codeDuplicate_todo"));
    seen.add(code);
  }
  if (!codes.length) throw new ExitError(2, t("codesEmpty"), t("codesEmpty_todo"));
  return codes;
}

async function init(o) {
  const docDir = findProject(o.project);
  const config = await loadConfig(docDir);
  const lang = o.lang ?? config.language ?? "en";
  checkLanguage(lang, "language");
  setMessageLanguage(lang);
  const codes = readCodes(o.codes).map((c) => ({ ...c, title: c.title || `${DEFAULT_TITLE[lang]} ${c.code}` }));
  const templateFile = path.join(SKILL_ROOT, "assets", "briefs", lang, "consolidation.md");
  if (!fs.existsSync(templateFile))
    throw new ExitError(2, t("templateMissing", { file: templateFile }), t("templateMissing_todo"));
  const template = fs.readFileSync(templateFile, "utf8");
  const a = template.indexOf(START);
  const b = template.indexOf(END);
  if (a < 0 || b < a) throw new ExitError(2, t("templateMarkers"), `${START} … ${END}`);

  const base = { ...baseVariables(docDir, config, lang), topic: o.topic ?? DEFAULT_TOPIC[lang] };
  const head = fill(template.slice(0, a), base);
  const section = template.slice(a + START.length, b);
  const foot = fill(template.slice(b + END.length), base);
  const filled = codes.map(({ code, title }) => fill(section, { ...base, code, sectionTitle: title }));
  const sections = filled.map((f) => f.text.replace(/^\n+|\n+$/g, "")).join("\n\n");
  const text = `${head.text.trimEnd()}\n\n${sections}\n\n${foot.text.trimStart()}`;
  const unfilled = [...new Set([...head.unfilled, ...foot.unfilled, ...filled.flatMap((f) => f.unfilled)])];

  const output = o.output ? path.resolve(o.output) : path.join(docDir, WORK_DIR, "consolidation.md");
  if (fs.existsSync(output) && !o.force) {
    throw new ExitError(2, t("fileExists", { file: output }), t("fileExists_todo"));
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, text.endsWith("\n") ? text : `${text}\n`);
  console.log(t("created", { file: output, n: codes.length, codes: codes.map((c) => c.code).join(", ") }));
  if (unfilled.length) {
    warn(t("unfilled", { names: unfilled.join(", ") }), t("unfilled_todo"));
    return 1;
  }
  console.log(t("createdNext"));
  return 0;
}

// ─── file:line references ──────────────────────────────────────────────────────────────────────────────────────

// `:28` (same file as the previous reference) | path/file.ext:12 or :12-18
const RE_REF =
  /`\s*:(\d+)(?:\s*[-–]\s*(\d+))?\s*`|((?:[\w@.\-[\]()]+[/\\])*[\w@.\-[\]()]+\.[A-Za-z][A-Za-z0-9]{0,6}):(\d+)(?:\s*[-–]\s*(\d+))?/g;
const NOT_FILES = new Set(["com", "net", "org", "fr", "io", "eu", "dev", "local", "internal", "services"]);

function normalise(file) {
  // "(orderService.ts" caught after an opening parenthesis: drop an unclosed bracket or parenthesis.
  return file
    .replace(/\\/g, "/")
    .replace(/^[([]+(?=[^)\]]*$)/, "")
    .replace(/^\.\//, "");
}

/** References of a text, in order; `:N` reuses the file of the previous reference. */
function extractReferences(text) {
  const refs = [];
  let last = null;
  for (const m of text.matchAll(RE_REF)) {
    let file;
    let start;
    let end;
    if (m[1]) {
      if (!last) continue;
      file = last;
      start = Number(m[1]);
      end = Number(m[2] ?? m[1]);
    } else {
      const ext = m[3].split(".").pop().toLowerCase();
      if (NOT_FILES.has(ext)) continue;
      file = normalise(m[3]);
      start = Number(m[4]);
      end = Number(m[5] ?? m[4]);
      last = file;
    }
    if (end < start) [start, end] = [end, start];
    refs.push({ file, start, end });
  }
  return refs;
}

function sameFile(a, b) {
  if (a === b) return true;
  const ba = a.split("/").pop();
  const bb = b.split("/").pop();
  if (ba !== bb) return false;
  if (!a.includes("/") || !b.includes("/")) return true;
  return a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

const overlap = (a, b) => sameFile(a.file, b.file) && a.start <= b.end && b.start <= a.end;
const refLabel = (r) => `${r.file.split("/").pop()}:${r.start}${r.end !== r.start ? `-${r.end}` : ""}`;

function sharedRefs(ra, rb) {
  const seen = new Map();
  for (const a of ra) for (const b of rb) if (overlap(a, b)) seen.set(refLabel(a), true);
  return [...seen.keys()];
}

// ─── reading the consolidation file ─────────────────────────────────────────────────────────────────────────

/** Candidates: sections "## Title (code)", a sub-section whose title contains "candidate"/"candidat", numbered items. */
function readCandidates(text) {
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, "");
  /** @type {{ code: string, n: number, text: string, refs?: any }[]} */
  const candidates = [];
  const sections = [];
  let section = null;
  let inCandidates = false;
  let current = null;
  const close = () => {
    if (current) {
      current.text = current.text.trim();
      if (current.text) candidates.push(current);
    }
    current = null;
  };
  for (const line of withoutComments.split(/\r?\n/)) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      close();
      const m = h2[1].match(/\(([\w-]+)\)\s*$/);
      section = {
        title: h2[1],
        code: m
          ? m[1]
          : h2[1]
              .toLowerCase()
              .replace(/[^\p{L}\p{N}]+/gu, "-")
              .replace(/^-|-$/g, ""),
      };
      sections.push(section);
      inCandidates = false;
      continue;
    }
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      close();
      inCandidates = Boolean(section) && /candidat/i.test(h3[1]);
      continue;
    }
    if (!inCandidates) continue;
    const item = line.match(/^\s{0,3}(\d+)[.)]\s*(.*)$/);
    if (item) {
      close();
      current = { code: section.code, n: Number(item[1]), text: item[2] };
    } else if (current && line.trim()) {
      current.text += ` ${line.trim()}`;
    }
  }
  close();
  for (const c of candidates) c.refs = extractReferences(c.text);
  return { candidates, sections };
}

/** Existing findings: headings "## C1 — …" (and ###) or table rows "| M3 | …". */
function readExistingFindings(files) {
  /** @type {{ id: string, file: any, text: string, refs?: any }[]} */
  const units = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
    let current = null;
    const close = () => {
      if (current) units.push(current);
      current = null;
    };
    for (const line of lines) {
      const heading = line.match(/^(#{2,3})\s+\**([A-Z]{1,2}\d+)\**\b/);
      const otherHeading = !heading && /^#{1,3}\s/.test(line);
      const row = line.match(/^\|\s*\**([A-Z]{1,2}\d+)\**\s*\|/);
      if (heading) {
        close();
        current = { id: heading[2], file: f, text: line };
      } else if (otherHeading) {
        close();
      } else if (row) {
        close();
        units.push({ id: row[1], file: f, text: line });
      } else if (current) {
        current.text += `\n${line}`;
      }
    }
    close();
  }
  for (const u of units) u.refs = extractReferences(u.text);
  return units.filter((u) => u.refs.length);
}

function findingsFiles(docDir, contentDir, id) {
  const content = path.join(docDir, contentDir);
  const files = [];
  const parent = path.join(content, `${id}.md`);
  if (fs.existsSync(parent)) files.push(parent);
  const sub = path.join(content, id);
  if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) {
    for (const f of fs.readdirSync(sub, { recursive: true })) {
      if (String(f).endsWith(".md")) files.push(path.join(sub, String(f)));
    }
  }
  return files;
}

// ─── duplicates ──────────────────────────────────────────────────────────────────────────────────────────────

async function duplicates(o) {
  const docDir = findProject(o.project);
  const config = await loadConfig(docDir);
  const vars = baseVariables(docDir, config, config.language ?? "en");
  setMessageLanguage(config.language ?? "en");
  const file = o.file
    ? ([path.resolve(o.file), path.resolve(docDir, o.file)].find((f) => fs.existsSync(f)) ?? path.resolve(o.file))
    : path.join(docDir, WORK_DIR, "consolidation.md");
  if (!fs.existsSync(file)) {
    throw new ExitError(2, t("fileMissing", { file }), t("fileMissing_todo"));
  }
  const { candidates, sections } = readCandidates(fs.readFileSync(file, "utf8"));
  const label = (c) => `${c.code} ${c.n}`;

  const pairs = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const shared = sharedRefs(candidates[i].refs, candidates[j].refs);
      if (shared.length) pairs.push({ a: label(candidates[i]), b: label(candidates[j]), refs: shared });
    }
  }

  const existing = [];
  let findingsPage = null;
  if (!o["no-findings"]) {
    findingsPage = o.findings ?? vars.findingsPage;
    const findings = readExistingFindings(findingsFiles(docDir, vars.contentDir, findingsPage));
    for (const c of candidates) {
      for (const u of findings) {
        const shared = sharedRefs(c.refs, u.refs);
        if (shared.length)
          existing.push({
            candidate: label(c),
            finding: u.id,
            page: path.relative(docDir, u.file).replace(/\\/g, "/"),
            refs: shared,
          });
      }
    }
  }
  const withoutRef = candidates.filter((c) => !c.refs.length).map(label);

  if (o.json) {
    console.log(
      JSON.stringify(
        {
          file,
          sections: sections.length,
          candidates: candidates.length,
          duplicates: pairs,
          existing,
          withoutReference: withoutRef,
        },
        null,
        2,
      ),
    );
    return candidates.length ? 0 : 1;
  }

  const refCount = candidates.reduce((s, c) => s + c.refs.length, 0);
  console.log(t("header", { file }));
  const withCandidates = sections.filter((s) => candidates.some((c) => c.code === s.code)).length;
  console.log(`${t("counts", { candidates: candidates.length, sections: withCandidates, refs: refCount })}\n`);
  if (!candidates.length) {
    warn(t("noCandidate"), t("noCandidate_todo"));
    return 1;
  }
  const width =
    Math.max(
      ...pairs.map((p) => `${p.a} ↔ ${p.b}`.length),
      ...existing.map((e) => `${e.candidate} ≈ ${e.finding}`.length),
      10,
    ) + 3;
  console.log(pairs.length ? t("duplicates") : t("noDuplicate"));
  for (const p of pairs) console.log(`  ${`${p.a} ↔ ${p.b}`.padEnd(width)}${p.refs.join(", ")}`);
  if (findingsPage) {
    const where = `${vars.contentDir}/${findingsPage}…`;
    console.log("");
    console.log(existing.length ? t("existing", { where }) : t("noExisting", { where }));
    for (const e of existing)
      console.log(`  ${`${e.candidate} ≈ ${e.finding}`.padEnd(width)}${e.refs.join(", ")}  (${e.page})`);
  }
  if (withoutRef.length) {
    console.log("");
    console.log(t("withoutRef", { list: withoutRef.join(", ") }));
  }
  console.log(`\n${t("next")}`);
  return 0;
}

// ─── dispatch ────────────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  // Messages in --lang until the project's language is known (init and duplicates set it).
  const argv = process.argv.slice(2);
  const iLang = argv.indexOf("--lang");
  setMessageLanguage(iLang >= 0 ? argv[iLang + 1] : "en");
  const { values: o, positionals } = parseOptions(
    {
      project: { type: "string" },
      codes: { type: "string" },
      topic: { type: "string" },
      lang: { type: "string" },
      output: { type: "string" },
      force: { type: "boolean" },
      file: { type: "string" },
      findings: { type: "string" },
      "no-findings": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    t("usage"),
  );
  if (o.help) {
    console.log(t("usage"));
    return 0;
  }
  checkLanguage(o.lang);
  const [command, ...rest] = positionals;
  if (rest.length) throw new ExitError(2, t("unexpectedArgument", { args: rest.join(" ") }), t("usage"));
  if (command === "init") return init(o);
  if (command === "duplicates") return duplicates(o);
  throw new ExitError(2, command ? t("unknownCommand", { command }) : t("missingCommand"), t("usage"));
}

await run(main);
