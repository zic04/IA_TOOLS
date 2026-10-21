// The kinds of spaces (ARCHITECTURE.md §6.1a, standard/spaces.json): the registry and its checks, the kind of a
// declared space, and what each kind changes — the code left out of the pages read without it, the glossary's
// technical correspondence, and the takeover dossier of the audit spread over the admin and develop spaces.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadSpaceProfiles, spaceKind, declaredSpaces } from "../../engine/core/space-profiles.mjs";
import { loadPageTemplates } from "../../engine/core/page-templates.mjs";
import { runAudit, TAKEOVER_ITEMS } from "../../engine/audit/audit.mjs";
import { loadProject } from "../../engine/project/load.mjs";
import { renderMarkdown } from "../../engine/audit/report.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { KIT_ROOT, DEMO, tempDir, buildBusiness, businessCopy, demoCopy } from "../tools/helpers.mjs";

describe("registry (standard/spaces.json)", () => {
  test("four kinds, one per audience, in that order; what each one says", () => {
    const p = loadSpaceProfiles();
    assert.deepEqual([...p.keys()], ["use", "product", "admin", "develop"]);
    const flag = (name) => [...p.values()].filter((x) => x[name]).map((x) => x.id);
    assert.deepEqual(flag("noCode"), ["use", "product"]);
    assert.deepEqual(flag("proofs"), ["develop"]);
    assert.deepEqual(flag("glossaryTechnical"), ["admin", "develop"]);
    assert.deepEqual(p.get("admin").takeoverItems, ["dat", "operations"]);
    // Every required takeover page lives in exactly one kind.
    const held = [...p.values()].flatMap((x) => x.takeoverItems);
    assert.deepEqual([...held].sort(), TAKEOVER_ITEMS.map((t) => t.id).sort());
  });

  test("the kinds the table of contents accepts are the kinds of the registry; their usual types exist", () => {
    const schema = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "schemas", "toc.schema.json"), "utf8"));
    const kind = schema.$defs.space.anyOf.find((x) => x.type === "object").properties.kind;
    assert.deepEqual(kind.enum, [...loadSpaceProfiles().keys()]);
    const types = loadPageTemplates().types;
    for (const p of loadSpaceProfiles().values())
      for (const t of p.preferTypes) assert.ok(Object.hasOwn(types, t), `${p.id}: ${t} is a page type`);
  });

  describe("a defect of the registry is refused when it is loaded", () => {
    const roots = [];
    after(() => {
      for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
    });
    const profile = (id, more = {}) => ({
      id,
      icon: "book",
      noCode: false,
      proofs: false,
      glossaryTechnical: false,
      takeoverItems: [],
      preferTypes: [],
      ...more,
    });
    const kitWith = (profiles) => {
      const root = tempDir("doc-kit-spaces-kit-");
      roots.push(root);
      fs.mkdirSync(path.join(root, "standard"));
      fs.mkdirSync(path.join(root, "schemas"));
      fs.copyFileSync(
        path.join(KIT_ROOT, "schemas", "spaces.schema.json"),
        path.join(root, "schemas", "spaces.schema.json"),
      );
      fs.writeFileSync(path.join(root, "standard", "spaces.json"), JSON.stringify({ version: 1, profiles }));
      return root;
    };
    test("against the schema (an unknown takeover page)", () =>
      assert.throws(
        () => loadSpaceProfiles(kitWith([profile("a", { takeoverItems: ["zz"] })])),
        /standard\/spaces\.json/,
      ));
    test("a kind declared twice", () =>
      assert.throws(() => loadSpaceProfiles(kitWith([profile("a"), profile("a")])), /profile a declared twice/));
  });
});

describe("the kind of a declared space", () => {
  test("a standard space is its own kind; a space of the project's own names one", () => {
    assert.equal(spaceKind("use"), "use");
    assert.equal(spaceKind({ id: "develop", kind: "develop" }), "develop");
    assert.equal(spaceKind({ id: "ops", kind: "admin" }), "admin");
    assert.equal(spaceKind({ id: "ops" }), null, "no kind");
    assert.equal(spaceKind({ id: "ops", kind: "nope" }), null, "an unknown kind");
    assert.equal(spaceKind({ id: "use", kind: "develop" }), null, "a standard space keeps its own kind");
    assert.equal(spaceKind({ id: "ops", kind: "constructor" }), null, "never a name of Object.prototype");
  });

  test("declaredSpaces: in order, once each, with their profile; null without spaces", () => {
    assert.equal(declaredSpaces({ sections: [] }), null);
    const d = declaredSpaces({ spaces: ["use", { id: "ops", kind: "admin" }, "use", "x"] });
    assert.deepEqual(
      d.map((s) => [s.id, s.kind, s.profile?.id ?? null]),
      [
        ["use", "use", "use"],
        ["ops", "admin", "admin"],
        ["x", null, null],
      ],
    );
  });
});

describe("what a kind changes", () => {
  /** Builds a copy of the business fixture whose spaces and sections `edit` changes. */
  const buildWith = async (edit) => {
    const root = businessCopy((t) => (edit(t), t));
    try {
      return await buildBusiness({ root });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };

  test("business.technical: in a space read without the code (use, product), never in admin or develop", async () => {
    for (const [space, expected] of [
      ["use", ["use/proof"]],
      ["product", ["use/proof"]],
      ["admin", []],
      ["develop", []],
    ]) {
      const r = await buildWith((t) => {
        t.spaces = [...new Set([space, "develop"])];
        t.sections[0].space = space;
      });
      assert.deepEqual(r.errors, [], space);
      const technical = r.warnings.filter((w) => w.key === "business.technical").map((w) => w.vars.page);
      assert.deepEqual(technical, expected, space);
    }
  });

  test("the glossary's technical correspondence: kept in the export of admin and develop, dropped elsewhere", async () => {
    for (const [space, kept] of [
      ["admin", true],
      ["develop", true],
      ["product", false],
      ["use", false],
    ]) {
      const other = space === "use" ? "develop" : "use";
      const r = await buildWith((t) => {
        t.spaces = [other, space];
        t.sections[0].space = other;
        t.sections[1].space = space;
      });
      assert.deepEqual(r.errors, [], space);
      const site = r.sites.find((s) => s.space === space);
      assert.equal("tech" in site.data.glossary[0], kept, space);
      assert.equal(r.data.spaces.find((s) => s.id === space).tech === true, kept, `${space}: the site knows it too`);
    }
  });
});

describe("the takeover dossier of the audit, spread over admin and develop", () => {
  const audit = async (root) => {
    const { project, config } = await loadProject({ project: root });
    return runAudit({
      project,
      config,
      measure: { tables: null, coverage: null, secrets: null },
      now: new Date(Date.UTC(2026, 9, 1, 12)),
      env: {},
    });
  };

  test("each required page is looked for, and suggested, in the space whose kind holds it", async () => {
    const r = await audit(DEMO);
    assert.equal(r.takeoverSection, "maintain", "the first section of the develop space");
    assert.deepEqual(
      r.takeover.map((t) => [t.id, t.section, t.ok]),
      [
        ["architecture", "maintain", true],
        ["dat", "operate", false],
        ["journey", "maintain", false],
        // In the usual part of its space (standard/structure.md: Risks), not in its first section.
        ["operations", "operate", false],
        ["troubleshooting", "risks", false],
        ["findings", "risks", true],
        ["maintaining", "maintain", false],
      ],
    );
    const items = r.actions.find((a) => a.key === "takeover").items.map((i) => [i.id, i.key]);
    assert.deepEqual(items.slice(0, 3), [
      ["operate/technical-architecture", "takeover.new"],
      ["maintain/journey-<object>", "takeover.new"],
      ["operate/operations", "takeover.new"],
    ]);
    // The takeover pages (proofs, outside written2) are those of develop only: admin is read without proofs.
    assert.equal(r.indicators.proofs.total, 3);
    assert.equal(r.indicators.written.outsideTakeover.total, 8);
  });

  test("level by space: takeover4 on the pages each kind holds; n/a as the kind says", async () => {
    const r = await audit(DEMO);
    const byId = Object.fromEntries(r.spaces.map((s) => [s.id, s]));
    const t4 = (id) => byId[id].criteria.find((c) => c.id === "takeover4");
    const na = (id) =>
      byId[id].criteria.filter((c) => c.na && ["written2", "takeover4", "proofs4"].includes(c.id)).map((c) => c.id);
    assert.deepEqual(na("use"), ["takeover4", "proofs4"]);
    assert.deepEqual(na("product"), ["takeover4", "proofs4"]);
    assert.deepEqual(na("admin"), ["proofs4"]);
    assert.deepEqual(na("develop"), ["written2"]);
    assert.deepEqual([t4("admin").threshold, byId.admin.indicators.takeover.n, t4("admin").ok], [2, 0, false]);
    assert.deepEqual([t4("develop").threshold, byId.develop.indicators.takeover.n], [5, 2]);
    assert.equal(r.criteria.find((c) => c.id === "takeover4").threshold, 7, "the project: all 7");
  });

  /** The demo with its table of contents changed by `edit`, audited. */
  const auditWith = async (edit) => {
    const dir = demoCopy();
    try {
      const file = path.join(dir, "content", "toc.json");
      const toc = JSON.parse(fs.readFileSync(file, "utf8"));
      edit(toc);
      fs.writeFileSync(file, JSON.stringify(toc));
      return await audit(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  test("without an admin space, the required pages it would hold belong to develop: its takeover4 counts all 7", async () => {
    const r = await auditWith((toc) => {
      toc.spaces = toc.spaces.filter((s) => (s.id ?? s) !== "admin");
      for (const s of toc.sections) if (s.space === "admin") s.space = "develop";
    });
    const develop = r.spaces.find((s) => s.id === "develop");
    assert.equal(develop.criteria.find((c) => c.id === "takeover4").threshold, 7);
    assert.equal(develop.indicators.takeover.total, 7);
    assert.deepEqual(
      r.takeover.filter((t) => t.section === "operate").map((t) => t.id),
      ["architecture", "dat", "journey", "operations"],
      "their usual part (Operate), or the first section of develop when it has none (architecture, journey)",
    );
  });

  test("a required page goes to the usual part of its space, not to the first one (Operate after Administer)", async () => {
    const r = await auditWith((toc) => {
      const at = toc.sections.findIndex((s) => s.id === "operate");
      const page = { id: "administer/users", title: "Users", template: "screen" };
      toc.sections.splice(at, 0, {
        id: "administer",
        space: "admin",
        title: "Administer",
        groups: [{ pages: [page] }],
      });
    });
    assert.deepEqual(
      r.takeover.filter((t) => ["dat", "operations"].includes(t.id)).map((t) => t.section),
      ["operate", "operate"],
    );
    const items = r.actions.find((a) => a.key === "takeover").items.map((i) => i.id);
    assert.ok(items.includes("operate/operations") && !items.some((id) => id.startsWith("administer/")));
  });

  test("the report names every section the required pages are looked for in (en and fr)", async () => {
    const r = await audit(DEMO);
    assert.match(
      renderMarkdown(r, createI18n({ language: "en" })),
      /^## The 7 required Take over pages \(sections `maintain`, `operate`, `risks`\)$/m,
    );
    assert.match(
      renderMarkdown(r, createI18n({ language: "fr" })),
      /^## Les 7 pages obligatoires de Reprendre \(sections `maintain`, `operate`, `risks`\)$/m,
    );
    const one = await auditWith((toc) => {
      delete toc.spaces;
      for (const s of toc.sections) delete s.space;
    });
    assert.match(
      renderMarkdown(one, createI18n({ language: "en" })),
      /^## The 7 required Take over pages \(section `risks`\)$/m,
    );
  });

  test("a second space of the same kind holds no required page: takeover4 is n/a there", async () => {
    const r = await auditWith((toc) => {
      toc.spaces.push({ id: "security", kind: "develop", title: "Security" });
      toc.sections.find((s) => s.id === "secure").space = "security";
    });
    const security = r.spaces.find((s) => s.id === "security");
    assert.equal(security.criteria.find((c) => c.id === "takeover4").na, true);
    assert.equal(security.criteria.find((c) => c.id === "written2").na, true, "a develop kind: written2 n/a");
    const develop = r.spaces.find((s) => s.id === "develop");
    assert.equal(develop.criteria.find((c) => c.id === "takeover4").threshold, 5);
  });

  test("spaces without an admin or develop space: no section for the required pages (takeover.noSection)", async () => {
    const dir = demoCopy();
    try {
      const file = path.join(dir, "content", "toc.json");
      const toc = JSON.parse(fs.readFileSync(file, "utf8"));
      toc.spaces = ["use", "product"];
      for (const s of toc.sections) if (s.space !== "use") s.space = "product";
      fs.writeFileSync(file, JSON.stringify(toc));
      const r = await audit(dir);
      assert.equal(r.takeoverSection, null);
      assert.ok(r.takeover.every((t) => t.section === null && !t.ok));
      assert.ok(r.actions.find((a) => a.key === "takeover").items.every((i) => i.key === "takeover.noSection"));
      assert.equal(r.indicators.proofs.total, 0, "no develop space: no page expects proofs");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
