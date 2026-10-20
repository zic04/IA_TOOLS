// The analyses of the features (ARCHITECTURE.md §6.11a): the check of an analysis (statuses, proofs inside the
// application folder — a path that leaves it refused without being read —, kinds and rubrics, no code for a reader
// without the code), the digests by reader, the open questions, the candidate findings, the depth loop
// (skill/doc-kit/scripts/analysis-model.mjs), and the script that runs them on a project (analysis.mjs).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  FORMAT,
  MAX_ROUNDS,
  checkAnalysis,
  codeInText,
  depthPlan,
  digest,
  findingsOf,
  itemsOf,
  openQuestions,
  safeProofPath,
} from "../../skill/doc-kit/scripts/analysis-model.mjs";
import { proofLines, MAX_PROOF_FILE } from "../../skill/doc-kit/scripts/analysis-files.mjs";
import { behaviourRegistry } from "../../engine/core/behaviours.mjs";
import { validate } from "../../engine/project/validate.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

const SCRIPT = path.join(KIT_ROOT, "skill", "doc-kit", "scripts", "analysis.mjs");
const SCHEMA = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "schemas", "behaviour-analysis.schema.json"), "utf8"));
const { kinds } = behaviourRegistry().registry;
const proof = (file = "src/orders.ts", line = 3) => ({ file, line });
const ok = (text, extra = {}) => ({ text, status: "verified", proofs: [proof()], ...extra });

/** A complete analysis of a search feature; `edit` changes a copy. */
function analysis(edit = (d) => d) {
  const search = Object.fromEntries(
    kinds
      .get("search")
      .rubrics.filter((r) => r.required)
      .map((r) => [r.id, ok(`The ${r.id} of the search.`)]),
  );
  const doc = {
    format: FORMAT,
    feature: "F-01",
    title: "Track orders",
    size: "M",
    summary: ok("Follow every order from its creation to its delivery.", {
      mechanism: "OrdersPage reads GET /api/orders.",
    }),
    roles: [ok("Sales manager")],
    stories: [
      {
        id: "US-01",
        role: "Sales manager",
        text: "I find an order by its customer.",
        status: "verified",
        proofs: [proof()],
      },
    ],
    flow: [ok("The list opens on the latest orders.")],
    behaviours: [{ id: "B-01", kind: "search", title: "Search an order", rubrics: search }],
    rules: [
      {
        id: "BR-01",
        text: "A cancelled order cannot be edited.",
        status: "deduced",
        proofs: [proof("src/rules.ts", 1)],
      },
    ],
    messages: [{ text: "", status: "unknown", question: "What does the reader see when the server is down?" }],
    limits: [{ text: "", status: "n/a", reason: "No export in this version." }],
    criteria: [
      {
        story: "US-01",
        given: "an order of Durand",
        when: "I type durand",
        then: "it is listed",
        status: "verified",
        proofs: [proof()],
      },
    ],
    findings: [
      {
        severity: "medium",
        text: "The search is not limited to the reader's orders.",
        mechanism: "no tenant filter in findOrders",
        proofs: [proof("src/orders.ts", 7)],
      },
    ],
  };
  return edit(structuredClone(doc));
}
/** A fake application folder: its files and their number of lines; what was asked. */
function app(files = { "src/orders.ts": 10, "src/rules.ts": 5 }) {
  const asked = [];
  return {
    asked,
    lines: (file) => {
      asked.push(file);
      if (file === "src/link.ts") return { outside: true };
      return file in files ? { count: files[file] } : { missing: true };
    },
  };
}
const keys = (problems) => problems.map((p) => p.key);
const check = (doc, a = app()) => checkAnalysis(doc, { name: "F-01", kinds, lines: a.lines });

describe("an analysis checked", () => {
  test("a complete analysis: it follows the schema and has no problem", () => {
    assert.deepEqual(validate(analysis(), SCHEMA).errors, []);
    assert.deepEqual(check(analysis()), []);
  });

  test("each status with what it needs: a proof and a text, a question, a reason", () => {
    const problems = check(
      analysis((d) => {
        d.roles[0].proofs = [];
        d.flow[0].text = " ";
        d.messages[0].question = "";
        d.limits[0].reason = undefined;
        return d;
      }),
    );
    assert.deepEqual(problems, [
      { key: "proofNeeded", vars: { at: "roles[0]" } },
      { key: "textNeeded", vars: { at: "flow[0]" } },
      { key: "questionNeeded", vars: { at: "messages[0]" } },
      { key: "reasonNeeded", vars: { at: "limits[0]" } },
    ]);
    assert.deepEqual(keys(check(analysis((d) => ((d.findings[0].proofs = []), d)))), ["proofNeeded"]);
  });

  test("a proof that leaves the application folder is refused without being read", () => {
    for (const file of [
      "../secret.txt",
      "src/../../secret.txt",
      "/etc/passwd",
      "C:/x.ts",
      "src\\x.ts",
      "src//x.ts",
      "./x.ts",
      "x.ts:Zone.Identifier",
      "a\0b",
    ]) {
      const a = app();
      const problems = check(
        analysis((d) => ((d.roles[0].proofs = [proof(file)]), d)),
        a,
      );
      assert.deepEqual(problems, [{ key: "proofOutside", vars: { at: "roles[0]", file } }], JSON.stringify(file));
      assert.ok(!a.asked.includes(file), `${JSON.stringify(file)} was not looked for`);
      assert.equal(safeProofPath(file), false);
    }
    // Its real path outside (a link): refused too.
    assert.deepEqual(keys(check(analysis((d) => ((d.roles[0].proofs = [proof("src/link.ts")]), d)))), ["proofOutside"]);
  });

  test("a proof's file must exist, its line and its range be in it", () => {
    const at = (p) => check(analysis((d) => ((d.roles[0].proofs = [p]), d)));
    assert.deepEqual(keys(at(proof("src/none.ts"))), ["proofMissing"]);
    assert.deepEqual(at(proof("src/orders.ts", 11)), [
      { key: "proofLine", vars: { at: "roles[0]", file: "src/orders.ts", line: 11, n: 10 } },
    ]);
    assert.deepEqual(keys(at({ file: "src/orders.ts", line: 4, endLine: 3 })), ["proofRange"]);
    assert.deepEqual(keys(at({ file: "src/orders.ts", line: 4, endLine: 11 })), ["proofRange"]);
    assert.deepEqual(at({ file: "src/orders.ts", line: 4, endLine: 10 }), []);
  });

  test("the behaviours: a known kind, its rubrics only, every required one answered", () => {
    assert.deepEqual(keys(check(analysis((d) => ((d.behaviours[0].kind = "teleport"), d)))), ["kind"]);
    const extra = check(analysis((d) => ((d.behaviours[0].rubrics.colour = ok("Blue.")), d)));
    assert.deepEqual(extra[0].key, "rubric");
    const missing = check(analysis((d) => (delete d.behaviours[0].rubrics.match, d)));
    assert.deepEqual(missing, [{ key: "rubricMissing", vars: { at: "behaviours[0]", rubrics: "match" } }]);
    // An explicit unknown answers a rubric.
    assert.deepEqual(
      check(
        analysis((d) => ((d.behaviours[0].rubrics.match = { text: "", status: "unknown", question: "Accents?" }), d)),
      ),
      [],
    );
    // Without the kinds (the kit unreachable), not checked.
    assert.deepEqual(
      checkAnalysis(
        analysis((d) => ((d.behaviours[0].kind = "x"), d)),
        { name: "F-01", kinds: null, lines: app().lines },
      ),
      [],
    );
  });

  test("its name, its ids once, a criterion of one of its stories", () => {
    assert.deepEqual(checkAnalysis(analysis(), { name: "F-02", kinds, lines: app().lines }), [
      { key: "fileName", vars: { file: "F-02.json", feature: "F-01" } },
    ]);
    assert.deepEqual(keys(check(analysis((d) => (d.stories.push({ ...d.stories[0] }), d)))), ["duplicate"]);
    assert.deepEqual(keys(check(analysis((d) => ((d.criteria[0].story = "US-09"), d)))), ["criterionStory"]);
  });

  test("no code in a text for a reader without the code; mechanism may name it", () => {
    for (const [text, token] of [
      ["Reads `orders`.", "`"],
      ["See orders.service.ts for it.", "service.ts"],
      ["Line in rules.py:42.", "rules.py"],
      ["Line in report.vb:42.", ".vb:42"],
      ["It calls fetchOrders() first.", "fetchOrders()"],
      ["Sorted by created_at.", "created_at"],
      ["The ordersTable lists them.", "ordersTable"],
    ])
      assert.equal(codeInText(text), token, text);
    for (const text of [
      "Works on an iPhone, with PayPal or eBay.",
      "The order(s) of macOS users by e-mail.",
      "Ce n'est pas l'heure.",
    ])
      assert.equal(codeInText(text), null, text);
    const problems = check(analysis((d) => ((d.stories[0].text = "I call getOrders() to find it."), d)));
    assert.deepEqual(problems, [{ key: "codeInText", vars: { at: "stories[0]", token: "getOrders()" } }]);
    assert.deepEqual(
      check(analysis((d) => ((d.summary.mechanism = "src/app/orders/page.tsx calls getOrders()"), d))),
      [],
    );
  });

  test("a secret in any text: its place and its kind, never its value", () => {
    const secrets = (text) => (text.includes("XYZZY") ? ["cloudKey"] : []);
    const problems = checkAnalysis(
      analysis((d) => {
        d.summary.mechanism = "Reads the key XYZZY at start.";
        d.findings[0].text = "XYZZY is in the code.";
        d.behaviours[0].title = "Search XYZZY";
        return d;
      }),
      { name: "F-01", kinds, lines: app().lines, secrets },
    );
    assert.deepEqual(problems, [
      { key: "secret", vars: { at: "behaviours[0].title", kind: "cloudKey" } },
      { key: "secret", vars: { at: "summary.mechanism", kind: "cloudKey" } },
      { key: "secret", vars: { at: "findings[0].text", kind: "cloudKey" } },
    ]);
    assert.ok(!JSON.stringify(problems).includes("XYZZY"));
  });

  test("every item of an analysis is visited, the rubrics with their id", () => {
    const at = itemsOf(analysis()).map((x) => x.at);
    assert.ok(at.includes("summary") && at.includes("behaviours[0].rubrics.match") && at.includes("criteria[0]"));
    assert.equal(itemsOf(analysis()).find((x) => x.at === "behaviours[0].rubrics.match").label, "match");
  });
});

const T = (key, vars = {}) => `${key}${Object.keys(vars).length ? JSON.stringify(vars) : ""}`;
const label = (kind, rubric) => `${kind}/${rubric}`;

describe("the digests", () => {
  test("for a reader without the code: the texts and their statuses, no mechanism, no proof, no finding", () => {
    const text = digest(analysis(), { mechanism: false, proofs: false, reader: "Product", t: T, rubricLabel: label });
    assert.match(text, /^# F-01 · Track orders — digest\.title\{"reader":"Product"\}\n/);
    assert.match(text, /## section\.stories\n\n- \*\*US-01\*\* — Sales manager: I find an order by its customer\.\n/);
    assert.match(text, /### B-01 · Search an order \(search\)\n\n- \*\*search\/where\*\*: The where of the search\.\n/);
    assert.match(text, /- \*\*BR-01\*\* — A cancelled order cannot be edited\. \*\(status\.deduced\)\*\n/);
    assert.match(text, /- \*\*status\.unknown\*\* — What does the reader see when the server is down\?\n/);
    assert.match(text, /- status\.na — No export in this version\.\n/);
    assert.doesNotMatch(text, /OrdersPage|src\/|digest\.proofs|digest\.mechanism|section\.findings|tenant/);
    // The sections in the order of the sheet; one without an item is left out.
    const order = [...text.matchAll(/^## (section\.\w+)/gm)].map((m) => m[1]);
    assert.deepEqual(order, [
      "section.summary",
      "section.roles",
      "section.stories",
      "section.flow",
      "section.behaviours",
      "section.rules",
      "section.messages",
      "section.criteria",
      "section.limits",
    ]);
  });

  test("for a developer: how it works, the proofs, the candidate findings", () => {
    const text = digest(analysis(), { mechanism: true, proofs: true, reader: "Develop", t: T, rubricLabel: label });
    assert.match(
      text,
      /\n {2}digest\.mechanism OrdersPage reads GET \/api\/orders\.\n {2}digest\.proofs `src\/orders\.ts:3`\n/,
    );
    assert.match(text, /## section\.findings\n\n- \*\*severity\.medium\*\* — The search is not limited/);
    const admin = digest(analysis(), {
      mechanism: true,
      proofs: false,
      reader: "Administer",
      t: T,
      rubricLabel: label,
    });
    assert.match(admin, /digest\.mechanism/);
    assert.doesNotMatch(admin, /digest\.proofs|section\.findings/);
  });
});

describe("the open questions and the findings", () => {
  test("every unknown item, by feature, with where it is; what the loop left; none", () => {
    const second = analysis((d) => ((d.feature = "F-02"), (d.title = "Approve"), d));
    second.behaviours[0].rubrics.match = { text: "", status: "unknown", question: "Do accents count?" };
    const text = openQuestions([second, analysis()], {
      left: [
        { feature: "F-01", title: "Track orders", gap: "Search an order · Order", why: "notFound" },
        { feature: "F-01", title: "Track orders", gap: "Search an order · Fields", why: "notCarried" },
        { feature: "F-01", title: "Track orders", gap: "rules", section: "rules", why: "notFound" },
      ],
      t: T,
      rubricLabel: label,
    });
    assert.match(
      text,
      /## F-01 · Track orders\n\n- \[ \] What does the reader see when the server is down\? \*\(section\.messages\)\*\n- \[ \] questions\.notFound\{"gap":"Search an order · Order"\}\n- \[ \] questions\.notCarried\{"gap":"Search an order · Fields"\}\n- \[ \] questions\.notFound\{"gap":"section\.rules"\}\n\n## F-02/,
    );
    assert.match(text, /- \[ \] Do accents count\? \*\(Search an order · search\/match\)\*/);
    assert.match(openQuestions([], { left: [], t: T, rubricLabel: label }), /questions\.none/);
    // An entry without its reason (a hand-edited depth.json) reads as not found.
    const bare = openQuestions([], { left: [{ feature: "F-03", title: "T", gap: "x" }], t: T, rubricLabel: label });
    assert.match(bare, /questions\.notFound\{"gap":"x"\}/);
  });

  test("the findings, the most severe first, then by feature", () => {
    const high = analysis((d) => ((d.feature = "F-09"), (d.findings[0].severity = "high"), d));
    const low = analysis((d) => ((d.feature = "F-02"), (d.findings[0].severity = "low"), d));
    assert.deepEqual(
      findingsOf([low, analysis(), high]).map((f) => `${f.feature} ${f.severity}`),
      ["F-09 high", "F-01 medium", "F-02 low"],
    );
  });
});

/** A feature of the audit's depth report with its gaps, and a card of its sheet with its open rubrics. */
const feature = (gaps) => ({ id: "F-01", title: "Track orders", page: "features/track", gaps });
const card = (rubrics, extra = {}) => ({ id: "B-01", kind: "search", title: "Search an order", rubrics, ...extra });

describe("the depth loop", () => {
  const plan = (gaps, { doc = analysis(), state = {} } = {}) =>
    depthPlan({
      features: [feature(gaps)],
      analyses: new Map(doc ? [[doc.feature, doc]] : []),
      state,
      rubricLabel: label,
    });

  test("what the analysis answers is deepened, what it does not hold analysed again, an unknown already asked", () => {
    const doc = analysis((d) => {
      d.behaviours[0].rubrics.match = { text: "", status: "unknown", question: "Accents?" };
      d.behaviours[0].rubrics.paging = { text: "", status: "n/a", reason: "One page." };
      delete d.behaviours[0].rubrics.empty;
      return d;
    });
    const r = plan(
      {
        cards: [
          card([
            { id: "fields", state: "missing" },
            { id: "match", state: "unknown" },
            { id: "paging", state: "missing" },
            { id: "empty", state: "missing" },
          ]),
        ],
        stories: ["US-01", "US-02"],
      },
      { doc },
    );
    assert.deepEqual(r.actions, [
      {
        feature: "F-01",
        title: "Track orders",
        page: "features/track",
        deepen: ["B-01.fields", "B-01.paging", "US-01.criteria"],
        reanalyse: ["B-01.empty", "US-02.criteria"],
        questions: ["B-01.match"],
      },
    ]);
    assert.deepEqual(r.state, { "F-01": { rounds: 1 } });
    assert.deepEqual(r.left, []);
  });

  test("a card found by its id, else the only one of its kind; no analysis: the whole feature analysed", () => {
    assert.deepEqual(plan({ cards: [card([{ id: "fields", state: "missing" }], { id: null })] }).actions[0].deepen, [
      "Search an order.fields",
    ]);
    assert.deepEqual(
      plan({ cards: [card([{ id: "fields", state: "missing" }])] }, { doc: null }).actions[0].reanalyse,
      ["*"],
    );
  });

  test("no story or no rule: deepened when the analysis holds some, left when it found none", () => {
    assert.deepEqual(plan({ noStory: true, noRule: true }).actions[0].deepen, ["stories", "rules"]);
    const none = plan(
      { noStory: true, noRule: true },
      { doc: analysis((d) => ((d.stories = []), (d.rules = []), (d.criteria = []), d)) },
    );
    assert.deepEqual(none.actions, []);
    assert.deepEqual(
      none.left.map((l) => [l.gap, l.section, l.why]),
      [
        ["stories", "stories", "notFound"],
        ["rules", "rules", "notFound"],
      ],
    );
  });

  test(`at most ${MAX_ROUNDS} rounds: then everything still open is left to the product owner; the state given unchanged`, () => {
    const state = { "F-01": { rounds: MAX_ROUNDS - 1 } };
    const gaps = { cards: [card([{ id: "fields", state: "missing" }])] };
    const r = plan(gaps, { state });
    assert.deepEqual(r.state, { "F-01": { rounds: MAX_ROUNDS } });
    assert.deepEqual(state, { "F-01": { rounds: MAX_ROUNDS - 1 } }, "pure");
    const last = plan(gaps, { state: r.state });
    assert.deepEqual(last.actions, []);
    assert.deepEqual(last.left, [
      { feature: "F-01", title: "Track orders", gap: "Search an order · search/fields", why: "notCarried" },
    ]);
    const open = plan(
      { cards: [card([{ id: "fields", state: "missing" }])], noRule: true },
      { doc: null, state: { "F-01": { rounds: MAX_ROUNDS } } },
    );
    assert.deepEqual(open.left, [
      { feature: "F-01", title: "Track orders", gap: "Search an order · search/fields", why: "notFound" },
      { feature: "F-01", title: "Track orders", gap: "rules", section: "rules", why: "notFound" },
    ]);
    // Without gaps, nothing.
    assert.deepEqual(plan(undefined), { actions: [], left: [], state: {} });
  });
});

describe("the files of the proofs", () => {
  /** A file system of the given entries (real path → stat, text); what was read. */
  function io(entries) {
    const read = [];
    return {
      read,
      realpathSync: { native: (p) => p.split(path.sep).join("/") },
      statSync: (p) => entries[p].stat,
      readFileSync: (p) => {
        read.push(p);
        return entries[p].text;
      },
    };
  }
  test("only a plain file of 8 MB at most is read — never a folder, a device or a named pipe — and once", () => {
    const fake = io({
      "/app/a.ts": { stat: { isFile: () => true, size: 6 }, text: "1\n2\n3\n" },
      "/app/pipe": { stat: { isFile: () => false, size: 0 } },
      "/app/big.txt": { stat: { isFile: () => true, size: MAX_PROOF_FILE + 1 } },
    });
    const lines = proofLines("/app", fake);
    assert.deepEqual(lines("a.ts"), { count: 3 });
    assert.deepEqual(lines("a.ts"), { count: 3 });
    assert.deepEqual(lines("pipe"), { missing: true });
    assert.deepEqual(lines("big.txt"), { missing: true });
    assert.deepEqual(lines("none.ts"), { missing: true }, "a stat that throws: missing");
    assert.deepEqual(fake.read, ["/app/a.ts"]);
  });
});

describe("analysis.mjs on a project", () => {
  /** A documentation project next to its application, an analysis written; `edit` changes it. */
  function project(edit = (d) => d) {
    const root = tempDir("doc-kit-analysis-");
    const docs = path.join(root, "docs");
    const appDir = path.join(root, "app");
    fs.mkdirSync(path.join(docs, ".doc-kit", "analysis"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(docs, "doc.config.mjs"),
      'export default { product: { name: "Shop" }, language: "en", app: { url: "http://localhost:3000", dir: "../app" } };\n',
    );
    fs.writeFileSync(path.join(appDir, "src", "orders.ts"), "a\n".repeat(10));
    fs.writeFileSync(path.join(appDir, "src", "rules.ts"), "a\n".repeat(5));
    fs.writeFileSync(path.join(root, "secret.txt"), "x\n".repeat(50));
    fs.writeFileSync(path.join(docs, ".doc-kit", "analysis", "F-01.json"), JSON.stringify(edit(analysis())));
    return { root, docs };
  }
  const script = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });

  test("check: OK, then a proof outside the application folder refused (exit code 1); digest for Product; findings", () => {
    const { root, docs } = project();
    try {
      let r = script(["check", "--project", docs]);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /✔ F-01\n1 analyses checked, 0 with problems/);
      r = script(["digest", "F-01", "--for", "product", "--project", docs]);
      assert.equal(r.status, 0, r.stderr);
      const text = fs.readFileSync(path.join(docs, ".doc-kit", "analysis", "F-01.product.md"), "utf8");
      assert.match(text, /^# F-01 · Track orders — digest for the Product space\n/);
      assert.match(text, /## Behaviours\n\n### B-01 · Search an order \(search\)\n\n- \*\*Where\*\*: /);
      assert.doesNotMatch(text, /src\/|How it works:/);
      r = script(["findings", "--project", docs]);
      assert.match(
        r.stdout,
        /^1\. Medium — The search is not limited to the reader's orders\. \(F-01\): `src\/orders\.ts:7`\n/,
      );
      const bad = project((d) => ((d.roles[0].proofs = [proof("../secret.txt")]), d));
      r = script(["check", "--project", bad.docs]);
      assert.equal(r.status, 1);
      assert.match(
        r.stdout,
        /✖ F-01\n {2}roles\[0\]: \.\.\/secret\.txt is not inside the application folder \(not read\)\n/,
      );
      r = script(["digest", "F-01", "--for", "product", "--project", bad.docs]);
      assert.equal(r.status, 1, "never a digest of a wrong analysis");
      fs.rmSync(bad.root, { recursive: true, force: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("depth: from .doc-kit/audit.json, recorded in depth.json; questions written; usage errors (2)", () => {
    const { root, docs } = project();
    try {
      fs.writeFileSync(
        path.join(docs, ".doc-kit", "audit.json"),
        JSON.stringify({
          depth: {
            features: [
              feature({
                cards: [
                  card([
                    { id: "fields", state: "missing" },
                    { id: "order", state: "missing" },
                  ]),
                ],
              }),
            ],
          },
        }),
      );
      let r = script(["depth", "--project", docs, "--json"]);
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(JSON.parse(r.stdout).actions[0].deepen, ["B-01.fields", "B-01.order"]);
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(docs, ".doc-kit", "analysis", "depth.json"), "utf8")).features,
        { "F-01": { rounds: 1 } },
      );
      r = script(["questions", "--project", docs]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(
        fs.readFileSync(path.join(docs, ".doc-kit", "open-questions.md"), "utf8"),
        /## F-01 · Track orders\n\n- \[ \] What does the reader see/,
      );
      assert.equal(script(["digest", "F-01", "--for", "everyone", "--project", docs]).status, 2);
      assert.equal(script(["fly", "--project", docs]).status, 2);
      assert.equal(script(["check", "F01", "--project", docs]).status, 2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("check: a proof through a link that leaves the application folder is refused", () => {
    const { root, docs } = project((d) => ((d.roles[0].proofs = [proof("src/linked/secret.txt")]), d));
    try {
      // A folder outside the application, reached by a junction (a link Windows makes without rights) inside it.
      const outside = path.join(root, "outside");
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "secret.txt"), "x\n".repeat(50));
      fs.symlinkSync(outside, path.join(root, "app", "src", "linked"), "junction");
      const r = script(["check", "--project", docs]);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /roles\[0\]: src\/linked\/secret\.txt is not inside the application folder \(not read\)/);
    } finally {
      fs.unlinkSync(path.join(root, "app", "src", "linked"));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("check: a file over 8 MB or a folder is not read; a device name does not hang; texts on one line; a secret", () => {
    const longText = "x".repeat(8 * 1024 * 1024 + 1);
    const { root, docs } = project((d) => {
      d.roles[0].proofs = [
        proof("src/big.txt"),
        proof("src"),
        proof("NUL"),
        proof("CON"),
        proof("src/\u001b[31mred.ts"),
      ];
      d.flow[0].mechanism = "The admin signs in at https://ops:" + "Zq8vT2mWxK4p@orders.acme.example";
      return d;
    });
    try {
      fs.writeFileSync(path.join(root, "app", "src", "big.txt"), longText);
      const r = spawnSync(process.execPath, [SCRIPT, "check", "--project", docs], { encoding: "utf8", timeout: 60000 });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      for (const file of ["src/big.txt", "src", "NUL", "CON"])
        assert.match(r.stdout, new RegExp(`roles\\[0\\]: ${file}( does not exist| is not inside)`), file);
      assert.ok(!r.stdout.includes("\u001b"), "no control character printed");
      assert.match(r.stdout, /flow\[0\]\.mechanism: a secret-like value \(credentialsUrl\)/);
      assert.ok(!r.stdout.includes("Zq8vT2mWxK4p"), "never the value");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("digest of a name that is not a feature id: exit code 2, nothing written; app.dir not set: said", () => {
    const { root, docs } = project();
    try {
      const r = script(["digest", "../x", "--for", "product", "--project", docs]);
      assert.equal(r.status, 2);
      assert.deepEqual(fs.readdirSync(path.join(docs, ".doc-kit", "analysis")), ["F-01.json"]);
      assert.ok(!fs.existsSync(path.join(docs, ".doc-kit", "x.product.md")));
      const config = path.join(docs, "doc.config.mjs");
      fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace(', dir: "../app"', ""));
      assert.match(
        script(["check", "--project", docs]).stderr,
        /⚠ app\.dir is not set: the proofs are checked against /,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("questions, findings and depth: an analysis that does not follow the format is named and skipped", () => {
    const { root, docs } = project();
    try {
      const broken = analysis((d) => ((d.feature = "F-02"), (d.findings[0].proofs = undefined), d));
      fs.writeFileSync(path.join(docs, ".doc-kit", "analysis", "F-02.json"), JSON.stringify(broken));
      fs.writeFileSync(path.join(docs, ".doc-kit", "audit.json"), JSON.stringify({ depth: { features: [] } }));
      for (const command of ["questions", "findings", "depth"]) {
        const r = script([command, "--project", docs]);
        assert.equal(r.status, 0, `${command}: ${r.stderr}`);
        assert.match(
          r.stderr,
          /⚠ F-02 is skipped: it does not follow the format\n {2}→ node analysis\.mjs check F-02 says why/,
        );
      }
      assert.match(script(["findings", "--project", docs]).stdout, /\(F-01\)/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("questions, findings and depth: an analysis holding a secret is skipped, its value never printed or written", () => {
    const value = "Zq8vT2mWxK4p";
    const { root, docs } = project((d) => {
      d.findings[0].text = "The orders database is reached at postgres://admin:" + value + "@db.example.test/app.";
      d.messages[0].question = "Is https://ops:" + value + "@orders.acme.example still used?";
      return d;
    });
    try {
      fs.writeFileSync(path.join(docs, ".doc-kit", "audit.json"), JSON.stringify({ depth: { features: [] } }));
      for (const args of [["findings"], ["findings", "--json"], ["questions"], ["depth"]]) {
        const r = script([...args, "--project", docs]);
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stderr, /⚠ F-01 is skipped: one of its texts holds a secret-like value\n/, args.join(" "));
        assert.ok(!(r.stdout + r.stderr).includes(value), `${args.join(" ")}: never the value`);
      }
      assert.ok(!fs.readFileSync(path.join(docs, ".doc-kit", "open-questions.md"), "utf8").includes(value));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("depth: once the gaps of a feature are closed, what it had left goes", () => {
    const { root, docs } = project();
    try {
      const audit = (features) =>
        fs.writeFileSync(path.join(docs, ".doc-kit", "audit.json"), JSON.stringify({ depth: { features } }));
      const depthState = () =>
        JSON.parse(fs.readFileSync(path.join(docs, ".doc-kit", "analysis", "depth.json"), "utf8"));
      audit([feature({ cards: [card([{ id: "fields", state: "missing" }])] })]);
      for (let i = 0; i <= MAX_ROUNDS; i++) script(["depth", "--project", docs]);
      assert.equal(depthState().left.length, 1, "left after the rounds");
      audit([feature({ cards: [], stories: [], noStory: false, noRule: false })]);
      const r = script(["depth", "--project", docs]);
      assert.match(r.stdout, /nothing open in the feature sheets/);
      assert.deepEqual(depthState().left, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("the messages in the project's language", () => {
    const { root, docs } = project();
    try {
      const config = path.join(docs, "doc.config.mjs");
      fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace('language: "en"', 'language: "fr"'));
      const r = script(["check", "--project", docs]);
      assert.match(r.stdout, /1 analyses vérifiées, 0 avec des problèmes/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
