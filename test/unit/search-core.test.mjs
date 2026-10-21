// The search of the site (ARCHITECTURE.md §6.1a, "Search"): its pure part, engine/site/lib/search-core.js, run as the
// site runs it (a script that adds EXT.searchCore) — terms, the order of the results (title, then page, then text; the
// start of a word before its inside), the close words of a term the index does not hold, the marks — and the index the
// build writes (engine/build/search.mjs): each page's summary, and the generated tables of the second pass.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { indexPage } from "../../engine/build/search.mjs";
import { buildDemo, KIT_ROOT } from "../tools/helpers.mjs";

/** The module, run in a context of its own; its results copied out of it (another realm's arrays). */
const context = { EXT: { hydrators: [], api: {} } };
vm.runInNewContext(fs.readFileSync(path.join(KIT_ROOT, "engine", "site", "lib", "search-core.js"), "utf8"), context);
const core = context.EXT.searchCore;
const plain = (x) => JSON.parse(JSON.stringify(x));
/** app.js's normalisation: no accents, lower case. */
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const entry = (p, a, t, page, x = "") => ({ p, a, t, x, nt: norm(t), np: norm(page), nx: norm(x) });
const keys = (q, index) => plain(core.match(index, q, norm).found.map((f) => `${f.e.p}~${f.e.a}`));

describe("search-core", () => {
  test("the terms of a query: its words of two characters or more, without accents or case", () => {
    const index = [entry("p", "a", "Orders", "Café", "a coffee")];
    assert.deepEqual(plain(core.match(index, "  Orders  a Café ", norm).found[0].terms), ["orders", "cafe"]);
  });

  test("the score: a page title starting with the term before one holding it; at most four occurrences counted", () => {
    const pages = [entry("inside", "a", "Filters", "Reorders"), entry("start", "a", "Filters", "Orders list")];
    assert.deepEqual(keys("orders", pages), ["start~a", "inside~a"]);
    const scores = plain(
      core
        .match(
          [entry("ten", "a", "x", "y", "orders ".repeat(10)), entry("four", "a", "x", "y", "orders ".repeat(4))],
          "orders",
          norm,
        )
        .found.map((f) => [f.e.p, f.score]),
    );
    assert.deepEqual(scores, [
      ["ten", 5],
      ["four", 5],
    ]);
  });

  test("the close words: the closest kept — fewer edits, a whole word before a start — and the score halved", () => {
    // Eight starts of words come first in the index; the whole word one swap away must not be pushed out.
    const index = [
      entry("intro", "a", "Intro", "Intro", "taken takes takeover talks tanks taking tags tabs"),
      entry("tasks", "a", "The task list", "Tasks"),
    ];
    const r = core.match(index, "taks", norm);
    // One edit each: the seven whole words first, in the order of the index, then the first start (taken).
    assert.deepEqual(plain(r.fuzzy), ["takes", "talks", "tanks", "tags", "tabs", "task", "tasks", "taken"]);
    assert.ok(plain(r.found.map((f) => f.e.p)).includes("tasks"));
    // Nine words one edit away: the eight first of the index.
    const nine = [entry("n", "a", "n", "n", "bata bbta bcta bdta beta bfta bgta bhta bita")];
    assert.deepEqual(plain(core.match(nine, "bzta", norm).fuzzy), [
      "bata",
      "bbta",
      "bcta",
      "bdta",
      "beta",
      "bfta",
      "bgta",
      "bhta",
    ]);
    // A start of a word: "ordr" reads "ordering".
    assert.deepEqual(plain(core.match([entry("o", "a", "Ordering", "x")], "ordr", norm).fuzzy), ["ordering"]);
    // One edit only from 4 to 7 letters: two replaced letters of "tasks" find nothing.
    assert.deepEqual(plain(core.match([entry("t", "a", "Tasks", "x")], "tazkz", norm)), { found: [], fuzzy: [] });
    // The score of a close word: half of the exact one.
    const one = [entry("o", "a", "Orders", "x")];
    assert.equal(core.match(one, "orders", norm).found[0].score, 12);
    assert.equal(core.match(one, "ordrs", norm).found[0].score, 6);
  });

  test("a term in the title first, at the start of a word before inside one; then the page; then the text", () => {
    const index = [
      entry("text", "a", "Shipping", "Shipping", "the orders leave at noon"),
      entry("inside", "a", "Reorders", "Stock"),
      entry("start", "a", "Orders list", "Use"),
      entry("page", "a", "Filters", "Orders"),
    ];
    assert.deepEqual(keys("orders", index), ["start~a", "inside~a", "page~a", "text~a"]);
    assert.deepEqual(keys("orders noon", index), ["text~a"], "every term");
  });

  test("a page entry slightly before its sections, for the same words", () => {
    const index = [entry("p", "s", "Orders", "Orders"), entry("p", null, "Orders", "Orders")];
    assert.deepEqual(keys("orders", index), ["p~null", "p~s"]);
  });

  test("a term the index does not hold: its close words — one edit from 4 letters, two from 8, a swap — said", () => {
    const index = [
      entry("o", "a", "Orders", "Orders", "the approval of an order"),
      entry("x", "a", "Exports", "Exports"),
    ];
    for (const typo of ["ordrs", "oredrs", "ordesr"]) {
      const r = core.match(index, typo, norm);
      assert.deepEqual(plain(r.found.map((f) => f.e.p)), ["o"], typo);
      assert.ok(plain(r.fuzzy).includes("orders"), typo);
    }
    assert.deepEqual(plain(core.match(index, "aprovall", norm).fuzzy), ["approval"], "two edits from 8 letters");
    assert.deepEqual(plain(core.match(index, "odr", norm)), { found: [], fuzzy: [] }, "three letters: no close word");
    assert.deepEqual(plain(core.match(index, "zzzzzz", norm)), { found: [], fuzzy: [] });
    // One exact term and one typo: both required.
    assert.deepEqual(keys("approval ordrs", index), ["o~a"]);
    assert.deepEqual(plain(core.match(index, "orders", norm).fuzzy), [], "an exact term: no close word");
  });

  test("the marks: each term found, accents ignored, the text escaped", () => {
    const esc = (s) => String(s).replace(/</g, "&lt;");
    assert.equal(
      core.mark("Café <b> orders", ["cafe", "orders"], norm, esc),
      "<mark>Café</mark> &lt;b> <mark>orders</mark>",
    );
    assert.equal(core.mark("nothing", ["x"], norm, esc), "nothing");
  });

  test("linear on a long text: a term found once per occurrence, never from each character", () => {
    const long = entry("p", "a", "t", "t", "ab ".repeat(100000));
    const started = performance.now();
    core.match([long], "ab", norm);
    core.match([long], "abq", norm);
    assert.ok(performance.now() - started < 2000);
  });
});

describe("the index of the build", () => {
  test("a page entry first: its summary and its introduction; then one entry per section", () => {
    const html = `<p>Intro text.</p><h2 id="a">First<a class="ancre" href="#/p~a">#</a></h2><p>Body.</p>`;
    assert.deepEqual(indexPage([], "p", "Page", html, "The summary."), [
      { p: "p", a: null, t: "Page", x: "The summary. — Intro text." },
      { p: "p", a: "a", t: "First", x: "Body." },
    ]);
    assert.deepEqual(indexPage([], "p", "Page", `<h2 id="a">A<a class="ancre">#</a></h2>`, "")[0], {
      p: "p",
      a: null,
      t: "Page",
      x: "",
    });
  });

  test("the demo: what a generated table lists can be found (the second pass resolved before the index)", async () => {
    const r = await buildDemo();
    const rulesByFeature = r.data.search.find((e) => e.p === "features/rules" && e.a === "rules-by-feature");
    assert.match(rulesByFeature.x, /BR-01/);
    const page = r.data.search.find((e) => e.p === "features/track-orders" && e.a === null);
    assert.ok(page.x.startsWith(r.data.pages["features/track-orders"].summary), "its summary first");
  });
});
