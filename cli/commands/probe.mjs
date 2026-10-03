// probe [--as <role>...] [--json]
// Checks a running LOCAL or DEMO instance, GET and HEAD only (ARCHITECTURE.md §6.13): security headers, cookies,
// CORS and version disclosure on "/" and on one API route; the access control of every GET route of
// facts/api.json, against its `auth` (facts --source api), for anonymous and every `--as <role>` session saved by
// `connect --as <role>`. Writes facts/probe.json. Refused (exit code 2) outside local or demo; never overridden.
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { roleSessionFile, ROLE_PATTERN } from "../../engine/capture/session.mjs";
import { runProbe, probeAllowed, ProbeUnreachableError } from "../../engine/review/probe.mjs";

export const options = {
  as: { type: "string", multiple: true },
};

/** The validated roles of `--as` (ARCHITECTURE.md §6.13), in the order given, de-duplicated. */
function rolesOf(values) {
  const roles = [...new Set(values.as || [])];
  for (const role of roles) if (!ROLE_PATTERN.test(role)) throw new KitError(EXIT.USAGE, "option.value", { option: "as", value: role, expected: "letters, digits and dashes, starting with a letter" });
  return roles;
}

/** A role's session (storageState), read from .doc-kit/session-<role>.json; null when it was never saved. */
function sessionStateOf(root, role) {
  const file = roleSessionFile(root, role);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function run({ ctx, values }) {
  const { project, config } = await ctx.loadProject();
  if (!probeAllowed(config)) throw new KitError(EXIT.USAGE, "probe.notLocal", { url: config.app.url || "—" });
  const url = (config.app.url || "").replace(/\/+$/, "");
  if (!url) throw new KitError(EXIT.USAGE, "probe.notLocal", { url: "—" });
  const roles = rolesOf(values);

  const apiFile = path.join(project.root, config.paths.facts, "api.json");
  const apiItems = fs.existsSync(apiFile) ? (JSON.parse(fs.readFileSync(apiFile, "utf8")).items ?? []) : [];

  let result;
  try {
    result = await runProbe({
      url,
      roles,
      sessionOf: (role) => sessionStateOf(project.root, role),
      apiItems,
      params: config.review?.params || {},
      fetch: ctx.fetch,
    });
  } catch (e) {
    if (e instanceof ProbeUnreachableError) throw new KitError(EXIT.ENVIRONMENT, "probe.unreachable", { url, error: e.message });
    throw e;
  }

  const factsDir = path.join(project.root, config.paths.facts);
  fs.mkdirSync(factsDir, { recursive: true });
  // facts/probe.json keeps the shape of ARCHITECTURE.md §6.13 exactly (no envelope: unlike the other sources, it
  // is not meant to be read by ::facts{}, only by the review briefs and the writer agent).
  fs.writeFileSync(path.join(factsDir, "probe.json"), JSON.stringify(result, null, 2) + "\n");

  if (ctx.json) {
    ctx.print(JSON.stringify(result, null, 2));
    return EXIT.OK;
  }
  const findings = result.routes.filter((r) => r.finding);
  ctx.print(ctx.t("cli.probe.checked", { url, n: result.routes.length, identities: result.identities.join(", ") }));
  for (const r of findings) ctx.print(`⚠ ${ctx.t(`cli.${r.finding}`, { method: r.method, route: r.route })}`);
  if (!findings.length) ctx.print(ctx.t("cli.probe.noFinding"));
  if (result.skipped.length) ctx.print(ctx.t("cli.probe.skipped", { n: result.skipped.length }));
  ctx.print(ctx.t("cli.probe.written", { file: `${config.paths.facts}/probe.json` }));
  return EXIT.OK;
}
