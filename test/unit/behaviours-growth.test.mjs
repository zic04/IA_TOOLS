// The readers of the behaviours source and of the feature sheets stay linear on what a crafted file holds (RULES.md
// S5): each input is built at a base size, then 4 and 16 times larger (assertLinear, test/tools/growth.mjs), no
// absolute time. test/tools/run-plan.mjs runs this file alone, after the others. The functional tests of these
// readers (what they find, what they refuse) stay in behaviours.test.mjs, facts-behaviours-crafted.test.mjs,
// facts-behaviours-review.test.mjs and backlog.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { behaviourRegistry, findKind, readCard, readScenario } from "../../engine/core/behaviours.mjs";
import {
  createSink,
  jsCommentRanges,
  pyCommentRanges,
  htmlCommentRanges,
} from "../../engine/facts/behaviour-common.mjs";
import { jsBehaviours } from "../../engine/facts/behaviour-js.mjs";
import { sqlBehaviours } from "../../engine/facts/behaviour-sql.mjs";
import { pyBehaviours } from "../../engine/facts/behaviour-py.mjs";
import { schemaBehaviours } from "../../engine/facts/behaviour-schemas.mjs";
import { openapiBehaviours } from "../../engine/facts/openapi.mjs";
import { fastapiRoutes } from "../../adapters/stack/fastapi.mjs";
import { sameRoute, apiHandlers } from "../../engine/sync/feature-files.mjs";
import { backlogModel } from "../../engine/build/backlog.mjs";
import { assertLinear, linearAt } from "../tools/growth.mjs";

/** A reader of text on a shape built for n characters. */
const linear = (label, size, build, run) => assertLinear(label, { size, build, run });

describe("the cards and the scenarios of a feature sheet (engine/core/behaviours.mjs)", () => {
  const { registry } = behaviourRegistry();
  const search = findKind(registry, "search");

  // behaviours.test.mjs › readCard › "linear on a hostile body" (was 200,000 characters under 1,500 ms)
  test("readCard: long runs of colons, 'Where:' and '- **', and many short lines", () => {
    linear(
      "readCard colons, rubrics and bold",
      12_500,
      (n) => ":".repeat(n) + "\n" + "Where:".repeat(n / 4) + "\n" + "- **".repeat(n / 4),
      (text) => readCard(text, search, registry.answers),
    );
    linear(
      "readCard short lines",
      12_500,
      (n) => "a\n".repeat(n),
      (text) => readCard(text, search, registry.answers),
    );
  });

  // behaviours.test.mjs › readScenario › "linear on a hostile body" (was 200,000 characters under 1,500 ms)
  test("readScenario: bold markers, unfinished keywords and short lines", () => {
    linear(
      "readScenario bold, keywords and short lines",
      12_500,
      (n) => "**".repeat(n / 2) + "\n" + "Étant ".repeat(n / 2) + "\n" + "x\n".repeat(n / 2),
      (text) => readScenario(text),
    );
  });
});

describe("an OpenAPI document built to cost (engine/facts/openapi.mjs)", () => {
  /** The document and its text, read by openapiBehaviours; what it kept. */
  const readDoc = ({ doc, text }) => {
    const sink = createSink("o.json", text, []);
    openapiBehaviours(doc, text, sink);
    return sink.items;
  };

  // facts-behaviours-crafted.test.mjs › "20,000 parameters to one $ref of 200,000 characters" (was under 1,000 ms)
  test("parameters to one $ref of a long path: read at once, nothing kept", () => {
    const { found } = linearAt("openapi parameters to a long $ref", {
      size: 1250,
      make: (n) => {
        const doc = {
          paths: { "/a": { get: { parameters: Array.from({ length: n }, () => ({ $ref: "#/p" })) } } },
          p: { $ref: "#/" + "a/".repeat(5 * n) },
        };
        return { doc, text: JSON.stringify(doc) };
      },
      read: readDoc,
    });
    assert.deepEqual(found, []);
  });

  // facts-behaviours-crafted.test.mjs › "routes written with escaped slashes" (20,000 routes, was under 1,000 ms)
  test("routes written with escaped slashes", () => {
    linearAt("openapi routes with escaped slashes", {
      size: 1250,
      make: (n) => {
        const text = `{"paths":{${Array.from({ length: n }, (_, i) => `"\\/r${i}":{}`).join(",")}}}`;
        return { doc: JSON.parse(text), text };
      },
      read: readDoc,
    });
  });

  // facts-behaviours-crafted.test.mjs › "3,500 operations sharing a body of 90,000 required names" (was under 500 ms)
  test("operations sharing a body of many required names", () => {
    linearAt("openapi operations sharing a body", {
      size: 45,
      make: (n) => {
        const requestBody = { content: { "application/json": { schema: { $ref: "#/c/B" } } } };
        const operation = { requestBody };
        const item = { get: operation, post: operation, put: operation, patch: operation, delete: operation };
        const doc = {
          paths: Object.fromEntries(Array.from({ length: n }, (_, i) => [`/r${i}`, item])),
          c: { B: { properties: {}, required: Array.from({ length: 128 * n }, (_, i) => `n${i}`) } },
        };
        return { doc, text: JSON.stringify(doc) };
      },
      read: readDoc,
    });
  });

  // facts-behaviours-review.test.mjs › "one schema used by every operation, stopped at the cap" (was under 1,000 ms)
  test("one schema of many properties used by every operation: stopped at the cap of 300 items", () => {
    const properties = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`p${i}`, { type: "string", maxLength: 9 }]),
    );
    const ref = { content: { "application/json": { schema: { $ref: "#/components/schemas/Big" } } } };
    const { found } = linearAt("openapi one schema, every operation", {
      size: 25,
      make: (n) => {
        const paths = Object.fromEntries(
          Array.from({ length: n }, (_, i) => [`/r${i}`, { post: { requestBody: ref } }]),
        );
        const doc = { paths, components: { schemas: { Big: { properties } } } };
        return { doc, text: JSON.stringify(doc) };
      },
      read: (input) => readDoc(input).length,
    });
    assert.equal(found, 300);
  });

  // facts-behaviours-review.test.mjs › "20,000 parameters pointing to one huge enum" (was under 1,000 ms)
  test("parameters pointing to one huge enum: stopped at the cap of 300 items", () => {
    const { found } = linearAt("openapi parameters to one enum", {
      size: 1250,
      make: (n) => {
        const doc = {
          paths: {
            "/a": { get: { parameters: Array.from({ length: n }, () => ({ $ref: "#/components/parameters/P" })) } },
          },
          components: {
            parameters: {
              P: { name: "status", in: "query", schema: { enum: Array.from({ length: n }, (_, i) => `v${i}`) } },
            },
          },
        };
        return { doc, text: JSON.stringify(doc) };
      },
      read: (input) => readDoc(input).length,
    });
    assert.equal(found, 300);
  });
});

describe("routes (engine/sync/feature-files.mjs)", () => {
  // facts-behaviours-crafted.test.mjs › routes › "a route of 80,000 slashes" (was under 200 ms, twice)
  test("a route of slashes is compared at once", () => {
    linear(
      "sameRoute on a route of slashes",
      5000,
      (n) => "/".repeat(n) + "x",
      (long) => sameRoute(long, "/x"),
    );
    linear(
      "apiHandlers on a route of slashes",
      5000,
      (n) => "/".repeat(n) + "x",
      (long) => apiHandlers({ api: ["/x", "GET /y"] }, [{ method: "GET", route: long, file: "a.js" }]),
    );
  });
});

describe("every reader on a file built to make it backtrack (engine/facts/behaviour-*.mjs)", () => {
  /** The signals of one text, through the sink of a file whose comments are left out, by language. */
  function read(text, language, file) {
    const sink = createSink(file, text, language === "py" ? pyCommentRanges(text) : jsCommentRanges(text));
    if (language === "js") jsBehaviours(text, sink);
    if (language === "py") pyBehaviours(text, sink);
    sqlBehaviours(text, sink);
    schemaBehaviours(text, language, sink);
    return sink.items;
  }
  // The shapes of facts-behaviours-review.test.mjs › "every reader stays linear on 200,000 characters built to make
  // it backtrack" (n = 200,000 there, under 3,000 ms each): here the base size, then 4 and 16 times larger.
  const SHAPES = (n) => [
    " ".repeat(n),
    "a".repeat(n),
    "a.".repeat(n / 2),
    "(".repeat(n),
    "/* ".repeat(n / 3),
    "<!--".repeat(n / 4),
    '"""'.repeat(n / 3),
    "select a from t " + "limit 1 ".repeat(n / 8),
    ".find(".repeat(n / 6),
    ".find(".repeat(n / 100) + "order:" + " ".repeat(n / 2) + ")".repeat(n / 100),
    "orderBy:" + " ".repeat(n),
    ".sort(" + " ".repeat(n),
    "a" + " ".repeat(n) + "x",
    "<select>".repeat(n / 8),
    "<input ".repeat(n / 7),
    "a__".repeat(n / 3),
    "class A(BaseModel):\n    a:" + " ".repeat(n) + "=" + "x".repeat(301),
    ".filter(".repeat(n / 8),
    "type A = '".repeat(n / 10),
    "enum A {".repeat(n / 8),
    "choices=[(".repeat(n / 10),
    "a: z.string(".repeat(n / 12),
    ".limit(" + " ".repeat(n),
    ".offset(" + " ".repeat(n),
    "schedule.every(" + " ".repeat(n),
    "type A = " + " ".repeat(n),
    "<Select<".repeat(n / 8),
  ];
  const SIZE = 12_500;

  for (const language of ["js", "py"])
    test(`${language}: ${SHAPES(SIZE).length} shapes`, () => {
      for (const [i, sample] of SHAPES(SIZE).entries())
        linear(
          `${language} reader on shape ${i} (${JSON.stringify(sample.slice(0, 30))}…)`,
          SIZE,
          (n) => SHAPES(n)[i],
          (text) => {
            read(text, language, language === "py" ? "x.py" : "x.js");
            htmlCommentRanges(text);
          },
        );
    });

  // facts-behaviours-review.test.mjs › "fastapiRoutes: a long run of letters" (200,000 characters, under 1,000 ms)
  test("fastapiRoutes: a long run of letters is read once", () => {
    linear(
      "fastapiRoutes on a run of letters",
      12_500,
      (n) => "a".repeat(n) + "!",
      (text) => fastapiRoutes(new Map([["x.py", text]])),
    );
  });
});

describe("the backlog of a documentation (engine/build/backlog.mjs)", () => {
  // backlog.test.mjs › "review of Lot 6a" (10,000 then 40,000 features in one epic, large < 50 ms or under 8 times)
  test("backlogModel: a search per feature would be quadratic, one pass is linear", () => {
    const one = (pages) => ({ sections: [{ id: "s", title: "S", groups: [{ title: "G", epic: "E-01", pages }] }] });
    const { found } = linearAt("backlogModel on features of one epic", {
      size: 625,
      make: (n) => {
        const pages = Array.from({ length: n }, (_, k) => ({ id: `p/${k}`, title: `${k}` }));
        const features = new Map(
          pages.map((p, k) => [`F-${k}`, { id: `F-${k}`, title: p.title, summary: "", page: p.id }]),
        );
        return { toc: one(pages), features, stories: new Map(), scenarios: [], rules: new Map(), cards: new Map() };
      },
      read: (p) => backlogModel({ ...p, sheets: {} }).epics[0].features.length,
    });
    assert.ok(found >= 10_000, `every feature of the largest epic is in the model: ${found}`);
  });
});
