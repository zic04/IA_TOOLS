// test/tools/legacy-data.mjs (AUDIT.md M6): the site data of an older build (French key names) is translated to the
// current names, record by record, so that the equivalence levels `bytes` and 1 still compare with older builds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA_SCRIPT, currentData } from "../tools/legacy-data.mjs";
import { buildDemo, dataOf } from "../tools/helpers.mjs";

const LEGACY = {
  meta: { titre: "Docs", produit: "Acme", accroche: "Tag", stats: { pages: 1, schemas: 2 } },
  icones: { recherche: "<path/>" },
  sections: [
    {
      id: "use",
      titre: "Use",
      titre_court: "U",
      sous_titre: "Sub",
      icone: "ecran",
      vedette: true,
      points: ["a"],
      intro_html: "<p>i</p>",
      groupes: [{ titre: "G", pages: ["recherche"] }],
    },
  ],
  pages: {
    recherche: {
      id: "recherche",
      titre: "Search",
      titre_menu: "S",
      resume: "R",
      section: "use",
      groupe: "G",
      niveau: 1,
      routes: [],
      droits: ["admin"],
      html: "<p>x</p>",
      toc: [{ id: "h", titre: "H", niveau: 2 }],
    },
  },
  ordre: ["recherche"],
  recherche: [{ p: "recherche", a: "", t: "Search", x: "x" }],
  glossaire: [{ terme: "Order", def: "d", motif: "orders?", tech: "t" }],
  parcours: [{ titre: "J", desc: "D", etapes: ["recherche"] }],
  suggestions: ["recherche"],
  accueil_html: "<p>home</p>",
  i18n: { "ui.titre": "kept" },
};

test("an older data object gets the current names; map keys (page ids, icon names, i18n keys) are kept", () => {
  assert.deepEqual(currentData(LEGACY), {
    meta: { title: "Docs", product: "Acme", tagline: "Tag", stats: { pages: 1, diagrams: 2 } },
    icons: { recherche: "<path/>" },
    sections: [
      {
        id: "use",
        title: "Use",
        shortTitle: "U",
        subtitle: "Sub",
        icon: "ecran",
        featured: true,
        highlights: ["a"],
        introHtml: "<p>i</p>",
        groups: [{ title: "G", pages: ["recherche"] }],
      },
    ],
    pages: {
      recherche: {
        id: "recherche",
        title: "Search",
        menuTitle: "S",
        summary: "R",
        section: "use",
        group: "G",
        level: 1,
        routes: [],
        permissions: ["admin"],
        html: "<p>x</p>",
        toc: [{ id: "h", title: "H", level: 2 }],
      },
    },
    order: ["recherche"],
    search: [{ p: "recherche", a: "", t: "Search", x: "x" }],
    glossary: [{ term: "Order", def: "d", pattern: "orders?", tech: "t" }],
    journeys: [{ title: "J", desc: "D", steps: ["recherche"] }],
    suggestions: ["recherche"],
    homeHtml: "<p>home</p>",
    i18n: { "ui.titre": "kept" },
  });
});

test("current data is returned as it is; DATA_SCRIPT finds the data of a current and of an older build", async () => {
  const { html } = await buildDemo();
  const data = dataOf(html);
  assert.equal(currentData(data), data);
  assert.deepEqual(JSON.parse(DATA_SCRIPT.exec(html)[1]), data);
  const older = html.replace('id="site-data"', 'id="donnees"');
  assert.deepEqual(JSON.parse(DATA_SCRIPT.exec(older)[1]), data);
});
