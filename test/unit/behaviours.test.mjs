// Behaviour cards, user stories and scenarios of a feature sheet (ARCHITECTURE.md §6.8a): the kinds of
// standard/behaviours.json, the reading of a card's "Rubric: value" lines and of a scenario's Given / When / Then
// steps (engine/core/behaviours.mjs), their markup and checks (engine/build/markdown-product.mjs), and the second
// pass that links a scenario to its story and its card (engine/build/business.mjs). English and French both.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testEngine, KIT_ROOT } from "../tools/helpers.mjs";
import {
  behaviourRegistry,
  findKind,
  readCard,
  readScenario,
  answerState,
  stepLine,
} from "../../engine/core/behaviours.mjs";
import { comparable } from "../../engine/core/page-templates.mjs";
import { resolveBusinessRefs } from "../../engine/build/business.mjs";
import { projectBehaviours } from "../../engine/build/behaviours.mjs";
import os from "node:os";
import { indexPage } from "../../engine/build/search.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { ICONS, ALIASES } from "../../engine/site/icons.mjs";

const { registry } = behaviourRegistry();
const answers = registry.answers;
const search = findKind(registry, "search");
const t = createI18n({ language: "en" }).t;

describe("standard/behaviours.json", () => {
  test("13 kinds, each with a title and labels in English and French, a known icon and at least one required rubric", () => {
    const data = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "standard/behaviours.json"), "utf8"));
    assert.deepEqual(
      data.kinds.map((k) => k.id),
      [
        "search",
        "filter",
        "sort",
        "pagination",
        "list",
        "form",
        "import",
        "export",
        "calculation",
        "notification",
        "workflow",
        "scheduled-job",
        "permission-check",
      ],
    );
    for (const kind of data.kinds) {
      assert.ok(kind.title.en && kind.title.fr, kind.id);
      assert.ok(kind.icon in ICONS || kind.icon in ALIASES, `${kind.id}: icon ${kind.icon}`);
      assert.ok(
        kind.rubrics.some((r) => r.required),
        `${kind.id}: no required rubric`,
      );
      // The same spelling for two rubrics of one kind would make a line ambiguous.
      const spellings = new Map();
      for (const r of kind.rubrics) {
        assert.ok(r.label.en && r.label.fr && r.hint?.en && r.hint?.fr, `${kind.id}.${r.id}`);
        for (const label of [...Object.values(r.label), ...(r.aliases?.en || []), ...(r.aliases?.fr || [])]) {
          const c = comparable(label);
          assert.ok((spellings.get(c) ?? r.id) === r.id, `${kind.id}: “${label}” names two rubrics`);
          spellings.set(c, r.id);
        }
      }
    }
  });

  test("a kind is found by its id or an alias, in any case; an unknown name is null", () => {
    assert.equal(findKind(registry, "Recherche").id, "search");
    assert.equal(findKind(registry, "controle-droits").id, "permission-check");
    assert.equal(findKind(registry, "SORT").id, "sort");
    assert.equal(findKind(registry, "teleport"), null);
  });
});

describe("a project's own kinds (config.behaviours.file)", () => {
  const own = {
    version: 1,
    kinds: [
      {
        id: "geocoding",
        aliases: ["geocodage"],
        title: { en: "Geocoding", fr: "Géocodage" },
        rubrics: [{ id: "source", label: { en: "Source", fr: "Source" }, required: true }],
      },
    ],
  };

  test("added to the kit's", () => {
    const { registry: r, problems } = behaviourRegistry({ project: own, file: "kinds.json" });
    assert.deepEqual(problems, []);
    assert.equal(findKind(r, "geocodage").id, "geocoding");
    assert.equal(findKind(r, "search").id, "search");
  });

  test("behaviour.kindTwice: a kind that takes a spelling of the kit's is refused, the others kept", () => {
    const project = { ...own, kinds: [...own.kinds, { ...own.kinds[0], id: "search2", aliases: ["recherche"] }] };
    const { registry: r, problems } = behaviourRegistry({ project, file: "kinds.json" });
    assert.deepEqual(problems, [
      { key: "behaviour.kindTwice", vars: { file: "kinds.json", kind: "search2", spelling: "recherche" } },
    ]);
    assert.equal(findKind(r, "geocoding").id, "geocoding");
    assert.equal(findKind(r, "search2"), null);
  });

  test("behaviour.file: a file that does not follow the schema, or that brings its own answers", () => {
    assert.equal(behaviourRegistry({ project: { version: 1 }, file: "k.json" }).problems[0].key, "behaviour.file");
    const rubric = (id, en) => ({ id, label: { en }, required: true });
    const withRubrics = (...rubrics) => ({ version: 1, kinds: [{ ...own.kinds[0], rubrics }] });
    // A label is the start of a line: never a colon in it, never longer than 60 characters (it could never match).
    for (const bad of [rubric("a", "Source: main"), rubric("a", "x".repeat(61))])
      assert.match(behaviourRegistry({ project: withRubrics(bad), file: "k.json" }).problems[0].vars.at, /label/);
    // Two rubrics of one id, or of one spelling: a line would be ambiguous.
    assert.deepEqual(
      behaviourRegistry({ project: withRubrics(rubric("a", "A"), rubric("a", "B")), file: "k.json" }).problems,
      [{ key: "behaviour.file", vars: { file: "k.json", at: "kinds[0].rubrics[1].id" } }],
    );
    assert.deepEqual(
      behaviourRegistry({ project: withRubrics(rubric("a", "Same"), rubric("b", "same")), file: "k.json" }).problems,
      [{ key: "behaviour.file", vars: { file: "k.json", at: "kinds[0].rubrics[1].label" } }],
    );
    assert.deepEqual(
      behaviourRegistry({ project: { ...own, answers: { na: ["x"], unknown: ["y"] } }, file: "k.json" }).problems,
      [{ key: "behaviour.file", vars: { file: "k.json", at: "answers" } }],
    );
  });
});

describe("readCard: the 'Rubric: value' lines of a card", () => {
  test("labels in English or French, in bold, in a list, with the colon inside the bold or after a no-break space", () => {
    const card = readCard(
      [
        "- **Where**: the Customer field",
        "**Champs cherchés :** the customer's name only",
        "Matching : contains",
        "__Several words__: one phrase",
        "* Trigger: at each keystroke",
      ].join("\n"),
      search,
      answers,
    );
    assert.deepEqual(
      card.rows.filter((r) => r.state !== "missing").map((r) => [r.rubric.id, r.value]),
      [
        ["where", "the Customer field"],
        ["fields", "the customer's name only"],
        ["match", "contains"],
        ["words", "one phrase"],
        ["trigger", "at each keystroke"],
      ],
    );
  });

  test("the introduction before the first rubric; a value continues on the lines after it; the kind's order; a rubric written twice keeps both", () => {
    const card = readCard(
      "The search field above the list.\n\nNo result: the table stays empty\nand the counters show 0.\nWhere: top\nNo result: no message.",
      search,
      answers,
    );
    assert.equal(card.intro, "The search field above the list.");
    assert.deepEqual(
      card.rows.filter((r) => r.state !== "missing").map((r) => [r.rubric.id, r.value]),
      [
        ["where", "top"],
        ["empty", "the table stays empty\nand the counters show 0.\n\nno message."],
      ],
    );
  });

  test("an indented line is never a rubric line: a sub-list under a rubric stays in its value", () => {
    const list = findKind(registry, "list");
    const card = readCard(
      "Columns:\n  - Number: the order number\n  - Order: the date\n\tStatus: its status\n\nOrder: newest first.",
      list,
      answers,
    );
    assert.deepEqual(
      card.rows.filter((r) => r.value).map((r) => [r.rubric.id, r.value]),
      [
        ["columns", "  - Number: the order number\n  - Order: the date\n\tStatus: its status"],
        ["order", "newest first."],
      ],
    );
  });

  test("a label of 60 characters is read in each documented form, in bold too", () => {
    const label = "L".repeat(60);
    const kind = { id: "k", title: { en: "K" }, rubrics: [{ id: "r", label: { en: label }, required: true }] };
    for (const line of [`${label}: v`, `**${label}:** v`, `**${label}**: v`, `- **${label}** : v`])
      assert.equal(readCard(line, kind, answers).rows[0].state, "answered", line);
  });

  test("an alias reads as its rubric (Sort → Order of results); a line that names no rubric is prose; a long label is never a rubric", () => {
    const card = readCard(`Sort: none\nNote: not a rubric\n${"x".repeat(70)}: Where`, search, answers);
    assert.equal(
      card.rows.find((r) => r.rubric.id === "order").value,
      "none\nNote: not a rubric\n" + "x".repeat(70) + ": Where",
    );
  });

  test("states: answered, n/a, unknown, and a required rubric absent or empty is missing; an optional one left out is no row", () => {
    const card = readCard(
      "Where: top\nFields searched: N/A — only one field\nMatching: unknown — case?\nSeveral words:\nPagination:",
      search,
      answers,
    );
    const states = Object.fromEntries(card.rows.map((r) => [r.rubric.id, r.state]));
    assert.deepEqual(states, {
      where: "answered",
      fields: "na",
      match: "unknown",
      words: "missing",
      trigger: "missing",
      order: "missing",
      empty: "missing",
      rights: "missing",
    });
    assert.deepEqual(
      card.missing.map((r) => r.id),
      ["words", "trigger", "order", "empty", "rights"],
    );
    assert.deepEqual(card.counts, { required: 8, answered: 1, na: 1, unknown: 1, missing: 5 });
  });

  test("answerState: the words of the kit's answers, any case, emphasis allowed, alone or before a separator — never at the start of an ordinary sentence", () => {
    for (const v of [
      "n/a",
      "N/A — reason",
      "Not applicable.",
      "Sans objet — l'ordre du serveur",
      "**Sans objet** : rien",
    ])
      assert.equal(answerState(v, answers), "na", v);
    for (const v of [
      "unknown — who knows?",
      "Inconnu : à voir",
      "**À confirmer** — avec la PO. Que voit…",
      "To be confirmed",
      "unknown - one",
      "Inconnu ; la PO tranchera",
    ])
      assert.equal(answerState(v, answers), "unknown", v);
    for (const v of [
      "n/abc",
      "Unknownness",
      "Inconnue2",
      "Known: yes",
      "Sans objets perdus",
      "Unknown order number: the page shows Not found",
      "Unknown customers are not listed",
      "not applicable to archived orders, which are hidden",
      "À confirmer avec la PO",
    ])
      assert.equal(answerState(v, answers), "answered", v);
  });

  test("linear on a hostile body", () => {
    const start = Date.now();
    readCard(":".repeat(200_000) + "\n" + "Where:".repeat(50_000) + "\n" + "- **".repeat(50_000), search, answers);
    readCard("a\n".repeat(200_000), search, answers);
    assert.ok(Date.now() - start < 1500, `${Date.now() - start} ms`);
  });
});

describe("readScenario: Given / When / Then (Soit / Quand / Alors)", () => {
  test("keywords in English and French, as written, in bold or in a list; a line without a keyword continues the step above", () => {
    const s = readScenario(
      "An introduction.\n\n**Given** an order\n- Étant donné qu’il pleut\nLorsqu'il clique\nWhen I type « north »\n  in the field\nThen nothing\nEt aussi\nBut not that",
    );
    assert.equal(s.intro, "An introduction.");
    assert.deepEqual(
      s.steps.map((x) => [x.step, x.keyword, x.text]),
      [
        ["given", "Given", "an order"],
        ["given", "Étant donné qu’", "il pleut"],
        ["when", "Lorsqu'", "il clique"],
        ["when", "When", "I type « north »\nin the field"],
        ["then", "Then", "nothing"],
        ["and", "Et", "aussi"],
        ["but", "But", "not that"],
      ],
    );
    assert.equal(s.complete, true);
  });

  test("a word that merely starts like a keyword is not one; complete only with a Then after a Given or a When", () => {
    assert.equal(stepLine("Thenceforth it rains"), null);
    assert.equal(stepLine("Ethics: none"), null);
    assert.deepEqual(stepLine("Then, it shows"), { step: "then", keyword: "Then", text: "it shows" });
    // Any blank after the keyword (a tab, a no-break space), and the French space before a colon.
    assert.deepEqual(stepLine("Soit : un client"), { step: "given", keyword: "Soit", text: "un client" });
    assert.deepEqual(stepLine("Alors\u00a0: le statut"), { step: "then", keyword: "Alors", text: "le statut" });
    assert.deepEqual(stepLine("Given\tthe user"), { step: "given", keyword: "Given", text: "the user" });
    assert.equal(readScenario("Then it shows").complete, false);
    assert.equal(readScenario("Then x\nGiven y\nThen z").complete, true, "a Then after a Given, wherever it is");
    assert.equal(readScenario("Given x\nAnd y").complete, false);
    assert.equal(readScenario("Soit x\nAlors y").complete, true);
  });

  test("linear on a hostile body", () => {
    const start = Date.now();
    readScenario("**".repeat(100_000) + "\n" + "Étant ".repeat(100_000) + "\n" + "x\n".repeat(100_000));
    assert.ok(Date.now() - start < 1500, `${Date.now() - start} ms`);
  });
});

describe(":::behaviour (and :::comportement): the card", () => {
  const CARD =
    ':::behaviour{kind="search" title="Search an order" id="B-01"}\nThe field above the list.\n\nWhere: the **Customer** field\nFields searched: N/A — one field only\nMatching: unknown — accents?\n:::';

  test("a card: kind and id, the title as an h3 in the outline and the search index, one row per rubric with its state", () => {
    const { render, engine, reports } = testEngine();
    const r = render(CARD, "product/orders");
    assert.match(r.html, /<div class="comportement" data-kind="search">/);
    assert.match(
      r.html,
      /<span class="comportement-type">B-01 · Search<\/span><h3 id="b-01">Search an order<a class="ancre" href="#\/product\/orders~b-01"/,
    );
    assert.match(r.html, /<div class="comportement-intro"><p>The field above the list.<\/p>/);
    assert.match(
      r.html,
      /<div class="rubrique renseignee"><dt>.*?Where<span class="sr-only"> \(answered\)<\/span><\/dt><dd><p>the <strong>Customer<\/strong> field<\/p>/s,
    );
    assert.match(r.html, /<div class="rubrique sans-objet"><dt>.*?Fields searched/s);
    assert.match(r.html, /<div class="rubrique a-confirmer"><dt>.*?Matching/s);
    assert.match(r.html, /<div class="rubrique manquante"><dt>.*?Several words.*?<dd><p>Not described yet.<\/p>/s);
    assert.match(
      r.html,
      /<span class="pastille-etat renseignee">2 rubrics answered<\/span><span class="pastille-etat a-confirmer">1 to confirm<\/span><span class="pastille-etat manquante">5 missing<\/span>/,
    );
    assert.ok(r.toc.some((x) => x.id === "b-01" && x.title === "Search an order" && x.level === 3));
    assert.ok(indexPage([], "product/orders", "Orders", r.html).some((e) => e.a === "b-01"));
    assert.deepEqual(engine.behaviours.get("B-01"), {
      id: "B-01",
      kind: "search",
      title: "Search an order",
      page: "product/orders",
      anchor: "b-01",
      feature: null,
      counts: { required: 8, answered: 1, na: 1, unknown: 1, missing: 5 },
      // Its required rubrics still open, in its kind's order (the depth loop): unknown, or left out.
      open: [
        { id: "match", state: "unknown" },
        { id: "words", state: "missing" },
        { id: "trigger", state: "missing" },
        { id: "order", state: "missing" },
        { id: "empty", state: "missing" },
        { id: "rights", state: "missing" },
      ],
    });
    // A required rubric left out: a warning, naming the rubrics.
    assert.deepEqual(reports, [
      {
        strict: false,
        kind: "behaviour",
        key: "behaviour.missing",
        vars: {
          page: "product/orders",
          title: "Search an order",
          kind: "Search",
          rubrics: "Several words, Trigger, Order of results, No result, Permissions",
        },
      },
    ]);
  });

  test("behaviour.missing is an error of the strict build with config.behaviours.strict", () => {
    const { render, reports } = testEngine({ behaviours: { registry, strict: true } });
    render(CARD);
    assert.equal(reports[0].strict, true);
  });

  test("the French spelling (:::comportement, type, titre), rubrics in French, labels of the page's language", () => {
    const { render, engine } = testEngine({ language: "fr", behaviours: { registry, strict: false } });
    const r = render(
      ':::comportement{type="recherche" titre="Rechercher une commande"}\nOù : en haut\n:::',
      "produit/commandes",
    );
    assert.match(r.html, /<span class="comportement-type">Recherche<\/span><h3 id="rechercher-une-commande">/);
    assert.match(r.html, /Où<span class="sr-only"> \(renseignée\)<\/span>/);
    assert.match(r.html, /1 rubrique renseignée/);
    // Without an id, the card is keyed by its page and anchor (it cannot be named by a scenario).
    assert.ok(engine.behaviours.has("produit/commandes~rechercher-une-commande"));
  });

  test("a card without a title is reported, and its whole body is still shown", () => {
    const { render, reports } = testEngine();
    const r = render(':::behaviour{kind="search"}\nWhere: the field\nMatching: contains\n:::');
    assert.deepEqual(
      reports.map((x) => x.key),
      ["behaviour.attributes"],
    );
    assert.match(r.html, /<div class="comportement"><p>Where: the field\nMatching: contains<\/p>/);
  });

  test("behaviour.attributes, behaviour.kind (with the known kinds), behaviour.duplicate: errors", () => {
    const { render, reports } = testEngine();
    render(':::behaviour{title="No kind"}\nWhere: x\n:::\n\n:::behaviour{kind="teleport" title="T"}\nx\n:::');
    render(
      ':::behaviour{kind="sort" title="A" id="B-09"}\nx\n:::\n\n:::behaviour{kind="sort" title="B" id="B-09"}\nx\n:::',
    );
    const keys = reports.filter((r) => r.strict).map((r) => r.key);
    assert.deepEqual(keys, ["behaviour.attributes", "behaviour.kind", "behaviour.duplicate"]);
    assert.match(reports.find((r) => r.key === "behaviour.kind").vars.known, /^search, filter, sort/);
  });
});

describe(":::story (and :::recit), :::scenario", () => {
  test("a story: an h3 'US-01 · title' in the outline, its labels, a place for its criteria; registered", () => {
    const { render, engine } = testEngine();
    const r = render(
      ':::story{id="US-01" title="Find a customer" role="Order manager" since="1.2" ref="ADO#1235"}\nAs an **order manager**, I want to type part of a name.\n:::',
      "product/orders",
    );
    assert.match(
      r.html,
      /<div class="recit"><div class="recit-tete"><h3 id="us-01">US-01 · Find a customer<a class="ancre"/,
    );
    assert.match(
      r.html,
      // The ticket: a placeholder the second pass links when the project has its address (engine/build/business.mjs).
      /<span class="puce role">.*?Order manager<\/span><span class="puce version">since 1.2<\/span><span class="puce reference" data-ticket="ADO#1235">ADO#1235<\/span><span class="recit-criteres" data-story="US-01"><\/span>/s,
    );
    assert.match(r.html, /<div class="recit-corps"><p>As an <strong>order manager<\/strong>/);
    assert.ok(r.toc.some((x) => x.id === "us-01" && x.title === "US-01 · Find a customer"));
    assert.deepEqual(engine.stories.get("US-01"), {
      title: "Find a customer",
      page: "product/orders",
      anchor: "us-01",
      role: "Order manager",
      since: "1.2",
      ref: "ADO#1235",
      // Its text as plain lines, the markup's text glued to its neighbours (the backlog export).
      text: ["As an order manager, I want to type part of a name."],
    });
  });

  test("the French spelling (:::recit, titre, depuis); story.attributes and story.duplicate", () => {
    const { render, engine, reports } = testEngine({ language: "fr" });
    const r = render(':::recit{id="US-02" titre="Retrouver un client" depuis="1.0"}\nEn tant que…\n:::');
    assert.match(r.html, /<h3 id="us-02">US-02 · Retrouver un client/);
    assert.match(r.html, /depuis 1.0/);
    assert.equal(engine.stories.get("US-02").since, "1.0");
    render(':::recit{titre="Sans id"}\nx\n:::\n\n:::recit{id="US-02" titre="Encore"}\nx\n:::');
    assert.deepEqual(
      reports.map((x) => x.key),
      ["story.attributes", "story.duplicate"],
    );
  });

  test("a scenario: numbered in its page from 1, its title, its links as placeholders, its steps; registered", () => {
    const { render, engine } = testEngine();
    const src =
      ':::scenario{title="Part of the name" story="US-01" behaviour="B-01"}\nGiven the orders of “Northwind Bistro”\nWhen I type **north**\nThen only #1041 and #1045 remain\n:::\n\n:::scenario{title="Second"}\nGiven x\nThen y\n:::';
    const a = render(src, "p/one");
    assert.match(
      a.html,
      /<span class="scenario-n" aria-hidden="true">1<\/span><p class="scenario-titre">Part of the name<\/p><span class="scenario-liens"><span class="ref-story" data-ref-id="US-01">US-01<\/span><span class="ref-behaviour" data-ref-id="B-01">B-01<\/span><\/span>/,
    );
    assert.match(
      a.html,
      /<li class="soit"><span class="mot">Given<\/span><span class="pas">the orders of “Northwind Bistro”<\/span><\/li><li class="quand"><span class="mot">When<\/span><span class="pas">I type <strong>north<\/strong><\/span><\/li><li class="alors">/,
    );
    assert.match(a.html, /scenario-n" aria-hidden="true">2</);
    const b = render(src, "p/two");
    assert.match(b.html, /scenario-n" aria-hidden="true">1</);
    assert.deepEqual(engine.scenarios[0], {
      title: "Part of the name",
      page: "p/one",
      story: "US-01",
      behaviour: "B-01",
      // Its steps as plain text (the backlog export).
      steps: [
        { step: "given", keyword: "Given", text: "the orders of “Northwind Bistro”" },
        { step: "when", keyword: "When", text: "I type north" },
        { step: "then", keyword: "Then", text: "only #1041 and #1045 remain" },
      ],
    });
    assert.equal(engine.scenarios.length, 4);
  });

  test("the French spelling (titre, recit, comportement); scenario.attributes (error) and scenario.steps (warning)", () => {
    const { render, engine, reports } = testEngine({ language: "fr" });
    render(':::scenario{titre="Accents" recit="US-02" comportement="B-01"}\nSoit x\nQuand y\nAlors z\n:::');
    assert.deepEqual(engine.scenarios[0], {
      title: "Accents",
      page: "page/test",
      story: "US-02",
      behaviour: "B-01",
      steps: [
        { step: "given", keyword: "Soit", text: "x" },
        { step: "when", keyword: "Quand", text: "y" },
        { step: "then", keyword: "Alors", text: "z" },
      ],
    });
    render(':::scenario{}\nSoit x\nAlors y\n:::\n\n:::scenario{titre="Sans alors"}\nSoit x\n:::');
    assert.deepEqual(
      reports.map((x) => [x.key, x.strict]),
      [
        ["scenario.attributes", true],
        ["scenario.steps", false],
      ],
    );
  });

  test("[[story US-01]] ([[recit US-01]]) is a placeholder, resolved once every page has rendered", () => {
    const { render } = testEngine();
    assert.match(
      render("See [[story US-01]] and [[recit US-02]].").html,
      /<span class="ref-story" data-ref-id="US-01">US-01<\/span> and <span class="ref-story" data-ref-id="US-02">US-02<\/span>/,
    );
  });
});

describe("the second pass: stories, cards, criteria (resolveBusinessRefs)", () => {
  function pass() {
    const { render, engine } = testEngine();
    const pages = {
      "p/sheet": {
        title: "Sheet",
        html: render(
          ':::story{id="US-01" title="Find"}\nx\n:::\n\n:::story{id="US-02" title="Sort"}\ny\n:::\n\n:::behaviour{kind="sort" title="Order" id="B-01"}\nDefault order: by date\n:::\n\n:::scenario{title="One" story="US-01" behaviour="B-01"}\nGiven a\nThen b\n:::\n\n:::scenario{title="Two" story="US-01"}\nGiven a\nThen b\n:::',
          "p/sheet",
        ).html,
      },
      "p/other": {
        title: "Other",
        html: render(
          ':::scenario{title="Lost" story="US-404" behaviour="B-404"}\nGiven a\nThen b\n:::\n\n:::behaviour{kind="sort" title="Elsewhere" feature="F-404"}\nDefault order: x\n:::\n\nSee [[story US-02]].',
          "p/other",
        ).html,
      },
    };
    const features = new Map([["F-01", { id: "F-01", title: "Sheet", page: "p/sheet", permissions: [] }]]);
    const { problems } = resolveBusinessRefs({
      pages,
      features,
      rules: engine.rules,
      stories: engine.stories,
      behaviours: engine.behaviours,
      scenarios: engine.scenarios,
      t,
    });
    return { pages, problems };
  }

  test("a scenario links to its story and its card; [[story …]] links to the story", () => {
    const { pages } = pass();
    assert.match(
      pages["p/sheet"].html,
      /<a class="puce lien-recit" href="#\/p\/sheet~us-01" title="Find">US-01<\/a><a class="puce lien-comportement" href="#\/p\/sheet~b-01" title="Order">B-01<\/a>/,
    );
    assert.match(
      pages["p/other"].html,
      /See <a class="puce lien-recit" href="#\/p\/sheet~us-02" title="Sort">US-02<\/a>/,
    );
  });

  test("an id written with & < > is found as written, in a citation and in a story's criteria", () => {
    const { render, engine } = testEngine();
    const html = render(
      ':::story{id="US&1" title="T"}\nx\n:::\n\n:::scenario{title="S" story="US&1"}\nGiven a\nThen b\n:::\n\nSee [[story US&1]].',
      "p/a",
    ).html;
    const pages = { "p/a": { title: "A", html } };
    const { problems } = resolveBusinessRefs({
      pages,
      features: new Map(),
      rules: engine.rules,
      stories: engine.stories,
      scenarios: engine.scenarios,
      t,
    });
    assert.deepEqual(problems, []);
    assert.match(pages["p/a"].html, /<span class="puce criteres">1 criterion<\/span>/);
    assert.match(pages["p/a"].html, /See <a class="puce lien-recit" href="#\/p\/a~us&amp;1" title="T">US&amp;1<\/a>/);
  });

  test("a rule's anchor is escaped in its link (a rule id is the writer's text)", () => {
    const { render } = testEngine();
    assert.match(
      render(':::rule{id="BR&<4" title="T"}\nx\n:::', "p/r").html,
      /<h3 id="br&amp;&lt;4">BR&amp;&lt;4 · T<a class="ancre" href="#\/p\/r~br&amp;&lt;4"/,
    );
  });

  test("each story counts the scenarios that name it", () => {
    const { pages } = pass();
    assert.match(pages["p/sheet"].html, /<span class="puce criteres">2 criteria<\/span>/);
    assert.match(pages["p/sheet"].html, /<span class="puce criteres aucun">no criteria<\/span>/);
    assert.ok(!pages["p/sheet"].html.includes("recit-criteres"));
  });

  test("story.unknown, behaviour.unknown, and feature.unknown for a card naming an undeclared feature: errors", () => {
    const { problems } = pass();
    assert.deepEqual(problems, [
      { key: "story.unknown", vars: { page: "p/other", id: "US-404" }, strict: true },
      { key: "behaviour.unknown", vars: { page: "p/other", id: "B-404" }, strict: true },
      { key: "feature.unknown", vars: { page: "p/other", id: "F-404" }, strict: true },
    ]);
  });
});

describe("the kinds of a project outside a build (projectBehaviours: translate --fix-anchors)", () => {
  test("the project's file read when it reads and follows the schema; the kit's kinds otherwise", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-kit-kinds-"));
    try {
      fs.writeFileSync(
        path.join(dir, "kinds.json"),
        JSON.stringify({
          version: 1,
          kinds: [
            {
              id: "geocoding",
              title: { en: "Geocoding" },
              rubrics: [{ id: "s", label: { en: "Source" }, required: true }],
            },
          ],
        }),
      );
      assert.equal(
        findKind(projectBehaviours(dir, { behaviours: { file: "kinds.json" } }).registry, "geocoding").id,
        "geocoding",
      );
      assert.equal(findKind(projectBehaviours(dir, { behaviours: { file: "nope.json" } }).registry, "geocoding"), null);
      assert.equal(findKind(projectBehaviours(dir, {}).registry, "search").id, "search");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("translate --fix-anchors follows the anchor of a card of a project kind, without an id", async () => {
    const { languagesCopy } = await import("../tools/helpers.mjs");
    const { runCli } = await import("../../cli/doc-kit.mjs");
    const dir = languagesCopy();
    try {
      fs.writeFileSync(
        path.join(dir, "kinds.json"),
        JSON.stringify({
          version: 1,
          kinds: [
            {
              id: "geocoding",
              title: { en: "Geocoding", fr: "Géocodage" },
              rubrics: [{ id: "s", label: { en: "Source", fr: "Source" }, required: true }],
            },
          ],
        }),
      );
      const config = path.join(dir, "doc.config.mjs");
      fs.writeFileSync(
        config,
        fs.readFileSync(config, "utf8").replace("  languages:", '  behaviours: { file: "kinds.json" },\n  languages:'),
      );
      fs.appendFileSync(
        path.join(dir, "content/use/orders.md"),
        '\n:::behaviour{kind="geocoding" title="Locate the customer"}\nSource: x\n:::\n',
      );
      fs.appendFileSync(
        path.join(dir, "translations/fr/use/orders.md"),
        '\n:::comportement{type="geocoding" titre="Localiser le client"}\nSource : x\n:::\n\n[Localiser](#/use/orders~locate-the-customer)\n',
      );
      let out = "";
      const code = await runCli(["translate", "--fix-anchors", "--project", dir], {
        stdout: { write: (s) => (out += s) },
        stderr: { write: () => {} },
        env: {},
      });
      assert.equal(code, 0, out);
      assert.match(
        fs.readFileSync(path.join(dir, "translations/fr/use/orders.md"), "utf8"),
        /\(#\/use\/orders~localiser-le-client\)/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the feature template and a real build", () => {
  for (const language of ["en", "fr"])
    test(`the template of the feature sheet (${language}) renders without a problem: its card answers every required rubric, its scenario is complete, its links resolve`, () => {
      const { render, engine, reports } = testEngine({ language, behaviours: { registry, strict: true } });
      const html = render(
        fs.readFileSync(path.join(KIT_ROOT, "templates", "pages", language, "feature.md"), "utf8"),
        "f/sheet",
      ).html;
      assert.deepEqual(reports, []);
      const pages = { "f/sheet": { title: "Sheet", html } };
      const { problems } = resolveBusinessRefs({
        pages,
        features: new Map(),
        rules: engine.rules,
        stories: engine.stories,
        behaviours: engine.behaviours,
        scenarios: engine.scenarios,
        t: createI18n({ language }).t,
      });
      assert.deepEqual(problems, []);
      assert.match(pages["f/sheet"].html, /class="puce criteres"/);
    });

  test("a project's own kinds (config.behaviours.file) and config.behaviours.strict, through the build", async () => {
    const { buildBusiness, businessCopy } = await import("../tools/helpers.mjs");
    const dir = businessCopy();
    try {
      fs.writeFileSync(
        path.join(dir, "kinds.json"),
        JSON.stringify({
          version: 1,
          kinds: [
            {
              id: "geocoding",
              title: { en: "Geocoding" },
              rubrics: [{ id: "source", label: { en: "Source" }, required: true }],
            },
          ],
        }),
      );
      fs.appendFileSync(
        path.join(dir, "content/use/approval.md"),
        '\n:::behaviour{kind="geocoding" title="Locate the customer"}\nSource: the delivery address\n:::\n\n:::behaviour{kind="sort" title="Queue order"}\nSortable by: nothing\n:::\n',
      );
      const own = await buildBusiness({ root: dir, modify: (c) => ({ ...c, behaviours: { file: "kinds.json" } }) });
      assert.deepEqual(own.errors, []);
      assert.match(own.data.pages["use/approval"].html, /data-kind="geocoding"/);
      assert.deepEqual(
        own.warnings.filter((w) => w.key === "behaviour.missing").map((w) => w.vars.title),
        ["Queue order"],
      );
      const strict = await buildBusiness({
        root: dir,
        modify: (c) => ({ ...c, behaviours: { file: "kinds.json", strict: true } }),
      });
      assert.deepEqual(
        strict.errors.map((e) => e.key),
        ["behaviour.missing"],
      );
      const missing = await buildBusiness({ root: dir, modify: (c) => ({ ...c, behaviours: { file: "nope.json" } }) });
      assert.ok(missing.errors.some((e) => e.key === "behaviour.fileMissing"));
      assert.ok(missing.errors.some((e) => e.key === "behaviour.kind" && e.vars.kind === "geocoding"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the fixture project: a scenario links to its story and its card; the story counts its criteria", async () => {
    const { buildBusiness } = await import("../tools/helpers.mjs");
    const r = await buildBusiness();
    assert.deepEqual(r.errors, []);
    const html = r.data.pages["use/approval"].html;
    assert.match(
      html,
      /<a class="puce lien-recit" href="#\/use\/approval~us-01" title="Approve a large order">US-01<\/a>/,
    );
    assert.match(
      html,
      /<a class="puce lien-comportement" href="#\/use\/approval~b-01" title="Approve or reject">B-01<\/a>/,
    );
    assert.match(html, /<span class="puce criteres">1 criterion<\/span>/);
  });
});
