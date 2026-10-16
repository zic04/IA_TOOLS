// Spaces (ARCHITECTURE.md §6.1a): declaration and its errors, site data emitted only when declared, one export per
// space (other spaces physically removed, links replaced, journeys, images and statistics recounted, output paths),
// counterparts, CLI (build, --space, --json, open, export, dev), audit by space, legacy aliases, site variants.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "../../engine/build/build.mjs";
import { spaceOutput, SPACE_TEXT_KEYS, checkSpaceOption } from "../../engine/build/spaces.mjs";
import { loadSpaceProfiles } from "../../engine/core/space-profiles.mjs";
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
const MARKER = { use: "marker-business-7q", develop: "marker-takeover-9z" };
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
      ["use", "develop"],
    );
  });

  test("space.missing, space.unknown, space.duplicate, space.title, space.kind: blocking, even a draft build", async () => {
    const cases = [
      [(t) => (delete t.sections[1].space, t), "space.missing", { section: "take-over", known: "use, develop" }],
      [
        (t) => ((t.sections[0].groups[1].pages[0].space = "tech"), t),
        "space.unknown",
        { where: "use/api-limits", space: "tech", known: "use, develop" },
      ],
      [
        (t) => ((t.journeys[1].space = "ops"), t),
        "space.unknown",
        { where: "Take over Acme Orders", space: "ops", known: "use, develop" },
      ],
      [(t) => ((t.spaces = ["use", "develop", "use"]), t), "space.duplicate", { space: "use" }],
      [
        (t) => ((t.spaces = ["use", "develop", { id: "ops", kind: "admin" }]), t),
        "space.title",
        { space: "ops", kinds: "use, product, admin, develop" },
      ],
      [
        (t) => ((t.spaces = ["use", "develop", "ops"]), t),
        "space.kind",
        { space: "ops", kinds: "use, product, admin, develop" },
      ],
      [
        (t) => ((t.spaces = ["use", { id: "develop", kind: "admin" }]), t),
        "space.kind",
        { space: "develop", kinds: "use, product, admin, develop" },
      ],
      // A space of kit 0.3 still declared: told to run doc-kit upgrade (migration 0.4.0).
      [
        (t) => ((t.spaces = ["business", "develop"]), (t.sections[0].space = "business"), t),
        "space.retired",
        { space: "business", kinds: "use, product, admin, develop" },
      ],
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
    const root = spacesCopy(
      (t) => ((t.spaces = [...t.spaces, { id: "ops", kind: "admin", title: "For the operators" }]), t),
    );
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
      (t) => ((t.spaces = [{ id: "use", titel: "x" }]), t),
      (t) => ((t.spaces = ["use", "develop", { id: "ops", kind: "ops", title: "x" }]), t),
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
      assert.ok(data.journeys.every((j) => !("space" in j) && !("hidden" in j)));
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
    for (const [language, use, develop] of [
      [
        "en",
        { title: "Using the application", shortTitle: "Use", for: "Users, key users, support" },
        { title: "Developing the application", shortTitle: "Develop" },
      ],
      [
        "fr",
        { title: "Utiliser l'application", shortTitle: "Utiliser", for: "Utilisateurs, référents, support" },
        { title: "Développer l'application", shortTitle: "Développer" },
      ],
    ]) {
      const r = await buildSpaces({ language });
      const data = dataOf(r.html);
      const t = createI18n({ language }).t;
      assert.deepEqual(
        data.spaces,
        [
          {
            id: "use",
            kind: "use",
            ...use,
            subtitle: t("ui.spaces.use.subtitle"),
            icon: "livre",
            pages: 3,
            for: use.for,
          },
          // The subtitle of the develop space is overridden by the table of contents.
          {
            id: "develop",
            kind: "develop",
            ...develop,
            subtitle: "Architecture, API and operations of Acme Orders.",
            icon: "reprendre",
            for: t("ui.spaces.develop.for"),
            pages: 3,
            tech: true,
          },
        ].map((s) => ({
          id: s.id,
          kind: s.kind,
          title: s.title,
          shortTitle: s.shortTitle,
          subtitle: s.subtitle,
          icon: s.icon,
          for: s.for,
          pages: s.pages,
          ...(s.tech ? { tech: true } : {}),
        })),
      );
      assert.deepEqual(
        data.sections.map((s) => [s.id, s.space]),
        [
          ["use", "use"],
          ["take-over", "develop"],
        ],
      );
      assert.deepEqual(
        Object.values(data.pages).map((p) => [p.id, p.space]),
        [
          ["use/orders", "use"],
          ["use/orders/detail", "use"],
          ["use/settings", "use"],
          ["use/api-limits", "develop"],
          ["take-over/architecture", "develop"],
          ["take-over/orders-api", "develop"],
        ],
      );
      // A journey without "space" takes the space of its first step.
      assert.deepEqual(
        data.journeys.map((j) => j.space),
        ["use", "develop"],
      );
      assert.ok(
        SPACE_TEXT_KEYS.every((k) => !k.startsWith("ui.") || k in data.i18n),
        "the texts of the spaces are embedded",
      );
      assert.match(r.html, /id="espaces" role="group"/);
    }
    assert.deepEqual([...loadSpaceProfiles().keys()], ["use", "product", "admin", "develop"]);
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
    const [use, develop] = r.sites;
    assert.ok(r.html.includes(MARKER.use) && r.html.includes(MARKER.develop), "the full site holds both");
    assert.ok(use.html.includes(MARKER.use));
    assert.ok(!use.html.includes(MARKER.develop), "no develop text in the use export");
    for (const id of ["take-over/", "use/api-limits"]) assert.ok(!use.html.includes(id), id);
    assert.ok(develop.html.includes(MARKER.develop));
    // The "use" section is kept for its develop page, without its introduction (it belongs to the use space).
    assert.ok(!develop.html.includes(MARKER.use), "no use text in the develop export");
    for (const id of ["use/orders", "use/settings"]) assert.ok(!develop.html.includes(id), id);
    assert.deepEqual(Object.keys(use.data.pages), ["use/orders", "use/orders/detail", "use/settings"]);
    assert.deepEqual(Object.keys(develop.data.pages), [
      "use/api-limits",
      "take-over/architecture",
      "take-over/orders-api",
    ]);
    assert.deepEqual(
      develop.data.sections.map((s) => [s.id, s.groups.map((g) => g.pages)]),
      [
        ["use", [["use/api-limits"]]],
        ["take-over", [["take-over/architecture", "take-over/orders-api"]]],
      ],
    );
    assert.equal(develop.data.sections[0].introHtml, "");
    assert.deepEqual(
      [develop.data.sections[0].subtitle, develop.data.sections[0].highlights, develop.data.sections[0].featured],
      ["", [], false],
    );
    assert.equal(
      develop.data.sections[1].subtitle,
      "How Acme Orders is built and run.",
      "the sections of the space keep theirs",
    );
    assert.equal(use.data.meta.space, "use");
    assert.deepEqual(
      use.data.spaces.map((s) => s.id),
      ["use"],
    );
    assert.deepEqual(use.data.order, ["use/orders", "use/orders/detail", "use/settings"]);
    assert.ok(use.data.search.every((e) => use.data.pages[e.p]));
    assert.deepEqual(use.data.suggestions, ["use/orders", "use/settings"]);
    assert.equal(r.data.meta.space, undefined, "the full site is unchanged");
  });

  test("links to another space become their text, counted; counterparts to another space are removed", async () => {
    const r = await buildSpaces();
    const [use, develop] = r.sites;
    assert.equal(use.excludedLinks, 3);
    assert.equal(develop.excludedLinks, 2);
    assert.deepEqual(
      r.warnings.map((w) => w.vars),
      [
        { space: "use", n: 3 },
        { space: "develop", n: 2 },
      ],
    );
    const page = use.data.pages["use/orders"].html;
    assert.match(page, /<span class="lien-exclu">the architecture<\/span> \(see the Develop documentation\)/);
    assert.match(page, /<span class="lien-exclu">the API quotas<\/span> \(see the Develop documentation\)/);
    assert.match(page, /<a href="#\/use\/settings">the settings<\/a>/, "a link inside the space is kept");
    assert.match(use.data.homeHtml, /<span class="lien-exclu">the architecture<\/span>/);
    assert.match(
      develop.data.pages["take-over/orders-api"].html,
      /<span class="lien-exclu">the orders list<\/span> \(see the Use documentation\)/,
    );
    assert.equal(use.data.pages["use/orders"].counterpart, undefined);
    assert.equal(develop.data.pages["take-over/orders-api"].counterpart, undefined);
    // In French: the text of the replaced link.
    const fr = await buildSpaces({ language: "fr" });
    assert.match(fr.sites[0].data.pages["use/orders"].html, /\(voir la documentation Développer\)/);
  });

  test("journeys: those of the space, steps of another space removed and counted (hidden)", async () => {
    const [use, develop] = (await buildSpaces()).sites;
    assert.deepEqual(use.data.journeys, [
      {
        title: "Discover Acme Orders",
        desc: "The pages to read first.",
        steps: ["use/orders", "use/settings"],
        space: "use",
        hidden: 1,
      },
    ]);
    assert.deepEqual(develop.data.journeys, [
      {
        title: "Take over Acme Orders",
        desc: "From the architecture to the API.",
        steps: ["take-over/architecture", "take-over/orders-api"],
        space: "develop",
      },
    ]);
  });

  test("images: only those of the kept pages; statistics recounted", async () => {
    const r = await buildSpaces();
    const [use, develop] = r.sites;
    const images = (html) => [...html.matchAll(/<script type="text\/plain" id="img-([^"]+)">data:/g)].map((m) => m[1]);
    assert.deepEqual(images(r.html), ["orders-list", "settings-profile"]);
    assert.deepEqual(images(use.html), ["orders-list", "settings-profile"]);
    assert.deepEqual(images(develop.html), [], "the develop export embeds no screenshot");
    assert.deepEqual(r.data.meta.stats, { pages: 6, captures: 2, zones: 5, diagrams: 1 });
    assert.deepEqual(use.data.meta.stats, { pages: 3, captures: 2, zones: 5, diagrams: 0 });
    assert.deepEqual(develop.data.meta.stats, { pages: 3, captures: 0, zones: 0, diagrams: 1 });
    assert.equal(develop.stats.diagrams, 1);
    assert.equal(develop.stats.bytes, Buffer.byteLength(develop.html));
    assert.ok(develop.stats.bytes < use.stats.bytes);
    assert.ok(dataOf(use.html).meta.screenshots["orders-list"], "screenshot dates of the kept pages");
    assert.equal(dataOf(develop.html).meta.screenshots, undefined);
  });

  test("output paths: default, spaces.output, options.space and spaceOutput, options.output", async () => {
    const dist = (f) => path.join(SPACES, "dist", f);
    let r = await buildSpaces();
    assert.equal(r.output, dist("Acme-Orders-Documentation.html"));
    assert.deepEqual(
      r.sites.map((s) => s.output),
      [dist("Acme-Orders-Documentation-use.html"), dist("Acme-Orders-Documentation-develop.html")],
    );
    r = await buildSpaces({ modify: (c) => ({ ...c, spaces: { output: "exports/acme-{space}.html" } }) });
    assert.deepEqual(
      r.sites.map((s) => s.output),
      ["use", "develop"].map((s) => path.join(SPACES, "exports", `acme-${s}.html`)),
    );
    r = await buildSpaces({ options: { space: "develop" } });
    assert.deepEqual(
      r.sites.map((s) => [s.space, s.output]),
      [["develop", dist("Acme-Orders-Documentation-develop.html")]],
    );
    assert.ok(r.html, "the full site is still computed");
    const elsewhere = path.join(tempDir(), "it.html");
    r = await buildSpaces({ options: { space: "use", spaceOutput: elsewhere } });
    assert.equal(r.sites[0].output, elsewhere);
    r = await buildSpaces({ options: { output: path.join(SPACES, "out", "site.html") } });
    assert.deepEqual(
      r.sites.map((s) => s.output),
      [path.join(SPACES, "out", "site-use.html"), path.join(SPACES, "out", "site-develop.html")],
    );
    // spaces.export false: the full site alone, unless an export is asked for.
    r = await buildSpaces({ modify: (c) => ({ ...c, spaces: { export: false } }) });
    assert.deepEqual(r.sites, []);
    r = await buildSpaces({ modify: (c) => ({ ...c, spaces: { export: false } }), options: { space: "use" } });
    assert.deepEqual(
      r.sites.map((s) => s.space),
      ["use"],
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
      assert.match(lines[1], /^✔ dist\/Acme-Orders-Documentation-use\.html — .* 3 pages · 2 screenshots/);
      assert.match(
        lines[2],
        /^✔ dist\/Acme-Orders-Documentation-develop\.html — .* 3 pages · 0 screenshots · 0 annotated elements · 1 diagram · 2 warnings$/,
      );
      assert.match(r.err, /⚠ export “use”: 3 links to another space replaced by their text/);
      for (const f of ["", "-use", "-develop"])
        assert.ok(fs.existsSync(path.join(dir, "dist", `Acme-Orders-Documentation${f}.html`)), f);
      assert.equal(
        dataOf(fs.readFileSync(path.join(dir, "dist", "Acme-Orders-Documentation-develop.html"), "utf8")).meta.space,
        "develop",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--space writes that export alone; --output then names it", async () => {
    const dir = spacesCopy();
    try {
      let r = await cli(["build", "--project", dir, "--space", "use"]);
      assert.equal(r.code, 0, r.err);
      assert.deepEqual(fs.readdirSync(path.join(dir, "dist")), ["Acme-Orders-Documentation-use.html"]);
      assert.equal(r.out.trim().split("\n").length, 1);
      const out = path.join(dir, "elsewhere", "use.html");
      r = await cli(["build", "--project", dir, "--space", "use", "--output", out]);
      assert.equal(r.code, 0, r.err);
      assert.ok(fs.existsSync(out));
      assert.equal(dataOf(fs.readFileSync(out, "utf8")).meta.space, "use");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("unknown space (with the closest id), --space without spaces: usage errors, exit code 2", async () => {
    let r = await cli(["build", "--project", SPACES, "--space", "devlop"]);
    assert.equal(r.code, 2);
    assert.match(
      r.err,
      /^✖ --space: unknown space “devlop”\n {2}→ declared spaces: use, develop \(did you mean “develop”\?\)/,
    );
    r = await cli(["build", "--project", SPACES, "--space", "devlop", "--lang", "fr"]);
    assert.match(r.err, /espace inconnu « devlop »[\s\S]*vouliez-vous dire « develop »/);
    const noSpaces = noSpacesCopy();
    try {
      r = await cli(["build", "--project", noSpaces, "--space", "use"]);
      assert.equal(r.code, 2);
      assert.match(r.err, /^✖ --space: the table of contents declares no space/);
      for (const command of ["view", "open"])
        assert.equal((await cli([command, "--project", noSpaces, "--space", "x"])).code, 2, command);
    } finally {
      fs.rmSync(noSpaces, { recursive: true, force: true });
    }
    assert.throws(
      () => checkSpaceOption({ ids: ["use"], space: "zzz", t: String }),
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
          ["use", "Acme-Orders-Documentation-use.html", 3, 3],
          ["develop", "Acme-Orders-Documentation-develop.html", 3, 2],
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
        (await cli(["open", "--project", dir, "--space", "develop"], { DOC_KIT_NO_OPEN: "1" })).code,
        1,
        "not built yet",
      );
      await cli(["build", "--project", dir]);
      const r = await cli(["open", "take-over/architecture", "--project", dir, "--space", "develop", "--json"], {
        DOC_KIT_NO_OPEN: "1",
      });
      assert.equal(r.code, 0, r.err);
      assert.match(JSON.parse(r.out).url, /Acme-Orders-Documentation-develop\.html#\/take-over\/architecture$/);
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
      assert.ok(fs.existsSync(path.join(root, "exports", "acme-use.html")));
      const { project, config } = await loadProject({ project: dir, env: {} });
      const r = exportProject({ project, config, target: path.join(root, "copy"), withDist: true });
      for (const f of ["dist/Acme-Orders-Documentation.html", "dist/acme-use.html", "dist/acme-develop.html"])
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
      assert.deepEqual(server.spaces, ["use", "develop"]);
      for (const space of ["use", "develop"]) {
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

  test("develop pages: those of the develop space, wherever their section sits", async () => {
    // The develop section first, under another id: without spaces, the last section would be taken.
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
      // use/api-limits (develop space, in the "use" section) is a develop page: the proofs are measured on 3 pages.
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
          ["use", "Using the application", 3],
          ["develop", "Developing the application", 3],
        ],
      );
      const [use, develop] = r.spaces;
      const na = (s) =>
        s.criteria.filter((c) => c.na && ["written2", "takeover4", "proofs4"].includes(c.id)).map((c) => c.id);
      assert.deepEqual(na(use), ["takeover4", "proofs4"]);
      assert.deepEqual(na(develop), ["written2"]);
      // The page indicators are those of the space; the project-wide ones are shared.
      assert.deepEqual([use.indicators.written.n, use.indicators.written.total], [3, 3]);
      assert.equal(use.indicators.annotated.total, 3);
      assert.equal(use.indicators.annotated.n, 2);
      assert.equal(develop.indicators.proofs.total, 3);
      assert.equal(use.indicators.glossary, r.indicators.glossary);
      assert.deepEqual(
        use.criteria.map((c) => c.id),
        r.criteria.map((c) => c.id),
      );
      assert.equal(use.level, 1, "the use space misses annotated2");
      assert.ok(develop.level >= 2);
      const md = renderMarkdown(r, createI18n({ language: "en" }));
      assert.match(
        md,
        /## Level by space\n\n\| Space \| Pages \| Level \| Missing for the next level \|\n\|---\|---\|---\|---\|\n\| Using the application \(`use`\) \| 3 \| 1 Skeleton \| `annotated2` \|/,
      );
      assert.match(renderMarkdown(r, createI18n({ language: "fr" })), /## Niveau par espace/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("without spaces: no level by space, the Take over section as before", async () => {
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
      espaces: ["use", { id: "develop", subtitle: "x" }],
      sections: [
        {
          id: "use",
          titre: "Use",
          espace: "use",
          groupes: [{ pages: [{ id: "use/a", titre: "A", espace: "develop", pendant: "use/b~x" }] }],
        },
      ],
      parcours: [{ titre: "J", etapes: ["use/a"], espace: "develop" }],
    });
    assert.equal(legacy, true);
    assert.deepEqual(value.spaces, ["use", { id: "develop", subtitle: "x" }]);
    assert.equal(value.sections[0].space, "use");
    assert.deepEqual(value.sections[0].groups[0].pages[0], {
      id: "use/a",
      title: "A",
      space: "develop",
      counterpart: "use/b~x",
    });
    assert.deepEqual(value.journeys[0], { title: "J", steps: ["use/a"], space: "develop" });
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
