// Azure DevOps (Azure Boards › Queries › Import work items): a CSV file in UTF-8 with a byte order mark, CRLF, at
// most 1,000 work items a file. The hierarchy is the column of the title — Title 1 an epic, Title 2 its features,
// Title 3 their stories — each item a child of the last one of the column before; a file holds each epic whole.
// The types are those of the project's process (config.backlog.azure.process): Agile, Scrum, CMMI or Basic. The
// description and the acceptance criteria are HTML, the tags the version. A parent already in Azure DevOps cannot be
// named by an import: its children stand at the top of the hierarchy, their description naming it, to be linked by
// hand after the import.
import { KitError, EXIT } from "../project/errors.mjs";
import { csvFile } from "./csv.mjs";
import { htmlText } from "./markup.mjs";
import { versionTag } from "./model.mjs";

/** The most work items one import takes. */
const MAX_ITEMS = 1000;

/** The work item types of each process, for an epic, a feature and a story. */
const AZURE_TYPES = Object.freeze({
  agile: { epic: "Epic", feature: "Feature", story: "User Story" },
  scrum: { epic: "Epic", feature: "Feature", story: "Product Backlog Item" },
  cmmi: { epic: "Epic", feature: "Feature", story: "Requirement" },
  basic: { epic: "Epic", feature: "Issue", story: "Task" },
});
/** The processes whose story has an Acceptance Criteria field; in the others the criteria end the description. */
const CRITERIA_FIELD = new Set(["agile", "scrum"]);

const paragraph = (text) => `<p>${htmlText(text)}</p>`;

/** The acceptance criteria of a story: each scenario's title, then its steps. */
const criteriaHtml = (item) =>
  item.criteria
    .map(
      (c) =>
        `<p><strong>${htmlText(c.title)}</strong></p><ul>${c.steps.map((s) => `<li><strong>${htmlText(s.keyword)}</strong> ${htmlText(s.text)}</li>`).join("")}</ul>`,
    )
    .join("");

function description(item, t, withCriteria) {
  return [
    ...item.lines.map(paragraph),
    item.parentRef ? paragraph(t("render.backlog.parent", { ref: item.parentRef.text })) : "",
    item.link ? `<p><a href="${htmlText(item.link)}">${htmlText(t("render.backlog.doc"))}</a></p>` : "",
    withCriteria && item.criteria.length
      ? `<p><strong>${htmlText(t("render.backlog.criteria"))}</strong></p>${criteriaHtml(item)}`
      : "",
  ].join("");
}

/** The items in trees: each top item (an epic, or what stands alone) with what follows it under it. */
function trees(items) {
  const depth = new Map();
  const out = [];
  for (const x of items) {
    const d = x.parent && depth.has(x.parent) ? depth.get(x.parent) + 1 : 0;
    depth.set(x.key, d);
    if (d === 0) out.push([]);
    out[out.length - 1].push(x);
  }
  return { trees: out, depth };
}

/** @type {import("./index.mjs").Exporter} */
export const azure = {
  id: "azure",
  extension: "csv",
  write(items, { t, options }) {
    const process = options.azure?.process ?? "agile";
    const types = AZURE_TYPES[process];
    const inField = CRITERIA_FIELD.has(process);
    const { trees: all, depth } = trees(items);
    const levels = Math.max(1, ...[...depth.values()].map((d) => d + 1));
    const titles = levels === 1 ? ["Title"] : Array.from({ length: levels }, (_, i) => `Title ${i + 1}`);
    const paths = [
      ["Area Path", options.azure?.areaPath],
      ["Iteration Path", options.azure?.iterationPath],
    ].filter(([, v]) => v);
    const head = [
      "Work Item Type",
      ...titles,
      "Description",
      ...(inField ? ["Acceptance Criteria"] : []),
      "Tags",
      ...paths.map(([h]) => h),
    ];
    const row = (x) => [
      types[x.kind],
      ...titles.map((_, i) => (i === depth.get(x.key) ? x.title : "")),
      description(x, t, !inField),
      ...(inField ? [criteriaHtml(x)] : []),
      versionTag(x.since) ?? "",
      ...paths.map(([, v]) => v),
    ];
    // The files: each epic whole in one, at most MAX_ITEMS items each.
    const files = [[]];
    for (const tree of all) {
      if (tree.length > MAX_ITEMS)
        throw new KitError(EXIT.CHECK, "backlog.azure.tooLarge", { id: tree[0].key, n: tree.length, max: MAX_ITEMS });
      if (files[files.length - 1].length + tree.length > MAX_ITEMS) files.push([]);
      files[files.length - 1].push(...tree);
    }
    return files.map((list, i) => ({
      suffix: files.length > 1 ? `-${i + 1}.csv` : ".csv",
      content: csvFile([head, ...list.map(row)], { bom: true, eol: "\r\n" }),
      items: list.length,
    }));
  },
};
