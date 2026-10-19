// GitLab (a project's Issues › Import CSV): a CSV file with `title` and `description`, one issue per feature and per
// story — an epic of GitLab belongs to a group, beyond what this import makes; the epic and the feature each issue
// belongs to are named in its description. The description is Markdown, a line starting with "/" no quick action.
import { csvFile } from "./csv.mjs";
import { markdownBody } from "./markup.mjs";

/** @type {import("./index.mjs").Exporter} */
export const gitlab = {
  id: "gitlab",
  extension: "csv",
  write(items, { t }) {
    const kept = items.filter((x) => x.kind !== "epic");
    const rows = kept.map((x) => [x.title, markdownBody(x, t, { quickActions: true })]);
    return [{ suffix: ".csv", content: csvFile([["title", "description"], ...rows]), items: kept.length }];
  },
};
