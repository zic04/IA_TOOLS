// The `infra` source (ARCHITECTURE.md §5, §6.9): the registry against the infra adapters' files, the whitelist every
// item goes through (never a value, a secret masked), the Dockerfile adapter on its fixture, what the shared helpers
// tell (an environment from a path, a range open to all), the project's own infra adapters, and doc-kit facts.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";
import { adaptersOf } from "../../engine/core/adapters.mjs";
import { BUILT_IN_INFRA, loadInfra, keptInfra, collectInfra, INFRA_PATTERNS } from "../../engine/facts/infra.mjs";
import {
  environmentOf,
  environmentOfPath,
  openToAll,
  INFRA_COMMON_PATTERNS,
} from "../../engine/facts/infra-common.mjs";
import dockerfile, { DOCKERFILE_PATTERNS } from "../../adapters/infra/dockerfile.mjs";
import compose from "../../adapters/infra/compose.mjs";
import kubernetes from "../../adapters/infra/kubernetes.mjs";
import githubActions from "../../adapters/infra/github-actions.mjs";

const FIXTURES = path.join(KIT_ROOT, "test", "fixtures", "infra");

/** Writes files (relative path → text) under a new temporary folder; returns it. */
function tree(prefix, files) {
  const dir = tempDir(prefix);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

describe("the registry and the whitelist", () => {
  test("every infra adapter file has its entry, in the order of BUILT_IN_INFRA; each declares its expressions", () => {
    const files = fs
      .readdirSync(path.join(KIT_ROOT, "adapters", "infra"))
      .filter((f) => f.endsWith(".mjs"))
      .map((f) => f.slice(0, -4))
      .sort();
    assert.deepEqual(
      adaptersOf("infra")
        .map((a) => a.id)
        .sort(),
      files,
    );
    assert.deepEqual(
      BUILT_IN_INFRA.map((a) => a.name),
      adaptersOf("infra").map((a) => a.id),
    );
    for (const patterns of [INFRA_PATTERNS, INFRA_COMMON_PATTERNS, DOCKERFILE_PATTERNS])
      assert.ok(Object.isFrozen(patterns) && Object.values(patterns).every((re) => re instanceof RegExp));
  });

  test("an item keeps its fields and the checked settings only: no value, a secret name masked, bounds held", () => {
    const token = "gh" + "p_" + "Zq8vN3kT6wP1xR4mY7bLc2Hd9sF0gJ5aQ1wE";
    const item = keptInfra(
      {
        kind: "workload",
        provider: "kubernetes",
        type: "Deployment",
        name: `hooks-${token}`,
        file: "k8s/app.yaml",
        line: "12",
        env: "production",
        image: "https://user:SECRET123@registry.example.test/acme/api",
        tag: "1.4.2",
        replicas: 3,
        ports: [8080, 70000, "443", -1],
        root: false,
        schedule: "0 3 * * *",
        variables: ["DB_URL", "not a name", token],
        value: "postgres://user:SECRET123@db/app",
        data: { password: "SECRET123" },
      },
      "kubernetes",
    );
    assert.deepEqual(item, {
      kind: "workload",
      provider: "kubernetes",
      type: "Deployment",
      name: "…",
      file: "k8s/app.yaml",
      line: 12,
      env: "production",
      image: "https://registry.example.test/acme/api",
      tag: "1.4.2",
      replicas: 3,
      ports: [8080, 443],
      root: false,
      schedule: "0 3 * * *",
      variables: ["DB_URL"],
    });
    assert.doesNotMatch(JSON.stringify(item), /SECRET123/);
    assert.equal(keptInfra({ kind: "anything", file: "x" }, "a"), null);
    assert.equal(keptInfra({ kind: "resource" }, "a"), null);
    assert.equal(keptInfra({ kind: "resource", file: "main.tf", type: "a b" }, "terraform").type, "resource");
    // A source's query (a SAS token, a presigned URL's signature) is taken off, whoever gives it, but its ref.
    const signed = "https://store.example.test/t/linked.json?sv=2022-11-02&sig=SECRET123SECRET123";
    assert.equal(keptInfra({ kind: "module", file: "a.json", source: signed }, "nomad").source, signed.split("?")[0]);
    assert.equal(
      keptInfra(
        { kind: "module", file: "main.tf", source: "git::https://git.example.test/m.git?token=SECRET123&ref=v1.2" },
        "x",
      ).source,
      "git::https://git.example.test/m.git?ref=v1.2",
    );
  });

  test("a type, an environment, a version or a tag a secret detector flags is never kept; nor an item of a file not given", () => {
    const key = "AK" + "IA" + "Q3VXR7ZT2LMN4PWS";
    const token = "gh" + "p_" + "Zq8vN3kT6wP1xR4mY7bLc2Hd9sF0gJ5aQ1wE";
    const item = keptInfra(
      { kind: "job", file: ".gitlab-ci.yml", type: key, env: token, version: token, tag: token },
      "g",
    );
    assert.deepEqual(item, { kind: "job", provider: "g", type: "job", name: "—", file: ".gitlab-ci.yml", line: 1 });
    const dir = tree("doc-kit-infra-file-", { "a.nomad": "job" });
    try {
      const nomad = {
        name: "nomad",
        files: /\.nomad$/,
        infra: () => ["a.nomad", "../../etc/passwd", "b.nomad"].map((file) => ({ kind: "job", file })),
      };
      assert.deepEqual(
        collectInfra(dir, [nomad]).map((i) => i.file),
        ["a.nomad"],
      );
      // The detection of the stack registry is the stack adapters': an infra adapter named like one still runs.
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { react: "18.3.1" } }));
      assert.equal(collectInfra(dir, [{ ...nomad, name: "express" }]).length, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the credentials of an image's registry are never kept (Compose, Kubernetes, GitHub Actions, Dockerfile)", () => {
    const ref = `deploy:${"S3cret" + "Passw0rd"}@registry.example.test/app:1.2`;
    const dir = tree("doc-kit-infra-image-", {
      "docker-compose.yml": `services:\n  api:\n    image: ${ref}\n`,
      "k8s/app.yaml": `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\nspec:\n  template:\n    spec:\n      containers:\n        - name: api\n          image: ${ref}\n`,
      ".github/workflows/ci.yml": `on: push\njobs:\n  build:\n    runs-on: x\n    container: ${ref}\n    steps:\n      - run: echo\n`,
      Dockerfile: `FROM ${ref}\nARG APP_USER=root\nUSER $APP_USER\n`,
    });
    try {
      const items = collectInfra(dir, [compose, kubernetes, githubActions, dockerfile]);
      assert.doesNotMatch(JSON.stringify(items), /S3cret|deploy:/);
      const images = items.filter((i) => i.image);
      assert.deepEqual(
        images.map((i) => `${i.provider} ${i.image}:${i.tag}`),
        [
          "github-actions registry.example.test/app:1.2",
          "docker registry.example.test/app:1.2",
          "docker registry.example.test/app:1.2",
          "kubernetes registry.example.test/app:1.2",
        ],
      );
      // `USER $APP_USER`: a build argument decides; the file does not tell whether the stage runs as root.
      assert.equal(images.find((i) => i.type === "stage")?.root, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an environment from a name or a path; a range open to all", () => {
    assert.equal(environmentOf("Prod"), "production");
    assert.equal(environmentOf("eu-west"), undefined);
    assert.equal(environmentOfPath("envs/staging/eu/main.tf"), "staging");
    assert.equal(environmentOfPath("charts/api/values.prod.yaml"), "production");
    assert.equal(environmentOfPath("deploy/deployment-dev.yaml"), "development");
    assert.equal(environmentOfPath("src/products/main.tf"), undefined);
    for (const open of ["0.0.0.0/0", "::/0", "*", "Internet"]) assert.equal(openToAll(open), true, open);
    for (const closed of ["10.0.0.0/8", "VirtualNetwork", 0, undefined]) assert.equal(openToAll(closed), false);
  });
});

describe("the files the infra adapters are given", () => {
  test("a folder named test/ is the test environment; tests/, spec/, fixtures/ and a Maven src/test/ are never read", () => {
    const manifest = "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: settings\n";
    const dir = tree("doc-kit-infra-tests-", {
      "k8s/overlays/test/config.yaml": manifest,
      "k8s/overlays/prod/config.yaml": manifest,
      "tests/config.yaml": manifest,
      "spec/config.yaml": manifest,
      "k8s/fixtures/config.yaml": manifest,
      "src/test/resources/config.yaml": manifest,
    });
    try {
      assert.deepEqual(
        collectInfra(dir, [kubernetes]).map((i) => `${i.file} ${i.env}`),
        ["k8s/overlays/prod/config.yaml production", "k8s/overlays/test/config.yaml test"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the Dockerfiles", () => {
  test("each stage: its base image and tag, its ports, whether it runs as root, its variables' names; tests never read", () => {
    assert.deepEqual(collectInfra(path.join(FIXTURES, "docker"), [dockerfile]), [
      {
        kind: "image",
        provider: "docker",
        type: "stage",
        name: "build",
        file: "Dockerfile",
        line: 2,
        image: "node",
        tag: "20.11-alpine",
        root: true,
        variables: ["NPM_TOKEN", "NODE_ENV", "PORT"],
      },
      {
        kind: "image",
        provider: "docker",
        type: "stage",
        name: "gcr.io/distroless/nodejs20",
        file: "Dockerfile",
        line: 9,
        image: "gcr.io/distroless/nodejs20",
        ports: [8080],
        root: true,
      },
      {
        kind: "image",
        provider: "docker",
        type: "stage",
        name: "runtime",
        file: "api/Dockerfile.prod",
        line: 1,
        image: "registry.example.test:5000/acme/base",
        ports: [9090],
        root: false,
        variables: ["LOG_LEVEL"],
      },
    ]);
  });
});

describe("the project's own infra adapters (config.infra)", () => {
  test("disabled and a local adapter; an unknown id, a kit name, a file of the application refused", async () => {
    const root = tree("doc-kit-infra-root-", {
      "adapters/nomad.mjs": "export default { name: 'nomad', files: /\\.nomad$/, infra: () => [] };\n",
      "adapters/named.mjs": "export default { name: 'dockerfile', files: /x/, infra: () => [] };\n",
      "adapters/no-hook.mjs": "export default { name: 'z', files: /x/, api: () => [] };\n",
      "adapters/no-files.mjs": "export default { name: 'w', infra: () => [] };\n",
      "app/evil.mjs": "globalThis.__dkInfra = true;\nexport default { name: 'x', files: /x/, infra: () => [] };\n",
    });
    try {
      const adapters = await loadInfra(root, {
        infra: { disabled: ["dockerfile"], adapters: ["local:adapters/nomad.mjs"] },
      });
      assert.deepEqual(
        adapters.map((a) => a.name),
        [...BUILT_IN_INFRA.map((a) => a.name).filter((n) => n !== "dockerfile"), "nomad"],
      );
      await assert.rejects(loadInfra(root, { infra: { disabled: ["terraformm"] } }), (e) => e.key === "stacks.unknown");
      await assert.rejects(
        loadInfra(root, { infra: { adapters: ["local:adapters/named.mjs"] } }),
        (e) => e.key === "stacks.name",
      );
      // An infra adapter has `files` and `infra`: a stack adapter's shape is refused.
      for (const spec of ["local:adapters/no-hook.mjs", "local:adapters/no-files.mjs"])
        await assert.rejects(loadInfra(root, { infra: { adapters: [spec] } }), (e) => e.key === "adapter.invalid");
      await assert.rejects(
        loadInfra(root, { app: { dir: "app" }, infra: { adapters: ["local:app/evil.mjs"] } }),
        (e) => e.key === "stacks.outside",
      );
      assert.equal(globalThis.__dkInfra, undefined);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("doc-kit facts --source infra writes facts/infra.json, a local adapter's items through the whitelist", async () => {
    const dir = tree("doc-kit-infra-cli-", {
      "doc.config.mjs":
        'export default { product: { name: "Shop" }, app: { dir: "app" }, infra: { adapters: ["local:adapters/nomad.mjs"] } };\n',
      "content/toc.json": JSON.stringify({ title: "Shop", sections: [] }),
      "adapters/nomad.mjs":
        "export default { name: 'nomad', files: /\\.nomad$/, infra: ({ sources }) => [...sources.keys()].map((file) => ({ kind: 'job', type: 'nomad-job', name: 'orders', file, line: 1, value: 'SECRET123' })) };\n",
      "app/Dockerfile": "FROM node:20\nUSER node\n",
      "app/deploy/orders.nomad": 'job "orders" {}\n',
    });
    try {
      let err = "";
      const code = await runCli(["facts", "--source", "infra", "--project", dir], {
        stdout: { write: () => {} },
        stderr: { write: (s) => (err += s) },
        env: {},
        commit: () => null,
        exec: () => null,
      });
      assert.equal(code, 0, err);
      const facts = JSON.parse(fs.readFileSync(path.join(dir, "facts", "infra.json"), "utf8"));
      assert.deepEqual(
        facts.items.map((i) => `${i.provider} ${i.kind} ${i.type} ${i.name} ${i.file}`),
        ["docker image stage node Dockerfile", "nomad job nomad-job orders deploy/orders.nomad"],
      );
      assert.doesNotMatch(JSON.stringify(facts), /SECRET123/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("a name that is a phrase (a workflow's, a job's, a play's)", () => {
  test("is kept, each word judged on its own: a word that reads as a token written …, a detector's finding the whole", () => {
    const name = (n) => keptInfra({ kind: "pipeline", file: "x.yml", name: n }, "g").name;
    for (const phrase of ["Build and deploy to production", "Nightly database backup job", "Configure the web servers"])
      assert.equal(name(phrase), phrase);
    assert.equal(name("Deploy Xk9QmZ2vLp8RtY4wNb7HcJ3f"), "Deploy …");
    assert.equal(name(`Deploy ${"gh" + "p_" + "Zq8vN3kT6wP1xR4mY7bLc2Hd9sF0gJ5aQ1wE"}`), "…");
  });
});
