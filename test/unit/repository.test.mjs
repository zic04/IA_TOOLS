// The repository's own hygiene (RULES.md, "Enforced by"): the package stays private until a publication is decided,
// RULES.md and RULES.fr.md list the same rules, the kit's CI keeps its time limits, its cancelled runs and the check
// names its branch ruleset requires, no checkout keeps its token, and the examples of ci/ check out the current release.
// Each checker is a pure function run first on a pair of samples (one it accepts, one it flags), then on the real file.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readYaml, at, text, items, entries, field } from "../../engine/core/yaml.mjs";
import { KIT_ROOT } from "../tools/helpers.mjs";

const read = (file) => fs.readFileSync(path.join(KIT_ROOT, file), "utf8");
const pkg = JSON.parse(read("package.json"));

// ── The package ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Why `npm publish` could take the whole repository (tests, docs, studies), or null: private, or a `files` list. */
const publishProblem = (p) =>
  p.private === true || (Array.isArray(p.files) && p.files.length) ? null : "neither private nor a files list";

/** An e-mail address in a text: a word, @, a domain with a dot. Each part is one class, bounded by the next. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

describe("the package", () => {
  test("the checkers flag what they forbid (positive controls)", () => {
    assert.equal(publishProblem({ private: true }), null);
    assert.equal(publishProblem({ files: ["cli/", "engine/"] }), null);
    assert.ok(publishProblem({ name: "x" }));
    assert.ok(publishProblem({ private: "true" }), "a string is not true");
    assert.ok(publishProblem({ files: [] }), "an empty list publishes everything");
    assert.match('"author": "A <a.b@example.org>"', EMAIL);
    assert.doesNotMatch('"url": "https://github.com/owner/repo/issues"', EMAIL);
    assert.doesNotMatch("git+https://github.com/owner/repo.git", EMAIL);
  });

  test("stays private until a publication is decided, unless a files list says what is published", () => {
    assert.equal(publishProblem(pkg), null);
  });

  test("says where the code and the issues are, and names no e-mail address", () => {
    assert.match(pkg.repository?.url ?? "", /^git\+https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/);
    assert.match(pkg.bugs?.url ?? "", /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues$/);
    assert.match(pkg.homepage ?? "", /^https:\/\/github\.com\//);
    assert.ok(Array.isArray(pkg.keywords) && pkg.keywords.length, "keywords");
    assert.doesNotMatch(read("package.json"), EMAIL);
  });

  test("a vulnerability and a conduct report go to the private reporting of the repository, with no e-mail", () => {
    const advisory = new URL("security/advisories/new", `${pkg.bugs.url.replace(/issues$/, "")}`).href;
    for (const file of ["SECURITY.md", "CODE_OF_CONDUCT.md"]) {
      const doc = read(file).replace(/\s+/g, " ");
      assert.ok(doc.includes("Report a vulnerability"), `${file}: the button to use`);
      assert.ok(doc.includes(advisory), `${file}: ${advisory}`);
      assert.match(doc, /\b7 days\b/, `${file}: the response time`);
      assert.doesNotMatch(doc, EMAIL, file);
    }
  });

  test("LICENSE names its holder, and AUTHORS names them too", () => {
    const holder = read("LICENSE").match(/^Copyright \(c\) \d{4} (.+)$/m)?.[1];
    assert.ok(holder && !/authors/i.test(holder), `a named holder: ${holder}`);
    assert.ok(read("AUTHORS").split(/\r?\n/).includes(holder), "AUTHORS");
    assert.equal(pkg.author, holder);
  });
});

// ── RULES.md and RULES.fr.md ─────────────────────────────────────────────────────────────────────────────────────

/** The ids of a rules document, in order: the first cell of each table row (S1, M17), then the release steps. */
function ruleIds(markdown) {
  const ids = [];
  for (const line of markdown.split(/\r?\n/)) {
    const row = /^\|\s*([SM]\d+)\s*\|/.exec(line);
    if (row) ids.push(row[1]);
    const step = /^(\d+)\.\s/.exec(line);
    if (step) ids.push(`step ${step[1]}`);
  }
  return ids;
}

describe("RULES.md and RULES.fr.md", () => {
  test("the reader finds the rows and the steps (positive control)", () => {
    const sample = "| # | Rule |\n|---|---|\n| S1 | **Never a shell.** |\n| M17 | Time. |\n\n1. `npm test`\n2. audit";
    assert.deepEqual(ruleIds(sample), ["S1", "M17", "step 1", "step 2"]);
    assert.deepEqual(ruleIds(sample.replace("| M17 | Time. |\n", "")), ["S1", "step 1", "step 2"]);
  });

  test("list the same rules, in the same order, and the same release steps", () => {
    const en = ruleIds(read("RULES.md"));
    assert.ok(en.includes("S1") && en.includes("M16") && en.includes("M17"), `read: ${en.join(" ")}`);
    assert.deepEqual(ruleIds(read("RULES.fr.md")), en);
  });
});

// ── The kit's CI ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The check names the branch ruleset requires: renaming a job or its matrix pattern blocks every pull request. */
const REQUIRED_CHECKS = ["tests (${{ matrix.os }}, Node ${{ matrix.node }})", "security (rules, dependencies)"];

/** What a workflow misses: per-ref concurrency cancelling pull request runs, a timeout on each job. */
function workflowProblems(source) {
  const doc = readYaml(source)[0];
  const problems = [];
  const group = text(at(doc, "concurrency", "group")) ?? "";
  if (!/github\.workflow/.test(group) || !/github\.ref/.test(group)) problems.push("concurrency: one group per ref");
  if (!/pull_request/.test(text(at(doc, "concurrency", "cancel-in-progress")) ?? ""))
    problems.push("concurrency: cancel-in-progress on pull requests");
  for (const job of entries(field(doc, "jobs")?.value))
    if (!/^\d+$/.test(text(at(job.value, "timeout-minutes")) ?? "")) problems.push(`${job.key}: timeout-minutes`);
  return problems;
}

/** The first line of a checkout step: GitHub's action, or Azure's `- checkout:`. */
const CHECKOUT = /^\s*(?:-\s+)?uses:\s*actions\/checkout@|^\s*-\s+checkout:\s*\S/;
/** The setting that leaves no token in .git/config (GitHub's spelling, Azure's). */
const NO_TOKEN = /^\s*(?:persist-credentials|persistCredentials):\s*false\b/;

/**
 * The checkouts that keep their token in .git/config, by line number, commented examples included (one `#` taken
 * off each line). A step's settings are the lines indented deeper than the dash that starts it.
 */
function checkoutsWithToken(source) {
  const lines = source.split(/\r?\n/).map((l) => l.replace(/^#/, ""));
  const indent = (l) => l.length - l.trimStart().length;
  const out = [];
  lines.forEach((line, i) => {
    if (!CHECKOUT.test(line)) return;
    const dash = line.trimStart().startsWith("-") ? indent(line) : indent(line) - 2;
    let safe = false;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      if (indent(lines[j]) <= dash) break;
      if (NO_TOKEN.test(lines[j])) safe = true;
    }
    if (!safe) out.push(i + 1);
  });
  return out;
}

/** The tags of the kit that the examples check out (`ref: v0.4.1`, `ref: refs/tags/v0.4.1`). */
const kitRefs = (source) => [...source.matchAll(/^#?[ \t]*ref:[ \t]*(?:refs\/tags\/)?(v[^\s#]+)/gm)].map((m) => m[1]);

describe("the CI", () => {
  const workflow = read(".github/workflows/ci.yml");

  test("the checkers flag what they forbid (positive controls)", () => {
    const good = [
      "concurrency:",
      "  group: ${{ github.workflow }}-${{ github.ref }}",
      "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
      "jobs:",
      "  test:",
      "    timeout-minutes: 30",
      "    steps:",
      "      - uses: actions/checkout@abc # v4",
      "        with:",
      "          persist-credentials: false",
      "      - run: npm test",
    ].join("\n");
    assert.deepEqual(workflowProblems(good), []);
    assert.deepEqual(checkoutsWithToken(good), []);
    assert.deepEqual(workflowProblems(good.replace("    timeout-minutes: 30\n", "")), ["test: timeout-minutes"]);
    assert.equal(workflowProblems(good.replace(/concurrency:\n.*\n.*\n/, "")).length, 2);
    assert.deepEqual(workflowProblems(good.replace("${{ github.event_name == 'pull_request' }}", "true")), [
      "concurrency: cancel-in-progress on pull requests",
    ]);
    assert.deepEqual(checkoutsWithToken(good.replace("false", "true")), [8]);
    assert.deepEqual(
      checkoutsWithToken(good.replace("        with:\n          persist-credentials: false\n", "")),
      [8],
    );
    // The next step's settings are not the checkout's.
    const next =
      "      - uses: actions/checkout@abc\n      - uses: x/y@1\n        with:\n          persist-credentials: false";
    assert.deepEqual(checkoutsWithToken(next), [1]);
    // Commented examples, and Azure's checkouts.
    assert.deepEqual(
      checkoutsWithToken("#       - uses: actions/checkout@abc\n#         with:\n#           path: app"),
      [1],
    );
    assert.deepEqual(checkoutsWithToken("  - checkout: self\n    persistCredentials: false\n  - checkout: kit"), [3]);
    assert.deepEqual(kitRefs("#           ref: v0.4.1   # a tag\n#       ref: refs/tags/v0.4.1\n  ref: main"), [
      "v0.4.1",
      "v0.4.1",
    ]);
  });

  test("cancels a replaced pull request run, and every job has a time limit", () => {
    assert.deepEqual(workflowProblems(workflow), []);
  });

  test("keeps the check names the branch ruleset requires, and tests Node 20, 22 and 24", () => {
    const jobs = field(readYaml(workflow)[0], "jobs").value;
    const names = entries(jobs).map((j) => text(at(j.value, "name")));
    for (const name of REQUIRED_CHECKS) assert.ok(names.includes(name), name);
    const node = items(at(jobs, "test", "strategy", "matrix", "node")).map(text);
    for (const version of ["20", "22", "24"]) assert.ok(node.includes(version), `Node ${version}`);
  });

  test("no checkout keeps its token, in the kit's CI and in the examples of ci/", () => {
    for (const file of [".github/workflows/ci.yml", "ci/github-actions.yml", "ci/azure-pipelines.yml"])
      assert.deepEqual(checkoutsWithToken(read(file)), [], `${file}: lines of the checkouts without it`);
  });

  test("the examples of ci/ check out the kit's current release", () => {
    for (const file of ["ci/github-actions.yml", "ci/azure-pipelines.yml"]) {
      const refs = kitRefs(read(file));
      assert.ok(refs.length, `${file}: a ref`);
      assert.deepEqual([...new Set(refs)], [`v${pkg.version}`], `${file}: moved at each release (RULES.md)`);
    }
  });
});
