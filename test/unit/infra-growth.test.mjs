// The readers of the infrastructure files stay linear on what a crafted file holds (RULES.md S5): each input is built
// at a base size, then 4 and 16 times larger (assertLinear, test/tools/growth.mjs), no absolute time.
// test/tools/run-plan.mjs runs this file alone, after the others. The functional tests of these readers (what they
// find, what they leave out) stay in infra.test.mjs, infra-containers.test.mjs, infra-iac.test.mjs,
// infra-pipelines.test.mjs and yaml.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readYaml, at, text, items } from "../../engine/core/yaml.mjs";
import { jsonTree } from "../../engine/core/json-tree.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";
import dockerfile from "../../adapters/infra/dockerfile.mjs";
import kubernetes from "../../adapters/infra/kubernetes.mjs";
import helm from "../../adapters/infra/helm.mjs";
import compose from "../../adapters/infra/compose.mjs";
import terraform from "../../adapters/infra/terraform.mjs";
import bicep from "../../adapters/infra/bicep.mjs";
import arm from "../../adapters/infra/arm.mjs";
import cloudformation from "../../adapters/infra/cloudformation.mjs";
import githubActions from "../../adapters/infra/github-actions.mjs";
import gitlabCi from "../../adapters/infra/gitlab-ci.mjs";
import azurePipelines from "../../adapters/infra/azure-pipelines.mjs";
import ansible from "../../adapters/infra/ansible.mjs";
import { assertLinear, linearAt } from "../tools/growth.mjs";

/** `k` pieces of text, each made from its index. */
const list = (k, piece) => Array.from({ length: k }, (_, i) => piece(i)).join("");

describe("Dockerfile and YAML (engine/core/yaml.mjs, adapters/infra/dockerfile.mjs)", () => {
  // infra.test.mjs › "a crafted Dockerfile of 256 KB is read at once" (was under 1,000 ms each)
  test("a crafted Dockerfile: continuations, instructions, long words", () => {
    const shapes = {
      continuations: (n) => "FROM a\n" + "RUN x \\\n".repeat(n / 8),
      "long ENV": (n) => "FROM a\n" + "ENV " + "A=1 ".repeat(n / 4),
      "long word": (n) => "FROM " + "a".repeat(n),
      instructions: (n) => "FROM a\n" + "EXPOSE 1\n".repeat(n / 9),
      "colons in an image": (n) => "FROM a:b:c:d:e:f:g:h:i:j:k:l:m:n:o:p" + ":q".repeat(n / 2),
    };
    for (const [name, build] of Object.entries(shapes))
      assertLinear(`dockerfile ${name}`, {
        size: 15_625,
        build,
        run: (text) => dockerfile.infra({ sources: new Map([["Dockerfile", text]]) }),
      });
  });

  // yaml.test.mjs › "a billion laughs stays a few aliases" (nine levels, was under 50 ms)
  test("a billion laughs of N levels: a few aliases, read at once, nothing multiplied", () => {
    const { found } = linearAt("readYaml on a billion laughs", {
      size: 1,
      make: (n) => {
        const lines = ["a0: &a0 [lol, lol, lol, lol, lol, lol, lol, lol, lol, lol]"];
        for (let i = 1; i <= n; i++)
          lines.push(
            `a${i}: &a${i} [${Array(10)
              .fill(`*a${i - 1}`)
              .join(", ")}]`,
          );
        return { n, yaml: lines.join("\n") };
      },
      read: ({ n, yaml }) => ({ n, refs: items(at(readYaml(yaml)[0], `a${n}`)).map(text) }),
    });
    assert.deepEqual(found.refs, Array(10).fill(`*a${found.n - 1}`));
  });

  // yaml.test.mjs › "every shape of 200,000 characters is read in linear time (N, 4N, 16N)"
  test("every shape of the YAML reader's inputs", () => {
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
    for (const [name, build] of Object.entries(shapes))
      assertLinear(`readYaml ${name}`, { size: 12_500, build, run: (yaml) => readYaml(yaml) });
  });

  // yaml.test.mjs › "the JSON form" (50,000 and 200,000 brackets nested, was under 200 ms each)
  test("jsonTree: brackets nested far deeper than the bound", () => {
    assertLinear("jsonTree on nested brackets", {
      size: 12_500,
      build: (n) => "[".repeat(n) + "]".repeat(n),
      run: (json) => jsonTree(json),
    });
  });
});

/** A piece of text repeated to about `n` characters. */
const fill = (unit, n) => unit.repeat(Math.max(1, Math.round(n / unit.length)));

/**
 * Each shape read by the adapter at 12,500, 50,000 and 200,000 characters (assertLinear, test/tools/growth.mjs):
 * `shapes` gives each one's sources (a Map) for n characters.
 */
function linearShapes(adapter, shapes) {
  for (const [name, make] of Object.entries(shapes))
    linearAt(`${adapter.name} ${name}`, {
      size: 12_500,
      make,
      read: (sources) => adapter.infra({ sources }).length,
    });
}

describe("Kubernetes, Helm and Compose (RULES.md S5)", () => {
  test("Kubernetes: documents, containers, variables, lists, nesting, unclosed brackets and quotes, paths", () => {
    const one = (text) => new Map([["k8s/deployment.yaml", text]]);
    const pod = "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: a\nspec:\n  template:\n    spec:\n";
    const containers = `${pod}      containers:\n`;
    linearShapes(kubernetes, {
      documents: (n) =>
        one(fill("apiVersion: v1\nkind: Service\nmetadata:\n  name: a\nspec: {ports: [{port: 1}]}\n---\n", n)),
      containers: (n) =>
        one(containers + fill("      - name: a\n        image: x:1\n        ports: [{containerPort: 1}]\n", n)),
      variables: (n) =>
        one(`${containers}      - name: a\n        env:\n${fill("          - name: A\n            value: b\n", n)}`),
      list: (n) =>
        one(
          "apiVersion: v1\nkind: List\nitems:\n" +
            fill("  - apiVersion: v1\n    kind: Pod\n    spec: {containers: [{image: a}]}\n", n),
        ),
      nesting: (n) =>
        one(pod + Array.from({ length: Math.sqrt(2 * n) }, (_, i) => `${" ".repeat(i + 6)}k${i}:`).join("\n")),
      unclosedFlow: (n) => one(`${pod}      containers: [${fill("{image: a, ports: [", n)}`),
      unclosedQuote: (n) => one(`${containers}      - image: "${fill('a\\"', n)}`),
      image: (n) => one(`${containers}      - image: ${fill("a:${/", n)}`),
      securityContext: (n) => one(`${pod}      securityContext:\n${fill("        runAsUser: 0\n", n)}`),
      kinds: (n) => one(fill("apiVersion: v1\nkind: Deployment\n---\n", n)),
      longLine: (n) => one(`apiVersion: ${"a".repeat(n)}\nkind: Pod`),
      paths: (n) =>
        new Map(
          Array.from({ length: n / 100 }, (_, i) => [
            `${"d/".repeat(40)}${i % 2 ? "Chart" : `x${i}`}.yaml`,
            "apiVersion: v1\nkind: Pod\n",
          ]),
        ),
      templates: (n) =>
        new Map([[`${"templates/".repeat(20)}x.yaml`, `apiVersion: v1\nkind: Pod\n${fill("{{ x }}\n", n)}`]]),
    });
  });

  test("Helm: components, dependencies, many charts, nesting, unclosed brackets, long scalars", () => {
    const values = (text) =>
      new Map([
        ["chart/Chart.yaml", "apiVersion: v2\nname: c\n"],
        ["chart/values.yaml", text],
      ]);
    const component =
      "c:\n  image:\n    repository: r\n    tag: t\n  replicaCount: 1\n  ingress:\n    enabled: true\n    tls: [a]\n  service:\n    type: X\n    port: 1\n";
    linearShapes(helm, {
      components: (n) => values(fill(component, n)),
      dependencies: (n) =>
        new Map([
          [
            "chart/Chart.yaml",
            `name: c\ndependencies:\n${fill("  - name: a\n    version: 1\n    repository: r\n", n)}`,
          ],
        ]),
      charts: (n) =>
        new Map(
          Array.from({ length: n / 60 }, (_, i) => [
            [`c${i}/Chart.yaml`, "name: a\n"],
            [`c${i}/values.yaml`, "replicaCount: 1\n"],
          ]).flat(),
        ),
      nesting: (n) => values(Array.from({ length: Math.sqrt(2 * n) }, (_, i) => `${" ".repeat(i)}image:`).join("\n")),
      unclosed: (n) => values(`image: {repository: [${fill("{a: [", n)}`),
      longScalar: (n) => values(`image:\n  repository: ${"a".repeat(n)}\n  tag: ${"1".repeat(n)}`),
      keys: (n) => values(fill("replicaCount: 1\n", n)),
    });
  });

  test("Compose: services, ports, colons, environments, top-level names, unclosed brackets, users", () => {
    const one = (text) => new Map([["docker-compose.yml", text]]);
    const service = "services:\n  s:\n";
    linearShapes(compose, {
      services: (n) =>
        one(
          `services:\n${fill("  s:\n    image: a:b\n    ports: ['1:2']\n    environment: [A=1]\n    user: root\n", n)}`,
        ),
      ports: (n) => one(`${service}    ports:\n${fill("      - '1:2:3:4/tcp'\n", n)}`),
      colons: (n) => one(`${service}    ports:\n      - ${fill(":-", n)}\n    image: ${fill("${:/", n)}`),
      environmentList: (n) => one(`${service}    environment:\n${fill("      - A=1=2\n", n)}`),
      environmentMap: (n) => one(`${service}    environment:\n${fill("      A: b\n", n)}`),
      volumes: (n) => one(`volumes:\n${fill("  v:\n", n)}networks:\n${fill("  n:\n", n)}`),
      unclosed: (n) => one(`services: {s: {image: [${fill("[", n)}`),
      users: (n) => one(`${service}    user: ${fill(":", n)}`),
      documents: (n) => one(fill("services:\n  s:\n    image: a\n---\n", n)),
    });
  });
});

describe("the infrastructure as code (RULES.md S5)", () => {
  /** `k` copies of `unit(i)`, joined. */
  const list = (k, unit) => Array.from({ length: Math.ceil(k) }, (_, i) => unit(i)).join("");

  /** The base size of each shape: it is then built 4 and 16 times larger (about 200,000 characters). */
  const SIZE = 12_500;

  /**
   * Each shape read by the adapter as `file` at N, 4N and 16N (assertLinear), MAX_ITEMS items at most; the files
   * the kit reads stay under 512 KB, so the three first sizes are checked to.
   */
  function linear(adapter, file, shapes) {
    for (const [name, build] of Object.entries(shapes))
      assertLinear(`${adapter.name} ${name}`, {
        size: SIZE,
        build: (n) => {
          const text = build(n);
          if (n <= 16 * SIZE) assert.ok(text.length < 512 * 1024, `${name}: ${text.length}`);
          return text;
        },
        run: (text) => assert.ok(adapter.infra({ sources: new Map([[file, text]]) }).length <= MAX_ITEMS),
      });
  }

  test("Terraform: strings, templates, heredocs, comments, brackets, many blocks and references", () => {
    linear(terraform, "main.tf", {
      "unclosed quotes": (n) => '"'.repeat(n),
      "templates never closed": (n) => '"${'.repeat(n / 3),
      "templates closed": (n) => list(n / 30, () => 'a = "${"${"x"}"}${b}" # c\n'),
      "heredoc never closed": (n) => "x = <<EOF\n" + "line\n".repeat(n / 5),
      "heredoc openers": (n) => "x = <<EOF\n".repeat(n / 10),
      "no heredoc after <<": (n) => "<<a ".repeat(n / 4),
      "block comments": (n) => "/*".repeat(n / 2),
      "line comments": (n) => "#\n//\n".repeat(n / 5),
      "open braces": (n) => "{".repeat(n),
      "close braces": (n) => "}".repeat(n),
      "brackets then objects": (n) => "[".repeat(n / 2) + "{}".repeat(n / 4),
      "nested blocks never closed": (n) =>
        'resource "aws_security_group" "a" {\n' + 'ingress {\ncidr_blocks = ["0.0.0.0/0"]\n'.repeat(n / 40),
      "resources × references": (n) =>
        list(
          n / 150,
          (i) =>
            `resource "aws_security_group" "r${i}" {\n  ingress { cidr_blocks = [aws_vpc.v${i}.cidr, "0.0.0.0/0"] security_groups = [aws_security_group.r${i ? i - 1 : 0}.id] }\n}\n`,
        ),
      "module inputs": (n) => 'module "m" {\nsource = "x"\n' + "a = 1\n".repeat(n / 6),
      "required providers": (n) => "terraform {\nrequired_providers {\n" + list(n / 20, (i) => `p${i} = "1.0"\n`),
      ranges: (n) => 'resource "a_b" "c" {\ncidr_blocks = [' + '"0.0.0.0/0",'.repeat(n / 12),
      "a long identifier": (n) => "a".repeat(n),
    });
  });

  test("Bicep: strings, templates, comments, nested bodies, loops, decorators, many declarations", () => {
    linear(bicep, "main.bicep", {
      quotes: (n) => "'".repeat(n),
      "templates never closed": (n) => "'${".repeat(n / 3),
      "multi-line strings never closed": (n) => "'''" + "x\n".repeat(n / 2),
      "block comments": (n) => "/*".repeat(n / 2),
      "nested resources": (n) =>
        "resource a 'Microsoft.Web/sites@2022-03-01' = {\n" + "resource b 'config' = {\n".repeat(n / 25),
      "loops never closed": (n) => "resource a 'T@v' = [for i in x: {\n".repeat(n / 35),
      "decorators never closed": (n) => "@a(".repeat(n / 3),
      "declarations never ended": (n) => "resource a 'T@v' = (".repeat(n / 20),
      "module params": (n) => "module m 'x' = {\nparams: {\n" + "a: 1\n".repeat(n / 5),
      ranges: (n) => "resource a 'T@v' = {\nproperties: {\n" + "sourceAddressPrefix: '*'\n".repeat(n / 25),
      "brackets then objects": (n) => "[".repeat(n / 2) + "{}".repeat(n / 4),
      "resources × references": (n) =>
        list(
          n / 200,
          (i) =>
            `resource r${i} 'Microsoft.Network/networkSecurityGroups@2023-04-01' = {\n  name: 'n${i}'\n  properties: { securityRules: [ { properties: { sourceAddressPrefix: r${i}.x, direction: 'Inbound' } } ] }\n}\n`,
        ),
    });
  });

  test("ARM: nested resources, many rules, deep properties, comments, long strings", () => {
    const head = '{"$schema":"https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",';
    const rule =
      '{"type":"Microsoft.Network/networkSecurityGroups","properties":{"securityRules":[{"properties":{"sourceAddressPrefix":"*","direction":"Inbound"}}]}}';
    linear(arm, "azuredeploy.json", {
      "nested resources": (n) => {
        const k = Math.ceil(n / 32);
        return `${head}"resources":[` + '{"type":"a/b","resources":['.repeat(k) + "]}".repeat(k) + "]}";
      },
      "many rules": (n) =>
        `${head}"resources":[` + Array.from({ length: Math.ceil(n / rule.length) }, () => rule).join(",") + "]}",
      "deep properties": (n) => {
        const k = Math.ceil(n / 6);
        return `${head}"resources":[{"type":"x/y","properties":` + '{"a":'.repeat(k) + "1" + "}".repeat(k) + "}]}";
      },
      "deep lists": (n) =>
        `${head}"resources":[{"type":"x/y","properties":` + "[".repeat(n / 2) + "]".repeat(n / 2) + "}]}",
      "many parameters": (n) =>
        `${head}"parameters":{` +
        Array.from({ length: Math.ceil(n / 25) }, (_, i) => `"p${i}":{"type":"string"}`).join(",") +
        "}}",
      "a long string": (n) => `${head}"resources":[{"type":"` + "a".repeat(n) + '"}]}',
      "block comments": (n) => "/*".repeat(n / 2),
      "line comments": (n) => "//\n".repeat(n / 3),
      quotes: (n) => '"'.repeat(n),
      "open brackets": (n) => "[{".repeat(n / 2),
    });
  });

  test("CloudFormation: many resources and tags (YAML, JSON), deep properties, many events, parameters", () => {
    const group = (i) =>
      `  R${i}:\n    Type: AWS::EC2::SecurityGroup\n    Properties:\n      SecurityGroupIngress:\n        - CidrIp: 0.0.0.0/0\n`;
    const tagged = (i) =>
      `  R${i}:\n    Type: AWS::EC2::SecurityGroup\n    Properties:\n      GroupName: !Sub "\${AWS::StackName}-${i}"\n      SecurityGroupIngress:\n        - CidrIp: !Ref P${i}\n          SourceSecurityGroupId: !GetAtt R${i ? i - 1 : 0}.GroupId\n`;
    linear(cloudformation, "template.yaml", {
      "many resources": (n) => "Resources:\n" + list(n / 110, group),
      "many tags and references": (n) => "AWSTemplateFormatVersion: x\nResources:\n" + list(n / 200, tagged),
      "many resources, JSON": (n) =>
        '{"Resources":{' +
        Array.from(
          { length: Math.ceil(n / 110) },
          (_, i) =>
            `"R${i}":{"Type":"AWS::EC2::SecurityGroup","Properties":{"SecurityGroupIngress":[{"CidrIp":"0.0.0.0/0"}]}}`,
        ).join(",") +
        "}}",
      "deep properties, JSON": (n) => {
        const k = Math.ceil(n / 6);
        return (
          '{"Resources":{"R":{"Type":"AWS::S3::Bucket","Properties":' + '{"a":'.repeat(k) + "1" + "}".repeat(k) + "}}}"
        );
      },
      "deep properties, YAML": (n) =>
        "Resources:\n  R:\n    Type: AWS::S3::Bucket\n    Properties:\n" +
        list(n / 140, (i) => `${" ".repeat(6 + (i % 60) * 2)}a${i}:\n`),
      "many events": (n) =>
        "Resources:\n  F:\n    Type: AWS::Serverless::Function\n    Properties:\n      Events:\n" +
        list(n / 40, (i) => `        E${i}:\n          Type: Api\n`),
      "many parameters": (n) =>
        "AWSTemplateFormatVersion: x\nParameters:\n" + list(n / 25, (i) => `  P${i}:\n    Type: String\n`),
      "the marker repeated": (n) => "AWS::A::".repeat(n / 8),
      "open brackets": (n) => "{".repeat(n),
    });
  });
});

describe("the readers of the pipelines and of the configuration (RULES.md S5)", () => {
  const READERS = [
    [githubActions, ".github/workflows/x.yml"],
    [gitlabCi, ".gitlab-ci.yml"],
    [azurePipelines, "azure-pipelines.yml"],
    [ansible, "site.yml"],
  ];
  const read = (adapter, sources) => adapter.infra({ sources }).length;
  /** The base size of the shapes of characters: it is then built 4 and 16 times larger (200,000 characters). */
  const SIZE = 12_500;

  /** The crafted files of n characters: long runs, unclosed brackets and strings, deep nesting, many declarations. */
  const textsOf = (n) => {
    const deep = (unit) =>
      Array.from({ length: Math.max(1, Math.round(Math.sqrt(2 * n))) }, (_, i) => " ".repeat(i) + unit).join("\n");
    return [
      "a".repeat(n),
      " ".repeat(n) + "x:",
      "- ".repeat(n / 2),
      "[".repeat(n),
      "{".repeat(n),
      'name: "' + "a".repeat(n),
      "name: '" + "a\\".repeat(n / 2),
      "#".repeat(n),
      "x: |\n" + "  ${{ secrets.A }}\n".repeat(n / 20),
      "${{ secrets.".repeat(n / 12),
      deep("a:"),
      deep("- a:"),
      deep("- hosts: a\n" + "  block:"),
      "jobs:\n" + list(n / 40, (i) => `  j${i}: { environment: e${i}, stage: s }\n`),
      list(n / 40, (i) => `- hosts: h${i}\n  roles: [r${i}]\n`),
      "stages:\n" + list(n / 60, (i) => `- \${{ if a }}:\n  - stage: s${i}\n    jobs: [{ job: j${i} }]\n`),
      "include:\n" + list(n / 20, () => "  - local: '*/*.yml'\n"),
    ];
  };

  // The old test: "long runs, unclosed brackets and strings, deep nesting, many declarations: under a second each".
  test("long runs, unclosed brackets and strings, deep nesting, many declarations", () => {
    for (const [adapter, file] of READERS)
      for (const [i, sample] of textsOf(SIZE).entries())
        assertLinear(`${adapter.name} on ${JSON.stringify(sample.slice(0, 30))}`, {
          size: SIZE,
          build: (n) => textsOf(n)[i],
          run: (text) => read(adapter, new Map([[file, text]])),
        });
  });

  /**
   * Reads a shape built for K (the one of the old test: K, K·step, K·step² — its text four times longer each time):
   * the text grows as K for a step of 4 and as K² for a step of 2 (K files of K lines, K lines of K), so n is the text
   * and K its root in the second case. MAX_ITEMS items at most; each file under 512 KB at the three first sizes.
   */
  function grows(adapter, name, k0, step, build) {
    const size = step === 2 ? k0 * k0 : k0;
    linearAt(`${adapter.name} ${name}`, {
      size,
      make: (n) => {
        const sources = new Map(build(step === 2 ? Math.round(Math.sqrt(n)) : n));
        if (n <= 16 * size)
          for (const [file, text] of sources) assert.ok(text.length < 512 * 1024, `${name}: ${file}, ${text.length}`);
        return sources;
      },
      read: (sources) => assert.ok(read(adapter, sources) <= MAX_ITEMS, `${name}: more than MAX_ITEMS items`),
    });
  }

  test("GitHub Actions: K jobs, K secrets read by a job, K jobs of K services and K secrets", () => {
    const file = ".github/workflows/x.yml";
    grows(githubActions, "jobs", 400, 4, (k) => [
      [file, "jobs:\n" + list(k, (i) => `  j${i}:\n    environment: e${i}\n    container: i${i}:1\n`)],
    ]);
    grows(githubActions, "secrets", 500, 4, (k) => [
      [file, "jobs:\n  a:\n    steps:\n" + list(k, (i) => `      - run: \${{ secrets.S${i} }} secrets.T${i}\n`)],
    ]);
    grows(githubActions, "services × secrets", 20, 2, (k) => [
      [
        file,
        "jobs:\n" +
          list(
            k,
            (i) =>
              `  j${i}:\n    services:\n${list(k, (j) => `      s${j}: { image: x }\n`)}    env:\n${list(k, (j) => `      A${j}: \${{ secrets.S${j} }}\n`)}`,
          ),
      ],
    ]);
  });

  test("GitLab CI: K files including one another, K wildcards, K jobs extending a long chain or a large template", () => {
    grows(gitlabCi, "includes", 30, 2, (k) => [
      [".gitlab-ci.yml", "include:\n" + list(k, (i) => `  - local: f${i}.yml\n`)],
      ...Array.from({ length: k }, (_, i) => [
        `f${i}.yml`,
        `include:\n${list(k, (j) => `  - f${j}.yml\n`)}j${i}:\n  stage: s\n`,
      ]),
    ]);
    grows(gitlabCi, "wildcards", 20, 2, (k) => [
      [".gitlab-ci.yml", "include:\n" + list(k * k, () => "  - local: 'ci/*.yml'\n")],
      ...Array.from({ length: k }, (_, i) => [`ci/f${i}.yml`, `j${i}:\n  script: x\n`]),
    ]);
    grows(gitlabCi, "extends", 300, 4, (k) => [
      [
        ".gitlab-ci.yml",
        list(k, (i) => `.t${i}:\n  extends: .t${i + 1}\n`) + list(k, (i) => `j${i}:\n  extends: [.x, .t0]\n`),
      ],
    ]);
    grows(gitlabCi, "large template", 300, 4, (k) => [
      [
        ".gitlab-ci.yml",
        `.big:\n${list(k, (i) => `  k${i}: v\n`)}  services:\n${list(k, (i) => `    - s${i}\n`)}` +
          list(k, (i) => `j${i}:\n  extends: .big\n`),
      ],
    ]);
  });

  test("Azure Pipelines: K stages of K jobs and K variables, K container aliases, nested blocks", () => {
    const file = "azure-pipelines.yml";
    grows(azurePipelines, "stages × jobs", 16, 2, (k) => [
      [
        file,
        "stages:\n" +
          list(
            k,
            (i) =>
              `  - stage: s${i}\n    variables:\n${list(k, (j) => `      v${j}: x\n`)}    jobs:\n${list(k, (j) => `      - deployment: d${j}\n        environment: e${j}.r\n        container: c${j}\n`)}`,
          ),
      ],
    ]);
    grows(azurePipelines, "aliases", 250, 4, (k) => [
      [
        file,
        `resources:\n  containers:\n${list(k, (i) => `    - container: c${i}\n      image: i${i}:1\n`)}jobs:\n` +
          list(k, (i) => `  - job: j${i}\n    container: c${i}\n`),
      ],
    ]);
    grows(azurePipelines, "blocks", 300, 4, (k) => [
      [file, "jobs:\n" + list(k, (i) => `  - \${{ if a }}:\n    - \${{ each b in c }}:\n      - job: j${i}\n`)],
    ]);
  });

  test("Ansible: K plays of K roles, K tasks in blocks, K hosts", () => {
    grows(ansible, "plays × roles", 40, 2, (k) => [
      ["site.yml", list(k, (i) => `- hosts: h${i}_prod\n  roles:\n${list(k, (j) => `    - r${j}\n`)}`)],
    ]);
    grows(ansible, "tasks", 250, 4, (k) => [
      [
        "site.yml",
        "- hosts: a\n  tasks:\n" +
          list(k, (i) => `    - block:\n        - include_role: { name: r${i} }\n      rescue:\n        - debug: x\n`),
      ],
    ]);
    grows(ansible, "hosts", 1000, 4, (k) => [
      [
        "site.yml",
        `- hosts: [${list(k, (i) => `h${i}_stg, `)}]\n  tasks: []\n- hosts: ${"a:&!".repeat(k)}\n  roles: []\n`,
      ],
    ]);
  });
});
