// The infra adapters of infrastructure as code (ARCHITECTURE.md §5, §6.9): Terraform, Bicep, ARM templates and
// CloudFormation (and SAM), each on its fixture through the `infra` source's whitelist (collectInfra): the exact items,
// the environment from the path, the open address ranges; what is never read (a comment, a string, a heredoc, a
// .tfvars or .bicepparam file, a parameters file, a CDK assembly, a test folder); no value kept (a default, an
// environment variable's value, a credential in a source); and the linearity of every reader on crafted files of
// 200,000 characters (RULES.md S5).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";
import { collectInfra } from "../../engine/facts/infra.mjs";
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";
import terraform, { terraformBlocks, TERRAFORM_PATTERNS } from "../../adapters/infra/terraform.mjs";
import bicep, { bicepDeclarations, BICEP_PATTERNS } from "../../adapters/infra/bicep.mjs";
import arm, { armTemplate, ARM_PATTERNS } from "../../adapters/infra/arm.mjs";
import { jsonTree, withoutJsonComments } from "../../engine/core/json-tree.mjs";
import cloudformation, {
  cloudformationTemplate,
  CLOUDFORMATION_PATTERNS,
} from "../../adapters/infra/cloudformation.mjs";
import { readYaml } from "../../engine/core/yaml.mjs";

const FIXTURES = path.join(KIT_ROOT, "test", "fixtures", "infra");

/** The items of an adapter on its fixture, as the source keeps them. */
const fixture = (adapter) => collectInfra(path.join(FIXTURES, adapter.name), [adapter]);

/** Writes files (relative path → text) under a new temporary folder; returns it. */
function tree(files) {
  const dir = tempDir("doc-kit-infra-iac-");
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

/** The items of an adapter on files written for the test (the folder removed after). */
function written(adapter, files) {
  const dir = tree(files);
  try {
    return collectInfra(dir, [adapter]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Asserts that none of `values` appears in what was kept. */
function nothingOf(items, values) {
  const kept = JSON.stringify(items);
  for (const v of values) assert.ok(!kept.includes(v), `${v} was kept`);
}

/** Credential-shaped values, built at run time (never written as literals). */
const TOKEN = "gh" + "p_" + "Zq8vN3kT6wP1xR4mY7bLc2Hd9sF0gJ5aQ1wE";
const KEY = "AK" + "IA" + "Z7Q4X9W2V8N3M5K1";

test("each adapter declares its expressions, frozen", () => {
  for (const patterns of [TERRAFORM_PATTERNS, BICEP_PATTERNS, ARM_PATTERNS, CLOUDFORMATION_PATTERNS])
    assert.ok(Object.isFrozen(patterns) && Object.values(patterns).every((re) => re instanceof RegExp));
});

describe("Terraform", () => {
  test("its blocks: resources and data, modules, providers and their versions, variables, outputs; open ranges", () => {
    assert.deepEqual(fixture(terraform), [
      {
        kind: "module",
        provider: "terraform",
        type: "module",
        name: "app",
        file: "envs/prod/main.tf",
        line: 1,
        env: "production",
        variables: ["environment", "replicas"],
        source: "../../modules/app",
      },
      {
        kind: "module",
        provider: "terraform",
        type: "module",
        name: "network",
        file: "envs/prod/main.tf",
        line: 8,
        env: "production",
        source: "git::https://git.example.test/acme/terraform-modules.git//network?ref=v1.2.0",
      },
      {
        kind: "module",
        provider: "terraform",
        type: "module",
        name: "archive",
        file: "envs/prod/main.tf",
        line: 12,
        env: "production",
        source: "s3::https://s3-eu-west-1.amazonaws.com/acme-modules/archive.zip",
      },
      {
        kind: "resource",
        provider: "azurerm",
        type: "azurerm_network_security_rule",
        name: "https_in",
        file: "envs/prod/main.tf",
        line: 16,
        env: "production",
        openToAll: true,
      },
      {
        kind: "resource",
        provider: "azurerm",
        type: "azurerm_network_security_rule",
        name: "all_out",
        file: "envs/prod/main.tf",
        line: 28,
        env: "production",
        openToAll: false,
      },
      {
        kind: "resource",
        provider: "azurerm",
        type: "azurerm_network_security_group",
        name: "deny_all",
        file: "envs/prod/main.tf",
        line: 40,
        env: "production",
        openToAll: false,
      },
      {
        kind: "provider",
        provider: "aws",
        type: "required_provider",
        name: "aws",
        file: "main.tf",
        line: 6,
        source: "hashicorp/aws",
        version: "5.31.0",
      },
      {
        kind: "provider",
        provider: "azurerm",
        type: "required_provider",
        name: "azurerm",
        file: "main.tf",
        line: 10,
        source: "hashicorp/azurerm",
        version: "~> 3.90",
      },
      {
        kind: "provider",
        provider: "random",
        type: "required_provider",
        name: "random",
        file: "main.tf",
        line: 14,
        version: "3.6.0",
      },
      { kind: "provider", provider: "aws", type: "provider", name: "aws", file: "main.tf", line: 23 },
      { kind: "resource", provider: "aws", type: "data.aws_ami", name: "ubuntu", file: "main.tf", line: 27 },
      { kind: "resource", provider: "aws", type: "aws_s3_bucket", name: "assets", file: "main.tf", line: 32 },
      {
        kind: "resource",
        provider: "aws",
        type: "aws_security_group",
        name: "web",
        file: "main.tf",
        line: 39,
        openToAll: true,
      },
      {
        kind: "resource",
        provider: "aws",
        type: "aws_security_group",
        name: "admin",
        file: "main.tf",
        line: 58,
        openToAll: false,
      },
      {
        kind: "resource",
        provider: "aws",
        type: "aws_security_group_rule",
        name: "metrics_out",
        file: "main.tf",
        line: 78,
        openToAll: false,
      },
      { kind: "resource", provider: "aws", type: "aws_instance", name: "web", file: "main.tf", line: 87 },
      {
        kind: "module",
        provider: "terraform",
        type: "module",
        name: "vpc",
        file: "main.tf",
        line: 98,
        variables: ["name", "cidr", "azs", "private_subnets"],
        source: "terraform-aws-modules/vpc/aws",
        version: "5.5.1",
      },
      {
        kind: "variable",
        provider: "terraform",
        type: "variable",
        name: "environment",
        file: "modules/app/main.tf",
        line: 1,
      },
      {
        kind: "variable",
        provider: "terraform",
        type: "variable",
        name: "replicas",
        file: "modules/app/main.tf",
        line: 5,
      },
      {
        kind: "resource",
        provider: "kubernetes",
        type: "kubernetes_deployment",
        name: "app",
        file: "modules/app/main.tf",
        line: 10,
      },
      {
        kind: "resource",
        provider: "google",
        type: "google_compute_firewall",
        name: "public",
        file: "modules/app/main.tf",
        line: 31,
        openToAll: true,
      },
      {
        kind: "resource",
        provider: "google",
        type: "google_compute_firewall",
        name: "block_all",
        file: "modules/app/main.tf",
        line: 42,
        openToAll: false,
      },
      { kind: "output", provider: "terraform", type: "output", name: "bucket_arn", file: "outputs.tf", line: 1 },
      { kind: "output", provider: "terraform", type: "output", name: "db_connection", file: "outputs.tf", line: 5 },
      { kind: "variable", provider: "terraform", type: "variable", name: "region", file: "variables.tf", line: 1 },
      { kind: "variable", provider: "terraform", type: "variable", name: "environment", file: "variables.tf", line: 6 },
      {
        kind: "variable",
        provider: "terraform",
        type: "variable",
        name: "db_password",
        file: "variables.tf",
        line: 11,
      },
    ]);
  });

  test("no value kept: defaults, a .tfvars file, inputs, an output's value, a source's credentials; tests/ never read", () => {
    nothingOf(fixture(terraform), [
      "fixture-default-not-kept",
      "tfvars-value-not-kept",
      "eu-west-3",
      "fixture-id-not-kept",
      "fixture-secret-not-kept",
      "fixture-env-value-not-kept",
      "10.20.0.0/16",
      "postgres://",
      "never-read",
      "test_only",
    ]);
    for (const f of ["terraform.tfvars", "prod.auto.tfvars", "main.tf.json"])
      assert.equal(terraform.files.test(f), false);
    const items = written(terraform, {
      "main.tf": [
        'variable "token" {',
        `  default = "${TOKEN}"`,
        "}",
        'module "private" {',
        `  source = "git::https://deploy:${TOKEN}@git.example.test/acme/private.git"`,
        `  key    = "${KEY}"`,
        "}",
      ].join("\n"),
    });
    assert.deepEqual(
      items.map((i) => `${i.kind} ${i.name} ${i.source ?? ""}`.trim()),
      ["variable token", "module private git::https://git.example.test/acme/private.git"],
    );
    nothingOf(items, [TOKEN, KEY]);
  });

  test("a declaration in a comment, a string, a template or a heredoc is none", () => {
    const text = [
      '# resource "aws_s3_bucket" "hash" {}',
      '// resource "aws_s3_bucket" "slashes" {}',
      '/* variable "block" {} */',
      "locals {",
      '  note = "resource \\"aws_s3_bucket\\" \\"in_string\\" {"',
      '  tpl  = "${jsonencode({ a = "}" })} and $${literal} %{ if true }x%{ endif }"',
      "}",
      'resource "aws_iam_policy" "real" {',
      "  policy = <<-EOF",
      '    resource "aws_s3_bucket" "in_heredoc" {',
      "    }",
      "  EOF",
      "}",
      'output "after" {}',
    ].join("\n");
    assert.deepEqual(
      terraformBlocks(text, "main.tf").map((i) => `${i.kind} ${i.type} ${i.name} ${i.line}`),
      ["resource aws_iam_policy real 8", "output output after 14"],
    );
  });

  test("a file of many declarations gives MAX_ITEMS items at most", () => {
    const text = Array.from({ length: MAX_ITEMS + 1000 }, (_, i) => `variable "v${i}" {}\n`).join("");
    assert.equal(terraform.infra({ sources: new Map([["main.tf", text]]) }).length, MAX_ITEMS);
  });
});

describe("Bicep", () => {
  test("its declarations: resources (existing, conditions, loops, children), modules, params, outputs; open rules", () => {
    assert.deepEqual(fixture(bicep), [
      { kind: "variable", provider: "bicep", type: "param", name: "location", file: "main.bicep", line: 5 },
      { kind: "variable", provider: "bicep", type: "param", name: "adminPassword", file: "main.bicep", line: 8 },
      { kind: "variable", provider: "bicep", type: "param", name: "skuName", file: "main.bicep", line: 14 },
      { kind: "variable", provider: "bicep", type: "param", name: "deployNsg", file: "main.bicep", line: 16 },
      { kind: "variable", provider: "bicep", type: "param", name: "storageName", file: "main.bicep", line: 17 },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Storage/storageAccounts",
        name: "stshopassets",
        file: "main.bicep",
        line: 24,
        version: "2023-01-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Storage/storageAccounts/blobServices",
        name: "default",
        file: "main.bicep",
        line: 33,
        version: "2023-01-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Storage/storageAccounts",
        name: "logs",
        file: "main.bicep",
        line: 38,
        version: "2023-01-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/virtualNetworks",
        name: "vnet-shared",
        file: "main.bicep",
        line: 45,
        version: "2023-04-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/networkSecurityGroups",
        name: "nsg-web",
        file: "main.bicep",
        line: 49,
        openToAll: true,
        version: "2023-04-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/networkSecurityGroups",
        name: "nsg-internal",
        file: "main.bicep",
        line: 69,
        openToAll: false,
        version: "2023-04-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Storage/storageAccounts/queueServices/queues",
        name: "queues",
        file: "main.bicep",
        line: 96,
        version: "2023-01-01",
      },
      {
        kind: "module",
        provider: "bicep",
        type: "module",
        name: "web",
        file: "main.bicep",
        line: 100,
        variables: ["appName", "location", "adminPassword"],
        source: "./modules/web.bicep",
      },
      {
        kind: "module",
        provider: "bicep",
        type: "module",
        name: "registryStorage",
        file: "main.bicep",
        line: 109,
        source: "br:acmeregistry.azurecr.io/bicep/modules/storage:v1.2.0",
        version: "v1.2.0",
      },
      { kind: "output", provider: "bicep", type: "output", name: "storageId", file: "main.bicep", line: 127 },
      { kind: "output", provider: "bicep", type: "output", name: "webUrl", file: "main.bicep", line: 128 },
      {
        kind: "variable",
        provider: "bicep",
        type: "param",
        name: "location",
        file: "main.prod.bicep",
        line: 1,
        env: "production",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.KeyVault/vaults",
        name: "kv-shop-prod",
        file: "main.prod.bicep",
        line: 3,
        env: "production",
        version: "2023-02-01",
      },
      { kind: "variable", provider: "bicep", type: "param", name: "appName", file: "modules/web.bicep", line: 1 },
      { kind: "variable", provider: "bicep", type: "param", name: "location", file: "modules/web.bicep", line: 2 },
      { kind: "variable", provider: "bicep", type: "param", name: "adminPassword", file: "modules/web.bicep", line: 5 },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Web/serverfarms",
        name: "plan",
        file: "modules/web.bicep",
        line: 7,
        version: "2022-03-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Web/sites",
        name: "site",
        file: "modules/web.bicep",
        line: 15,
        version: "2022-03-01",
      },
      { kind: "output", provider: "bicep", type: "output", name: "url", file: "modules/web.bicep", line: 35 },
    ]);
  });

  test("no value kept: defaults, a .bicepparam file, app settings, params passed; tests/ never read", () => {
    nothingOf(fixture(bicep), [
      "Standard_LRS",
      "Standard_GRS",
      "bicepparam-value-not-kept",
      "fixture-app-setting-not-kept",
      "shop-web",
      "never-read",
      "testOnly",
      "legacy",
      "notReal",
    ]);
    assert.equal(bicep.files.test("main.bicepparam"), false);
    const items = written(bicep, {
      "main.bicep": `param key string = '${KEY}'\nmodule m './m.bicep' = {\n  params: {\n    token: '${TOKEN}'\n  }\n}\n`,
    });
    assert.deepEqual(
      items.map((i) => `${i.kind} ${i.name} ${(i.variables ?? []).join(",")}`.trim()),
      ["variable key", "module m token"],
    );
    nothingOf(items, [TOKEN, KEY]);
  });

  test("a declaration in a comment or a string (escaped quotes, templates, ''' … ''') is none; decorators inline", () => {
    const text = [
      "// resource c1 'Microsoft.Web/sites@2022-03-01' = {}",
      "/* module c2 './x.bicep' = {} */",
      "var a = 'resource s1 \\'Microsoft.Web/sites@2022-03-01\\' = {'",
      "var b = 'it''s ${concat('}', '{')} done'",
      "var c = '''",
      "resource s2 'Microsoft.Web/sites@2022-03-01' = {",
      "'''",
      "@secure() param inline string",
      "resource real 'Microsoft.Web/sites@2022-03-01' = {",
      "  name: 'site-real'",
      "}",
    ].join("\n");
    assert.deepEqual(
      bicepDeclarations(text, "main.bicep").map((i) => `${i.kind} ${i.type} ${i.name} ${i.line}`),
      ["variable param inline 8", "resource Microsoft.Web/sites site-real 9"],
    );
  });

  test("children nested K deep: each read, their types bounded; MAX_ITEMS items at most", () => {
    const deep = "resource a 'Microsoft.Web/sites@2022-03-01' = {\n" + "resource b 'config' = {\n".repeat(3000);
    const items = bicepDeclarations(deep, "main.bicep");
    assert.equal(items.length, 3001);
    assert.ok(items.every((i) => i.type.length <= 200));
    const many = Array.from({ length: MAX_ITEMS + 1000 }, (_, i) => `param p${i} string\n`).join("");
    assert.equal(bicep.infra({ sources: new Map([["main.bicep", many]]) }).length, MAX_ITEMS);
  });
});

describe("ARM templates", () => {
  test("parameters, resources nested three levels (types completed), symbolic names, linked and inline deployments", () => {
    assert.deepEqual(fixture(arm), [
      { kind: "variable", provider: "arm", type: "parameter", name: "storageName", file: "azuredeploy.json", line: 6 },
      {
        kind: "variable",
        provider: "arm",
        type: "parameter",
        name: "adminPassword",
        file: "azuredeploy.json",
        line: 10,
      },
      { kind: "variable", provider: "arm", type: "parameter", name: "location", file: "azuredeploy.json", line: 14 },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Storage/storageAccounts",
        name: "[parameters('storageName')]",
        file: "azuredeploy.json",
        line: 23,
        version: "2023-01-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/networkSecurityGroups",
        name: "nsg-web",
        file: "azuredeploy.json",
        line: 31,
        openToAll: true,
        version: "2023-04-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/networkSecurityGroups/securityRules",
        name: "nsg-web/deny-all",
        file: "azuredeploy.json",
        line: 62,
        openToAll: false,
        version: "2023-04-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/virtualNetworks",
        name: "[variables('vnetName')]",
        file: "azuredeploy.json",
        line: 73,
        version: "2023-04-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/virtualNetworks/subnets",
        name: "web",
        file: "azuredeploy.json",
        line: 82,
        version: "2023-04-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/virtualNetworks/subnets/providers/roleAssignments",
        name: "web/Microsoft.Authorization/reader",
        file: "azuredeploy.json",
        line: 89,
        version: "2022-04-01",
      },
      {
        kind: "module",
        provider: "azure",
        type: "Microsoft.Resources/deployments",
        name: "linked-network",
        file: "azuredeploy.json",
        line: 112,
        variables: ["vnetName", "adminPassword"],
        source: "https://stshoptemplates.blob.core.windows.net/templates/network.json",
        version: "2022-09-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Resources/deployments",
        name: "inline-monitoring",
        file: "azuredeploy.json",
        line: 128,
        version: "2022-09-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Insights/components",
        name: "appi-shop",
        file: "azuredeploy.json",
        line: 138,
        version: "2020-02-02",
      },
      { kind: "output", provider: "arm", type: "output", name: "storageId", file: "azuredeploy.json", line: 150 },
      {
        kind: "variable",
        provider: "arm",
        type: "parameter",
        name: "vnetName",
        file: "nested/prod/network.json",
        line: 6,
        env: "production",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/virtualNetworks",
        name: "[parameters('vnetName')]",
        file: "nested/prod/network.json",
        line: 9,
        env: "production",
        version: "2023-04-01",
      },
      {
        kind: "resource",
        provider: "azure",
        type: "Microsoft.Network/networkSecurityGroups",
        name: "bastionNsg",
        file: "nested/prod/network.json",
        line: 18,
        env: "production",
        openToAll: true,
        version: "2023-04-01",
      },
    ]);
  });

  test("no value kept: defaultValues, a parameters file, a SAS token; comments, a fourth level and tests/ never read", () => {
    nothingOf(fixture(arm), [
      "fixture-default-not-kept",
      "fixture-password-not-kept",
      "parameters-file-value-not-kept",
      "stshopprod",
      "fixture-signature-not-kept",
      "sig=",
      "commented-out-site",
      "never-read",
      "tooDeep",
      "Microsoft.Fake",
    ]);
    const template = {
      $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
      parameters: { key: { type: "securestring", defaultValue: KEY } },
      resources: [
        {
          type: "Microsoft.Resources/deployments",
          apiVersion: "2022-09-01",
          name: "linked",
          properties: { templateLink: { uri: `https://deploy:${TOKEN}@templates.example.test/t.json?sig=${TOKEN}` } },
        },
      ],
    };
    const items = written(arm, { "azuredeploy.json": JSON.stringify(template, null, 2) });
    assert.deepEqual(
      items.map((i) => `${i.kind} ${i.name} ${i.source ?? ""}`.trim()),
      ["variable key", "module linked https://templates.example.test/t.json"],
    );
    nothingOf(items, [TOKEN, KEY]);
  });

  test("comments blanked outside strings, lines kept; the tree of a JSON text with its lines", () => {
    const text = '{\n  "a": "https://x.test/y // not /* a comment */", // gone\n  /* "b": 1, */ "c": [true, 2]\n}';
    const clean = withoutJsonComments(text);
    assert.equal(clean.split("\n").length, 4);
    assert.deepEqual(JSON.parse(clean), { a: "https://x.test/y // not /* a comment */", c: [true, 2] });
    const root = jsonTree(clean);
    assert.deepEqual(
      root.entries.map((e) => [e.key, e.line]),
      [
        ["a", 2],
        ["c", 3],
      ],
    );
    assert.deepEqual(
      root.entries[1].value.items.map((n) => n.value),
      ["true", "2"],
    );
    assert.equal(jsonTree("{ not json"), null);
    assert.deepEqual(armTemplate(jsonTree('{"resources":[{"name":"no type"}]}'), "x.json"), []);
  });
});

describe("CloudFormation and SAM", () => {
  test("parameters, resources, nested stacks, functions' variables, schedules, outputs; YAML, JSON, .template", () => {
    assert.deepEqual(fixture(cloudformation), [
      {
        kind: "variable",
        provider: "cloudformation",
        type: "parameter",
        name: "BucketName",
        file: "infra/prod/stack.json",
        line: 4,
        env: "production",
      },
      {
        kind: "resource",
        provider: "aws",
        type: "AWS::S3::Bucket",
        name: "AssetsBucket",
        file: "infra/prod/stack.json",
        line: 7,
        env: "production",
      },
      {
        kind: "resource",
        provider: "aws",
        type: "AWS::EC2::SecurityGroupIngress",
        name: "PublicIngress",
        file: "infra/prod/stack.json",
        line: 11,
        env: "production",
        openToAll: true,
      },
      {
        kind: "resource",
        provider: "aws",
        type: "AWS::EC2::SecurityGroupEgress",
        name: "AllOut",
        file: "infra/prod/stack.json",
        line: 21,
        env: "production",
        openToAll: false,
      },
      {
        kind: "resource",
        provider: "aws",
        type: "AWS::Lambda::Function",
        name: "Worker",
        file: "infra/prod/stack.json",
        line: 25,
        env: "production",
        variables: ["QUEUE_URL", "LOG_LEVEL"],
      },
      {
        kind: "output",
        provider: "cloudformation",
        type: "output",
        name: "BucketArn",
        file: "infra/prod/stack.json",
        line: 34,
        env: "production",
      },
      { kind: "resource", provider: "aws", type: "AWS::EC2::VPC", name: "Vpc", file: "network.template", line: 2 },
      {
        kind: "module",
        provider: "aws",
        type: "AWS::Serverless::Application",
        name: "Reports",
        file: "network.template",
        line: 6,
        source: "https://acme-templates.s3.amazonaws.com/reports.yaml",
      },
      {
        kind: "variable",
        provider: "cloudformation",
        type: "parameter",
        name: "Stage",
        file: "template.yaml",
        line: 6,
      },
      {
        kind: "variable",
        provider: "cloudformation",
        type: "parameter",
        name: "DbPassword",
        file: "template.yaml",
        line: 10,
      },
      {
        kind: "resource",
        provider: "aws",
        type: "AWS::Serverless::Function",
        name: "OrdersFunction",
        file: "template.yaml",
        line: 20,
        schedule: "0 3 * * ? *",
        variables: ["TABLE_NAME", "PAYMENT_API_KEY"],
      },
      {
        kind: "resource",
        provider: "aws",
        type: "AWS::DynamoDB::Table",
        name: "OrdersTable",
        file: "template.yaml",
        line: 40,
      },
      {
        kind: "resource",
        provider: "aws",
        type: "AWS::EC2::SecurityGroup",
        name: "WebSecurityGroup",
        file: "template.yaml",
        line: 45,
        openToAll: true,
      },
      {
        kind: "resource",
        provider: "aws",
        type: "AWS::EC2::SecurityGroup",
        name: "AdminSecurityGroup",
        file: "template.yaml",
        line: 58,
        // `CidrIp: !Ref OfficeCidr`: a parameter decides — open to all or not, the template does not tell.
      },
      {
        kind: "module",
        provider: "aws",
        type: "AWS::CloudFormation::Stack",
        name: "NetworkStack",
        file: "template.yaml",
        line: 72,
        variables: ["VpcCidr", "Stage"],
        source: "https://acme-templates.s3.eu-west-1.amazonaws.com/network.yaml",
      },
      {
        kind: "module",
        provider: "aws",
        type: "AWS::CloudFormation::Stack",
        name: "DatabaseStack",
        file: "template.yaml",
        line: 80,
      },
      {
        kind: "resource",
        provider: "aws",
        type: "AWS::Events::Rule",
        name: "CleanupRule",
        file: "template.yaml",
        line: 88,
        schedule: "30 2 * * ? *",
      },
      {
        kind: "output",
        provider: "cloudformation",
        type: "output",
        name: "OrdersApi",
        file: "template.yaml",
        line: 95,
      },
      {
        kind: "output",
        provider: "cloudformation",
        type: "output",
        name: "TableName",
        file: "template.yaml",
        line: 97,
      },
    ]);
  });

  test("no value kept: Defaults, environment values, a presigned URL, a tagged value; cdk.out, comments, tests/ never read", () => {
    nothingOf(fixture(cloudformation), [
      "fixture-default-not-kept",
      "fixture-password-not-kept",
      "fixture-env-value-not-kept",
      "fixture-json-default-not-kept",
      "fixture-json-env-not-kept",
      "fixture-signature-not-kept",
      "X-Amz-Signature",
      "TemplatesBucket",
      "10.50.0.0/16",
      "OldBucket",
      "GeneratedBucket",
      "TestOnly",
    ]);
    const items = written(cloudformation, {
      "template.yaml": [
        "AWSTemplateFormatVersion: '2010-09-09'",
        "Resources:",
        "  Fn:",
        "    Type: AWS::Lambda::Function",
        "    Properties:",
        "      Environment:",
        "        Variables:",
        `          ACCESS_KEY: ${KEY}`,
        "  Child:",
        "    Type: AWS::CloudFormation::Stack",
        "    Properties:",
        `      TemplateURL: https://templates.example.test/child.yaml?token=${TOKEN}`,
        "  Tagged:",
        "    Type: !Ref SomeType",
      ].join("\n"),
    });
    assert.deepEqual(
      items.map((i) => `${i.kind} ${i.name} ${i.source ?? (i.variables ?? []).join(",")}`),
      ["resource Fn ACCESS_KEY", "module Child https://templates.example.test/child.yaml"],
    );
    nothingOf(items, [TOKEN, KEY, "SomeType"]);
  });

  test("a document that is no template gives nothing; MAX_ITEMS items at most", () => {
    assert.deepEqual(cloudformation.infra({ sources: new Map([["notes.yaml", "notes:\n  - AWS::S3::Bucket\n"]]) }), []);
    assert.deepEqual(cloudformationTemplate(readYaml("Parameters:\n  P:\n    Type: String\n")[0], "t.yaml"), [
      { kind: "variable", type: "parameter", name: "P", file: "t.yaml", line: 2 },
    ]);
    const many =
      "AWSTemplateFormatVersion: x\nParameters:\n" +
      Array.from({ length: MAX_ITEMS + 1000 }, (_, i) => `  P${i}:\n    Type: String\n`).join("");
    assert.equal(cloudformation.infra({ sources: new Map([["template.yaml", many]]) }).length, MAX_ITEMS);
  });
});

describe("linear on crafted files (RULES.md S5)", () => {
  /**
   * The time of `fn`, the best of five runs (the first warms the code up; a pause of the garbage collector, which
   * the YAML reader's trees of 200,000 characters may meet, is not the reader's), in milliseconds.
   */
  const best = (fn) =>
    Math.min(
      ...[0, 1, 2, 3, 4].map(() => {
        const start = performance.now();
        fn();
        return performance.now() - start;
      }),
    );
  /** The sizes of each shape: N, 4N, 16N (about 200,000 characters). */
  const SIZES = [12_500, 50_000, 200_000];
  /** `k` copies of `unit(i)`, joined. */
  const list = (k, unit) => Array.from({ length: Math.ceil(k) }, (_, i) => unit(i)).join("");

  /**
   * Each shape read by the adapter as `file` at N, 4N and 16N: under a second at 16N, MAX_ITEMS items at most, and
   * each size at most 8 times the one below once it takes 20 ms or more.
   */
  function linear(adapter, file, shapes) {
    for (const [name, build] of Object.entries(shapes)) {
      const texts = SIZES.map((n) => build(n));
      for (const t of texts) assert.ok(t.length < 512 * 1024, `${name}: ${t.length}`);
      const times = texts.map((t) =>
        best(() => assert.ok(adapter.infra({ sources: new Map([[file, t]]) }).length <= MAX_ITEMS)),
      );
      const shown = `${adapter.name} ${name}: ${times.map((t) => t.toFixed(0)).join(" → ")} ms`;
      assert.ok(times[2] < 1000, shown);
      for (let s = 1; s < times.length; s++)
        if (times[s] >= 20) assert.ok(times[s] / Math.max(times[s - 1], 0.1) <= 8, shown);
    }
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

describe("an address range the template does not tell (a variable, a parameter, an expression)", () => {
  test("leaves openToAll out, never false; a literal open range still makes it true, an egress rule false", () => {
    const dir = tree({
      "main.tf":
        'resource "aws_security_group" "from_variable" {\n  ingress {\n    cidr_blocks = var.cidr\n  }\n}\nresource "aws_security_group" "closed" {\n  ingress {\n    cidr_blocks = ["10.0.0.0/8"]\n  }\n}\nresource "aws_security_group" "open_and_variable" {\n  ingress {\n    cidr_blocks = [var.office, "0.0.0.0/0"]\n  }\n}\nresource "aws_security_group" "templated" {\n  ingress {\n    cidr_blocks = ["${var.prefix}/16"]\n  }\n}\nresource "aws_security_group" "egress_only" {\n  egress {\n    cidr_blocks = var.cidr\n  }\n}\n',
      "main.bicep":
        "param src string = '*'\nresource fromParam 'Microsoft.Network/networkSecurityGroups@2023-04-01' = {\n  name: 'fromParam'\n  properties: {\n    securityRules: [\n      {\n        name: 'r'\n        properties: {\n          direction: 'Inbound'\n          access: 'Allow'\n          sourceAddressPrefix: src\n        }\n      }\n    ]\n  }\n}\nresource closed 'Microsoft.Network/networkSecurityGroups@2023-04-01' = {\n  name: 'closed'\n  properties: {\n    securityRules: [\n      {\n        name: 'r'\n        properties: {\n          direction: 'Inbound'\n          access: 'Allow'\n          sourceAddressPrefixes: ['10.0.0.0/8']\n        }\n      }\n    ]\n  }\n}\nresource openList 'Microsoft.Network/networkSecurityGroups@2023-04-01' = {\n  name: 'openList'\n  properties: {\n    securityRules: [\n      {\n        name: 'r'\n        properties: {\n          direction: 'Inbound'\n          access: 'Allow'\n          sourceAddressPrefixes: ['0.0.0.0/0']\n        }\n      }\n    ]\n  }\n}\n",
      "azuredeploy.json":
        '{\n  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",\n  "contentVersion": "1.0.0.0",\n  "parameters": {\n    "src": {\n      "type": "string",\n      "defaultValue": "*"\n    }\n  },\n  "resources": [\n    {\n      "type": "Microsoft.Network/networkSecurityGroups",\n      "apiVersion": "2023-04-01",\n      "name": "nsg-parameterssrc",\n      "properties": {\n        "securityRules": [\n          {\n            "name": "r",\n            "properties": {\n              "direction": "Inbound",\n              "access": "Allow",\n              "sourceAddressPrefix": "[parameters(\'src\')]"\n            }\n          }\n        ]\n      }\n    },\n    {\n      "type": "Microsoft.Network/networkSecurityGroups",\n      "apiVersion": "2023-04-01",\n      "name": "nsg-100008",\n      "properties": {\n        "securityRules": [\n          {\n            "name": "r",\n            "properties": {\n              "direction": "Inbound",\n              "access": "Allow",\n              "sourceAddressPrefix": "10.0.0.0/8"\n            }\n          }\n        ]\n      }\n    },\n    {\n      "type": "Microsoft.Network/networkSecurityGroups",\n      "apiVersion": "2023-04-01",\n      "name": "nsg-literal",\n      "properties": {\n        "securityRules": [\n          {\n            "name": "r",\n            "properties": {\n              "direction": "Inbound",\n              "access": "Allow",\n              "sourceAddressPrefix": "[[literal]"\n            }\n          }\n        ]\n      }\n    }\n  ]\n}',
    });
    try {
      const open = (adapter) =>
        collectInfra(dir, [adapter])
          .filter((i) => i.kind === "resource")
          .map((i) => [i.name, i.openToAll]);
      assert.deepEqual(open(terraform), [
        ["from_variable", undefined],
        ["closed", false],
        ["open_and_variable", true],
        ["templated", undefined],
        ["egress_only", false],
      ]);
      assert.deepEqual(open(bicep), [
        ["fromParam", undefined],
        ["closed", false],
        ["openList", true],
      ]);
      assert.deepEqual(open(arm), [
        ["nsg-parameterssrc", undefined],
        ["nsg-100008", false],
        ["nsg-literal", false],
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("a CloudFormation value under a tag, on the lines below it", () => {
  test("is never kept: neither a type nor a nested stack's source", () => {
    const items = written(cloudformation, {
      "template.yaml": [
        "AWSTemplateFormatVersion: '2010-09-09'",
        "Resources:",
        "  Tagged:",
        "    Type: !Ref",
        "      SomeType",
        "  Nested:",
        "    Type: AWS::CloudFormation::Stack",
        "    Properties:",
        "      TemplateURL: !Sub |",
        "        https://templates.example.test/${Stage}/net.yaml",
        "",
      ].join("\n"),
    });
    assert.doesNotMatch(JSON.stringify(items), /SomeType|templates\.example/);
    assert.equal(items.find((i) => i.name === "Nested")?.source, undefined);
  });
});

describe("an address range in a list given whole, a condition, an attribute (review of Lot 5c-1, round 3)", () => {
  test("a list of ranges as one expression is unknown; an open literal in a condition is open; outbound attributes are not", () => {
    const rule = (properties) => ({ name: "r", properties: { direction: "Inbound", access: "Allow", ...properties } });
    const nsg = (name, ...rules) => ({
      type: "Microsoft.Network/networkSecurityGroups",
      apiVersion: "2023-04-01",
      name,
      properties: { securityRules: rules },
    });
    const dir = tree({
      "main.tf": [
        'resource "aws_security_group" "egress_attribute" {',
        '  egress = [{ cidr_blocks = ["0.0.0.0/0"] }]',
        "}",
        'resource "aws_security_group" "ingress_attribute" {',
        '  ingress = [{ cidr_blocks = ["0.0.0.0/0"] }]',
        "}",
        "",
      ].join("\n"),
      "azuredeploy.json": JSON.stringify({
        $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
        resources: [
          nsg(
            "list-expression",
            rule({ sourceAddressPrefixes: "[parameters('ranges')]" }),
            rule({ sourceAddressPrefix: "10.0.0.0/8" }),
          ),
          nsg("condition", rule({ sourceAddressPrefix: "[if(parameters('public'), '*', '10.0.0.0/8')]" })),
          // A parameter or a variable named like an open range is a name, not a range: unknown.
          nsg("named-internet", rule({ sourceAddressPrefix: "[parameters('Internet')]" })),
          nsg("named-any", rule({ sourceAddressPrefix: "[variables( 'any')]" })),
        ],
      }),
      "template.yaml": [
        "AWSTemplateFormatVersion: '2010-09-09'",
        "Resources:",
        "  Conditional:",
        "    Type: AWS::EC2::SecurityGroupIngress",
        "    Properties:",
        "      CidrIp: !If [IsPublic, 0.0.0.0/0, 10.0.0.0/8]",
        "  ExplicitString:",
        "    Type: AWS::EC2::SecurityGroupIngress",
        "    Properties:",
        "      CidrIp: !!str 0.0.0.0/0",
        "",
      ].join("\n"),
      "stack.json": JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Resources: {
          JsonConditional: {
            Type: "AWS::EC2::SecurityGroupIngress",
            Properties: { CidrIp: { "Fn::If": ["IsPublic", "0.0.0.0/0", "10.0.0.0/8"] } },
          },
        },
      }),
    });
    try {
      const open = (adapter) =>
        collectInfra(dir, [adapter])
          .filter((i) => i.kind === "resource")
          .map((i) => [i.name, i.openToAll]);
      assert.deepEqual(open(terraform), [
        ["egress_attribute", false],
        ["ingress_attribute", true],
      ]);
      assert.deepEqual(open(arm), [
        ["list-expression", undefined],
        ["condition", true],
        ["named-internet", undefined],
        ["named-any", undefined],
      ]);
      assert.deepEqual(open(cloudformation), [
        ["JsonConditional", true],
        ["Conditional", true],
        ["ExplicitString", true],
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
