// The export of the backlog (ARCHITECTURE.md §6.8b, engine/backlog/, `doc-kit backlog export`): the items of the
// model in order, what a tool already holds left out, each tool's import format (Azure DevOps, Jira, GitLab, GitHub,
// JSON), the CSV cells a spreadsheet would read as formulas, the markup and the mentions of the text made inert, the
// secret filter, and the command — refused on an error of the backlog, nothing written then.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { exportBacklog, EXPORTERS } from "../../engine/backlog/index.mjs";
import { exportItems, selectItems } from "../../engine/backlog/model.mjs";
import { csvFile } from "../../engine/backlog/csv.mjs";
import { markdownText, wikiText } from "../../engine/backlog/markup.mjs";
import { refTool, parseRef } from "../../engine/core/refs.mjs";
import { plainLines } from "../../engine/core/text.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { validate } from "../../engine/project/validate.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy, KIT_ROOT, SPACES } from "../tools/helpers.mjs";

const { t } = createI18n({ language: "en" });
const JOINER = "\u2060";

/** A backlog as build().backlog gives it: an epic, a group without one, two features, three stories. */
function backlog() {
  const story = (id, feature, page, extra = {}) => ({
    id,
    title: `Story ${id}`,
    role: "Manager",
    since: null,
    ref: null,
    feature,
    page,
    anchor: id.toLowerCase(),
    criteria: 0,
    text: [],
    scenarios: [],
    ...extra,
  });
  return {
    epics: [
      {
        id: "E-01",
        title: "Find an order",
        summary: "See every order.",
        ref: null,
        section: "features",
        features: ["F-01"],
      },
      { id: null, title: "Rules", summary: "", ref: null, section: "features", features: ["F-02"] },
    ],
    features: [
      {
        id: "F-01",
        title: "Track orders",
        summary: "Filter the list.",
        page: "features/track",
        epic: "E-01",
        since: "1.0",
        ref: null,
        roles: ["Manager"],
      },
      {
        id: "F-02",
        title: "Approve",
        summary: "",
        page: "features/approve",
        epic: null,
        since: null,
        ref: null,
        roles: [],
      },
    ],
    stories: [
      story("US-01", "F-01", "features/track", {
        since: "1.0",
        text: ["As a manager, I want to filter the orders."],
        scenarios: [
          {
            title: "By status",
            steps: [
              { step: "given", keyword: "Given", text: "an open order" },
              { step: "when", keyword: "When", text: "I choose Open" },
              { step: "then", keyword: "Then", text: "it remains" },
            ],
          },
        ],
      }),
      story("US-02", "F-01", "features/track", { since: "1.2" }),
      story("US-03", "F-02", "features/approve"),
    ],
  };
}

/** The rows of a CSV file written by csvFile (every cell quoted; a line break only inside a cell). */
function rowsOf(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const s = text.startsWith("\uFEFF") ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') ((cell += '"'), i++);
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") (row.push(cell), (cell = ""));
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      (row.push(cell), rows.push(row), (row = []), (cell = ""));
    } else cell += ch;
  }
  return rows;
}

const exported = (target, options = {}, extra = {}) =>
  exportBacklog(extra.backlog ?? backlog(), {
    target,
    t,
    options,
    product: "Acme",
    language: "en",
    base: "acme-backlog",
    ...extra,
  });

describe("the items", () => {
  test("each before its children; a group without an epic is no item; titles with their id; links of the pages", () => {
    const items = exportItems(backlog(), { t, docUrl: "https://docs.example.org/acme.html" });
    assert.deepEqual(
      items.map((x) => [x.key, x.kind, x.parent]),
      [
        ["E-01", "epic", null],
        ["F-01", "feature", "E-01"],
        ["US-01", "story", "F-01"],
        ["US-02", "story", "F-01"],
        ["F-02", "feature", null],
        ["US-03", "story", "F-02"],
      ],
    );
    const [epic, feature, story] = items;
    assert.equal(feature.title, "F-01 · Track orders");
    assert.deepEqual(feature.lines, ["Filter the list.", "Who: Manager", "Since version 1.0"]);
    assert.equal(epic.link, "https://docs.example.org/acme.html#/features");
    assert.equal(feature.link, "https://docs.example.org/acme.html#/features/track");
    assert.equal(story.link, "https://docs.example.org/acme.html#/features/track~us-01");
    assert.deepEqual(story.epic, { id: "E-01", title: "Find an order" });
    assert.deepEqual(story.feature, { id: "F-01", title: "Track orders" });
    assert.equal(exportItems(backlog(), { t, idInTitle: false })[1].title, "Track orders");
    assert.equal(exportItems(backlog(), { t })[1].link, null, "no docUrl: no link");
  });

  test("a title on one line, at most 255 characters; every text through the secret filter", () => {
    const b = backlog();
    b.features[0].title = "Line\nbreak " + "x".repeat(400);
    b.stories[0].text = ["keep", "SECRET here"];
    b.stories[0].scenarios[0].steps[0].text = "SECRET step";
    const scrub = (s) => (s.includes("SECRET") ? "[removed]" : s);
    const items = exportItems(b, { t, scrub });
    const title = items[1].title;
    assert.equal([...title].length, 255);
    assert.ok(title.startsWith("F-01 · Line break x") && title.endsWith("…"));
    assert.deepEqual(items[2].lines, ["keep", "[removed]"]);
    assert.equal(items[2].criteria[0].steps[0].text, "[removed]");
  });

  test("what the tool already holds is left out (unless all); its children name it as their parent", () => {
    const items = exportItems(
      {
        ...backlog(),
        features: backlog().features.map((f) => (f.id === "F-01" ? { ...f, ref: "ADO#121" } : f)),
      },
      { t },
    );
    const azure = (ref) => refTool(ref) === "azure";
    const { items: kept, skipped } = selectItems(items, azure, false);
    assert.deepEqual(
      skipped.map((x) => x.key),
      ["F-01"],
    );
    const us1 = kept.find((x) => x.key === "US-01");
    assert.equal(us1.parent, null);
    assert.equal(us1.parentRef?.text, "ADO#121");
    assert.equal(selectItems(items, azure, true).items.length, items.length);
  });

  test("the tool of a reference: Azure DevOps, Jira; a repository's, GitHub or GitLab by the templates, else its depth", () => {
    const repo2 = parseRef("acme/shop#42");
    const repo3 = parseRef("acme/team/shop#7");
    assert.equal(refTool(parseRef("AB#12")), "azure");
    assert.equal(refTool(parseRef("PROJ-7")), "jira");
    assert.equal(refTool(repo2), "github");
    assert.equal(refTool(repo3), "gitlab");
    assert.equal(refTool(repo2, { gitlab: "https://gitlab.com/{repo}/-/issues/{id}" }), "gitlab");
    assert.equal(refTool(repo3, { github: "https://github.com/{repo}/issues/{id}" }), "github");
  });
});

describe("CSV and markup", () => {
  test("a story's HTML as lines: one per block, inline tags glued, cells apart, entities decoded once", () => {
    assert.deepEqual(
      plainLines(
        '<p>As a <b>manager</b>,\nI want <svg><path d="x"/></svg>it &amp;lt; &quot;q&quot;</p><ul><li>one</li><li>two&nbsp;&amp; three</li></ul><table><tr><td>a</td><td>b</td></tr></table><p></p>line<br>break',
      ),
      ['As a manager, I want it &lt; "q"', "one", "two & three", "a b", "line", "break"],
    );
    assert.deepEqual(plainLines("<p>open < never closed"), ["open < never closed"], "a < never closed: text");
  });

  test("every cell quoted, a quote doubled, a line break kept in its cell; a would-be formula starts with an apostrophe", () => {
    const text = csvFile([
      ["a", 'say "hi"', "two\nlines"],
      ["=1+1", "+cmd", "-2", "@SUM(A1)", "\tx", "\rx", "ok = fine"],
    ]);
    assert.equal(
      text,
      '"a","say ""hi""","two\nlines"\n"\'=1+1","\'+cmd","\'-2","\'@SUM(A1)","\'\tx","\'\rx","ok = fine"\n',
    );
    assert.ok(csvFile([["x"]], { bom: true, eol: "\r\n" }).startsWith('\uFEFF"x"\r\n'));
  });

  test("Markdown: markup escaped, a mention or a reference inert, a GitLab quick action no command", () => {
    assert.equal(
      markdownText("a *b* _c_ `d` [e](f) <script> | ~x"),
      "a \\*b\\* \\_c\\_ \\`d\\` \\[e\\](f) \\<script\\> \\| \\~x",
    );
    assert.equal(markdownText("# not a title"), "\\# not a title");
    assert.equal(markdownText("1. not a list"), "1\\. not a list");
    assert.equal(markdownText("- not a list"), "\\- not a list");
    assert.equal(
      markdownText("ask @alice, see #12, !3 and &4"),
      `ask @${JOINER}alice, see #${JOINER}12, !${JOINER}3 and \\&${JOINER}4`,
    );
    assert.equal(markdownText("mail a@b.org, R&D, #tag"), "mail a@b.org, R\\&D, #tag");
    // A reference's sign before a number, whatever precedes it; GitHub's GH-12; an entity never decoded.
    assert.equal(
      markdownText("see acme/shop#42, group/project!12, issue#3 and GH-7"),
      `see acme/shop#${JOINER}42, group/project!${JOINER}12, issue#${JOINER}3 and GH-${JOINER}7`,
    );
    assert.equal(markdownText("&commat;alice &#x40;bob"), "\\&commat;alice \\&#x40;bob");
    for (const mark of ["+", "=", ">"]) assert.equal(markdownText(`${mark} x`), `\\${mark} x`);
    assert.equal(markdownText("/close it"), "/close it", "a quick action is GitLab's only");
    assert.equal(markdownText("/close it", { quickActions: true }), "\\/close it");
  });

  test("Jira's wiki markup: its characters escaped, a mention with them, a leading list marker", () => {
    assert.equal(
      wikiText("[~alice] *b* _c_ {code} a|b !img! x^2 ~y +z"),
      "\\[\\~alice\\] \\*b\\* \\_c\\_ \\{code\\} a\\|b \\!img\\! x\\^2 \\~y \\+z",
    );
    assert.equal(wikiText("# one"), "\\# one");
    assert.equal(wikiText("- one - two"), "\\- one - two");
    assert.equal(wikiText("why?? ok?"), "why\\?? ok?");
  });
});

describe("the tools' formats", () => {
  test("Azure DevOps: UTF-8 with a BOM, CRLF, the hierarchy by the title columns, the types of the process", () => {
    const [file] = exported("azure", { azure: { areaPath: "Acme\\Team", iterationPath: "Acme\\Sprint 1" } }).files;
    assert.equal(file.suffix, ".csv");
    assert.ok(file.content.startsWith("\uFEFF") && file.content.includes("\r\n"));
    const [head, ...rows] = rowsOf(file.content);
    assert.deepEqual(head, [
      "Work Item Type",
      "Title 1",
      "Title 2",
      "Title 3",
      "Description",
      "Acceptance Criteria",
      "Tags",
      "Area Path",
      "Iteration Path",
    ]);
    assert.deepEqual(
      rows.map((r) => r.slice(0, 4)),
      [
        ["Epic", "E-01 · Find an order", "", ""],
        ["Feature", "", "F-01 · Track orders", ""],
        ["User Story", "", "", "US-01 · Story US-01"],
        ["User Story", "", "", "US-02 · Story US-02"],
        ["Feature", "F-02 · Approve", "", ""],
        ["User Story", "", "US-03 · Story US-03", ""],
      ],
    );
    const us1 = rows[2];
    assert.equal(us1[4], "<p>As a manager, I want to filter the orders.</p>");
    assert.equal(
      us1[5],
      "<p><strong>By status</strong></p><ul><li><strong>Given</strong> an open order</li><li><strong>When</strong> I choose Open</li><li><strong>Then</strong> it remains</li></ul>",
    );
    assert.deepEqual(us1.slice(6), ["v1.0", "Acme\\Team", "Acme\\Sprint 1"]);
    const types = (process) =>
      rowsOf(exported("azure", { azure: { process } }).files[0].content)
        .slice(1)
        .map((r) => r[0]);
    assert.deepEqual(new Set(types("scrum")), new Set(["Epic", "Feature", "Product Backlog Item"]));
    assert.deepEqual(new Set(types("cmmi")), new Set(["Epic", "Feature", "Requirement"]));
    assert.deepEqual(new Set(types("basic")), new Set(["Epic", "Issue", "Task"]));
    // CMMI and Basic have no Acceptance Criteria field: the criteria end the description.
    const [basicHead, , , basicUs1] = rowsOf(exported("azure", { azure: { process: "basic" } }).files[0].content);
    assert.ok(!basicHead.includes("Acceptance Criteria"));
    assert.match(basicUs1[4], /<p><strong>Acceptance criteria<\/strong><\/p><p><strong>By status<\/strong>/);
  });

  test("Azure DevOps: at most 1,000 items a file, each epic whole; an epic of more refused; a parent already there named", () => {
    const big = (n) => {
      const b = { epics: [], features: [], stories: [] };
      for (const [e, size] of n.entries()) {
        const f = `F-${e}`;
        b.epics.push({ id: `E-${e}`, title: `Epic ${e}`, summary: "", ref: null, section: "s", features: [f] });
        b.features.push({
          id: f,
          title: f,
          summary: "",
          page: `p/${e}`,
          epic: `E-${e}`,
          since: null,
          ref: null,
          roles: [],
        });
        for (let i = 0; i < size - 2; i++)
          b.stories.push({
            id: `US-${e}-${i}`,
            title: "s",
            role: null,
            since: null,
            ref: null,
            feature: f,
            page: `p/${e}`,
            anchor: "a",
            text: [],
            scenarios: [],
          });
      }
      return b;
    };
    const files = exported("azure", {}, { backlog: big([600, 500, 300]) }).files;
    assert.deepEqual(
      files.map((f) => [f.suffix, f.items]),
      [
        ["-1.csv", 600],
        ["-2.csv", 800],
      ],
    );
    assert.throws(
      () => exported("azure", {}, { backlog: big([1001]) }),
      (e) => e.key === "backlog.azure.tooLarge" && e.vars.id === "E-0" && e.vars.n === 1001,
    );
    const b = backlog();
    b.epics[0].ref = "ADO#120";
    const out = exported("azure", {}, { backlog: b });
    assert.equal(out.toLink, 1, "F-01, its parent already in Azure DevOps");
    const [head, ...rows] = rowsOf(out.files[0].content);
    assert.deepEqual(head.slice(0, 3), ["Work Item Type", "Title 1", "Title 2"], "two levels left");
    const f01 = rows.find((r) => r[1] === "F-01 · Track orders");
    assert.match(f01[head.indexOf("Description")], /<p>Parent: ADO#120 \(to link after the import\)<\/p>/);
    assert.equal(out.skipped[0].key, "E-01");
  });

  test("Jira: numbered, parents first; by default a feature an Epic, a story a Story, an epic a label; a key already in Jira", () => {
    const b = backlog();
    b.features[0].ref = "SHOP-12";
    const out = exported("jira", {}, { backlog: b });
    assert.equal(out.toLink, 0, "Jira takes a parent already there");
    const [head, ...rows] = rowsOf(out.files[0].content);
    assert.deepEqual(head, ["Work item ID", "Work type", "Summary", "Description", "Parent", "Labels", "Labels"]);
    assert.deepEqual(
      rows.map((r) => [r[0], r[1], r[2], r[4], r[5], r[6]]),
      [
        ["1", "Story", "US-01 · Story US-01", "SHOP-12", "v1.0", "E-01"],
        ["2", "Story", "US-02 · Story US-02", "SHOP-12", "v1.2", "E-01"],
        ["3", "Epic", "F-02 · Approve", "", "", ""],
        ["4", "Story", "US-03 · Story US-03", "3", "", ""],
      ],
    );
    assert.equal(
      rows[0][3],
      "As a manager, I want to filter the orders.\n\nh4. Acceptance criteria\n\n*By status*\n* *Given* an open order\n* *When* I choose Open\n* *Then* it remains",
    );
    // A level above Epic: the documentation's epics are items, the features their children.
    const above = rowsOf(exported("jira", { jira: { types: { epic: "Initiative" } } }).files[0].content).slice(1);
    assert.deepEqual(
      above.slice(0, 2).map((r) => [r[0], r[1], r[4]]),
      [
        ["1", "Initiative", ""],
        ["2", "Epic", "1"],
      ],
    );
  });

  test("GitLab: the features and the stories, Markdown descriptions naming their epic and feature, no quick action", () => {
    const b = backlog();
    b.stories[0].text = ["/close", "ask @alice about #12"];
    const out = exported("gitlab", { docUrl: "https://docs.example.org/acme.html" }, { backlog: b });
    const [head, ...rows] = rowsOf(out.files[0].content);
    assert.deepEqual(head, ["title", "description"]);
    assert.deepEqual(
      rows.map((r) => r[0]),
      ["F-01 · Track orders", "US-01 · Story US-01", "US-02 · Story US-02", "F-02 · Approve", "US-03 · Story US-03"],
    );
    assert.equal(
      rows[1][1],
      `\\/close\n\nask @${JOINER}alice about #${JOINER}12\n\nEpic: E-01 · Find an order\n\nFeature: F-01 · Track orders\n\n[Documentation](https://docs.example.org/acme.html#/features/track~us-01)\n\n### Acceptance criteria\n\n**By status**\n\n- **Given** an open order\n- **When** I choose Open\n- **Then** it remains\n`,
    );
  });

  test("GitHub: the issues as JSON (parent, parentRef, types, labels) and how to import them", () => {
    const b = backlog();
    b.epics[0].ref = "acme/shop#40";
    const out = exported("github", { github: { types: { feature: "Feature", story: "Task" } } }, { backlog: b });
    assert.deepEqual(
      out.files.map((f) => f.suffix),
      [".json", ".md"],
    );
    const json = JSON.parse(out.files[0].content);
    assert.equal(json.schema, "doc-kit/github-issues@1");
    assert.deepEqual(
      json.issues.map((x) => [x.key, x.type ?? null, x.parent, x.parentRef ?? null, x.labels]),
      [
        ["F-01", "Feature", null, "acme/shop#40", ["v1.0"]],
        ["US-01", "Task", "F-01", null, ["v1.0"]],
        ["US-02", "Task", "F-01", null, ["v1.2"]],
        ["F-02", "Feature", null, null, []],
        ["US-03", "Task", "F-02", null, []],
      ],
    );
    const md = out.files[1].content;
    assert.match(md, /^# Import the backlog into GitHub\n/);
    assert.match(md, /5 issues of the documentation, in `acme-backlog\.json`/);
    assert.match(md, /4 issues have a parent/);
    assert.match(md, /gh api repos\/OWNER\/REPO\/issues\/<parent number>\/sub_issues -F sub_issue_id=<child id>/);
    // Each issue sent as a file: never a title or a body in a string of the shell.
    assert.match(md, /jq '\.issues\[<n>\] \| \{title, body, labels\}.*' 'acme-backlog\.json' > issue\.json/);
    // The file's name as one word of the shell: nothing expanded, a quote closed and reopened.
    const named = exported("github", {}, { base: "it's $HOME" }).files[1].content;
    assert.ok(named.includes(`' 'it'\\''s $HOME.json' > issue.json`), named);
    assert.match(md, /gh api repos\/OWNER\/REPO\/issues --input issue\.json/);
    assert.doesNotMatch(md, /--title "|--body "/);
    assert.ok(md.includes(`| F-01 | F-01 · Track orders | acme/shop#${JOINER}40 |`));
  });

  test("JSON: every item, whatever the references, valid against schemas/backlog.schema.json", () => {
    const b = backlog();
    b.epics[0].ref = "ADO#120";
    const out = exported("json", {}, { backlog: b, all: false });
    const data = JSON.parse(out.files[0].content);
    assert.equal(data.items.length, 6, "nothing left out");
    const schema = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "schemas", "backlog.schema.json"), "utf8"));
    assert.deepEqual(validate(data, schema).errors, []);
    assert.deepEqual(Object.keys(EXPORTERS).sort(), ["azure", "github", "gitlab", "jira", "json"]);
  });

  test("a secret in any text — an epic's, a feature's or a criterion's title, a version — reaches no target", () => {
    const b = backlog();
    b.epics[0].title = "Epic SECRET";
    b.features[0].title = "Feature SECRET";
    b.features[0].since = "1.0-SECRET";
    b.stories[0].scenarios[0].title = "Criterion SECRET";
    b.stories[1].since = "SECRET";
    const scrub = (text) => text.split("SECRET").join("[removed]");
    for (const target of Object.keys(EXPORTERS))
      for (const file of exported(target, {}, { backlog: b, scrub }).files) {
        // The escapes of Markdown and wiki markup removed: no secret hidden behind a backslash either.
        const plain = file.content.split("\\").join("");
        assert.ok(!plain.includes("SECRET"), `${target}${file.suffix}`);
      }
  });

  test("Azure DevOps' HTML and Jira's wiki markup: the text as text", () => {
    const b = backlog();
    b.stories[0].text = ['<b>&"x" [~alice]'];
    b.stories[0].scenarios[0].title = '<i>&"t"';
    b.stories[0].scenarios[0].steps[0].text = '<u>&"s"';
    const [head, ...rows] = rowsOf(exported("azure", {}, { backlog: b }).files[0].content);
    const us1 = rows[2];
    assert.equal(us1[head.indexOf("Description")], "<p>&lt;b&gt;&amp;&quot;x&quot; [~alice]</p>");
    const criteria = us1[head.indexOf("Acceptance Criteria")];
    assert.match(criteria, /^<p><strong>&lt;i&gt;&amp;&quot;t&quot;<\/strong><\/p>/);
    assert.match(criteria, /<li><strong>Given<\/strong> &lt;u&gt;&amp;&quot;s&quot;<\/li>/);
    const description = rowsOf(exported("jira", {}, { backlog: b }).files[0].content)[2][3];
    assert.ok(description.startsWith('<b>&"x" \\[\\~alice\\]'), description);
  });

  test("GitLab: a parent already there named in the description, inert", () => {
    const b = backlog();
    b.features[0].ref = "acme/team/shop#7";
    const out = exported("gitlab", {}, { backlog: b });
    assert.equal(out.toLink, 2);
    const rows = rowsOf(out.files[0].content);
    assert.ok(rows[1][1].includes(`Parent: acme/team/shop#${JOINER}7 (to link after the import)`), rows[1][1]);
  });

  test("in the documentation's language: French texts", () => {
    const fr = createI18n({ language: "fr" }).t;
    const [file] = exportBacklog(backlog(), {
      target: "gitlab",
      t: fr,
      options: {},
      product: "Acme",
      language: "fr",
      base: "x",
    }).files;
    assert.match(file.content, /Fonctionnalité : F-01 · Track orders/);
    assert.match(file.content, /### Critères d'acceptation/);
  });
});

/** Runs the CLI, its output captured. */
async function cli(args) {
  let out = "";
  let err = "";
  const code = await runCli(args, {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) },
    env: {},
  });
  return { code, out, err };
}

describe("doc-kit backlog export", () => {
  test("the demo: each target written beside the site; --output; a usage error for an unknown target", async () => {
    const dir = demoCopy();
    try {
      const r = await cli(["backlog", "export", "azure", "--project", dir]);
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, /dist\/Acme-Orders-Documentation-backlog-azure\.csv — 8 items/);
      assert.ok(fs.existsSync(path.join(dir, "dist", "Acme-Orders-Documentation-backlog-azure.csv")));
      const gh = await cli([
        "backlog",
        "export",
        "github",
        "--project",
        dir,
        "--output",
        path.join(dir, "out", "issues.txt"),
      ]);
      assert.equal(gh.code, 0, gh.err);
      assert.ok(
        fs.existsSync(path.join(dir, "out", "issues.json")) && fs.existsSync(path.join(dir, "out", "issues.md")),
      );
      const json = await cli(["backlog", "export", "json", "--project", dir, "--json"]);
      assert.deepEqual(JSON.parse(json.out).files, [{ file: "dist/Acme-Orders-Documentation-backlog.json", items: 8 }]);
      assert.equal((await cli(["backlog", "export", "trello", "--project", dir])).code, 2);
      assert.equal((await cli(["backlog", "--project", dir])).code, 2);
      const bare = await cli(["backlog", "export", "--project", dir]);
      assert.equal(bare.code, 2);
      assert.match(bare.err, /usage: .* backlog export <target>/);
      assert.doesNotMatch(bare.err, /\{target\}/);
      assert.equal((await cli(["backlog", "export", "toString", "--project", dir])).code, 2, "no inherited name");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an error of the backlog refuses the export, nothing written; what Azure DevOps holds left out; a secret removed", async () => {
    const dir = demoCopy();
    try {
      const tocFile = path.join(dir, "content", "toc.json");
      const toc = JSON.parse(fs.readFileSync(tocFile, "utf8"));
      const groups = toc.sections.flatMap((s) => s.groups);
      const second = groups.find((g) => g.epic === "E-02");
      second.epic = "E-01";
      fs.writeFileSync(tocFile, JSON.stringify(toc));
      const refused = await cli(["backlog", "export", "jira", "--project", dir]);
      assert.equal(refused.code, 1);
      assert.match(refused.err, /E-01/);
      assert.match(refused.err, /the backlog has 1 error: nothing exported/);
      assert.ok(!fs.existsSync(path.join(dir, "dist", "Acme-Orders-Documentation-backlog-jira.csv")));

      second.epic = "E-02";
      groups.find((g) => g.epic === "E-01").ref = "ADO#120";
      fs.writeFileSync(tocFile, JSON.stringify(toc));
      const page = path.join(dir, "content", "features", "track-orders.md");
      const token = "gh" + "p_" + "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5";
      fs.writeFileSync(
        page,
        fs
          .readFileSync(page, "utf8")
          .replace(
            "so that I deal with the open ones first.",
            `so that I deal with the open ones first.\n\nToken ${token}`,
          ),
      );
      const r = await cli(["backlog", "export", "azure", "--project", dir]);
      assert.equal(r.code, 1, "a secret removed: exit code 1, the file written");
      assert.match(r.out, /— 7 items/);
      assert.match(r.out, /1 item already in Azure DevOps left out \(--all to export it too\)/);
      assert.match(r.out, /1 item whose parent is already in Azure DevOps/);
      assert.match(r.err, /1 line removed from the export: a possible secret/);
      const text = fs.readFileSync(path.join(dir, "dist", "Acme-Orders-Documentation-backlog-azure.csv"), "utf8");
      assert.ok(!text.includes(token));
      assert.match(text, /\[removed: a possible secret/);
      const all = await cli(["backlog", "export", "azure", "--project", dir, "--all"]);
      assert.match(all.out, /— 8 items/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--lang of a multilingual documentation: beside that language's site, in its language", async () => {
    const dir = demoCopy();
    try {
      const config = path.join(dir, "doc.config.mjs");
      const source = fs.readFileSync(config, "utf8");
      fs.writeFileSync(config, source.replace('  language: "en",', '  language: "en",\n  languages: ["en", "fr"],'));
      const r = await cli(["backlog", "export", "json", "--project", dir, "--lang", "fr"]);
      assert.equal(r.code, 0, r.err);
      const file = path.join(dir, "dist", "Acme-Orders-Documentation-fr-backlog.json");
      assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).language, "fr");
      assert.ok(!fs.existsSync(path.join(dir, "dist", "Acme-Orders-Documentation-backlog.json")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an outline that cannot be read: its errors refuse the export", async () => {
    const dir = demoCopy();
    try {
      fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Docs" }));
      const r = await cli(["backlog", "export", "json", "--project", dir]);
      assert.equal(r.code, 1);
      assert.match(r.err, /nothing exported/);
      assert.doesNotMatch(r.err, /no feature sheet/);
      assert.ok(!fs.existsSync(path.join(dir, "dist", "Acme-Orders-Documentation-backlog.json")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a documentation without a feature sheet: nothing to export", async () => {
    const r = await cli(["backlog", "export", "json", "--project", SPACES]);
    assert.equal(r.code, 1, r.err);
    assert.match(r.err, /no feature sheet: the backlog is empty, nothing to export/);
  });
});
