// `::c4{view="deployment"}` (fr `vue="deploiement"`): the deployment view of the application (C4 model), drawn from
// facts/infra.json at build time, never guessed. One column per environment the infrastructure files name (a path's
// envs/prod/, a namespace, a values.prod.yaml, a pipeline's environment), each with its entry points (ingresses,
// services), its workloads and jobs, and a count of its cloud resources by provider; above them, the pipelines, with
// an arrow to each environment they deploy to. Then one row per element with its settings (replicas, image and tag,
// ports, root, TLS, open to all, schedule) and its evidence (file:line), from the model of engine/facts/deployment.mjs.
// Pure: the Markdown engine reads the facts.
import { envLabel, settingsOf } from "../facts/deployment.mjs";

// ─── Drawing ────────────────────────────────────────────────────────────────────────────────────────────────────

const COL_W = 210;
const GAP = 24;
const PIPE_H = 46;
const HEAD_H = 34;
const LINE_H = 18;
const TOP = PIPE_H + 46;

/** The text of an element in its column: its name, and its type. */
const nodeText = (i) => `${i.name} · ${i.type}`;

/** A text cut to fit a column (its full text stays in the table). */
const fit = (s, n = 30) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The lines of one column: entry points, what runs, the cloud resources by provider; `limit` at most, then "+N". */
function columnLines(e, limit, t) {
  const lines = [
    ...e.entries.map((i) => ({ cls: "entry", text: nodeText(i) })),
    ...e.runs.map((i) => ({ cls: "run", text: nodeText(i) })),
    ...[...e.resources].map(([provider, count]) => ({
      cls: "resource",
      text: t("render.c4.deployment.resources", { provider, count }),
    })),
  ];
  if (lines.length <= limit) return lines;
  return [
    ...lines.slice(0, limit),
    { cls: "more", text: t("render.c4.deployment.more", { count: lines.length - limit }) },
  ];
}

/** The SVG of the view: the pipelines on top, one column per environment. */
function drawing(model, { t, esc, title, limit }) {
  const cols = model.environments.map((e, k) => ({ e, x: k * (COL_W + GAP), lines: columnLines(e, limit, t) }));
  const width = Math.max(cols.length, model.pipelines.length, 1) * (COL_W + GAP) - GAP;
  const top = model.pipelines.length ? TOP : 0;
  const height = top + HEAD_H + Math.max(1, ...cols.map((c) => c.lines.length)) * LINE_H + 16;
  const pipeW = Math.min(COL_W, (width - (model.pipelines.length - 1) * GAP) / Math.max(1, model.pipelines.length));
  const pipes = model.pipelines.map((p, k) => ({ p, x: k * (pipeW + GAP) }));
  const out = [];
  for (const { p, x } of pipes)
    for (const env of p.envs) {
      const c = cols.find((col) => col.e.env === env);
      if (c)
        out.push(
          `<line class="c4-edge" x1="${(x + pipeW / 2).toFixed(1)}" y1="${PIPE_H}" x2="${(c.x + COL_W / 2).toFixed(1)}" y2="${top}" marker-end="url(#c4-arrow)"/>`,
        );
    }
  for (const { p, x } of pipes)
    out.push(
      `<g class="c4-pipeline"><rect x="${x.toFixed(1)}" y="0" width="${pipeW.toFixed(1)}" height="${PIPE_H}" rx="8"/><text class="c4-name" x="${(x + pipeW / 2).toFixed(1)}" y="20" text-anchor="middle">${esc(fit(p.name, 26))}</text><text class="c4-tech" x="${(x + pipeW / 2).toFixed(1)}" y="36" text-anchor="middle">${esc(t("render.c4.deployment.pipeline"))}</text></g>`,
    );
  for (const c of cols) {
    const h = HEAD_H + c.lines.length * LINE_H + 16;
    out.push(
      `<g class="c4-env"><rect x="${c.x}" y="${top}" width="${COL_W}" height="${h}" rx="8"/><text class="c4-name" x="${c.x + COL_W / 2}" y="${top + 22}" text-anchor="middle">${esc(envLabel(c.e.env, t))}</text>${c.lines
        .map(
          (l, k) =>
            `<text class="c4-node c4-node-${l.cls}" x="${c.x + 12}" y="${top + HEAD_H + 14 + k * LINE_H}">${esc(fit(l.text))}</text>`,
        )
        .join("")}</g>`,
    );
  }
  const pad = 10;
  return `<svg class="c4 c4-deployment" xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}" width="${width + 2 * pad}" role="img" aria-label="${esc(title)}"><defs><marker id="c4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="c4-arrow" d="M0 0L10 5L0 10z"/></marker></defs>${out.join("")}</svg>`;
}

/**
 * HTML of the deployment view (SVG, then one row per element with its settings and evidence), or "" when the
 * infrastructure facts name nothing it shows.
 * @param {import("../facts/deployment.mjs").DeploymentModel} model
 * @param {{ t: Function, esc: Function, title?: string, limit?: number }} o   limit: lines per environment
 */
export function renderDeployment(model, { t, esc, title = "", limit = 10 }) {
  if (!model.environments.some((e) => e.rows.length)) return "";
  const svg = drawing(model, { t, esc, title, limit });
  const rows = [];
  for (const e of model.environments) {
    for (const i of e.rows.slice(0, limit))
      rows.push(
        `<tr><td>${esc(envLabel(e.env, t))}</td><td>${esc(i.name)}</td><td>${esc(`${i.provider} · ${i.type}`)}</td><td>${esc(settingsOf(i, t).join(" · ") || "—")}</td><td><code>${esc(`${i.file}:${i.line}`)}</code></td></tr>`,
      );
    if (e.rows.length > limit)
      rows.push(
        `<tr><td>${esc(envLabel(e.env, t))}</td><td colspan="4">${esc(t("render.c4.deployment.more", { count: e.rows.length - limit }))}</td></tr>`,
      );
  }
  const head = ["environment", "element", "type", "settings", "evidence"]
    .map((k) => `<th>${esc(t(`render.c4.deployment.column.${k}`))}</th>`)
    .join("");
  return `<div class="dev-view" data-generated="c4-deployment"><figure class="schema c4-figure">${svg}</figure><div class="tableau" data-generated="developer"><table data-generated="developer"><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div></div>`;
}
