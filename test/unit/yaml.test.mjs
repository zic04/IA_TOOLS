// The YAML reader of the infrastructure facts (engine/core/yaml.mjs, ARCHITECTURE.md §6.9): the forms the files of
// an application use, nothing expanded (aliases, tags), bounded, linear on what a crafted file holds.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readYaml, at, text, items, entries, field, YAML_PATTERNS } from "../../engine/core/yaml.mjs";
import { jsonTree, withoutJsonComments } from "../../engine/core/json-tree.mjs";

/** The time of `fn`, the best of two runs, in milliseconds. */
const best = (fn) =>
  Math.min(
    ...[0, 1].map(() => {
      const start = performance.now();
      fn();
      return performance.now() - start;
    }),
  );

describe("what the files of an application write", () => {
  test("Kubernetes manifests: several documents, nested mappings and sequences, a flow collection over two lines", () => {
    const docs = readYaml(
      [
        "apiVersion: apps/v1",
        "kind: Deployment",
        "metadata:",
        "  name: orders  # the API",
        "spec:",
        "  replicas: 3",
        "  template:",
        "    spec:",
        "      containers:",
        "        - name: api",
        '          image: "ghcr.io/acme/orders:1.4.2"',
        "          ports:",
        "            - containerPort: 8080",
        '          command: ["node",',
        '            "server.js"]',
        "---",
        "kind: Service",
        "metadata: { name: orders, labels: { app: shop } }",
        "spec:",
        "  ports: [{ port: 80, targetPort: 8080 }]",
      ].join("\n"),
    );
    assert.equal(docs.length, 2);
    assert.equal(text(at(docs[0], "metadata", "name")), "orders");
    assert.equal(at(docs[0], "metadata", "name").line, 4);
    const container = items(at(docs[0], "spec", "template", "spec", "containers"))[0];
    assert.equal(text(at(container, "image")), "ghcr.io/acme/orders:1.4.2");
    assert.equal(text(at(items(at(container, "ports"))[0], "containerPort")), "8080");
    assert.deepEqual(items(at(container, "command")).map(text), ["node", "server.js"]);
    assert.equal(text(at(docs[1], "metadata", "labels", "app")), "shop");
    assert.equal(text(at(items(at(docs[1], "spec", "ports"))[0], "targetPort")), "8080");
  });

  test("a CI pipeline: `on` is a key, a sequence at its key's indentation, a block scalar keeps its # as text", () => {
    const doc = readYaml(
      [
        "on:",
        "  push:",
        "    branches: [main]",
        "jobs:",
        "  deploy:",
        "    environment: production",
        "    steps:",
        "    - uses: actions/checkout@v4",
        "    - run: |",
        "        npm ci",
        "        npm run build # not a comment",
        "    - name: done",
      ].join("\n"),
    )[0];
    assert.deepEqual(items(at(doc, "on", "push", "branches")).map(text), ["main"]);
    assert.equal(text(at(doc, "jobs", "deploy", "environment")), "production");
    const steps = items(at(doc, "jobs", "deploy", "steps"));
    assert.equal(steps.length, 3);
    assert.equal(text(at(steps[1], "run")), "npm ci\nnpm run build # not a comment");
    assert.equal(text(at(steps[2], "name")), "done");
  });

  test("quoted scalars and keys, a plain scalar over several lines, a key holding ': ' in its value", () => {
    const doc = readYaml(
      [
        "\"quoted key\": 'it''s'",
        'escaped: "a\\"b"',
        "folded: one",
        "  two",
        "command: echo a: b",
        "url: http://example.test/#x",
      ].join("\n"),
    )[0];
    assert.equal(text(at(doc, "quoted key")), "it's");
    assert.equal(text(at(doc, "escaped")), 'a"b');
    assert.equal(text(at(doc, "folded")), "one two");
    assert.equal(text(at(doc, "command")), "echo a: b");
    assert.equal(text(at(doc, "url")), "http://example.test/#x");
    assert.deepEqual(
      entries(doc).map((e) => e.key),
      ["quoted key", "escaped", "folded", "command", "url"],
    );
  });
});

describe("nothing is expanded or resolved", () => {
  test("an alias stays its text, an anchor is dropped, a tag is kept beside its scalar", () => {
    const doc = readYaml(
      ["base: &base { a: 1 }", "copy: *base", "merged:", "  <<: *base", 'name: !Sub "${AWS::StackName}-data"'].join(
        "\n",
      ),
    )[0];
    assert.deepEqual(at(doc, "copy"), { type: "scalar", line: 2, value: "*base", alias: true });
    assert.equal(text(at(doc, "merged", "<<")), "*base");
    assert.equal(text(at(doc, "base", "a")), "1");
    assert.equal(at(doc, "name").tag, "!Sub");
    assert.equal(text(at(doc, "name")), "${AWS::StackName}-data");
  });

  test("a billion laughs stays a few aliases: read at once, nothing multiplied", () => {
    const lines = ["a0: &a0 [lol, lol, lol, lol, lol, lol, lol, lol, lol, lol]"];
    for (let i = 1; i < 10; i++)
      lines.push(
        `a${i}: &a${i} [${Array(10)
          .fill(`*a${i - 1}`)
          .join(", ")}]`,
      );
    const ms = best(() => readYaml(lines.join("\n")));
    const doc = readYaml(lines.join("\n"))[0];
    assert.ok(ms < 50, `${ms.toFixed(0)} ms`);
    assert.deepEqual(items(at(doc, "a9")).map(text), Array(10).fill("*a8"));
  });

  test("a Helm template (not YAML) gives what could be read, never an error", () => {
    const docs = readYaml(
      "{{- if .Values.enabled }}\nkind: Service\nmetadata:\n  name: {{ .Release.Name }}\n{{- end }}\n",
    );
    assert.ok(docs.some((d) => text(field(d, "kind")?.value) === "Service"));
  });
});

describe("bounded and linear on what a crafted file holds (RULES.md S5)", () => {
  test("nesting deeper than the bound is left out, a huge flow collection is cut, a long block scalar too", () => {
    const deep = Array.from({ length: 200 }, (_, i) => `${" ".repeat(i)}k${i}:`).join("\n") + " leaf";
    const doc = readYaml(deep)[0];
    let n = doc;
    let depth = 0;
    while (n?.type === "map") {
      n = n.entries[0].value;
      depth++;
    }
    assert.ok(depth <= 70, String(depth));
    const flow = readYaml(`a: [${Array.from({ length: 50_000 }, (_, i) => `v${i}`).join(", ")}]`)[0];
    assert.ok(items(at(flow, "a")).length < 2000);
    const block = readYaml(`a: |\n${"  line of text\n".repeat(20_000)}b: 1`)[0];
    assert.ok(text(at(block, "a")).length <= 64 * 1024);
    assert.equal(text(at(block, "b")), "1");
  });

  test("every shape of 200,000 characters is read in linear time (N, 4N, 16N)", () => {
    const shapes = {
      keys: (n) => "a: b\n".repeat(n / 5),
      nested: (n) => Array.from({ length: n / 40 }, () => "a:\n  b:\n    c:\n      - d: e\n").join(""),
      items: (n) => "- a\n".repeat(n / 4),
      flow: (n) => `a: [${"[".repeat(n)}`,
      quotes: (n) => `a: "${'\\"'.repeat(n / 2)}`,
      colons: (n) => `a${": a".repeat(n / 3)}`,
      comments: (n) => "# x\n".repeat(n / 4),
      unclosedFlow: (n) => "a: [b,\n  c,\n".repeat(n / 12),
      blocks: (n) => "a: |\n  x\n".repeat(n / 10),
      blanks: (n) => " ".repeat(n),
      hashes: (n) => `a: ${"x #".repeat(n / 3)}`,
    };
    for (const [name, make] of Object.entries(shapes)) {
      const times = [12_500, 50_000, 200_000].map((n) => {
        const t = make(n);
        return best(() => readYaml(t));
      });
      assert.ok(times[2] < 1000, `${name}: ${times[2].toFixed(0)} ms`);
      for (const k of [1, 2])
        assert.ok(
          times[k] < 20 || times[k] / Math.max(times[k - 1], 0.05) <= 8,
          `${name}: ×${(times[k] / times[k - 1]).toFixed(1)}`,
        );
    }
    assert.ok(Object.values(YAML_PATTERNS).every((re) => re instanceof RegExp));
  });
});

describe("the JSON form (engine/core/json-tree.mjs)", () => {
  test("nodes as readYaml gives them, with their lines; comments blanked; a mark, a bad text, a crafted depth", () => {
    const json =
      String.fromCharCode(0xfeff) + '{\n  // a comment\n  "a": [1, "x"],\n  /* two\n lines */ "b": { "c": true }\n}\n';
    const root = jsonTree(withoutJsonComments(json));
    assert.equal(root?.type, "map");
    assert.deepEqual(
      entries(root).map((e) => [e.key, e.line]),
      [
        ["a", 3],
        ["b", 5],
      ],
    );
    assert.deepEqual(items(at(root, "a")).map(text), ["1", "x"]);
    assert.equal(text(at(root, "b", "c")), "true");
    assert.equal(at(root, "b", "c").line, 5);
    assert.equal(jsonTree('{ "a": "not closed }'), null);
    assert.equal(jsonTree("[".repeat(300) + "]".repeat(300)), null);
    assert.equal(jsonTree("[".repeat(200) + "]".repeat(200))?.type, "seq");
    for (const n of [50_000, 200_000]) {
      const ms = best(() => jsonTree("[".repeat(n) + "]".repeat(n)));
      assert.ok(ms < 200, `${n} brackets: ${ms.toFixed(0)} ms`);
    }
  });
});

describe("forms found by the review of Lot 5c-1", () => {
  test("an empty item is null, never its next sibling; a block scalar keeps its blank lines and its # lines", () => {
    const [doc] = readYaml("a:\n  -\n  - b\n  - c\nd: 1\n");
    assert.deepEqual(items(at(doc, "a")).map(text), [null, "b", "c"]);
    assert.equal(text(at(doc, "d")), "1");
    const [job] = readYaml("run: |\n  echo a\n\n  # not a comment\n    indented\n  echo b\n\nnext: 1\n");
    assert.equal(text(at(job, "run")), "echo a\n\n# not a comment\n  indented\necho b");
    assert.deepEqual(
      entries(job).map((e) => [e.key, e.line]),
      [
        ["run", 1],
        ["next", 8],
      ],
    );
  });

  test("the bound of nodes holds for the items of a sequence too, and what is past it is skipped", () => {
    const docs = readYaml("- a\n".repeat(250_000));
    assert.equal(docs.length, 1);
    assert.ok(items(docs[0]).length < 200_000, String(items(docs[0]).length));
  });
});

describe("a tag before a value read below it (review of Lot 5c-1, round 2)", () => {
  test("a tagged block scalar, a tagged value on the next line and a tagged flow collection keep their tag", () => {
    const [doc] = readYaml("url: !Sub |\n  https://x.example.test/y\ntype: !Ref\n  SomeType\nlist: !Split [a, b]\n");
    assert.deepEqual(
      ["url", "type", "list"].map((k) => [at(doc, k)?.tag, at(doc, k)?.type]),
      [
        ["!Sub", "scalar"],
        ["!Ref", "scalar"],
        ["!Split", "seq"],
      ],
    );
    assert.equal(text(at(doc, "url")), "https://x.example.test/y");
  });
});
