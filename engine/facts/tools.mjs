// `--tools` (ARCHITECTURE.md §6.9): runs gitleaks, osv-scanner, syft and knip when they are found on the PATH.
// `exec` is the test seam of the CLI context (`ctx.exec`): (bin, args, options) => { status, stdout, stderr } |
// null (null: the binary is not on the PATH — "not installed", never an error). Each tool writes its own
// `facts/tool-<name>.json`; the gitleaks report is scrubbed of the matched secret values before it is written.
// `semgrep` (ARCHITECTURE.md §6.13) is not in TOOL_NAMES: it only runs with a local rules folder (review.semgrep),
// unlike the four tools above which always run (and are reported "not installed" when missing) with --tools.
export const TOOL_NAMES = Object.freeze(["gitleaks", "osv-scanner", "syft", "knip"]);

/** Command line of each tool, run from the application folder. `semgrep`: `options.semgrepConfig` (a local rules
 * folder, never --config auto, which downloads rules). */
const ARGS = {
  gitleaks: (dir) => ["detect", "--source", dir, "--no-git", "--report-format", "json", "--report-path", "-"],
  "osv-scanner": (dir) => ["--format", "json", dir],
  syft: (dir) => [dir, "-o", "json"],
  knip: () => ["--reporter", "json"],
  semgrep: (dir, options) => ["--config", options.semgrepConfig, "--json", "--metrics=off", dir],
};

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/** Removes the matched secret values from a gitleaks report ("Secret", "Match"): never store a real secret. */
export function scrubGitleaks(report) {
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, x] of Object.entries(v)) if (k !== "Secret" && k !== "Match") out[k] = strip(x);
      return out;
    }
    return v;
  };
  return strip(report);
}

/**
 * Runs one tool.
 * @param {object} [options]   `semgrepConfig`: the local rules folder, for `name === "semgrep"`.
 * @returns {{ tool: string, installed: boolean, ok?: boolean, data?: any }}
 */
export function runTool(name, appDir, exec, options = {}) {
  const r = exec(name, ARGS[name](appDir, options), { cwd: appDir });
  if (r === null) return { tool: name, installed: false };
  const data = parseJson(r.stdout || "");
  return { tool: name, installed: true, ok: r.status === 0, data: name === "gitleaks" && data !== null ? scrubGitleaks(data) : data };
}

/** Runs every tool of `TOOL_NAMES` (or `only`), never throwing: a missing or failing tool is reported, not thrown. */
export function runTools(appDir, exec, only = TOOL_NAMES) {
  return only.map((name) => runTool(name, appDir, exec));
}
