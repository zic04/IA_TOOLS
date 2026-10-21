// `--tools` (ARCHITECTURE.md §6.9): runs gitleaks, osv-scanner, syft and knip when they are found on the PATH.
// `exec` is the test seam of the CLI context (`ctx.exec`): (bin, args, options) => { status, stdout, stderr } |
// null (null: the binary is not on the PATH — "not installed", never an error). Each tool writes its own
// `facts/tool-<name>.json`.
// What a tool prints is never stored as such (RULES.md S7): each report is NORMALISED through an allowlist of fields
// (rule, file, line, package, version…), so a matched secret, a line of code or an e-mail address cannot reach the
// file, whatever the tool adds to its output in a later version.
// osv-scanner runs OFFLINE only (AUDIT.md S13): its API mode would send every package name and version, private
// ones included, to osv.dev. Its vulnerability database is downloaded only with `--network` (public files: no name
// is sent); without it, the local copy of an earlier download is used, or the scan fails and says so.
// The status comes from each tool's own exit codes: gitleaks, osv-scanner and knip exit with 1 when they FIND
// something, which is a result ("findings"), not a failure.
// `semgrep` (ARCHITECTURE.md §6.13) is not in TOOL_NAMES: it only runs with a local rules folder (review.semgrep),
// unlike the four tools above which always run (and are reported "not installed" when missing) with --tools.
import path from "node:path";
import { relPath } from "./common.mjs";

export const TOOL_NAMES = Object.freeze(["gitleaks", "osv-scanner", "syft", "knip"]);

/** At most this many items are kept per tool (a huge report would not help a reader either). */
const MAX_ITEMS = 5000;

/** Command line of each tool, run from the application folder. `semgrep`: `options.semgrepConfig` (a local rules
 * folder, never --config auto, which downloads rules). osv-scanner: `options.major` (1 or 2, from --version) and
 * `options.download` (--network: download or refresh the offline database). */
const ARGS = {
  gitleaks: (dir) => [
    "detect",
    "--source",
    dir,
    "--no-git",
    "--redact",
    "--report-format",
    "json",
    "--report-path",
    "-",
  ],
  "osv-scanner": (dir, options) =>
    options.major === 1
      ? [
          "--recursive",
          "--experimental-offline",
          ...(options.download ? ["--experimental-download-offline-databases"] : []),
          "--format",
          "json",
          dir,
        ]
      : [
          "scan",
          "source",
          "--recursive",
          "--offline",
          ...(options.download ? ["--download-offline-databases"] : []),
          "--format",
          "json",
          dir,
        ],
  syft: (dir) => [dir, "-o", "json"],
  knip: () => ["--reporter", "json"],
  semgrep: (dir, options) => ["--config", options.semgrepConfig, "--json", "--metrics=off", dir],
};

/**
 * Exit codes of a run that worked, per tool (any other code is "failed"), and the code a tool uses to say it FOUND
 * something (then a report without any item is a failure, not a clean result: gitleaks also exits with 1 on a fatal
 * error). osv-scanner 128: no package to scan. syft lists packages: it never "finds" anything.
 */
const EXITS = {
  gitleaks: { ok: [0, 1], found: 1 },
  "osv-scanner": { ok: [0, 1, 128], found: 1 },
  syft: { ok: [0], found: null },
  knip: { ok: [0, 1], found: 1 },
  semgrep: { ok: [0, 1], found: 1 },
};

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/** A short string, or undefined: every value kept goes through it (no object, no huge text). */
const str = (v, max = 300) => (typeof v === "string" && v ? v.slice(0, max) : undefined);
/** A positive integer, or undefined. */
const int = (v) => (Number.isInteger(v) && v > 0 ? v : undefined);
/** An object without its undefined fields. */
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const asArray = (v) => (Array.isArray(v) ? v : []);

/** A path reported by a tool, relative to the application (forward slashes); an outside path keeps its name only. */
function relFile(appDir, file) {
  const f = str(file, 500);
  if (!f) return undefined;
  if (!path.isAbsolute(f)) return f.replace(/\\/g, "/");
  const rel = relPath(appDir, f);
  return rel.startsWith("..") || path.isAbsolute(rel) ? path.basename(f) : rel;
}

/** Allowlist of each tool's report: what is kept, field by field. `data` is the parsed output. */
const NORMALISE = {
  gitleaks: (data, appDir) =>
    asArray(data).map((f) =>
      compact({
        rule: str(f?.RuleID),
        file: relFile(appDir, f?.File),
        line: int(f?.StartLine),
        commit: str(f?.Commit, 12),
      }),
    ),
  "osv-scanner": (data, appDir) =>
    asArray(data?.results).flatMap((r) =>
      asArray(r?.packages).flatMap((p) =>
        asArray(p?.vulnerabilities).map((v) =>
          compact({
            id: str(v?.id, 80),
            aliases: asArray(v?.aliases)
              .map((a) => str(a, 80))
              .filter(Boolean)
              .slice(0, 10),
            package: str(p?.package?.name),
            version: str(p?.package?.version, 80),
            ecosystem: str(p?.package?.ecosystem, 40),
            source: relFile(appDir, r?.source?.path),
            maxSeverity: maxSeverityOf(p?.groups, v?.id),
          }),
        ),
      ),
    ),
  syft: (data) =>
    asArray(data?.artifacts).map((a) =>
      compact({
        name: str(a?.name),
        version: str(a?.version, 80),
        type: str(a?.type, 40),
        purl: str(a?.purl, 500),
        licenses: asArray(a?.licenses)
          .map((l) => str(typeof l === "string" ? l : (l?.spdxExpression ?? l?.value), 120))
          .filter(Boolean)
          .slice(0, 10),
      }),
    ),
  knip: (data, appDir) => [
    ...asArray(data?.files).map((f) => compact({ kind: "file", file: relFile(appDir, f) })),
    ...asArray(data?.issues).flatMap((issue) => {
      const file = relFile(appDir, issue?.file);
      const named = (kind, list) =>
        asArray(list).map((x) => compact({ kind, file, name: str(x?.name, 200), line: int(x?.line) }));
      return [
        ...named("export", issue?.exports),
        ...named("type", issue?.types),
        ...named("dependency", issue?.dependencies),
        ...named("devDependency", issue?.devDependencies),
        ...named("unlisted", issue?.unlisted),
      ];
    }),
  ],
  semgrep: (data, appDir) =>
    asArray(data?.results).map((r) =>
      compact({
        rule: str(r?.check_id),
        file: relFile(appDir, r?.path),
        line: int(r?.start?.line),
        severity: str(r?.extra?.severity, 20),
        cwe: str(asArray(r?.extra?.metadata?.cwe)[0], 120),
        owasp: str(asArray(r?.extra?.metadata?.owasp)[0], 120),
      }),
    ),
};

/** osv-scanner groups: the numeric max_severity of the group holding `id`, or undefined. */
function maxSeverityOf(groups, id) {
  const group = asArray(groups).find((g) => asArray(g?.ids).includes(id));
  const score = Number(group?.max_severity);
  return group && Number.isFinite(score) && score >= 0 && score <= 10 ? score : undefined;
}

/**
 * Major version of osv-scanner, from `--version`: `missing` when the binary is not found, `major: null` when no
 * version can be read — then the scan is never run, since a wrong command line could fall back to the API mode that
 * sends the package names (AUDIT.md S13).
 */
function osvVersion(appDir, exec) {
  const r = exec("osv-scanner", ["--version"], { cwd: appDir });
  if (r === null) return { missing: true, major: null };
  const m = r.status === 0 ? /(\d+)\.\d+/.exec(r.stdout || "") : null;
  return { missing: false, major: m ? Number(m[1]) : null };
}

/**
 * @typedef {{ tool: string, status: "ok"|"findings"|"failed"|"missing", reason?: "exit"|"interrupted"|"output"|"version",
 *   code?: number, items: Array<object>, truncated?: boolean }} ToolResult
 */

/**
 * The status of a run whose exit code is one of the tool's `ok` codes, from its normalised items.
 * @returns {"ok"|"findings"|"failed"}
 */
function statusOf(name, exitCode, items) {
  if (EXITS[name].found === null) return "ok"; // an inventory (syft): its items are not findings
  if (items.length) return "findings";
  return exitCode === EXITS[name].found ? "failed" : "ok"; // "found something", but nothing readable
}

/**
 * Runs one tool and normalises its report.
 * @param {string} name
 * @param {string} appDir
 * @param {(bin: string, args: string[], options?: object) => ({status: number, stdout: string, stderr: string}|null)} exec
 * @param {{ semgrepConfig?: string, download?: boolean }} [options]
 *   semgrepConfig: the local rules folder, for `name === "semgrep"`; download: osv-scanner may download its offline
 *   database (--network)
 * @returns {ToolResult}
 */
export function runTool(name, appDir, exec, options = {}) {
  /** @type {(reason: "exit"|"interrupted"|"output"|"version", code?: number) => ToolResult} */
  const failed = (reason, code) => ({
    tool: name,
    status: "failed",
    reason,
    ...(code != null ? { code } : {}),
    items: [],
  });
  let args = ARGS[name](appDir, options);
  if (name === "osv-scanner") {
    const version = osvVersion(appDir, exec);
    if (version.missing) return { tool: name, status: "missing", items: [] };
    if (version.major === null) return failed("version");
    args = ARGS[name](appDir, { major: version.major, download: !!options.download });
  }
  const r = exec(name, args, { cwd: appDir });
  if (r === null) return { tool: name, status: "missing", items: [] };
  if (r.status === null || r.status === undefined) return failed("interrupted"); // a signal, a buffer overflow
  if (!EXITS[name].ok.includes(r.status)) return failed("exit", r.status);
  const data = parseJson(r.stdout || "");
  if (data === null && (r.stdout || "").trim()) return failed("output");
  const all = data === null ? [] : NORMALISE[name](data, appDir).filter((i) => Object.keys(i).length);
  const status = statusOf(name, r.status, all);
  if (status === "failed") return failed("output");
  const truncated = all.length > MAX_ITEMS;
  return { tool: name, status, items: all.slice(0, MAX_ITEMS), ...(truncated ? { truncated } : {}) };
}

/**
 * Runs every tool of `TOOL_NAMES` (or `only`), never throwing: a missing or failing tool is reported, not thrown.
 * @param {string} appDir
 * @param {Parameters<typeof runTool>[2]} exec
 * @param {readonly string[]} [only]
 * @param {{ download?: boolean }} [options]
 */
export function runTools(appDir, exec, only = TOOL_NAMES, options = {}) {
  return only.map((name) => runTool(name, appDir, exec, options));
}
