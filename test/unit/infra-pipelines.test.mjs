// The infra adapters of the pipelines and of the configuration (ARCHITECTURE.md §5, §6.9): GitHub Actions, GitLab
// CI, Azure Pipelines and Ansible, each on its fixture through the whitelist of the source `infra` (collectInfra):
// the items they give, the environments they deduce, never a value (of an `env`, a variable, a parameter, a `vars`),
// never a declaration in a comment, never a file of tests; then the forms each one reads, and a crafted file read at
// once — long runs, unclosed brackets and strings, deep nesting, many declarations and references.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { KIT_ROOT } from "../tools/helpers.mjs";
import { collectInfra, keptInfra } from "../../engine/facts/infra.mjs";
import githubActions, { GITHUB_ACTIONS_PATTERNS } from "../../adapters/infra/github-actions.mjs";
import gitlabCi, { GITLAB_CI_PATTERNS } from "../../adapters/infra/gitlab-ci.mjs";
import azurePipelines, { AZURE_PIPELINES_PATTERNS } from "../../adapters/infra/azure-pipelines.mjs";
import ansible, { ANSIBLE_PATTERNS } from "../../adapters/infra/ansible.mjs";

const FIXTURES = path.join(KIT_ROOT, "test", "fixtures", "infra");

/** The items of an adapter on files (relative path → text), each through the whitelist as the source keeps it. */
const kept = (adapter, files) =>
  adapter
    .infra({ sources: new Map(Object.entries(files)) })
    .map((r) => keptInfra(r, adapter.name))
    .filter(Boolean);

/** A fixture's items, checked to hold no value of its files (each one is written "do-not-keep…"). */
function fixture(name, adapter) {
  const items = collectInfra(path.join(FIXTURES, name), [adapter]);
  assert.doesNotMatch(JSON.stringify(items), /do-not-keep/);
  return items;
}

/** A token's shape, built here so that no file of the repository holds one. */
const TOKEN = "gh" + "p_" + "Zq8vN3kT6wP1xR4mY7bLc2Hd9sF0gJ5aQ1wE";

test("each adapter declares its expressions", () => {
  for (const patterns of [GITHUB_ACTIONS_PATTERNS, GITLAB_CI_PATTERNS, AZURE_PIPELINES_PATTERNS, ANSIBLE_PATTERNS])
    assert.ok(Object.isFrozen(patterns) && Object.values(patterns).every((re) => re instanceof RegExp));
  assert.ok(".github/workflows/deploy.yml".search(githubActions.files) !== -1);
  assert.equal(".github/dependabot.yml".search(githubActions.files), -1);
  for (const file of [
    "azure-pipelines.yml",
    "ci/azure-pipelines-pr.yaml",
    "web.azure-pipelines.yml",
    ".pipelines/a/b.yml",
  ])
    assert.ok(file.search(azurePipelines.files) !== -1, file);
  assert.equal("pipelines/build.yml".search(azurePipelines.files), -1);
});

describe("GitHub Actions", () => {
  const P = { provider: "github-actions" };
  const deploy = ".github/workflows/deploy.yml";
  const reusable = ".github/workflows/reusable-build.yml";

  test("each workflow, its jobs, the environments they deploy to and their images; names only; tests never read", () => {
    assert.deepEqual(fixture("github-actions", githubActions), [
      {
        kind: "pipeline",
        ...P,
        type: "workflow",
        name: "Deploy shop",
        file: deploy,
        line: 2,
        schedule: "0 3 * * 1-5",
        variables: ["NODE_VERSION", "SENTRY_DSN", "release"],
      },
      {
        kind: "job",
        ...P,
        type: "job",
        name: "build",
        file: deploy,
        line: 18,
        variables: ["DATABASE_URL", "NPM_TOKEN", "REGISTRY_PASSWORD"],
      },
      {
        kind: "image",
        ...P,
        type: "container",
        name: "build",
        file: deploy,
        line: 21,
        image: "node",
        tag: "20.11-bookworm",
      },
      {
        kind: "image",
        ...P,
        type: "service",
        name: "postgres",
        file: deploy,
        line: 27,
        image: "postgres",
        tag: "16-alpine",
      },
      { kind: "image", ...P, type: "service", name: "redis", file: deploy, line: 33, image: "redis" },
      {
        kind: "job",
        ...P,
        type: "job",
        name: "deploy-staging",
        file: deploy,
        line: 45,
        env: "staging",
        variables: ["DEPLOY_KEY", "STAGING_DEPLOY_KEY"],
      },
      { kind: "environment", ...P, type: "environment", name: "staging", file: deploy, line: 48, env: "staging" },
      {
        kind: "job",
        ...P,
        type: "job",
        name: "deploy-production",
        file: deploy,
        line: 53,
        env: "production",
        variables: ["DEPLOY_KEY", "PROD_DEPLOY_KEY"],
      },
      { kind: "environment", ...P, type: "environment", name: "production", file: deploy, line: 56, env: "production" },
      { kind: "job", ...P, type: "job", name: "smoke-production", file: deploy, line: 63, env: "production" },
      {
        kind: "pipeline",
        ...P,
        type: "workflow",
        name: "reusable-build.yml",
        file: reusable,
        line: 1,
        variables: ["target", "REGISTRY_TOKEN"],
      },
      {
        kind: "job",
        ...P,
        type: "job",
        name: "build",
        file: reusable,
        line: 11,
        variables: ["token", "REGISTRY_TOKEN"],
        source: "acme/platform/.github/workflows/build.yml@v2",
      },
    ]);
  });

  test("`on` as a list, a container as a string, an environment chosen by an expression; a credential never kept", () => {
    const items = kept(githubActions, {
      ".github/workflows/ci.yml": [
        "on: [push, pull_request]",
        "jobs:",
        "  test:",
        "    container: ghcr.io/acme/ci@sha256:" + "a".repeat(64),
        "    environment: ${{ inputs.target }}",
        "    env:",
        `      HOOK: ${TOKEN}`,
        `      ${TOKEN}: x`,
        "    steps:",
        `      - run: echo \${{ secrets.${TOKEN} }} \${{ needs.secrets.NOT_ONE }} \${{secrets.API_TOKEN}}`,
        "  release: { environment: { name: Prod }, runs-on: ubuntu-latest }",
        "  matrix: not a job",
      ].join("\n"),
    });
    assert.deepEqual(
      items.map((i) => [i.kind, i.name, i.env, i.image, i.tag, i.variables]),
      [
        ["pipeline", "ci.yml", undefined, undefined, undefined, undefined],
        ["job", "test", undefined, undefined, undefined, ["HOOK", "API_TOKEN"]],
        ["image", "test", undefined, "ghcr.io/acme/ci", undefined, undefined],
        ["job", "release", "production", undefined, undefined, undefined],
        ["environment", "Prod", "production", undefined, undefined, undefined],
      ],
    );
    assert.doesNotMatch(JSON.stringify(items), new RegExp(TOKEN));
  });
});

describe("GitLab CI", () => {
  const P = { provider: "gitlab" };
  const kubectl = { image: "registry.example.test:5000/acme/kubectl", tag: "1.30" };

  test("the pipeline, its local includes (a wildcard too), its jobs and stages through `extends`, environments, images", () => {
    assert.deepEqual(fixture("gitlab-ci", gitlabCi), [
      {
        kind: "pipeline",
        ...P,
        type: "pipeline",
        name: ".gitlab-ci.yml",
        file: ".gitlab-ci.yml",
        line: 2,
        variables: ["NODE_ENV", "DATABASE_URL"],
      },
      {
        kind: "image",
        ...P,
        type: "image",
        name: "default",
        file: ".gitlab-ci.yml",
        line: 12,
        image: "node",
        tag: "20.11-alpine",
      },
      {
        kind: "image",
        ...P,
        type: "service",
        name: "default",
        file: ".gitlab-ci.yml",
        line: 14,
        image: "postgres",
        tag: "16",
      },
      {
        kind: "image",
        ...P,
        type: "image",
        name: "build",
        file: ".gitlab-ci.yml",
        line: 25,
        image: "node",
        tag: "20.11-alpine",
      },
      {
        kind: "job",
        ...P,
        type: "build",
        name: "build",
        file: ".gitlab-ci.yml",
        line: 28,
        variables: ["NPM_CONFIG_CACHE", "NPM_TOKEN"],
      },
      { kind: "job", ...P, type: "deploy", name: "docs", file: ".gitlab-ci.yml", line: 44, source: "acme/docs" },
      {
        kind: "job",
        ...P,
        type: "deploy",
        name: "deploy_staging",
        file: "ci/deploy.yml",
        line: 4,
        env: "staging",
        variables: ["KUBE_CONTEXT"],
      },
      {
        kind: "environment",
        ...P,
        type: "environment",
        name: "staging",
        file: "ci/deploy.yml",
        line: 6,
        env: "staging",
      },
      {
        kind: "job",
        ...P,
        type: "deploy",
        name: "deploy_production",
        file: "ci/deploy.yml",
        line: 12,
        env: "production",
      },
      {
        kind: "environment",
        ...P,
        type: "environment",
        name: "production",
        file: "ci/deploy.yml",
        line: 14,
        env: "production",
      },
      { kind: "job", ...P, type: "deploy", name: "review", file: "ci/deploy.yml", line: 17 },
      {
        kind: "environment",
        ...P,
        type: "environment",
        name: "review/$CI_COMMIT_REF_SLUG",
        file: "ci/deploy.yml",
        line: 19,
      },
      {
        kind: "image",
        ...P,
        type: "image",
        name: "deploy_staging",
        file: "ci/templates/deploy.yml",
        line: 3,
        env: "staging",
        ...kubectl,
      },
      {
        kind: "image",
        ...P,
        type: "image",
        name: "deploy_production",
        file: "ci/templates/deploy.yml",
        line: 3,
        env: "production",
        ...kubectl,
      },
      { kind: "image", ...P, type: "image", name: "review", file: "ci/templates/deploy.yml", line: 3, ...kubectl },
      { kind: "job", ...P, type: "test", name: "unit", file: "ci/test.yml", line: 1 },
      {
        kind: "image",
        ...P,
        type: "image",
        name: "unit",
        file: "ci/test.yml",
        line: 3,
        image: "mcr.microsoft.com/playwright",
        tag: "v1.48.0-jammy",
      },
    ]);
  });

  test("includes: a string, `{ local }`, from a root's folder, each file once; never `..`, a URL or a file not included", () => {
    const items = kept(gitlabCi, {
      "api/.gitlab-ci.yml": "include: 'ci/a.yml'\nlint:\n  script: x\n",
      "api/ci/a.yml":
        "include:\n  - local: /ci/b.yml\n  - ../../secret.yml\n  - https://h.example.test/x.yml\na:\n  stage: x\n",
      "api/ci/b.yml": "include: { local: ci/a.yml }\nb:\n  stage: y\n",
      "secret.yml": "never:\n  script: x\n",
      "x.yml": "never:\n  script: x\n",
      "ci/b.yml": "never:\n  script: x\n",
    });
    assert.deepEqual(
      items.map((i) => `${i.kind} ${i.type} ${i.name} ${i.file}`),
      [
        "pipeline pipeline api/.gitlab-ci.yml api/.gitlab-ci.yml",
        "job job lint api/.gitlab-ci.yml",
        "job x a api/ci/a.yml",
        "job y b api/ci/b.yml",
      ],
    );
  });

  test("keywords, hidden templates and a cycle of `extends` are no jobs' stages; the header of inputs is no job", () => {
    const items = kept(gitlabCi, {
      ".gitlab-ci.yml": [
        "spec:",
        "  inputs:",
        "    target: { default: do-not-keep }",
        "---",
        "workflow: { rules: [{ when: always }] }",
        "variables: { A: do-not-keep }",
        "cache: { paths: [x] }",
        "before_script: [x]",
        ".a: { extends: .b }",
        ".b: { extends: .a }",
        "job: { extends: [.x, .a], environment: { name: Prod, url: do-not-keep }, script: x }",
        "alias: *base",
      ].join("\n"),
    });
    assert.deepEqual(
      items.map((i) => [i.kind, i.type, i.name, i.line, i.env, i.variables]),
      [
        ["pipeline", "pipeline", ".gitlab-ci.yml", 5, undefined, ["A"]],
        ["job", "job", "job", 11, "production", undefined],
        ["environment", "environment", "Prod", 11, "production", undefined],
      ],
    );
    assert.doesNotMatch(JSON.stringify(items), /do-not-keep/);
  });
});

describe("Azure Pipelines", () => {
  const P = { provider: "azure-devops" };

  test("each pipeline, its schedule, its stages' jobs (a conditional stage too), deployments and environments, images", () => {
    assert.deepEqual(fixture("azure-pipelines", azurePipelines), [
      { kind: "pipeline", ...P, type: "pipeline", name: "lint.yml", file: ".azure-pipelines/lint.yml", line: 1 },
      {
        kind: "pipeline",
        ...P,
        type: "pipeline",
        name: "nightly.yml",
        file: ".pipelines/nightly.yml",
        line: 1,
        schedule: "30 1 * * 1-5",
        variables: ["REPORT_BUCKET", "API_KEY"],
      },
      { kind: "job", ...P, type: "job", name: "Report", file: ".pipelines/nightly.yml", line: 11 },
      {
        kind: "image",
        ...P,
        type: "container",
        name: "Report",
        file: ".pipelines/nightly.yml",
        line: 13,
        image: "python",
        tag: "3.12-slim",
      },
      { kind: "job", ...P, type: "deployment", name: "Publish", file: ".pipelines/nightly.yml", line: 16, env: "qa" },
      {
        kind: "environment",
        ...P,
        type: "environment",
        name: "qa",
        file: ".pipelines/nightly.yml",
        line: 17,
        env: "qa",
      },
      {
        kind: "pipeline",
        ...P,
        type: "pipeline",
        name: "azure-pipelines.yml",
        file: "azure-pipelines.yml",
        line: 2,
        schedule: "0 2 * * *",
        variables: ["buildConfiguration", "connectionString", "deployProduction"],
      },
      {
        kind: "image",
        ...P,
        type: "container",
        name: "sdk",
        file: "azure-pipelines.yml",
        line: 26,
        image: "mcr.microsoft.com/dotnet/sdk",
        tag: "8.0",
      },
      {
        kind: "image",
        ...P,
        type: "container",
        name: "node",
        file: "azure-pipelines.yml",
        line: 28,
        image: "node",
        tag: "20.11",
      },
      {
        kind: "job",
        ...P,
        type: "job",
        name: "Compile",
        file: "azure-pipelines.yml",
        line: 39,
        variables: ["dotnetVersion"],
      },
      {
        kind: "job",
        ...P,
        type: "job",
        name: "Frontend",
        file: "azure-pipelines.yml",
        line: 43,
        variables: ["npm_config_cache", "dotnetVersion"],
      },
      {
        kind: "image",
        ...P,
        type: "container",
        name: "Frontend",
        file: "azure-pipelines.yml",
        line: 44,
        image: "node",
        tag: "20.11-alpine",
      },
      {
        kind: "job",
        ...P,
        type: "deployment",
        name: "DeployWeb",
        file: "azure-pipelines.yml",
        line: 55,
        env: "staging",
      },
      {
        kind: "environment",
        ...P,
        type: "environment",
        name: "staging",
        file: "azure-pipelines.yml",
        line: 56,
        env: "staging",
      },
      {
        kind: "job",
        ...P,
        type: "deployment",
        name: "DeployWebProd",
        file: "azure-pipelines.yml",
        line: 65,
        env: "production",
      },
      {
        kind: "environment",
        ...P,
        type: "environment",
        name: "prod",
        file: "azure-pipelines.yml",
        line: 66,
        env: "production",
      },
    ]);
  });

  test("jobs without stages, `${{ each }}` blocks, templates and groups skipped, an environment once per file, none an expression chooses", () => {
    const items = kept(azurePipelines, {
      "azure-pipelines.yml": [
        "extends:",
        "  template: templates/base.yml",
        "variables:",
        "  - template: vars.yml",
        "  - group: do-not-keep-group",
        "  - { name: region, value: do-not-keep }",
        "jobs:",
        "  - template: jobs/build.yml",
        "  - ${{ each env in parameters.envs }}:",
        "    - deployment: deploy_${{ env }}",
        "      environment: Production",
        "  - deployment: again",
        "    environment: { name: Production.vm1 }",
        "  - deployment: chosen",
        "    environment: ${{ parameters.env }}.webapp",
        "  - job: macro",
        "    environment: $(target)",
        "  - job: plain",
      ].join("\n"),
    });
    assert.deepEqual(
      items.map((i) => [i.kind, i.name, i.env, i.source, i.variables]),
      [
        ["pipeline", "azure-pipelines.yml", undefined, "templates/base.yml", ["region"]],
        ["job", "deploy_${{ env }}", "production", undefined, undefined],
        ["environment", "Production", "production", undefined, undefined],
        ["job", "again", "production", undefined, undefined],
        ["job", "chosen", undefined, undefined, undefined],
        ["job", "macro", undefined, undefined, undefined],
        ["job", "plain", undefined, undefined, undefined],
      ],
    );
    assert.doesNotMatch(JSON.stringify(items), /do-not-keep/);
  });
});

describe("Ansible", () => {
  const P = { provider: "ansible" };
  const role = (name, line, env) => ({ kind: "module", ...P, type: "role", name, file: "site.yml", line, env });

  test("each play, its environment (from its hosts, else its path), its variables' names, its roles once per file", () => {
    assert.deepEqual(fixture("ansible", ansible), [
      {
        kind: "job",
        ...P,
        type: "play",
        name: "Deploy the shop",
        file: "playbooks/deploy-uat.yml",
        line: 1,
        env: "uat",
      },
      {
        kind: "job",
        ...P,
        type: "play",
        name: "Web servers",
        file: "site.yml",
        line: 3,
        env: "production",
        variables: ["http_port", "db_password"],
      },
      role("common", 12, "production"),
      role("nginx", 13, "production"),
      role("geerlingguy.certbot", 16, "production"),
      role("shop-app", 19, "production"),
      role("migrations", 23, "production"),
      role("rollback", 27, "production"),
      {
        kind: "job",
        ...P,
        type: "play",
        name: "db-staging",
        file: "site.yml",
        line: 34,
        env: "staging",
        variables: ["admin_password"],
      },
      role("postgres", 41, "staging"),
    ]);
  });

  test("no playbook: a manifest naming hosts, a role's tasks, an inventory, an import of playbooks", () => {
    const play = "- hosts: web\n  tasks:\n    - name: x\n";
    assert.deepEqual(
      kept(ansible, {
        "k8s/ingress.yaml": "kind: Ingress\nspec:\n  tls:\n    - hosts: [shop.example.test]\n      secretName: tls\n",
        "roles/web/tasks/main.yml": play,
        "inventories/prod/hosts.yml": play,
        "group_vars/all.yml": play,
        "site.yml": "- import_playbook: web.yml\n- hosts: web\n",
      }),
      [],
    );
    const items = kept(ansible, {
      "deploy/staging/site.yml": [
        "- hosts: ['{{ target }}', db]",
        "  vars:",
        "    - { a: do-not-keep }",
        "    - b: do-not-keep",
        "  roles: [{ name: legacy }]",
        "- hosts: web:&qa",
        "  roles: [legacy]",
      ].join("\n"),
    });
    assert.deepEqual(
      items.map((i) => [i.kind, i.name, i.env, i.variables]),
      [
        ["job", "{{ target }}, db", "staging", ["a", "b"]],
        ["module", "legacy", "staging", undefined],
        ["job", "web:&qa", "qa", undefined],
      ],
    );
  });
});
