// The DAT and the code (ARCHITECTURE.md §6.19, engine/inputs/reconcile.mjs, `doc-kit inputs reconcile`): the words of
// a text, the technologies it names (standard/technologies.json), the addresses it gives, their traces in the facts
// of the code, the three outcomes, and the command on a project.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import {
  wordsOf,
  mentionsOf,
  hostsOf,
  tracesOf,
  reconcile,
  loadTechnologies,
  RECONCILE_FACTS,
  MAX_DAT_BYTES,
} from "../../engine/inputs/reconcile.mjs";
import { tempDir } from "../tools/helpers.mjs";

const dirs = [];
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
const technologies = loadTechnologies();
const tech = (id) => technologies.find((t) => t.id === id);

describe("the registry", () => {
  test("follows its schema, one id each, and no name shared by two technologies", () => {
    assert.ok(technologies.length >= 40);
    const names = new Map();
    for (const t of technologies)
      for (const n of t.names) {
        const key = wordsOf(n)
          .map((x) => x.w)
          .join(" ");
        assert.ok(!names.has(key), `“${n}” names ${names.get(key)} and ${t.id}`);
        names.set(key, t.id);
      }
  });
});

describe("the words and the mentions of a text", () => {
  test("words: letters, digits, + and #; a dot inside joins, a dash does not; case and accents ignored; each with its line", () => {
    assert.deepEqual(
      wordsOf("Node.js and C# on Azure-SQL.\nÉléments, C++ end.").map((x) => [x.w, x.raw, x.line]),
      [
        ["nodejs", "Nodejs", 1],
        ["and", "and", 1],
        ["c#", "C#", 1],
        ["on", "on", 1],
        ["azure", "Azure", 1],
        ["sql", "SQL", 1],
        ["elements", "Éléments", 2],
        ["c++", "C++", 2],
        ["end", "end", 2],
      ],
    );
    // A dash does not hide a name: Kafka-based is Kafka; docker-compose is Docker Compose.
    assert.deepEqual(
      [...mentionsOf("Kafka-based messaging, built with docker-compose.", technologies).keys()],
      ["kafka", "docker"],
    );
  });

  test("a name that is also a common word is a mention only as written", () => {
    const m = mentionsOf("We react quickly; the sentry; an oracle.\nIn React, with Sentry.", technologies);
    assert.deepEqual(m.get("react").mentions, [{ line: 2, heading: "", name: "React" }]);
    assert.deepEqual(m.get("sentry").mentions, [{ line: 2, heading: "", name: "Sentry" }]);
    assert.equal(m.has("oracle"), false);
    // Ordinary prose names nothing.
    const prose = "The web app reads the API gateway of the enterprise service bus; log analytics go to a CDN.";
    assert.deepEqual([...mentionsOf(prose, technologies).keys()], []);
  });

  test("a technology named word for word, the longest name first, once per line, under its heading", () => {
    const text = [
      "# Data",
      "The data lives in Azure Database for PostgreSQL; PostgreSQL 16, postgres too.",
      "## Cache",
      "A redis cache (Redis).",
      "Nothing about the reactor or the nodes.",
    ].join("\n");
    const m = mentionsOf(text, technologies);
    assert.deepEqual(m.get("postgresql"), {
      mentions: [{ line: 2, heading: "Data", name: "Azure Database for PostgreSQL" }],
      more: 0,
    });
    assert.deepEqual(m.get("redis"), { mentions: [{ line: 4, heading: "Cache", name: "Redis" }], more: 0 });
    assert.deepEqual([...m.keys()].sort(), ["postgresql", "redis"], "no mention in “reactor” or “nodes”");
    // A multi-word name, case and accents ignored.
    assert.ok(mentionsOf("Hébergé sur azure kubernetes SERVICE.", technologies).has("kubernetes"));
    // The longest name wins, and its words are not read again: Cosmos DB for MongoDB is MongoDB, not Cosmos DB.
    assert.deepEqual([...mentionsOf("We use Azure Cosmos DB for MongoDB.", technologies).keys()], ["mongodb"]);
    // Whatever the order of the registry: its shorter name declared first.
    const short = [
      { id: "cosmos", names: ["Cosmos"] },
      { id: "cosmosdb", names: ["Cosmos DB"] },
    ];
    assert.deepEqual([...mentionsOf("On Cosmos DB.", short).keys()], ["cosmosdb"]);
    // A line starting with "#" and no space is no heading.
    assert.equal(mentionsOf("# Data\n#hashtag\nRedis", technologies).get("redis").mentions[0].heading, "Data");
  });

  test("at most 20 mentions kept per technology, the others counted", () => {
    const text = Array.from({ length: 25 }, () => "Kafka").join("\n");
    const k = mentionsOf(text, technologies).get("kafka");
    assert.equal(k.mentions.length, 20);
    assert.equal(k.more, 5);
  });

  test("addresses: the host of each http(s) address, lower-case, its line, a final dot left out", () => {
    assert.deepEqual(hostsOf("See https://Orders.Acme.example/api and\nhttp://legacy.acme.example. Not ftp://x.y."), [
      { host: "orders.acme.example", line: 1 },
      { host: "legacy.acme.example", line: 2 },
    ]);
    // A user name before "@" is skipped, never kept: the host is the one after it.
    const hosts = hostsOf("https://alice@ops.acme.example/admin and https://jean.dupont@intranet.acme.example");
    assert.deepEqual(hosts, [
      { host: "ops.acme.example", line: 1 },
      { host: "intranet.acme.example", line: 1 },
    ]);
    assert.ok(!JSON.stringify(hosts).includes("alice") && !JSON.stringify(hosts).includes("dupont"));
    // A host that cannot be read after the user name: nothing, never the user name; a "?" or "#" ends the address.
    assert.deepEqual(hostsOf("https://admin@[fd00::1]:8443/console https://jean.dupont@_intranet.acme.example"), []);
    // Whatever the characters of the user name; the host after the last "@".
    assert.deepEqual(hostsOf("https://jean_dupont@[fd00::1]/console https://jean+ops@_intranet.acme.example"), []);
    assert.deepEqual(hostsOf("https://a@b@ops.acme.example:8443/x"), [{ host: "ops.acme.example", line: 1 }]);
    // An authority longer than the limit: its "@" may lie beyond, nothing of it is kept.
    assert.deepEqual(hostsOf(`https://user_${"u".repeat(520)}@ops.acme.example`), []);
    assert.deepEqual(hostsOf(`https://${"a".repeat(600)}@ops.acme.example`), []);
    assert.deepEqual(hostsOf("https://ops.acme.example?mail=bob@acme.example"), [
      { host: "ops.acme.example", line: 1 },
    ]);
  });
});

describe("the traces in the facts", () => {
  test("a package exact or by prefix, an image by its name or its last part, a type, a provider, a file", () => {
    const facts = {
      dependencies: [
        { name: "PG", manifest: "package.json" },
        { name: "org.postgresql:postgresql", manifest: "pom.xml" },
        { name: "pgx", manifest: "go.mod" },
      ],
      infra: [
        {
          type: "workload",
          name: "db",
          image: "docker.io/library/postgres:16@sha256:abc",
          file: "compose.yaml",
          line: 3,
        },
        { type: "workload", name: "db2", image: "registry:5000/team/postgres:16", file: "compose.yaml", line: 9 },
        { type: "workload", name: "x", image: "registry:5000/team/postgresx", file: "compose.yaml", line: 12 },
        { type: "azurerm_postgresql_flexible_server", name: "main", file: "main.tf", line: 9 },
        { type: "Deployment", name: "api", provider: "kubernetes", file: "k8s/api.yaml", line: 1 },
      ],
    };
    assert.deepEqual(
      tracesOf(tech("postgresql"), facts).map((x) => `${x.source}:${x.what}`),
      [
        "dependencies:PG",
        "dependencies:org.postgresql:postgresql",
        "infra:workload db docker.io/library/postgres:16@sha256:abc",
        "infra:workload db2 registry:5000/team/postgres:16",
        "infra:azurerm_postgresql_flexible_server main",
      ],
    );
    assert.deepEqual(
      tracesOf(tech("kubernetes"), facts).map((x) => [x.source, x.file, x.line]),
      [["infra", "k8s/api.yaml", 1]],
    );
    assert.deepEqual(
      tracesOf(tech("terraform"), facts).map((x) => x.file),
      ["main.tf"],
    );
  });

  test("a stack, a language with lines, a variable; at most 5 traces per source", () => {
    const facts = {
      stack: {
        stacks: [{ id: "spring", title: "Spring Boot" }],
        items: [
          { language: "java", lines: 1200 },
          { language: "python", lines: 0 },
        ],
      },
      env: Array.from({ length: 7 }, (_, i) => ({ name: `REDIS_${i}`, files: [".env.example"] })),
    };
    assert.deepEqual(tracesOf(tech("springboot"), facts), [{ source: "stack", what: "Spring Boot" }]);
    assert.deepEqual(tracesOf(tech("java"), facts), [{ source: "stack", what: "java (1200 lines)" }]);
    assert.deepEqual(tracesOf(tech("python"), facts), [], "a language without lines is no trace");
    assert.equal(tracesOf(tech("redis"), facts).length, 5);
  });
});

describe("the reconciliation", () => {
  test("found in the code, said by the DAT only, in the code only — in that order of attention; the addresses", () => {
    const r = reconcile({
      documents: [
        {
          source: "dat.docx",
          text: "# Run\nApp Service, PostgreSQL and Redis. https://orders.acme.example\nhttps://old.acme.example",
        },
      ],
      facts: {
        dependencies: [
          { name: "pg", manifest: "package.json" },
          { name: "@sentry/node", manifest: "package.json" },
        ],
      },
      technologies,
      appHosts: ["orders.acme.example"],
    });
    assert.deepEqual(
      r.technologies.map((x) => [x.id, x.status]),
      [
        ["appservice", "datOnly"],
        ["redis", "datOnly"],
        ["sentry", "codeOnly"],
        ["postgresql", "confirmed"],
      ],
    );
    assert.deepEqual(r.technologies[3].dat, [{ doc: "dat.docx", line: 2, heading: "Run", name: "PostgreSQL" }]);
    assert.deepEqual(r.hosts, [
      { host: "old.acme.example", declared: false, dat: [{ doc: "dat.docx", line: 3 }] },
      { host: "orders.acme.example", declared: true, dat: [{ doc: "dat.docx", line: 2 }] },
    ]);
  });
});

describe("doc-kit inputs reconcile", () => {
  function project({ dat = true, facts = true } = {}) {
    const dir = tempDir("doc-kit-reconcile-");
    dirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "doc.config.mjs"),
      'export default { product: { name: "Shop" }, app: { url: "https://orders.acme.example" } };\n',
    );
    fs.mkdirSync(path.join(dir, "content"));
    fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Shop", sections: [] }));
    const docs = path.join(dir, ".doc-kit", "inputs", "docs");
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(docs, "dat.md"), "# Data\nPostgreSQL and RabbitMQ.\nhttps://legacy.acme.example\n");
    fs.writeFileSync(
      path.join(docs, "index.json"),
      JSON.stringify({
        documents: [
          ...(dat
            ? [{ source: "DAT v2.docx", kind: "dat", format: "docx", output: ".doc-kit/inputs/docs/dat.md" }]
            : []),
          { source: "guide.md", kind: "guide", format: "markdown", output: ".doc-kit/inputs/docs/dat.md" },
        ],
      }),
    );
    if (facts) {
      fs.mkdirSync(path.join(dir, "facts"));
      fs.writeFileSync(
        path.join(dir, "facts", "dependencies.json"),
        JSON.stringify({
          source: "dependencies",
          items: [
            { name: "pg", manifest: "package.json" },
            { name: "stripe", manifest: "package.json" },
          ],
        }),
      );
    }
    return dir;
  }
  async function cli(args) {
    let out = "";
    let err = "";
    const code = await runCli(args, {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      env: {},
    });
    return { code, out, err };
  }

  test("the summary, the file written for the agent, the facts missing said; --json", async () => {
    const dir = project();
    const r = await cli(["inputs", "reconcile", "--project", dir]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^The DAT and the code — 1 DAT read: DAT v2\.docx\n/);
    assert.match(r.out, /\n {2}✔ found in the code \(1\): PostgreSQL\n/);
    assert.match(r.out, /\n {2}⚠ said by the DAT, no trace in the code \(1\): RabbitMQ\n/);
    assert.match(r.out, /\n {2}⚠ in the code, not in the DAT \(1\): Stripe\n/);
    assert.match(
      r.out,
      /\n {2}⚠ addresses the DAT gives that are not the application's \(app\.url, the app of inputs\.json\): legacy\.acme\.example\n/,
    );
    assert.match(
      r.out,
      /⚠ facts missing: infra, stack, env — the code's side is incomplete\n {2}→ run doc-kit facts --source infra --source stack --source env\n/,
    );
    const saved = JSON.parse(fs.readFileSync(path.join(dir, ".doc-kit", "inputs", "reconcile.json"), "utf8"));
    assert.deepEqual(
      saved.documents,
      [{ source: "DAT v2.docx", output: ".doc-kit/inputs/docs/dat.md" }],
      "only the DATs",
    );
    assert.deepEqual(saved.missing, ["infra", "stack", "env"]);
    assert.match(saved.generator, /doc-kit/);
    const json = JSON.parse((await cli(["inputs", "reconcile", "--json", "--project", dir])).out);
    assert.deepEqual(
      json.technologies.map((x) => x.id),
      ["rabbitmq", "stripe", "postgresql"],
    );
    assert.deepEqual(RECONCILE_FACTS, ["dependencies", "infra", "stack", "env"]);
    // An address of inputs.json's app is the application's too.
    fs.writeFileSync(
      path.join(dir, "inputs.json"),
      JSON.stringify({ app: [{ env: "legacy", url: "https://legacy.acme.example" }] }),
    );
    const declared = await cli(["inputs", "reconcile", "--project", dir]);
    assert.match(declared.out, /\n {2}✔ addresses of the application: legacy\.acme\.example\n/);
  });

  test("only a converted text of .doc-kit/inputs/docs/ is read, whatever the index says", async () => {
    const dir = project({ dat: false });
    fs.writeFileSync(path.join(dir, "secret.md"), "PostgreSQL\n");
    fs.mkdirSync(path.join(dir, ".doc-kit", "inputs", "docs", "sub.md"));
    for (const name of [".hidden.md", "dat.txt"])
      fs.writeFileSync(path.join(dir, ".doc-kit", "inputs", "docs", name), "PostgreSQL\n");
    // A conversion over the size a conversion has at most is not read (a sparse file: no disk taken).
    const big = path.join(dir, ".doc-kit", "inputs", "docs", "big.md");
    fs.writeFileSync(big, "PostgreSQL\n");
    fs.truncateSync(big, MAX_DAT_BYTES + 1);
    const outputs = [
      "secret.md",
      "../secret.md",
      ".doc-kit/inputs/docs/../../../secret.md",
      ".doc-kit/inputs/docs/sub/../../../../secret.md",
      ".doc-kit/inputs/docs/.hidden.md",
      ".doc-kit/inputs/docs/sub.md",
      ".doc-kit/inputs/docs/dat.txt",
      ".doc-kit/inputs/docs/big.md",
    ];
    fs.writeFileSync(
      path.join(dir, ".doc-kit", "inputs", "docs", "index.json"),
      JSON.stringify({ documents: outputs.map((output) => ({ source: output, kind: "dat", output })) }),
    );
    const r = await cli(["inputs", "reconcile", "--project", dir]);
    assert.match(r.out, /^no technical architecture document \(DAT\) ingested/);
    // The name of a document, as the index gives it, is printed on one line, without a control character.
    fs.writeFileSync(path.join(dir, ".doc-kit", "inputs", "docs", "ok.md"), "PostgreSQL\n");
    fs.writeFileSync(
      path.join(dir, ".doc-kit", "inputs", "docs", "index.json"),
      JSON.stringify({
        documents: [{ source: "DAT\u001b[31m\nv2.docx", kind: "dat", output: ".doc-kit/inputs/docs/ok.md" }],
      }),
    );
    const named = await cli(["inputs", "reconcile", "--project", dir]);
    assert.match(named.out, /^The DAT and the code — 1 DAT read: DAT \[31m v2\.docx\n/);
    assert.ok(!named.out.includes("\u001b"));
  });

  test("a folder of the conversions that leads out of the project (a junction) is not read", async () => {
    const dir = project();
    const outside = tempDir("doc-kit-reconcile-outside-");
    dirs.push(outside);
    const docs = path.join(dir, ".doc-kit", "inputs", "docs");
    for (const f of fs.readdirSync(docs)) fs.copyFileSync(path.join(docs, f), path.join(outside, f));
    fs.rmSync(docs, { recursive: true, force: true });
    fs.symlinkSync(outside, docs, "junction");
    try {
      const r = await cli(["inputs", "reconcile", "--project", dir]);
      assert.match(r.out, /^no technical architecture document \(DAT\) ingested/);
    } finally {
      fs.unlinkSync(docs);
    }
  });

  test("no DAT ingested: said, with what to do, nothing written; the messages in French", async () => {
    const dir = project({ dat: false });
    const r = await cli(["inputs", "reconcile", "--project", dir]);
    assert.equal(r.code, 0);
    assert.match(
      r.out,
      /^no technical architecture document \(DAT\) ingested: nothing to reconcile\n→ declare it with doc-kit inputs add document <file> --kind dat/,
    );
    assert.ok(!fs.existsSync(path.join(dir, ".doc-kit", "inputs", "reconcile.json")));
    const fr = await cli(["--lang", "fr", "inputs", "reconcile", "--project", project({ facts: false })]);
    assert.match(fr.out, /^Le DAT et le code — 1 DAT lu\(s\) : DAT v2\.docx\n/);
    assert.match(fr.out, /dit par le DAT, sans trace dans le code \(2\) : PostgreSQL, RabbitMQ/);
  });
});
