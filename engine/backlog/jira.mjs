// Jira Cloud (Settings › System › External system import › CSV): a CSV file, each parent before its children, each
// item numbered in "Work item ID" and its parent named in "Parent" — by that number, or by its key when it is already
// in Jira. The types are config.backlog.jira.types: by default a feature is an Epic and a story a Story (Jira's
// standard hierarchy), and an epic of the documentation is no item but a label of what it holds; a project with a
// level above Epic names it (`epic`). The description is Jira's wiki markup, the labels the version (and the epic).
import { csvFile } from "./csv.mjs";
import { wikiText } from "./markup.mjs";
import { versionTag } from "./model.mjs";

/** The types of an epic, a feature and a story, by default (null: not exported). */
const JIRA_TYPES = Object.freeze({ epic: null, feature: "Epic", story: "Story" });

/** A label: Jira's labels hold no blank. */
const label = (text) => [...text].map((ch) => (ch.trim() ? ch : "-")).join("");

function description(item, t) {
  const blocks = [...item.lines.map(wikiText), item.link ? `[${wikiText(t("render.backlog.doc"))}|${item.link}]` : ""];
  if (item.criteria.length)
    blocks.push(
      `h4. ${wikiText(t("render.backlog.criteria"))}`,
      ...item.criteria.map((c) =>
        [`*${wikiText(c.title)}*`, ...c.steps.map((s) => `* *${wikiText(s.keyword)}* ${wikiText(s.text)}`)].join("\n"),
      ),
    );
  return blocks.filter(Boolean).join("\n\n");
}

/** @type {import("./index.mjs").Exporter} */
export const jira = {
  id: "jira",
  extension: "csv",
  namesParents: true,
  write(items, { t, options }) {
    const types = { ...JIRA_TYPES, ...options.jira?.types };
    const kept = items.filter((x) => types[x.kind]);
    const number = new Map(kept.map((x, i) => [x.key, String(i + 1)]));
    const labelsOf = (x) =>
      [versionTag(x.since), !types.epic && x.epic ? x.epic.id : null].filter((l) => l !== null).map(label);
    const most = Math.max(1, ...kept.map((x) => labelsOf(x).length));
    const head = ["Work item ID", "Work type", "Summary", "Description", "Parent", ...Array(most).fill("Labels")];
    const parentOf = (x) => number.get(x.parent ?? "") ?? (x.parentRef ? x.parentRef.id : "");
    const row = (x) => {
      const labels = labelsOf(x);
      return [
        number.get(x.key),
        types[x.kind],
        x.title,
        description(x, t),
        parentOf(x),
        ...labels,
        ...Array(most - labels.length).fill(""),
      ];
    };
    return [{ suffix: ".csv", content: csvFile([head, ...kept.map(row)]), items: kept.length }];
  },
};
