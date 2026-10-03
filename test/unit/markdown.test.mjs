// Markdown extensions: directives, containers, badges, callouts (both spellings), headings and anchors,
// tables, <wbr> in long code.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { testEngine } from "../tools/helpers.mjs";
import { statusColour } from "../../engine/build/markdown.mjs";

const CAPTURES = {
  screen: {
    file: "screen.webp",
    title: "Screen",
    width: 400,
    height: 200,
    zones: [
      { n: 1, x: 1, y: 2, w: 3, h: 4 },
      { n: 2, x: 5, y: 6, w: 7, h: 8, side: "right" },
    ],
  },
  plain: { file: "plain.webp", title: "Plain", width: 100, height: 50, zones: [] },
};

describe("directives ::", () => {
  test("::capture renders a figure with the image and an Enlarge button", () => {
    const { render, engine, reports } = testEngine({ captures: CAPTURES });
    const r = render('::capture{id="plain" title="A screen"}\n');
    assert.match(r.html, /<figure class="ecran" data-capture="plain" data-titre="A screen">/);
    assert.match(r.html, /<img data-img="plain" alt="A screen" width="100" height="50" loading="lazy">/);
    assert.match(r.html, /<span class="libelle-long">Enlarge<\/span>/);
    assert.equal(r.captures, 1);
    assert.deepEqual([...engine.usedCaptures], ["plain"]);
    assert.equal(reports.length, 0);
  });

  test("::capture of a screenshot with zones is a strict error", () => {
    const { render, reports } = testEngine({ captures: CAPTURES });
    render('::capture{id="screen"}\n');
    assert.deepEqual(
      reports.map((s) => [s.strict, s.key]),
      [[true, "capture.hasZones"]],
    );
  });

  test("missing screenshot: 'Screenshot to produce' box and an error with the page id", () => {
    const { render, reports } = testEngine();
    const r = render('::capture{id="missing"}\n');
    assert.match(r.html, /Screenshot to produce<\/div><p><code>missing<\/code>/);
    assert.equal(reports[0].key, "capture.notFound");
    assert.equal(reports[0].vars.page, "page/test");
  });

  test("::diagram inlines the SVG without the XML prologue; ::schema is the French spelling", () => {
    const files = { "diagrams/flow.svg": '<?xml version="1.0"?>\n<svg viewBox="0 0 10 10"></svg>\n' };
    const { render, engine } = testEngine({ files });
    const en = render('::diagram{id="flow" title="Flow"}\n').html;
    assert.equal(en, '<figure class="schema"><svg viewBox="0 0 10 10"></svg><figcaption>Flow</figcaption></figure>');
    assert.equal(render('::schema{id="flow" titre="Flow"}\n').html, en);
    assert.equal(engine.usedDiagrams.size, 1);
  });

  test("missing diagram: strict error, nothing rendered", () => {
    const { render, reports } = testEngine();
    assert.equal(render('::diagram{id="x"}\n').html, "");
    assert.equal(reports[0].key, "diagram.notFound");
  });

  test("::before-after and ::avant-apres", () => {
    const { render } = testEngine({ captures: CAPTURES });
    const en = render(
      '::before-after{before="plain" after="screen" before-label="Yesterday" title="Comparison"}\n',
    ).html;
    assert.match(en, /aria-label="Compare before \/ after \(left\/right arrows\)"/);
    assert.match(
      en,
      /<span class="comparer-etiquette avant">Yesterday<\/span><span class="comparer-etiquette apres">After<\/span>/,
    );
    assert.match(en, /<figcaption>Comparison<\/figcaption>/);
    assert.equal(
      render('::avant-apres{avant="plain" apres="screen" libelle-avant="Yesterday" titre="Comparison"}\n').html,
      en,
    );
  });
});

describe("containers :::", () => {
  test(":::screen: zones, pins, numbered legend, guided tour", () => {
    const { render, engine, reports } = testEngine({ captures: CAPTURES });
    const r = render(':::screen{capture="screen" title="Screen"}\nFree text.\n\n1. First\n2. Second\n:::\n');
    assert.equal(reports.length, 0);
    assert.match(r.html, /Guided tour<span class="libelle-long"> · 2 steps<\/span>/);
    assert.match(
      r.html,
      /<div class="zone" data-n="1" style="left:1%;top:2%;width:3%;height:4%"><span class="pastille">1<\/span><\/div>/,
    );
    assert.match(r.html, /<div class="zone cote-droit" data-n="2"/);
    assert.match(r.html, /<div class="legende-figure"><p>Free text.<\/p>\n<\/div>/);
    assert.match(r.html, /<ol class="legende"><li data-n="1"><span class="n">1<\/span><div>First<\/div><\/li>/);
    assert.equal(engine.zoneCount, 2);
  });

  test(":::screen: legend ≠ zones → strict error (legend = zones check)", () => {
    const { render, reports } = testEngine({ captures: CAPTURES });
    render(':::screen{capture="screen"}\n1. Only one\n:::\n');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].key, "screen.legend");
    assert.deepEqual({ zones: reports[0].vars.zones, items: reports[0].vars.items }, { zones: 2, items: 1 });
  });

  test(":::ecran (French) renders like :::screen; labels follow the language", () => {
    const en = testEngine({ captures: CAPTURES }).render(
      ':::screen{capture="screen" title="T"}\n1. A\n2. B\n:::\n',
    ).html;
    assert.equal(
      testEngine({ captures: CAPTURES }).render(':::ecran{capture="screen" titre="T"}\n1. A\n2. B\n:::\n').html,
      en,
    );
    const fr = testEngine({ captures: CAPTURES, language: "fr" }).render(
      ':::screen{capture="screen" title="T"}\n1. A\n2. B\n:::\n',
    ).html;
    assert.match(fr, /Visite guidée<span class="libelle-long"> · 2 étapes<\/span>/);
    assert.match(fr, /<span class="libelle-long">Agrandir<\/span>/);
  });

  test(":::steps and :::etapes: ordered list with the steps class", () => {
    const { render } = testEngine();
    const en = render(":::steps\n1. Open\n2. Close\n:::\n").html;
    assert.equal(en, '<ol class="etapes">\n<li>Open</li>\n<li>Close</li>\n</ol>\n');
    assert.equal(render(":::etapes\n1. Open\n2. Close\n:::\n").html, en);
    assert.match(render(":::steps\n3. Three\n4. Four\n:::\n").html, /^<ol class="etapes">/);
  });
});

describe("badges [[…]]", () => {
  test("perm, menu, route, key, status (and the French spellings)", () => {
    const { render } = testEngine({ statuses: { 0: ["st-0", "0 · paid"], x: ["#123456", "Ex"] } });
    const p = (s) => render(s).html.trim();
    assert.match(
      p("[[perm orders:write]]"),
      /<span class="puce droit" title="Permission"><svg[^>]*>.*<\/svg>orders:write<\/span>/,
    );
    assert.equal(p("[[droit orders:write]]"), p("[[perm orders:write]]"));
    assert.equal(p("[[menu A › B]]"), '<p><span class="puce menu">A › B</span></p>');
    assert.equal(p("[[route /orders/[id]]]"), '<p><span class="puce route">/orders/[id]</span></p>');
    assert.equal(p("[[key Ctrl+K]]"), "<p><kbd>Ctrl</kbd>+<kbd>K</kbd></p>");
    assert.equal(p("[[touche Ctrl+K]]"), p("[[key Ctrl+K]]"));
    assert.equal(p("[[status 0]]"), '<p><span class="puce statut" style="--c:var(--st-0)">0 · paid</span></p>');
    assert.equal(p("[[statut x]]"), '<p><span class="puce statut" style="--c:#123456">Ex</span></p>');
    assert.equal(p("[[status Draft]]"), '<p><span class="puce statut" style="--c:var(--line-strong)">Draft</span></p>');
  });

  test("statusColour: token, hexadecimal, var()", () => {
    assert.equal(statusColour("st-2"), "var(--st-2)");
    assert.equal(statusColour("#abc"), "#abc");
    assert.equal(statusColour("var(--x)"), "var(--x)");
  });
});

describe("callouts > [!TYPE]", () => {
  const CASES = [
    ["TIP", "ASTUCE", "astuce", "Tip", "Astuce"],
    ["WARNING", "ATTENTION", "attention", "Warning", "Attention"],
    ["CAUTION", "ERREUR", "erreur", "Blocking error", "Erreur bloquante"],
    ["PERMISSIONS", "DROITS", "droits", "Required permissions", "Droits requis"],
    ["NOTE", "NOTE", "note", "Good to know", "À savoir"],
    ["RECIPE", "RECETTE", "recette", "Recipe", "Recette"],
    ["HOW", "MECANISME", "mecanisme", "How it works", "Comment ça marche"],
  ];
  for (const [en, fr, cls, titleEn, titleFr] of CASES) {
    test(`${en} / ${fr}`, () => {
      const a = testEngine().render(`> [!${en}]\n> Body.\n`).html;
      assert.match(
        a,
        new RegExp(
          `^<aside class="encadre ${cls}"><svg class="ico"[^>]*>.*</svg><div class="encadre-corps"><div class="encadre-titre">${titleEn}</div><p>Body.</p>\n</div></aside>`,
        ),
      );
      assert.equal(testEngine().render(`> [!${fr}]\n> Body.\n`).html, a);
      assert.match(
        testEngine({ language: "fr" }).render(`> [!${en}]\n> Body.\n`).html,
        new RegExp(`encadre-titre">${titleFr}<`),
      );
    });
  }

  test("custom title (inline allowed, apostrophe not escaped twice); body on the next line", () => {
    const r = testEngine().render("> [!NOTE] Where's the `option`\n> Text.\n").html;
    assert.match(r, /<div class="encadre-titre">Where&#39;s the <code>option<\/code><\/div><p>Text.<\/p>/);
  });

  test("unknown type: non-strict warning, raw class and title", () => {
    const { render, reports } = testEngine();
    const r = render("> [!ODD]\n> X\n").html;
    assert.match(r, /<aside class="encadre odd">/);
    assert.match(r, /encadre-titre">ODD</);
    assert.deepEqual(
      reports.map((s) => [s.strict, s.key]),
      [[false, "callout.unknown"]],
    );
  });

  test("plain quotes are unchanged", () => {
    assert.equal(testEngine().render("> Just a quote.\n").html, "<blockquote><p>Just a quote.</p>\n</blockquote>\n");
  });
});

describe("headings, anchors, links, tables, long code", () => {
  test("h2/h3: anchor and page table of contents; h1 becomes h2; h4 has no anchor", () => {
    const r = testEngine().render("# One\n\n## Two *three*\n\n#### Four\n", "p/x");
    assert.match(
      r.html,
      /^<h2 id="one">One<a class="ancre" href="#\/p\/x~one" aria-label="Link to this section">#<\/a><\/h2>/,
    );
    assert.match(r.html, /<h2 id="two-three">Two <em>three<\/em>/);
    assert.match(r.html, /<h4>Four<\/h4>/);
    assert.deepEqual(r.toc, [
      { id: "one", title: "One", level: 2 },
      { id: "two-three", title: "Two three", level: 2 },
    ]);
  });

  test("de-duplicated slugs (-2, then -2-2), without accents", () => {
    const r = testEngine().render("## Écran\n\n### Écran\n\n### Écran\n");
    assert.deepEqual(
      r.toc.map((x) => x.id),
      ["ecran", "ecran-2", "ecran-2-2"],
    );
  });

  test("internal links are collected", () => {
    const r = testEngine().render("[a](#/x/y) [b](#/x/y~z) [c](https://example.org)\n");
    assert.deepEqual(r.links, ["#/x/y", "#/x/y~z"]);
  });

  test("tables are wrapped in div.tableau", () => {
    const r = testEngine().render("| A | B |\n|---|---|\n| 1 | 2 |\n").html;
    assert.match(r, /^<div class="tableau"><table>/);
    assert.match(r, /<\/table><\/div>\n?$/);
  });

  test("<wbr> in code of 28 characters or more, never inside an entity", () => {
    assert.equal(testEngine().render("`a/b.c`\n").html, "<p><code>a/b.c</code></p>\n");
    assert.equal(
      testEngine().render("`https://example.org/api/v1/x?filter=open,b`\n").html,
      "<p><code>https:/<wbr>/<wbr>example.<wbr>org/<wbr>api/<wbr>v1/<wbr>x?<wbr>filter=<wbr>open,<wbr>b</code></p>\n",
    );
    assert.equal(
      testEngine().render("`<path>/one/two?a=1&b=2&c=three`\n").html,
      "<p><code>&lt;path&gt;/<wbr>one/<wbr>two?<wbr>a=<wbr>1&amp;b=<wbr>2&amp;c=<wbr>three</code></p>\n",
    );
  });
});
