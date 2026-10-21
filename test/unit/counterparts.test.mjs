// Topic groups (ARCHITECTURE.md §6.1a, engine/core/counterparts.mjs): a counterpart names one page or a list; the
// pages it joins, either way, form one group, declared once and shown on each member (site data pages[].topic); the
// link check of each target; a space's export keeps the members it keeps.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { counterpartTargets, topicGroups, topicOf } from "../../engine/core/counterparts.mjs";
import { checkLinks } from "../../engine/check/links.mjs";
import { buildDemo, demoCopy, dataOf } from "../tools/helpers.mjs";

describe("topic groups", () => {
  test("the targets of a counterpart: one text, a list, none", () => {
    assert.deepEqual(counterpartTargets("a/b~h"), [{ id: "a/b", anchor: "h" }]);
    assert.deepEqual(counterpartTargets(["a/b", "c/d~x"]), [{ id: "a/b" }, { id: "c/d", anchor: "x" }]);
    assert.deepEqual(counterpartTargets(undefined), []);
  });

  test("joined either way, in the order of the pages; the anchor first declared; unknown targets and itself joined to nothing", () => {
    const groups = topicGroups([
      { id: "use/a", counterpart: "product/b" },
      { id: "product/b", counterpart: ["dev/c~api", "nope/x"] },
      { id: "dev/c" },
      // Declared on the runbook alone: it joins the group all the same.
      { id: "admin/d", counterpart: "dev/c~other" },
      { id: "lonely", counterpart: "lonely" },
      { id: "e", counterpart: "f" },
      { id: "f" },
    ]);
    assert.deepEqual(groups.get("use/a"), [{ id: "product/b" }, { id: "dev/c", anchor: "api" }, { id: "admin/d" }]);
    assert.deepEqual(groups.get("admin/d"), [{ id: "use/a" }, { id: "product/b" }, { id: "dev/c", anchor: "api" }]);
    assert.deepEqual(groups.get("e"), [{ id: "f" }], "another group");
    assert.equal(groups.has("lonely"), false);
    assert.equal(groups.has("nope/x"), false);
    const toc = { sections: [{ groups: [{ pages: [{ id: "x", counterpart: "y" }, { id: "y" }] }] }] };
    assert.deepEqual(topicOf(toc, "y"), [{ id: "x" }]);
    assert.deepEqual(topicOf(toc, "z"), []);
  });

  test("a long chain stays one group (each page names the next)", () => {
    const pages = Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}`, counterpart: i ? `p${i - 1}` : undefined }));
    const groups = topicGroups(pages);
    assert.equal(groups.get("p0").length, 1999);
    assert.equal(groups.get("p1999")[0].id, "p0");
  });

  test("the link check: each target of a list, its anchor", () => {
    const pages = { a: { id: "a", toc: [] }, b: { id: "b", toc: [{ id: "h" }] } };
    const problems = checkLinks({ pages, links: {}, sections: [], counterparts: { a: ["b~h", "nope", "b~x", "a"] } });
    assert.deepEqual(
      problems.map((p) => [p.key, p.vars.link]),
      [
        ["link.counterpart", "#/nope"],
        ["link.anchor", "#/b~x"],
        ["link.counterpart", "#/a"],
      ],
    );
  });
});

describe("in a site", () => {
  /** The demo, a screen of the Use space joined to the approval's group by a list on its own entry. */
  async function threeSpaces() {
    const dir = demoCopy();
    try {
      const file = path.join(dir, "content", "toc.json");
      const toc = JSON.parse(fs.readFileSync(file, "utf8"));
      const pages = toc.sections.flatMap((s) => s.groups).flatMap((g) => g.pages);
      pages.find((p) => p.id === "use/orders/detail").counterpart = ["features/approve-order"];
      fs.writeFileSync(file, JSON.stringify(toc));
      return await buildDemo({ root: dir });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a group of three pages in three spaces: each names the two others; the exports keep their own", async () => {
    const r = await threeSpaces();
    assert.deepEqual(r.errors, []);
    const topic = (id) => r.data.pages[id].topic;
    assert.deepEqual(topic("use/orders/detail"), [
      { id: "features/approve-order" },
      { id: "secure/api-surface", anchor: "the-routes" },
    ]);
    assert.deepEqual(topic("secure/api-surface"), [{ id: "use/orders/detail" }, { id: "features/approve-order" }]);
    // An export keeps the members of its space: none here, so no topic at all.
    for (const site of r.sites)
      for (const page of Object.values(site.data.pages))
        assert.ok(!page.topic || page.topic.every((m) => site.data.pages[m.id]), site.space);
    const product = r.sites.find((s) => s.space === "product").data;
    assert.equal(product.pages["features/approve-order"].topic, undefined);
    assert.match(dataOf(r.html).i18n["ui.topic"], /This topic for:/);
  });
});
