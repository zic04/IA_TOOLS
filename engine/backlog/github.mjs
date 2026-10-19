// GitHub has no CSV import: two files. <name>-github.json holds the issues in order — title, body in Markdown,
// labels (the version), type (config.backlog.github.types, an organisation's issue types), parent (the key of another
// issue of the file) or parentRef (an issue already in GitHub) — and <name>-github.md how to create them with the
// GitHub CLI (`gh api …/issues --input`, each issue sent as a file) and make each a sub-issue of its parent (the REST
// API's sub_issues, which takes the child's id, not its number). The kit calls no API and writes no script: the
// person, or an agent of their session, runs the commands.
import { markdownBody, markdownText } from "./markup.mjs";
import { versionTag } from "./model.mjs";

/** The issue types of an epic, a feature and a story, by default: none (types belong to an organisation). */
const GITHUB_TYPES = Object.freeze({ epic: null, feature: null, story: null });

/** A file name as one word for a POSIX shell, in single quotes — nothing expanded ("$", backquotes), a quote closed. */
const shellWord = (name) => `'${name.split("'").join("'\\''")}'`;

/** The procedure, in the documentation's language. */
function procedure(issues, { t, json }) {
  const cell = (s) => markdownText(s ?? "");
  const withParent = issues.filter((x) => x.parent || x.parentRef).length;
  return [
    `# ${t("render.backlog.github.title")}`,
    "",
    t("render.backlog.github.intro", { n: issues.length, json }),
    "",
    `## ${t("render.backlog.github.create")}`,
    "",
    t("render.backlog.github.createHow", { json }),
    "",
    // Each issue sent as a file, as it is: never a title or a body pasted into a string of the shell.
    "```sh",
    `jq '.issues[<n>] | {title, body, labels} + (if .type then {type} else {} end)' ${shellWord(json)} > issue.json`,
    "gh api repos/OWNER/REPO/issues --input issue.json --jq '{number, id}'",
    "```",
    "",
    t("render.backlog.github.createNote"),
    "",
    `## ${t("render.backlog.github.link")}`,
    "",
    t("render.backlog.github.linkHow", { n: withParent }),
    "",
    "```sh",
    "gh api repos/OWNER/REPO/issues/<parent number>/sub_issues -F sub_issue_id=<child id>",
    "```",
    "",
    `## ${t("render.backlog.github.list")}`,
    "",
    `| ${t("render.backlog.github.col.key")} | ${t("render.backlog.github.col.title")} | ${t("render.backlog.github.col.parent")} |`,
    "|---|---|---|",
    ...issues.map((x) => `| ${cell(x.key)} | ${cell(x.title)} | ${cell(x.parent ?? x.parentRef ?? "")} |`),
    "",
  ].join("\n");
}

/** @type {import("./index.mjs").Exporter} */
export const github = {
  id: "github",
  extension: "json",
  namesParents: true,
  write(items, { t, options, product, base }) {
    const types = { ...GITHUB_TYPES, ...options.github?.types };
    const issues = items.map((x) => ({
      key: x.key,
      title: x.title,
      body: markdownBody(x, t),
      labels: [versionTag(x.since)].filter((l) => l !== null),
      ...(types[x.kind] ? { type: types[x.kind] } : {}),
      parent: x.parent,
      ...(x.parentRef ? { parentRef: x.parentRef.text } : {}),
    }));
    const json = JSON.stringify({ schema: "doc-kit/github-issues@1", product, issues }, null, 2) + "\n";
    return [
      { suffix: ".json", content: json, items: issues.length },
      { suffix: ".md", content: procedure(issues, { t, json: `${base}.json` }), items: 0 },
    ];
  },
};
