// Legacy French-keyed formats (ARCHITECTURE.md §6.7): normalisation when read, `migrate`, identical builds.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeToc, normalizeGlossary, normalizeZones, normalizePlanEntry } from "../../engine/project/legacy.mjs";
import { migrateProject } from "../../cli/commands/migrate.mjs";
import { buildDemo, demoCopy } from "../tools/helpers.mjs";

const LEGACY_TOC = {
  titre: "Docs",
  produit: "Acme Orders",
  accroche: "Tagline",
  sections: [
    {
      id: "use",
      titre: "Use",
      titre_court: "Use",
      icone: "ecran",
      sous_titre: "Sub",
      vedette: true,
      points: ["a"],
      groupes: [{ titre: "G", pages: [{ id: "use/a", titre: "A", titre_menu: "A", resume: "R", niveau: 2, droits: ["x"], routes: ["/"], gabarit: "screen", fichier: "a.md" }] }],
    },
  ],
  parcours: [{ titre: "J", desc: "D", etapes: ["use/a"] }],
  suggestions: ["use/a"],
};

describe("normalisation", () => {
  test("toc: every legacy key is renamed, order kept", () => {
    const { value, legacy } = normalizeToc(LEGACY_TOC);
    assert.equal(legacy, true);
    assert.deepEqual(Object.keys(value), ["title", "product", "tagline", "sections", "journeys", "suggestions"]);
    assert.deepEqual(Object.keys(value.sections[0]), ["id", "title", "shortTitle", "icon", "subtitle", "featured", "highlights", "groups"]);
    assert.deepEqual(value.sections[0].groups[0].pages[0], {
      id: "use/a",
      title: "A",
      menuTitle: "A",
      summary: "R",
      level: 2,
      permissions: ["x"],
      routes: ["/"],
      template: "screen",
      file: "a.md",
    });
    assert.deepEqual(value.journeys, [{ title: "J", description: "D", steps: ["use/a"] }]);
  });

  test("current files are left alone; the current key wins over the legacy one", () => {
    const current = { title: "T", sections: [] };
    assert.deepEqual(normalizeToc(current), { value: current, legacy: false });
    assert.deepEqual(normalizeToc({ title: "new", titre: "old", sections: [] }).value, { title: "new", sections: [] });
  });

  test("glossary and zones (with the pin side)", () => {
    assert.deepEqual(normalizeGlossary([{ terme: "A", motif: "as?", def: "D" }]), { value: [{ term: "A", pattern: "as?", def: "D" }], legacy: true });
    const z = normalizeZones({ fichier: "a.webp", titre: "T", route: "/", largeur: 10, hauteur: 5, zones: [{ n: 1, x: 1, y: 2, l: 3, h: 4, libelle: "L", cote: "coin" }] });
    assert.deepEqual(z.value, { file: "a.webp", title: "T", route: "/", width: 10, height: 5, zones: [{ n: 1, x: 1, y: 2, w: 3, h: 4, label: "L", side: "corner" }] });
  });

  test("capture plan entry: fields, actions, targets, unions", () => {
    const { value, legacy } = normalizePlanEntry({
      id: "x",
      titre: "T",
      route: "/",
      contexte: "bureau",
      vue: { lon: 1, lat: 2, zoom: 3 },
      stockage: { a: "1" },
      delai: 500,
      actions: [
        { clic: { role: "button", nom: "Open", exact: true } },
        { saisir: { champ: "Name" }, valeur: "Ada" },
        { attendre: 200 },
        { molette: { x: 1, y: 2, crans: 3, sens: 1 } },
        { touche: "Escape" },
      ],
      cadre: { css: "main", marge: 0, margeV: 0 },
      zones: [{ texte: "Total", parent: 1, cote: "coin" }, { union: [{ champ: "A" }, { champ: "B", dans: { bloc: "Panel" } }] }, { texte: "X", encadre: true, dernier: true, filtre: "y" }],
      masques: [{ css: ".secret" }],
    });
    assert.equal(legacy, true);
    assert.deepEqual(value, {
      id: "x",
      title: "T",
      route: "/",
      context: "desktop",
      view: { lon: 1, lat: 2, zoom: 3 },
      storage: { a: "1" },
      delay: 500,
      actions: [
        { click: { role: "button", name: "Open", exact: true } },
        { type: { field: "Name" }, value: "Ada" },
        { wait: 200 },
        { wheel: { x: 1, y: 2, steps: 3, direction: 1 } },
        { press: "Escape" },
      ],
      frame: { css: "main", margin: 0, marginY: 0 },
      zones: [{ text: "Total", up: 1, side: "corner" }, { union: [{ field: "A" }, { field: "B", within: { block: "Panel" } }] }, { text: "X", framed: true, last: true, has: "y" }],
      masks: [{ css: ".secret" }],
    });
  });
});

describe("legacy project: build and migrate", () => {
  /** Demo copy rewritten in the legacy format (French keys, legacy file names). */
  function legacyCopy() {
    const dir = demoCopy();
    const c = path.join(dir, "content");
    const toc = JSON.parse(fs.readFileSync(path.join(c, "toc.json"), "utf8"));
    const fr = {
      title: "titre",
      tagline: "accroche",
      journeys: "parcours",
      shortTitle: "titre_court",
      icon: "icone",
      subtitle: "sous_titre",
      highlights: "points",
      featured: "vedette",
      groups: "groupes",
      menuTitle: "titre_menu",
      summary: "resume",
      level: "niveau",
      permissions: "droits",
      template: "gabarit",
      description: "desc",
      steps: "etapes",
    };
    const back = (v) =>
      Array.isArray(v) ? v.map(back) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [fr[k] || k, back(x)])) : v;
    fs.writeFileSync(path.join(c, "sommaire.json"), JSON.stringify(back(toc)));
    fs.unlinkSync(path.join(c, "toc.json"));
    const g = JSON.parse(fs.readFileSync(path.join(c, "glossary.json"), "utf8"));
    fs.writeFileSync(path.join(c, "glossaire.json"), JSON.stringify(g.map((t) => ({ terme: t.term, motif: t.pattern, def: t.def }))));
    fs.unlinkSync(path.join(c, "glossary.json"));
    fs.renameSync(path.join(c, "home.md"), path.join(c, "accueil.md"));
    for (const f of fs.readdirSync(path.join(dir, "images/zones"))) {
      const p = path.join(dir, "images/zones", f);
      const z = JSON.parse(fs.readFileSync(p, "utf8"));
      const zones = z.zones.map(({ w, label, side, ...r }) => ({ ...r, l: w, libelle: label, ...(side ? { cote: { right: "droit" }[side] } : {}) }));
      fs.writeFileSync(
        p,
        JSON.stringify({
          fichier: z.file,
          titre: z.title,
          route: z.route,
          largeur: z.width,
          hauteur: z.height,
          ...(z.version ? { version: z.version } : {}),
          ...(z.captured ? { capture: z.captured } : {}),
          zones,
        })
      );
    }
    return dir;
  }

  test("a legacy copy builds exactly like the current project, with one warning", async () => {
    const dir = legacyCopy();
    try {
      const current = await buildDemo();
      const legacy = await buildDemo({ root: dir });
      assert.deepEqual(legacy.errors, []);
      assert.equal(legacy.html, current.html);
      assert.deepEqual(legacy.warnings.map((w) => w.key), ["legacy.read"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("migrate rewrites the files; the build stays identical; a second run does nothing", async () => {
    const dir = legacyCopy();
    try {
      const paths = { content: "content", images: "images", diagrams: "diagrams" };
      const r = migrateProject(dir, paths);
      assert.deepEqual(r.errors, []);
      assert.deepEqual(
        r.converted.map((c) => c.to),
        ["content/toc.json", "content/glossary.json", "content/home.md", "images/zones/orders-list.json", "images/zones/settings-profile.json"]
      );
      assert.ok(!fs.existsSync(path.join(dir, "content/sommaire.json")));
      const after = await buildDemo({ root: dir });
      assert.deepEqual(after.warnings, []);
      assert.equal(after.html, (await buildDemo()).html);
      assert.deepEqual(migrateProject(dir, paths).converted, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
