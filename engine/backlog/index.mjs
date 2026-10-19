// The export of the backlog (ARCHITECTURE.md §6.8b, `doc-kit backlog export <target>`): the registry of the
// exporters, one module per tool, and the export itself — the items of the model (engine/backlog/model.mjs), those
// the tool already holds left out unless asked, written in the tool's import format. No network, no token: the
// person imports the files. Pure.
import { refTool } from "../core/refs.mjs";
import { exportItems, selectItems } from "./model.mjs";
import { azure } from "./azure.mjs";
import { jira } from "./jira.mjs";
import { github } from "./github.mjs";
import { gitlab } from "./gitlab.mjs";
import { json } from "./json.mjs";

/**
 * @typedef {object} ExportContext
 * @property {(key: string, vars?: object) => string} t   the translator of the documentation's language
 * @property {any} options      config.backlog
 * @property {string} product   config.product.name
 * @property {string} language  the documentation's language
 * @property {string} base      the name of the files, without their extension
 * @typedef {{ suffix: string, content: string, items: number }} ExportFile   suffix: after `base` (".csv", "-2.csv")
 * @typedef {{ id: string, extension: string, namesParents?: boolean,
 *   write: (items: import("./model.mjs").Item[], c: ExportContext) => ExportFile[] }} Exporter
 *   namesParents: its import links an item to a parent already in the tool (Jira's Parent, GitHub's parentRef)
 */

/** The exporters, by target. */
export const EXPORTERS = Object.freeze({ azure, jira, github, gitlab, json });

/**
 * The files of one target.
 * @param {{ epics: any[], features: any[], stories: any[] }} backlog   build().backlog
 * @param {ExportContext & { target: string, all?: boolean, scrub?: (text: string) => string }} o
 * @returns {{ files: ExportFile[], skipped: import("./model.mjs").Item[], toLink: number }}
 *   skipped: the items the tool already holds, left out; toLink: those whose parent it holds, to be linked by hand
 *   after the import (none when the exporter names their parent: Jira, GitHub)
 */
export function exportBacklog(backlog, { target, all = false, scrub, ...c }) {
  const exporter = EXPORTERS[target];
  const options = c.options ?? {};
  const items = exportItems(backlog, { t: c.t, docUrl: options.docUrl, idInTitle: options.idInTitle, scrub });
  const linked = (ref) => refTool(ref, options.refs) === target;
  const chosen = selectItems(items, linked, all);
  return {
    files: exporter.write(chosen.items, { ...c, options }),
    skipped: chosen.skipped,
    toLink: exporter.namesParents ? 0 : chosen.items.filter((x) => x.parentRef).length,
  };
}
