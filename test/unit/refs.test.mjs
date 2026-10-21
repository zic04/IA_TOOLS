// Ticket references (engine/core/refs.mjs, ARCHITECTURE.md §6.8b): the forms the kit reads, the link of each from the
// project's templates (https:// only, the parts encoded), and linear on what a crafted toc.json or page holds.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseRef, refUrl, REFS_PATTERNS } from "../../engine/core/refs.mjs";

const REFS = {
  azure: "https://dev.azure.com/acme/shop/_workitems/edit/{id}",
  jira: "https://acme.atlassian.net/browse/{id}",
  github: "https://github.com/{repo}/issues/{id}",
  gitlab: "https://gitlab.example.test/{repo}/-/issues/{id}",
};

describe("parseRef", () => {
  test("the forms of Azure Boards, Jira, GitHub and GitLab; anything else is no reference", () => {
    assert.deepEqual(parseRef("ADO#1234"), { tool: "azure", id: "1234", text: "ADO#1234" });
    assert.deepEqual(parseRef(" AB#7 "), { tool: "azure", id: "7", text: "AB#7" });
    assert.deepEqual(parseRef("PROJ-123"), { tool: "jira", id: "PROJ-123", text: "PROJ-123" });
    assert.deepEqual(parseRef("acme/shop#42"), { tool: "repo", id: "42", repo: "acme/shop", text: "acme/shop#42" });
    assert.deepEqual(parseRef("group/sub/project#7"), {
      tool: "repo",
      id: "7",
      repo: "group/sub/project",
      text: "group/sub/project#7",
    });
    for (const no of [
      "#12",
      "ADO#",
      "ADO#12a",
      "proj-1",
      "P-1",
      "a b#1",
      "shop#1",
      "javascript:alert(1)",
      // A "." or ".." segment would climb out of the repository in the link: no reference.
      "acme/..#2",
      "a/../../../x#4",
      "acme/.#1",
      "x".repeat(301),
    ])
      assert.equal(parseRef(no), null, no);
    assert.equal(parseRef(12), null);
    assert.equal(parseRef(undefined), null);
  });
});

describe("refUrl", () => {
  test("the project's template for each tool, the parts encoded; GitHub or GitLab by the templates given", () => {
    assert.equal(refUrl(parseRef("ADO#1234"), REFS), "https://dev.azure.com/acme/shop/_workitems/edit/1234");
    assert.equal(refUrl(parseRef("PROJ-123"), REFS), "https://acme.atlassian.net/browse/PROJ-123");
    assert.equal(refUrl(parseRef("acme/shop.web#42"), REFS), "https://github.com/acme/shop.web/issues/42");
    assert.equal(refUrl(parseRef("group/sub/app#7"), REFS), "https://gitlab.example.test/group/sub/app/-/issues/7");
    assert.equal(
      refUrl(parseRef("acme/shop#42"), { gitlab: REFS.gitlab }),
      "https://gitlab.example.test/acme/shop/-/issues/42",
      "only GitLab: a path of two parts is GitLab's",
    );
    assert.equal(
      refUrl(parseRef("group/sub/app#7"), { github: REFS.github }),
      "https://github.com/group/sub/app/issues/7",
    );
  });

  test("no link without a template, from a template that is no https:// address or has no {id}, nor for no reference", () => {
    assert.equal(refUrl(parseRef("ADO#1"), { jira: REFS.jira }), null);
    assert.equal(refUrl(parseRef("ADO#1"), { azure: "javascript:alert('{id}')" }), null);
    assert.equal(refUrl(parseRef("ADO#1"), { azure: "http://dev.azure.com/{id}" }), null);
    assert.equal(refUrl(parseRef("ADO#1"), { azure: "https://dev.azure.com/x" }), null);
    assert.equal(refUrl(parseRef("acme/shop#1"), {}), null);
    assert.equal(refUrl(null, REFS), null);
    assert.equal(refUrl(parseRef("ADO#1"), undefined), null);
  });

  test("linear on crafted references", () => {
    assert.ok(Object.isFrozen(REFS_PATTERNS) && Object.values(REFS_PATTERNS).every((re) => re instanceof RegExp));
    for (const make of [
      (n) => `ADO#${"1".repeat(n)}`,
      (n) => `${"A".repeat(n)}-1`,
      (n) => `${"a/".repeat(n)}#1`,
      (n) => `${"a".repeat(n)}#`,
    ]) {
      const s = make(200_000);
      const start = performance.now();
      for (const re of Object.values(REFS_PATTERNS)) re.exec(s);
      assert.ok(performance.now() - start < 200, make.toString());
    }
  });
});
