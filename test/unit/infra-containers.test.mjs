// The infra adapters of containers and their orchestration (ARCHITECTURE.md §5, §6.9): Kubernetes and OpenShift
// manifests, Helm charts, Docker Compose files — the exact items of each fixture through the whitelist of the
// `infra` source (collectInfra), never a value, comments and templates and tests left out, the environment deduced;
// the pure helpers each adapter's items come from; and every reader linear on what a crafted file holds (S5).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";
import { collectInfra } from "../../engine/facts/infra.mjs";
import { readYaml } from "../../engine/core/yaml.mjs";
import { imageOf } from "../../engine/facts/infra-common.mjs";
import kubernetes, { KUBERNETES_PATTERNS, runsAsRoot, isTemplate } from "../../adapters/infra/kubernetes.mjs";
import helm, { HELM_PATTERNS } from "../../adapters/infra/helm.mjs";
import compose, { COMPOSE_PATTERNS, containerPort, rootOf } from "../../adapters/infra/compose.mjs";

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

/** Asserts that none of `values` is in the items. */
function noneOf(items, values) {
  const json = JSON.stringify(items);
  for (const v of values) assert.ok(!json.includes(v), `${v} kept`);
}

describe("Kubernetes and OpenShift manifests", () => {
  const items = collectInfra(path.join(FIXTURES, "kubernetes"), [kubernetes]);

  test("workloads and jobs, a container's image each, services, ingresses and routes, names of configs and secrets", () => {
    const k8s = { provider: "kubernetes" };
    const orders = { ...k8s, file: "k8s/base/orders.yaml" };
    const batch = { ...k8s, file: "k8s/overlays/prod/batch.yaml" };
    const spaces = { ...k8s, file: "k8s/namespaces.yaml", env: "production" };
    const app = { file: "openshift/app.yaml" };
    assert.deepEqual(items, [
      { kind: "workload", ...orders, type: "Deployment", name: "orders", line: 2, replicas: 3 },
      {
        kind: "image",
        ...orders,
        type: "init-container",
        name: "orders/migrate",
        line: 21,
        image: "ghcr.io/acme/orders-migrate",
        tag: "1.4.2",
        root: true,
      },
      {
        kind: "image",
        ...orders,
        type: "container",
        name: "orders/api",
        line: 26,
        image: "ghcr.io/acme/orders",
        tag: "1.4.2",
        ports: [8080, 9090],
        root: false,
        variables: ["DATABASE_URL", "DB_PASSWORD", "settings", "orders-credentials"],
      },
      {
        kind: "image",
        ...orders,
        type: "container",
        name: "orders/sidecar",
        line: 45,
        image: "registry.example.test:5000/acme/proxy",
        root: false,
      },
      {
        kind: "service",
        ...orders,
        type: "Service/LoadBalancer",
        name: "orders",
        line: 55,
        ports: [443, 80],
        openToAll: true,
      },
      { kind: "environment", ...spaces, type: "Namespace", name: "production", line: 1 },
      { kind: "config", ...spaces, type: "ConfigMap", name: "orders-settings", line: 11 },
      { kind: "secret", ...spaces, type: "Secret", name: "orders-credentials", line: 19 },
      {
        kind: "job",
        ...batch,
        type: "CronJob",
        name: "nightly-report",
        line: 1,
        env: "production",
        schedule: "0 3 * * *",
      },
      {
        kind: "image",
        ...batch,
        type: "container",
        name: "nightly-report/report",
        line: 12,
        env: "production",
        image: "ghcr.io/acme/report",
        root: true,
      },
      { kind: "workload", ...batch, type: "StatefulSet", name: "cache", line: 18, env: "staging", replicas: 2 },
      {
        kind: "image",
        ...batch,
        type: "container",
        name: "cache/redis",
        line: 28,
        env: "staging",
        image: "redis",
        tag: "7.2-alpine",
        ports: [6379],
      },
      { kind: "job", ...batch, type: "Job", name: "seed", line: 33, env: "production" },
      {
        kind: "image",
        ...batch,
        type: "container",
        name: "seed/seed",
        line: 44,
        env: "production",
        image: "ghcr.io/acme/seed",
        tag: "2.0.0",
        root: false,
      },
      {
        kind: "workload",
        provider: "openshift",
        type: "DeploymentConfig",
        name: "storefront",
        ...app,
        line: 4,
        replicas: 2,
      },
      {
        kind: "image",
        provider: "openshift",
        type: "container",
        name: "storefront/web",
        ...app,
        line: 13,
        image: "registry.example.test/shop/storefront",
        tag: "latest",
        ports: [8080],
      },
      { kind: "ingress", provider: "openshift", type: "Route", name: "storefront", ...app, line: 17, tls: true },
      { kind: "ingress", ...k8s, type: "Ingress", name: "storefront-public", ...app, line: 27, tls: false },
      { kind: "workload", ...k8s, type: "DaemonSet", name: "log-agent", ...app, line: 44 },
      {
        kind: "image",
        ...k8s,
        type: "container",
        name: "log-agent/agent",
        ...app,
        line: 52,
        image: "fluent/fluent-bit",
        tag: "3.0",
        root: true,
      },
    ]);
  });

  test("never a value, a ConfigMap's or a Secret's data, a Template's parameter; comments, charts, tests never read", () => {
    noneOf(items, [
      "k8s-value-never-kept",
      "config-value-never-kept",
      "secret-value-never-kept",
      "bmV2ZXIta2VwdA",
      "template-value-never-kept",
      "AGENT_KEY",
      "orders-db",
      "commented-out-never-read",
      "chart-template-never-read",
      "legacy-template-never-read",
      "test-deployment-never-read",
      "Kustomization",
    ]);
    assert.ok(!items.some((i) => i.file.startsWith("charts/") || i.file.startsWith("legacy/")));
  });

  test("the environment: the namespace's when it says one, else the file's path; a Namespace only when it says one", () => {
    const envOf = (name) => items.find((i) => i.name === name)?.env;
    assert.equal(envOf("cache"), "staging"); // namespace shop-staging, in overlays/prod
    assert.equal(envOf("seed"), "production"); // namespace production
    assert.equal(envOf("nightly-report"), "production"); // overlays/prod
    assert.equal(envOf("orders"), undefined);
    assert.ok(!items.some((i) => i.name === "monitoring"));
  });

  test("root: privileged, user 0 or runAsNonRoot false; another user or runAsNonRoot true is not; the container first", () => {
    const context = (yaml) => readYaml(yaml)[0];
    assert.equal(runsAsRoot(undefined, context("privileged: true\nrunAsUser: 1000")), true);
    assert.equal(runsAsRoot(context("runAsUser: 0"), undefined), true);
    assert.equal(runsAsRoot(context("runAsUser: 0"), context("runAsUser: 1001")), false);
    assert.equal(runsAsRoot(context("runAsNonRoot: true"), context("runAsUser: 0")), true);
    assert.equal(runsAsRoot(context("runAsNonRoot: true"), undefined), false);
    assert.equal(runsAsRoot(undefined, context("runAsNonRoot: false")), true);
    assert.equal(runsAsRoot(undefined, context("runAsUser: ${UID}")), undefined);
    assert.equal(runsAsRoot(undefined, undefined), undefined);
  });

  test("a chart's files and Go templates are never manifests", () => {
    const charts = new Set(["deploy/chart"]);
    assert.equal(isTemplate("deploy/chart/templates/x.yaml", "kind: Pod", charts), true);
    assert.equal(isTemplate("deploy/chart/crds/x.yaml", "kind: Pod", charts), true);
    assert.equal(isTemplate("deploy/other/x.yaml", "kind: Pod", charts), false);
    assert.equal(isTemplate("old/templates/x.yaml", "name: {{ .Release.Name }}", charts), true);
    assert.equal(isTemplate("k8s/templates/x.yaml", "kind: Pod", charts), false);
    assert.equal(isTemplate("x.yaml", "", new Set([""])), true);
  });

  test("a value built like a credential is never kept, a name built like one is written …", () => {
    const token = "gh" + "p_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
    const dir = tree("doc-kit-infra-k8s-", {
      "deploy/app.yaml": [
        "apiVersion: v1",
        "kind: Pod",
        "metadata:",
        "  name: api",
        "spec:",
        "  containers:",
        `    - name: ${token}`,
        "      image: nginx:1.25",
        "      env:",
        "        - name: GITHUB_TOKEN",
        `          value: ${token}`,
        "---",
        "apiVersion: v1",
        "kind: Secret",
        "metadata:",
        "  name: github",
        "stringData:",
        `  token: ${token}`,
      ].join("\n"),
    });
    try {
      const found = collectInfra(dir, [kubernetes]);
      assert.deepEqual(
        found.map((i) => `${i.kind} ${i.name} ${(i.variables || []).join(",")}`),
        ["workload api ", "image … GITHUB_TOKEN", "secret github "],
      );
      noneOf(found, [token.slice(4)]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Helm charts", () => {
  const items = collectInfra(path.join(FIXTURES, "helm"), [helm]);

  test("a chart and its dependencies; the values of its folder by their usual keys, the environment from the name", () => {
    const shop = { provider: "helm", name: "shop" };
    const prod = { ...shop, file: "charts/shop/values.prod.yaml", env: "production" };
    const values = { provider: "helm", file: "charts/shop/values.yaml" };
    const chart = { kind: "module", provider: "helm" };
    assert.deepEqual(items, [
      { ...chart, type: "chart", name: "common", file: "charts/common/Chart.yaml", line: 1, version: "2.1.0" },
      { ...chart, type: "chart", name: "legacy", file: "charts/legacy/Chart.yaml", line: 1, version: "0.3.0" },
      {
        ...chart,
        type: "dependency",
        name: "mysql",
        file: "charts/legacy/requirements.yaml",
        line: 2,
        source: "@stable",
        version: "1.6.9",
      },
      { ...chart, type: "chart", name: "shop", file: "charts/shop/Chart.yaml", line: 1, version: "1.2.0" },
      {
        ...chart,
        type: "dependency",
        name: "postgresql",
        file: "charts/shop/Chart.yaml",
        line: 8,
        source: "https://charts.bitnami.com/bitnami",
        version: "12.5.6",
      },
      {
        ...chart,
        type: "dependency",
        name: "common",
        file: "charts/shop/Chart.yaml",
        line: 12,
        source: "file://../common",
        version: "2.x.x",
      },
      {
        kind: "ingress",
        ...shop,
        type: "Ingress",
        file: "charts/shop/values-staging.yaml",
        line: 1,
        env: "staging",
        tls: false,
      },
      { kind: "workload", type: "release", ...prod, line: 1, replicas: 5 },
      { kind: "image", type: "image", ...prod, line: 2, tag: "1.4.2" },
      { kind: "ingress", type: "Ingress", ...prod, line: 4, tls: true },
      { kind: "service", type: "Service/LoadBalancer", ...prod, line: 11, ports: [443] },
      { kind: "workload", ...values, type: "release", name: "shop", line: 2, replicas: 2 },
      { kind: "image", ...values, type: "image", name: "shop", line: 3, image: "ghcr.io/acme/shop" },
      { kind: "service", ...values, type: "Service/ClusterIP", name: "shop", line: 7, ports: [80] },
      { kind: "workload", ...values, type: "release", name: "shop/worker", line: 15, replicas: 1 },
      {
        kind: "image",
        ...values,
        type: "image",
        name: "shop/worker",
        line: 16,
        image: "registry.example.test/acme/shop-worker",
        tag: "2.0.1",
      },
    ]);
  });

  test("never a value of the values, a template, a values file outside a chart, a commented dependency, a test", () => {
    noneOf(items, [
      "helm-value-never-kept",
      "helm-password-never-kept",
      "DATABASE_URL",
      "template-image-never-read",
      "stray-image-never-read",
      "test-chart-never-read",
      "redis",
      "18.0.0",
    ]);
    assert.ok(!items.some((i) => i.file.includes("templates/") || i.file.startsWith("stray/")));
  });
});

describe("Docker Compose", () => {
  const items = collectInfra(path.join(FIXTURES, "compose"), [compose]);

  test("each service with its image, ports, user, replicas and variables' names; volumes, networks, secrets, configs", () => {
    const docker = { provider: "docker" };
    const service = { kind: "workload", ...docker, type: "compose-service" };
    const file = "docker-compose.yml";
    assert.deepEqual(items, [
      {
        ...service,
        name: "api",
        file: "deploy/compose.staging.yaml",
        line: 3,
        env: "staging",
        image: "ghcr.io/acme/shop-api",
        tag: "1.5.0-rc.1",
        ports: [80, 3000],
      },
      {
        ...service,
        name: "api",
        file: "docker-compose.prod.yml",
        line: 2,
        env: "production",
        image: "registry.example.test:5000/acme/shop-api",
        tag: "${TAG:-latest}",
        replicas: 4,
        variables: ["NODE_ENV"],
      },
      {
        ...service,
        name: "api",
        file,
        line: 6,
        image: "ghcr.io/acme/shop-api",
        tag: "1.4.2",
        replicas: 2,
        ports: [80, 9229, 443],
        root: false,
        variables: ["DATABASE_URL", "LOG_LEVEL"],
      },
      { ...service, name: "web", file, line: 22, image: "nginx", tag: "1.25-alpine", ports: [80], root: true },
      {
        ...service,
        name: "db",
        file,
        line: 26,
        image: "postgres",
        tag: "16",
        variables: ["POSTGRES_PASSWORD", "POSTGRES_DB"],
      },
      { ...service, name: "worker", file, line: 33, root: true },
      { kind: "volume", ...docker, type: "compose-volume", name: "db-data", file, line: 41 },
      { kind: "volume", ...docker, type: "compose-network", name: "front", file, line: 43 },
      { kind: "volume", ...docker, type: "compose-network", name: "back", file, line: 44 },
      { kind: "secret", ...docker, type: "compose-secret", name: "db_password", file, line: 47 },
      { kind: "config", ...docker, type: "compose-config", name: "nginx_conf", file, line: 50 },
    ]);
  });

  test("never a value of the environment, a secret's file, a commented service, an extension field, a test", () => {
    noneOf(items, [
      "compose-value-never-kept",
      "compose-password-never-kept",
      "debug",
      "db_password.txt",
      "mailhog",
      "x-common",
      "unless-stopped",
      "test-service-never-read",
    ]);
  });

  test("the container side of a port, root from the user, an image's tag past a registry's port and placeholders", () => {
    assert.deepEqual(
      ["8080:80", "127.0.0.1:9229:9229/tcp", "3000-3005:3000-3005", "80", "[::1]:6001:6001", "${PORT}:8080"].map(
        containerPort,
      ),
      ["80", "9229", "3000", "80", "6001", "8080"],
    );
    const service = (yaml) => readYaml(yaml)[0];
    assert.equal(rootOf(service("user: root")), true);
    assert.equal(rootOf(service('user: "0:0"')), true);
    assert.equal(rootOf(service("user: node")), false);
    assert.equal(rootOf(service('user: "${UID}:${GID}"')), undefined);
    assert.equal(rootOf(service("user: node\nprivileged: true")), true);
    assert.equal(rootOf(service("image: x")), undefined);
    const digest = "sha256:" + "0f".repeat(32);
    const refs = {
      nginx: { image: "nginx" },
      "nginx:1.25": { image: "nginx", tag: "1.25" },
      "registry.example.test:5000/app": { image: "registry.example.test:5000/app" },
      "registry.example.test:5000/app:2": { image: "registry.example.test:5000/app", tag: "2" },
      [`app@${digest}`]: { image: "app" },
      [`app:1.0@${digest}`]: { image: "app", tag: "1.0" },
      "${REGISTRY:-docker.io}/app:${TAG:-1}": { image: "${REGISTRY:-docker.io}/app", tag: "${TAG:-1}" },
      "app@${DIGEST}": { image: "app" },
      // A registry's credentials (`user:password@host/…`): taken off with all before them, never read as a tag.
      "deploy:pw0rd@registry.example.test/app": { image: "registry.example.test/app" },
      "u:p/w@reg.example.test/img:1": { image: "reg.example.test/img", tag: "1" },
      [`u:p@reg.example.test/img:2@${digest}`]: { image: "reg.example.test/img", tag: "2" },
      "u:p@reg.example.test": { image: "reg.example.test" },
    };
    for (const [ref, expected] of Object.entries(refs)) {
      assert.deepEqual(imageOf(ref), expected, ref);
    }
  });

  test("a value built like a credential is never kept, a service named like one is written …", () => {
    const key = "AK" + "IA" + "Q3EGRZ7XN4MDP2LW";
    const dir = tree("doc-kit-infra-compose-", {
      "compose.yaml": [
        "services:",
        `  ${key}:`,
        "    image: nginx",
        "    environment:",
        `      - AWS_ACCESS_KEY_ID=${key}`,
        "  web:",
        "    environment:",
        `      AWS_SECRET: ${key}`,
      ].join("\n"),
    });
    try {
      const found = collectInfra(dir, [compose]);
      assert.deepEqual(
        found.map((i) => `${i.name} ${(i.variables || []).join(",")}`),
        ["… AWS_ACCESS_KEY_ID", "web AWS_SECRET"],
      );
      noneOf(found, [key]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the expressions of the adapters (their growth: infra-growth.test.mjs)", () => {
  test("Kubernetes, Helm and Compose declare their expressions", () => {
    for (const patterns of [KUBERNETES_PATTERNS, HELM_PATTERNS, COMPOSE_PATTERNS])
      assert.ok(Object.values(patterns).every((re) => re instanceof RegExp));
  });
});
