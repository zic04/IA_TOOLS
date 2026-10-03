// Spaces (ARCHITECTURE.md §6.1a): declaration and its errors, site data emitted only when declared, one export per
// space (other spaces physically removed, links replaced, journeys, images and statistics recounted, output paths),
// counterparts, CLI (build, --space, --json, open, export, dev), audit by space, legacy aliases, site variants.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "../../engine/build/build.mjs";
import { spaceOutput, SPACE_DEFAULTS, SPACE_TEXT_KEYS, checkSpaceOption } from "../../engine/build/spaces.mjs";
import { checkLinks } from "../../engine/check/links.mjs";
import { prepareConfig, loadProject } from "../../engine/project/load.mjs";
import { normalizeToc } from "../../engine/project/legacy.mjs";
import { runAudit } from "../../engine/audit/audit.mjs";
import { renderMarkdown } from "../../engine/audit/report.mjs";
import { startDevServer } from "../../engine/dev/server.mjs";
import { reloadConfig } from "../../engine/dev/environment.mjs";
import { exportProject } from "../../cli/commands/export.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { SPACES, buildDemo, buildSpaces, spacesCopy, demoCopy, tempDir, dataOf } from "../tools/helpers.mjs";

async function cli(args, env = {}) {
  let out = "";
  let err = "";
  const code = await runCli(args, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, env });
  return { code, out, err };
}
const keys = (list) => list.map((p) => p.key);
const MARKER = { business: "marker-business-7q", takeover: "marker-takeover-9z" };
const NOW = new Date(Date.UTC(2026, 9, 1, 12));

/** A copy of the demo with its two spaces (ARCHITECTURE.md §6.1a) stripped out: the demo itself now declares
 * them, so the "without spaces" baseline these tests check against (nothing space-related leaks in when a
 * project declares none) has to be built here instead. */
function noSpacesCopy() {
  const dir = demoCopy();
  const file = path.join(dir, "content", "toc.json");
  const toc = JSON.parse(fs.readFileSync(file, "utf8"));
  delete toc.spaces;
  for (const s of toc.sections) {
    delete s.space;
    for (const g of s.groups) for (const p of g.pages) delete p.counterpart;
  }
  fs.writeFileSync(file, JSON.stringify(toc));
  return dir;
}

describe("declaration and validation", () => {
  test("a correct declaration builds, strict, with one export per space", async () => {
    const r = await buildSpaces();
    assert.deepEqual(r.errors, []);
    assert.deepEqual(keys(r.warnings), ["space.excludedLinks", "space.excludedLinks"]);
    assert.deepEqual(
      r.sites.map((s) => s.space),
      ["business", "takeover"],
    );
  });

  test("space.missing, space.unknown, space.duplicate, space.title: blocking, even a draft build", async () => {
    const cases = [
      [(t) => (delete t.sections[1].space, t), "space.missing", { section: "take-over", known: "business, takeover" }],
      [
        (t) => ((t.sections[0].groups[1].pages[0].space = "tech"), t),
        "space.unknown",
        { where: "use/api-limits", space: "tech", known: "business, takeover" },
      ],
      [
        (t) => ((t.journeys[1].space = "ops"), t),
        "space.unknown",
        { where: "Take over Acme Orders", space: "ops", known: "business, takeover" },
      ],
      [(t) => ((t.spaces = ["business", "takeover", "business"]), t), "space.duplicate", { space: "business" }],
      [(t) => ((t.spaces = ["business", "takeover", "ops"]), t), "space.title", { space: "ops" }],
    ];
    for (const [edit, key, vars] of cases) {
      const root = spacesCopy(edit);
      try {
        const r = await buildSpaces({ root, draft: true });
        assert.equal(r.html, null, key);
        assert.deepEqual(r.sites, []);
        assert.deepEqual(
          r.errors.map((e) => [e.kind, e.key, e.vars]),
          [["space", key, vars]],
          key,
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("space.undeclared: “space” anywhere while “spaces” is not declared", async () => {
    const root = spacesCopy((t) => (delete t.spaces, t));
    try {
      const r = await buildSpaces({ root });
      assert.equal(r.html, null);
      assert.deepEqual(
        r.errors.map((e) => [e.key, e.vars.where]),
        [
          ["space.undeclared", "use"],
          ["space.undeclared", "use/api-limits"],
          ["space.undeclared", "take-over"],
          ["space.undeclared", "Take over Acme Orders"],
        ],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("space.empty: a declared space without any page is a warning", async () => {
    const root = spacesCopy((t) => ((t.spaces = [...t.spaces, { id: "ops", title: "For the operators" }]), t));
    try {
      const r = await buildSpaces({ root });
      assert.deepEqual(r.errors, []);
      assert.deepEqual(
        r.warnings.find((w) => w.key === "space.empty"),
        { kind: "space", key: "space.empty", vars: { space: "ops" } },
      );
      assert.equal(r.data.spaces.find((s) => s.id === "ops").pages, 0);
      assert.equal(
        r.data.spaces.find((s) => s.id === "ops").shortTitle,
        "For the operators",
        "shortTitle defaults to the title",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("schema: space ids, space objects, counterpart format", async () => {
    for (const edit of [
      (t) => ((t.spaces = ["Business"]), t),
      (t) => ((t.spaces = [{ id: "business", titel: "x" }]), t),
      (t) => ((t.sections[0].space = "Business"), t),
      (t) => ((t.sections[0].groups[0].pages[0].counterpart = "take-over/orders-api~a~b"), t),
      (t) => ((t.spaces = []), t),
    ]) {
      const root = spacesCopy(edit);
      try {
        const r = await buildSpaces({ root, draft: true });
        assert.equal(r.html, null);
        assert.equal(r.errors[0].kind, "validate", JSON.stringify(r.errors[0]));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  test("spaces.output must contain {space} (spaceOutput, exit code 2); spaces.export is a boolean", () => {
    const base = { product: { name: "Acme Orders" } };
    assert.throws(
      () => prepareConfig({ ...base, spaces: { output: "dist/export.html" } }, { env: {} }),
      (e) =>
        e.code === 2 &&
        e.key === "config.invalid" &&
        e.details.some((d) => d.path === "spaces.output" && d.key === "spaceOutput"),
    );
    assert.throws(
      () => prepareConfig({ ...base, spaces: { export: "yes" } }, { env: {} }),
      (e) => e.code === 2 && e.details[0].path === "spaces.export",
    );
    assert.throws(
      () => prepareConfig({ ...base, spaces: { exprt: false } }, { env: {} }),
      (e) => e.details[0].path === "spaces.exprt",
    );
    const c = prepareConfig({ ...base, spaces: { output: "dist/acme-{space}.html" } }, { env: {} });
    assert.deepEqual(c.spaces, { export: true, output: "dist/acme-{space}.html" });
    assert.deepEqual(prepareConfig(base, { env: {} }).spaces, { export: true, output: null });
    const t = createI18n({ language: "en" }).t;
    assert.equal(
      t("cli.validate.spaceOutput", { placeholder: "{space}" }),
      "the path of each export must contain {space}",
    );
  });
});

describe("site data", () => {
  test("without spaces: nothing is emitted (data, texts)", async () => {
    const dir = noSpacesCopy();
    try {
      const r = await buildDemo({ root: dir });
      const data = dataOf(r.html);
      assert.equal("spaces" in data, false);
      assert.ok(data.sections.every((s) => !("space" in s)));
      assert.ok(Object.values(data.pages).every((p) => !("space" in p) && !("counterpart" in p)));
      assert.ok(data.parcours.every((j) => !("space" in j) && !("hidden" in j)));
      assert.equal("space" in data.meta, false);
      assert.deepEqual(
        Object.keys(data.i18n).filter((k) => SPACE_TEXT_KEYS.includes(k)),
        [],
      );
      assert.deepEqual(r.sites, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("declared: spaces with their default texts (en, fr), an overridden field, the space of each section, page and journey", async () => {
    for (const [language, business, takeover] of [
      [
        "en",
        { title: "For the business", shortTitle: "Business", for: "Users, key users, product owners, support" },
        { title: "For the takeover team", shortTitle: "Takeover" },
      ],
      [
        "fr",
        {
          title: "Pour le métier",
          shortTitle: "Métier",
          for: "Utilisateurs, référents, responsables produit, support",
        },
        { title: "Pour l'équipe de reprise", shortTitle: "Reprise" },
      ],
    ]) {
      const r = await buildSpaces({ language });
      const data = dataOf(r.html);
      const t = createI18n({ language }).t;
      assert.deepEqual(
        data.spaces,
        [
          {
            id: "business",
            ...business,
            subtitle: t("ui.spaces.business.subtitle"),
            icon: "livre",
            pages: 3,
            for: business.for,
          },
          // The subtitle of the takeover space is overridden by the table of contents.
          {
            id: "takeover",
            ...takeover,
            subtitle: "Architecture, API and operations of Acme Orders.",
            icon: "reprendre",
            for: t("ui.spaces.takeover.for"),
            pages: 3,
          },
        ].map((s) => ({
          id: s.id,
          title: s.title,
          shortTitle: s.shortTitle,
          subtitle: s.subtitle,
          icon: s.icon,
          for: s.for,
          pages: s.pages,
        })),
      );
      assert.deepEqual(
        data.sections.map((s) => [s.id, s.space]),
        [
          ["use", "business"],
          ["take-over", "takeover"],
        ],
      );
      assert.deepEqual(
        Object.values(data.pages).map((p) => [p.id, p.space]),
        [
          ["use/orders", "business"],
          ["use/orders/detail", "business"],
          ["use/settings", "business"],
          ["use/api-limits", "takeover"],
          ["take-over/architecture", "takeover"],
          ["take-over/orders-api", "takeover"],
        ],
      );
      // A journey without "space" takes the space of its first step.
      assert.deepEqual(
        data.parcours.map((j) => j.space),
        ["business", "takeover"],
      );
      assert.ok(
        SPACE_TEXT_KEYS.every((k) => !k.startsWith("ui.") || k in data.i18n),
        "the texts of the spaces are embedded",
      );
      assert.match(r.html, /id="espaces" role="group"/);
    }
    assert.deepEqual(Object.keys(SPACE_DEFAULTS), ["business", "takeover"]);
  });

  test("counterpart: { id, anchor? } in the page data, with or without spaces", async () => {
    const data = dataOf((await buildSpaces()).html);
    assert.deepEqual(data.pages["use/orders"].counterpart, { id: "take-over/orders-api" });
    assert.deepEqual(data.pages["take-over/orders-api"].counterpart, { id: "use/orders", anchor: "the-screen" });
    // Without spaces, a counterpart alone brings the code and the texts it needs, nothing else.
    const dir = noSpacesCopy();
    try {
      const file = path.join(dir, "content", "toc.json");
      const toc = JSON.parse(fs.readFileSync(file, "utf8"));
      toc.sections[0].groups[0].pages[0].counterpart = "maintain/architecture";
      fs.writeFileSync(file, JSON.stringify(toc));
      const r = await buildDemo({ root: dir });
      const plain = dataOf(r.html);
      assert.deepEqual(plain.pages["use/orders"].counterpart, { id: "maintain/architecture" });
      assert.equal("spaces" in plain, false);
      assert.equal(plain.i18n["ui.counterpart.plain"], "Related: {title} →");
      assert.match(r.html, /function counterpartLine/);
      assert.deepEqual(r.sites, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("exports", () => {
  test("an export holds nothing of the other space: no text, no page id", async () => {
    const r = await buildSpaces();
    const [business, takeover] = r.sites;
    assert.ok(r.html.includes(MARKER.business) && r.html.includes(MARKER.takeover), "the full site holds both");
    assert.ok(business.html.includes(MARKER.business));
    assert.ok(!business.html.includes(MARKER.takeover), "no takeover text in the business export");
    for (const id of ["take-over/", "use/api-limits"]) assert.ok(!business.html.includes(id), id);
    assert.ok(takeover.html.includes(MARKER.takeover));
    // The "use" section is kept for its takeover page, without its introduction (it belongs to the business space).
    assert.ok(!takeover.html.includes(MARKER.business), "no business text in the takeover export");
    for (const id of ["use/orders", "use/settings"]) assert.ok(!takeover.html.includes(id), id);
    assert.deepEqual(Object.keys(business.data.pages), ["use/orders", "use/orders/detail", "use/settings"]);
    assert.deepEqual(Object.keys(takeover.data.pages), [
      "use/api-limits",
      "take-over/architecture",
      "take-over/orders-api",
    ]);
    assert.deepEqual(
      takeover.data.sections.map((s) => [s.id, s.groupes.map((g) => g.pages)]),
      [
        ["use", [["use/api-limits"]]],
        ["take-over", [["take-over/architecture", "take-over/orders-api"]]],
      ],
    );
    assert.equal(takeover.data.sections[0].intro_html, "");
    assert.deepEqual(
      [takeover.data.sections[0].sous_titre, takeover.data.sections[0].points, takeover.data.sections[0].vedette],
      ["", [], false],
    );
    assert.equal(
      takeover.data.sections[1].sous_titre,
      "How Acme Orders is built and run.",
      "the sections of the space keep theirs",
    );
    assert.equal(business.data.meta.space, "business");
    assert.deepEqual(
      business.data.spaces.map((s) => s.id),
      ["business"],
    );
    assert.deepEqual(business.data.ordre, ["use/orders", "use/orders/detail", "use/settings"]);
    assert.ok(business.data.recherche.every((e) => business.data.pages[e.p]));
    assert.deepEqual(business.data.suggestions, ["use/orders", "use/settings"]);
    assert.equal(r.data.meta.space, undefined, "the full site is unchanged");
  });

  test("links to another space become their text, counted; counterparts to another space are removed", async () => {
    const r = await buildSpaces();
    const [business, takeover] = r.sites;
    assert.equal(business.excludedLinks, 3);
    assert.equal(takeover.excludedLinks, 2);
    assert.deepEqual(
      r.warnings.map((w) => w.vars),
      [
        { space: "business", n: 3 },
        { space: "takeover", n: 2 },
      ],
    );
    const page = business.data.pages["use/orders"].html;
    assert.match(page, /<span class="lien-exclu">the architecture<\/span> \(see the Takeover documentation\)/);
    assert.match(page, /<span class="lien-exclu">the API quotas<\/span> \(see the Takeover documentation\)/);
    assert.match(page, /<a href="#\/use\/settings">the settings<\/a>/, "a link inside the space is kept");
    assert.match(business.data.accueil_html, /<span class="lien-exclu">the architecture<\/span>/);
    assert.match(
      takeover.data.pages["take-over/orders-api"].html,
      /<span class="lien-exclu">the orders list<\/span> \(see the Business documentation\)/,
    );
    assert.equal(business.data.pages["use/orders"].counterpart, undefined);
    assert.equal(takeover.data.pages["take-over/orders-api"].counterpart, undefined);
    // In French: the text of the replaced link.
    const fr = await buildSpaces({ language: "fr" });
    assert.match(fr.sites[0].data.pages["use/orders"].html, /\(voir la documentation Reprise\)/);
  });

  test("journeys: those of the space, steps of another space removed and counted (hidden)", async () => {
    const [business, takeover] = (await buildSpaces()).sites;
    assert.deepEqual(business.data.parcours, [
      {
        titre: "Discover Acme Orders",
        desc: "The pages to read first.",
        etapes: ["use/orders", "use/settings"],
        space: "business",
        hidden: 1,
      },
    ]);
    assert.deepEqual(takeover.data.parcours, [
      {
        titre: "Take over Acme Orders",
        desc: "From the architecture to the API.",
        etapes: ["take-over/architecture", "take-over/orders-api"],
        space: "takeover",
      },
    ]);
  });

  test("images: only those of the kept pages; statistics recounted", async () => {
    const r = await buildSpaces();
    const [business, takeover] = r.sites;
    const images = (html) => [...html.matchAll(/<script type="text\/plain" id="img-([^"]+)">data:/g)].map((m) => m[1]);
    assert.deepEqual(images(r.html), ["orders-list", "settings-profile"]);
    assert.deepEqual(images(business.html), ["orders-list", "settings-profile"]);
    assert.deepEqual(images(takeover.html), [], "the takeover export embeds no screenshot");
    assert.deepEqual(r.data.meta.stats, { pages: 6, captures: 2, zones: 5, schemas: 1 });
    assert.deepEqual(business.data.meta.stats, { pages: 3, captures: 2, zones: 5, schemas: 0 });
    assert.deepEqual(takeover.data.meta.stats, { pages: 3, captures: 0, zones: 0, schemas: 1 });
    assert.equal(takeover.stats.diagrams, 1);
    assert.equal(takeover.stats.bytes, Buffer.byteLength(takeover.html));
    assert.ok(takeover.stats.bytes < business.stats.bytes);
    assert.ok(dataOf(business.html).meta.screenshots["orders-list"], "screenshot dates of the kept pages");
    assert.equal(dataOf(takeover.html).meta.screenshots, undefined);
  });

  test("output paths: default, spaces.output, options.space and spaceOutput, options.output", async () => {
    const dist = (f) => path.join(SPACES, "dist", f);
    let r = await buildSpaces();
    assert.equal(r.output, dist("Acme-Orders-Documentation.html"));
    assert.deepEqual(
      r.sites.map((s) => s.output),
      [dist("Acme-Orders-Documentation-business.html"), dist("Acme-Orders-Documentation-takeover.html")],
    );
    r = await buildSpaces({ modify: (c) => ({ ...c, spaces: { output: "exports/acme-{space}.html" } }) });
    assert.deepEqual(
      r.sites.map((s) => s.output),
      ["business", "takeover"].map((s) => path.join(SPACES, "exports", `acme-${s}.html`)),
    );
    r = await buildSpaces({ options: { space: "takeover" } });
    assert.deepEqual(
      r.sites.map((s) => [s.space, s.output]),
      [["takeover", dist("Acme-Orders-Documentation-takeover.html")]],
    );
    assert.ok(r.html, "the full site is still computed");
    const elsewhere = path.join(tempDir(), "it.html");
    r = await buildSpaces({ options: { space: "business", spaceOutput: elsewhere } });
    assert.equal(r.sites[0].output, elsewhere);
    r = await buildSpaces({ options: { output: path.join(SPACES, "out", "site.html") } });
    assert.deepEqual(
      r.sites.map((s) => s.output),
      [path.join(SPACES, "out", "site-business.html"), path.join(SPACES, "out", "site-takeover.html")],
    );
    // spaces.export false: the full site alone, unless an export is asked for.
    r = await buildSpaces({ modify: (c) => ({ ...c, spaces: { export: false } }) });
    assert.deepEqual(r.sites, []);
    r = await buildSpaces({ modify: (c) => ({ ...c, spaces: { export: false } }), options: { space: "business" } });
    assert.deepEqual(
      r.sites.map((s) => s.space),
      ["business"],
    );
    assert.equal(
      spaceOutput("/p", { spaces: { output: null } }, "x", path.resolve("/p/dist/Doc.v2.html")),
      path.resolve("/p/dist/Doc.v2-x.html"),
    );
  });
});

describe("counterpart", () => {
  const pages = {
    "use/orders": { id: "use/orders", toc: [{ id: "the-screen" }] },
    "take-over/api": { id: "take-over/api", toc: [{ id: "endpoints" }] },
  };
  const check = (counterparts, unwritten) =>
    checkLinks({ pages, links: {}, sections: ["use"], counterparts, unwritten });
  test("a valid counterpart, with or without anchor: no problem", () => {
    assert.deepEqual(check({ "use/orders": "take-over/api", "take-over/api": "use/orders~the-screen" }), []);
  });
  test("an unknown page, the page itself, a section: link.counterpart", () => {
    assert.deepEqual(check({ "use/orders": "take-over/nope" }), [
      { kind: "link", key: "link.counterpart", vars: { page: "use/orders", link: "#/take-over/nope" } },
    ]);
    assert.deepEqual(
      check({ "use/orders": "use/orders" }).map((p) => p.key),
      ["link.counterpart"],
    );
    assert.deepEqual(
      check({ "use/orders": "use" }).map((p) => p.key),
      ["link.counterpart"],
    );
  });
  test("an unknown anchor: link.anchor (not checked while the target page is not written yet)", () => {
    assert.deepEqual(check({ "use/orders": "take-over/api~nope" }), [
      { kind: "link", key: "link.anchor", vars: { page: "use/orders", link: "#/take-over/api~nope" } },
    ]);
    assert.deepEqual(check({ "use/orders": "take-over/api~nope" }, new Set(["take-over/api"])), []);
  });
  test("in a build: strict error, a warning with --draft, reported by check links", async () => {
    const root = spacesCopy((t) => ((t.sections[0].groups[0].pages[0].counterpart = "take-over/nope"), t));
    try {
      const strict = await buildSpaces({ root });
      assert.deepEqual(
        strict.errors.map((e) => e.key),
        ["link.counterpart"],
      );
      const draft = await buildSpaces({ root, draft: true });
      assert.deepEqual(draft.errors, []);
      assert.ok(draft.warnings.some((w) => w.key === "link.counterpart"));
      const r = await cli(["check", "links", "--project", root]);
      assert.equal(r.code, 1);
      assert.match(r.err, /\[use\/orders\] invalid counterpart: #\/take-over\/nope/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("CLI", () => {
  test("build writes the full site and one file per space, one summary line each", async () => {
    const dir = spacesCopy();
    try {
      const r = await cli(["build", "--project", dir, "--date", "2026-01-01"]);
      assert.equal(r.code, 0, r.err);
      const lines = r.out.trim().split("\n");
      assert.equal(lines.length, 3);
      assert.match(
        lines[0],
        /^✔ dist\/Acme-Orders-Documentation\.html — .* 6 pages · 2 screenshots · 5 annotated elements · 1 diagram$/,
      );
      assert.match(lines[1], /^✔ dist\/Acme-Orders-Documentation-business\.html — .* 3 pages · 2 screenshots/);
      assert.match(
        lines[2],
        /^✔ dist\/Acme-Orders-Documentation-takeover\.html — .* 3 pages · 0 screenshots · 0 annotated elements · 1 diagram · 2 warnings$/,
      );
      assert.match(r.err, /⚠ export “business”: 3 links to another space replaced by their text/);
      for (const f of ["", "-business", "-takeover"])
        assert.ok(fs.existsSync(path.join(dir, "dist", `Acme-Orders-Documentation${f}.html`)), f);
      assert.equal(
        dataOf(fs.readFileSync(path.join(dir, "dist", "Acme-Orders-Documentation-takeover.html"), "utf8")).meta.space,
        "takeover",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--space writes that export alone; --output then names it", async () => {
    const dir = spacesCopy();
    try {
      let r = await cli(["build", "--project", dir, "--space", "business"]);
      assert.equal(r.code, 0, r.err);
      assert.deepEqual(fs.readdirSync(path.join(dir, "dist")), ["Acme-Orders-Documentation-business.html"]);
      assert.equal(r.out.trim().split("\n").length, 1);
      const out = path.join(dir, "elsewhere", "business.html");
      r = await cli(["build", "--project", dir, "--space", "business", "--output", out]);
      assert.equal(r.code, 0, r.err);
      assert.ok(fs.existsSync(out));
      assert.equal(dataOf(fs.readFileSync(out, "utf8")).meta.space, "business");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("unknown space (with the closest id), --space without spaces: usage errors, exit code 2", async () => {
    let r = await cli(["build", "--project", SPACES, "--space", "busines"]);
    assert.equal(r.code, 2);
    assert.match(
      r.err,
      /^✖ --space: unknown space “busines”\n {2}→ declared spaces: business, takeover \(did you mean “business”\?\)/,
    );
    r = await cli(["build", "--project", SPACES, "--space", "busines", "--lang", "fr"]);
    assert.match(r.err, /espace inconnu « busines »[\s\S]*vouliez-vous dire « business »/);
    const noSpaces = noSpacesCopy();
    try {
      r = await cli(["build", "--project", noSpaces, "--space", "business"]);
      assert.equal(r.code, 2);
      assert.match(r.err, /^✖ --space: the table of contents declares no space/);
      for (const command of ["view", "open"])
        assert.equal((await cli([command, "--project", noSpaces, "--space", "x"])).code, 2, command);
    } finally {
      fs.rmSync(noSpaces, { recursive: true, force: true });
    }
    assert.throws(
      () => checkSpaceOption({ ids: ["business"], space: "zzz", t: String }),
      (e) => e.code === 2 && e.key === "build.spaceUnknown" && e.vars.closest === "",
    );
  });

  test("--json: { ok, output, stats, sites: [{ space, output, stats, excludedLinks }], languages, errors, warnings }", async () => {
    const dir = spacesCopy();
    const noSpaces = noSpacesCopy();
    try {
      const r = await cli(["build", "--project", dir, "--json"]);
      assert.equal(r.code, 0, r.err);
      const json = JSON.parse(r.out);
      assert.deepEqual(Object.keys(json), ["ok", "output", "stats", "sites", "languages", "errors", "warnings"]);
      assert.deepEqual(json.languages, [], "no `languages` declared (ARCHITECTURE.md §6.12)");
      assert.deepEqual(
        json.sites.map((s) => [s.space, path.basename(s.output), s.stats.pages, s.excludedLinks]),
        [
          ["business", "Acme-Orders-Documentation-business.html", 3, 3],
          ["takeover", "Acme-Orders-Documentation-takeover.html", 3, 2],
        ],
      );
      assert.deepEqual(Object.keys(json.sites[0]), ["space", "output", "stats", "excludedLinks"]);
      // Without spaces: sites is [].
      const plain = JSON.parse(
        (await cli(["build", "--project", noSpaces, "--json", "--output", path.join(dir, "demo.html")])).out,
      );
      assert.deepEqual(plain.sites, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(noSpaces, { recursive: true, force: true });
    }
  });

  test("open --space: the export of that space", async () => {
    const dir = spacesCopy();
    try {
      assert.equal(
        (await cli(["open", "--project", dir, "--space", "takeover"], { DOC_KIT_NO_OPEN: "1" })).code,
        1,
        "not built yet",
      );
      await cli(["build", "--project", dir]);
      const r = await cli(["open", "take-over/architecture", "--project", dir, "--space", "takeover", "--json"], {
        DOC_KIT_NO_OPEN: "1",
      });
      assert.equal(r.code, 0, r.err);
      assert.match(JSON.parse(r.out).url, /Acme-Orders-Documentation-takeover\.html#\/take-over\/architecture$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("export --with-dist: the exports per space too, even outside dist/", async () => {
    const root = tempDir("doc-kit-spaces-export-");
    const dir = path.join(root, "docs");
    fs.cpSync(spacesCopy(), dir, { recursive: true });
    const file = path.join(dir, "doc.config.mjs");
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, "utf8")
        .replace("statuses:", 'spaces: { output: "../exports/acme-{space}.html" },\n  statuses:'),
    );
    try {
      assert.equal((await cli(["build", "--project", dir])).code, 0);
      assert.ok(fs.existsSync(path.join(root, "exports", "acme-business.html")));
      const { project, config } = await loadProject({ project: dir, env: {} });
      const r = exportProject({ project, config, target: path.join(root, "copy"), withDist: true });
      for (const f of ["dist/Acme-Orders-Documentation.html", "dist/acme-business.html", "dist/acme-takeover.html"])
        assert.ok(fs.existsSync(path.join(r.target, f)), f);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("dev: each export is served at /space/<id>", async () => {
    const dir = spacesCopy();
    const server = await startDevServer({
      root: dir,
      loadConfig: () => reloadConfig(dir, {}),
      describe: (p) => ({ what: p.key }),
      describeError: (e) => ({ what: e.message }),
      texts: { language: "en", title: "Build error", hint: "Fix and save.", close: "Close", waiting: "No build yet." },
    });
    try {
      assert.deepEqual(server.spaces, ["business", "takeover"]);
      for (const space of ["business", "takeover"]) {
        const res = await fetch(new URL(`space/${space}`, server.url));
        assert.equal(res.status, 200);
        const html = await res.text();
        assert.equal(dataOf(html).meta.space, space);
        assert.match(html, /id="doc-kit-dev"/, "with the live-reload client");
      }
      assert.equal((await fetch(new URL("space/nope", server.url))).status, 404);
      assert.equal(dataOf(await (await fetch(server.url)).text()).meta.space, undefined, "the full site at /");
    } finally {
      await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("audit", () => {
  const audit = async (dir) => {
    const { project, config } = await loadProject({ project: dir, env: {} });
    return runAudit({ project, config, measure: { tables: null, coverage: null, secrets: null }, now: NOW, env: {} });
  };

  test("takeover pages: those of the takeover space, wherever their section sits", async () => {
    // The takeover section first, under another id: without spaces, the last section would be taken.
    const dir = spacesCopy((t) => {
      t.sections[1].id = "tech";
      t.sections.reverse();
      return t;
    });
    for (const f of fs.readdirSync(path.join(dir, "content", "take-over")))
      fs.renameSync(path.join(dir, "content", "take-over", f), path.join(dir, "content", f === "index.md" ? "x" : f));
    try {
      const toc = JSON.parse(fs.readFileSync(path.join(dir, "content", "toc.json"), "utf8"));
      toc.sections[0].groups[0].pages.forEach((p) => (p.file = p.id.replace("take-over/", "") + ".md"));
      fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify(toc));
      const r = await audit(dir);
      assert.equal(r.takeoverSection, "tech");
      assert.ok(r.level >= 1, JSON.stringify(r.errors));
      // use/api-limits (takeover space, in the "use" section) is a takeover page: the proofs are measured on 3 pages.
      assert.equal(r.indicators.proofs.total, 3);
      assert.equal(r.indicators.written.outsideTakeover.total, 3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("level by space: page indicators of each space, criteria not concerned n/a; report table", async () => {
    const dir = spacesCopy();
    try {
      const r = await audit(dir);
      assert.equal(r.takeoverSection, "take-over");
      assert.deepEqual(
        r.spaces.map((s) => [s.id, s.title, s.pages]),
        [
          ["business", "For the business", 3],
          ["takeover", "For the takeover team", 3],
        ],
      );
      const [business, takeover] = r.spaces;
      const na = (s) =>
        s.criteria.filter((c) => c.na && ["written2", "takeover4", "proofs4"].includes(c.id)).map((c) => c.id);
      assert.deepEqual(na(business), ["takeover4", "proofs4"]);
      assert.deepEqual(na(takeover), ["written2"]);
      // The page indicators are those of the space; the project-wide ones are shared.
      assert.deepEqual([business.indicators.written.n, business.indicators.written.total], [3, 3]);
      assert.equal(business.indicators.annotated.total, 3);
      assert.equal(business.indicators.annotated.n, 2);
      assert.equal(takeover.indicators.proofs.total, 3);
      assert.equal(business.indicators.glossary, r.indicators.glossary);
      assert.deepEqual(
        business.criteria.map((c) => c.id),
        r.criteria.map((c) => c.id),
      );
      assert.equal(business.level, 1, "the business space misses annotated2");
      assert.ok(takeover.level >= 2);
      const md = renderMarkdown(r, createI18n({ language: "en" }));
      assert.match(
        md,
        /## Level by space\n\n\| Space \| Pages \| Level \| Missing for the next level \|\n\|---\|---\|---\|---\|\n\| For the business \(`business`\) \| 3 \| 1 Skeleton \| `annotated2` \|/,
      );
      assert.match(renderMarkdown(r, createI18n({ language: "fr" })), /## Niveau par espace/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("without spaces: no level by space, takeover section as before", async () => {
    const dir = noSpacesCopy();
    try {
      const r = await audit(dir);
      assert.equal("spaces" in r, false);
      // The fallback rule (no section named "take-over"/"reprendre": the last one of the plan) — "risks" here.
      assert.equal(r.takeoverSection, "risks");
      assert.doesNotMatch(renderMarkdown(r, createI18n({ language: "en" })), /Level by space/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("legacy", () => {
  test("espaces, espace, pendant → spaces, space, counterpart", () => {
    const { value, legacy } = normalizeToc({
      titre: "Docs",
      espaces: ["business", { id: "takeover", subtitle: "x" }],
      sections: [
        {
          id: "use",
          titre: "Use",
          espace: "business",
          groupes: [{ pages: [{ id: "use/a", titre: "A", espace: "takeover", pendant: "use/b~x" }] }],
        },
      ],
      parcours: [{ titre: "J", etapes: ["use/a"], espace: "takeover" }],
    });
    assert.equal(legacy, true);
    assert.deepEqual(value.spaces, ["business", { id: "takeover", subtitle: "x" }]);
    assert.equal(value.sections[0].space, "business");
    assert.deepEqual(value.sections[0].groups[0].pages[0], {
      id: "use/a",
      title: "A",
      space: "takeover",
      counterpart: "use/b~x",
    });
    assert.deepEqual(value.journeys[0], { title: "J", steps: ["use/a"], space: "takeover" });
  });

  test("a legacy table of contents with spaces builds like the current one", async () => {
    const dir = spacesCopy();
    try {
      const file = path.join(dir, "content", "toc.json");
      const legacy = fs
        .readFileSync(file, "utf8")
        .replace('"spaces":', '"espaces":')
        .replace(/"space":/g, '"espace":')
        .replace(/"counterpart":/g, '"pendant":');
      fs.writeFileSync(file, legacy);
      const r = await buildSpaces({ root: dir });
      assert.deepEqual(r.errors, []);
      assert.ok(r.warnings.some((w) => w.key === "legacy.read"));
      const current = await buildSpaces();
      assert.deepEqual(
        r.sites.map((s) => s.data.meta.stats),
        current.sites.map((s) => s.data.meta.stats),
      );
      assert.deepEqual(dataOf(r.html).spaces, dataOf(current.html).spaces);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("the fixture builds without writing anything in the kit", async () => {
  await buildSpaces();
  assert.equal(fs.existsSync(path.join(SPACES, "dist")), false);
  assert.equal(fs.existsSync(path.join(SPACES, ".doc-kit")), false);
  assert.ok(build);
});
