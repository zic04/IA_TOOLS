// The readers of the `dependencies` source beyond npm and pip (ARCHITECTURE.md §6.9): Maven and Gradle, NuGet,
// Composer, Go modules, Bundler and Cargo. Each manifest is read on its own; `version` is the exact version the file
// states (else null, the constraint kept in `spec`); `direct` only when the file says so; `local` for what does not
// come from the public registry. A broken file is unreadable, never an exception; every reader stays linear on a
// crafted file (RULES.md S5); and no item of these ecosystems ever reaches the network gateway (RULES.md S12).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";
import { collectDependencies, dependencyReader, DEPENDENCY_PATTERNS } from "../../engine/facts/dependencies.mjs";
import { createRegistryClient, isPrivatePackage } from "../../engine/facts/network.mjs";
import { NPM_PATTERNS } from "../../engine/facts/deps/npm.mjs";
import { PYTHON_PATTERNS } from "../../engine/facts/deps/python.mjs";
import { JVM_PATTERNS } from "../../engine/facts/deps/jvm.mjs";
import { DOTNET_PATTERNS } from "../../engine/facts/deps/dotnet.mjs";
import { PHP_PATTERNS } from "../../engine/facts/deps/php.mjs";
import { GO_PATTERNS } from "../../engine/facts/deps/golang.mjs";
import { RUBY_PATTERNS } from "../../engine/facts/deps/ruby.mjs";
import { RUST_PATTERNS } from "../../engine/facts/deps/rust.mjs";

const DEPS = path.join(KIT_ROOT, "test", "fixtures", "deps");

/** The items one manifest of a fixture folder gives, without `manifest` and `ecosystem` (checked here). */
function itemsOf(folder, manifest, ecosystem) {
  const items = collectDependencies(path.join(DEPS, folder)).filter((i) => i.manifest === manifest);
  assert.deepEqual([...new Set(items.map((i) => i.ecosystem))], [ecosystem], manifest);
  return items.map((i) => {
    const rest = { ...i };
    delete rest.manifest;
    delete rest.ecosystem;
    return rest;
  });
}

/** Runs `check` on a temporary folder holding `files` (relative path → text), then removes it. */
function withFolder(files, check) {
  const dir = tempDir("doc-kit-deps-");
  try {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return check(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** What each reader lists for a file it cannot read: `{ file, reason: "read" }`, and no item. */
function assertMissingIsUnreadable(names) {
  for (const name of names) {
    const unreadable = [];
    assert.deepEqual(dependencyReader(name)(path.join(DEPS, "no-such-file"), name, unreadable), [], name);
    assert.deepEqual(unreadable, [{ file: name, reason: "read" }], name);
  }
}

describe("maven: pom.xml, build.gradle(.kts), libs.versions.toml, gradle.lockfile", () => {
  test("pom.xml: its own dependencies, versions from its properties or its dependencyManagement, test scope dev", () => {
    assert.deepEqual(itemsOf("maven", "pom.xml", "maven"), [
      { name: "com.acme:orders-model", version: "1.4.0", spec: "${project.version}", direct: true, dev: false },
      { name: "com.acme.legacy:billing-client", version: "2.0", direct: true, dev: false, local: true },
      {
        name: "com.fasterxml.jackson.core:jackson-databind",
        version: null,
        spec: "[2.15,2.17)",
        direct: true,
        dev: false,
      },
      { name: "com.google.guava:guava", version: "33.0.0-jre", direct: true, dev: false },
      { name: "io.jsonwebtoken:jjwt-api", version: null, spec: "${jjwt.range}", direct: true, dev: false },
      { name: "org.flywaydb:flyway-core", version: null, spec: "${flyway.version}", direct: true, dev: false },
      {
        name: "org.mapstruct:mapstruct",
        version: "1.5.5.Final",
        spec: "${mapstruct.version}",
        direct: true,
        dev: false,
      },
      { name: "org.projectlombok:lombok", version: "1.18.30", direct: true, dev: false },
      { name: "org.springframework.boot:spring-boot-starter-test", version: null, direct: true, dev: true },
      { name: "org.springframework.boot:spring-boot-starter-web", version: null, direct: true, dev: false },
      { name: "org.testcontainers:postgresql", version: "1.19.3", direct: true, dev: true },
    ]);
  });

  test("build.gradle: every Groovy form, comments skipped, a catalog alias or a project left unread", () => {
    assert.deepEqual(itemsOf("maven", "build.gradle", "maven"), [
      {
        name: "com.fasterxml.jackson.core:jackson-databind",
        version: null,
        spec: "${jacksonVersion}",
        direct: true,
        dev: false,
      },
      { name: "com.google.guava:guava", version: "33.0.0-jre", direct: true, dev: false },
      { name: "com.squareup.okhttp3:okhttp", version: "4.12.0", direct: true, dev: false },
      { name: "io.micrometer:micrometer-core", version: null, spec: "1.+", direct: true, dev: false },
      { name: "org.apache.commons:commons-lang3", version: "3.14.0", direct: true, dev: false },
      { name: "org.junit.jupiter:junit-jupiter", version: "5.10.1", direct: true, dev: true },
      { name: "org.junit.platform:junit-platform-launcher", version: "1.10.1", direct: true, dev: true },
      { name: "org.mockito:mockito-core", version: "5.8.0", direct: true, dev: true },
      { name: "org.postgresql:postgresql", version: "42.7.1", direct: true, dev: false },
      { name: "org.projectlombok:lombok", version: "1.18.30", direct: true, dev: false },
      { name: "org.springframework.boot:spring-boot-dependencies", version: "3.2.1", direct: true, dev: false },
      { name: "org.springframework.boot:spring-boot-devtools", version: null, direct: true, dev: false },
      { name: "org.springframework.boot:spring-boot-starter-web", version: null, direct: true, dev: false },
    ]);
  });

  test("build.gradle.kts: the Kotlin forms, platform(), named arguments, the test configurations dev", () => {
    assert.deepEqual(itemsOf("maven", "app/build.gradle.kts", "maven"), [
      { name: "androidx.test.ext:junit", version: "1.1.5", direct: true, dev: true },
      { name: "ch.qos.logback:logback-classic", version: "1.4.14", direct: true, dev: false },
      { name: "com.google.dagger:dagger-compiler", version: "2.50", direct: true, dev: false },
      { name: "io.kotest:kotest-runner-junit5", version: "5.8.0", direct: true, dev: true },
      { name: "io.ktor:ktor-bom", version: "2.3.7", direct: true, dev: false },
      { name: "io.ktor:ktor-server-core", version: null, spec: "$ktorVersion", direct: true, dev: false },
      { name: "org.assertj:assertj-core", version: "3.25.1", direct: true, dev: true },
      { name: "org.example:ranged", version: null, spec: "[1.0,2.0)", direct: true, dev: false },
      { name: "org.jetbrains.kotlinx:kotlinx-coroutines-core", version: "1.7.3", direct: true, dev: false },
      { name: "org.slf4j:slf4j-api", version: "2.0.9", direct: true, dev: false },
    ]);
  });

  test("a version catalog: its [libraries], version.ref resolved from its own [versions] only", () => {
    assert.deepEqual(itemsOf("maven", "gradle/libs.versions.toml", "maven"), [
      { name: "com.fasterxml.jackson.core:jackson-databind", version: "2.16.1", direct: true, dev: false },
      { name: "com.squareup.okhttp3:okhttp-bom", version: null, direct: true, dev: false },
      { name: "org.example:guarded", version: null, direct: true, dev: false },
      { name: "org.example:unknown", version: null, direct: true, dev: false },
      { name: "org.jetbrains.exposed:exposed-core", version: "0.45.0", direct: true, dev: false },
      { name: "org.postgresql:postgresql", version: "42.7.1", direct: true, dev: false },
      { name: "org.springframework:spring-web", version: "6.1.2", direct: true, dev: false },
    ]);
  });

  test("gradle.lockfile: resolved, never direct; dev when only test configurations hold it", () => {
    assert.deepEqual(itemsOf("maven", "gradle.lockfile", "maven"), [
      { name: "com.google.guava:failureaccess", version: "1.0.2", direct: false, dev: false },
      { name: "com.google.guava:guava", version: "33.0.0-jre", direct: false, dev: false },
      { name: "org.junit.jupiter:junit-jupiter-api", version: "5.10.1", direct: false, dev: true },
      { name: "org.postgresql:postgresql", version: "42.7.1", direct: false, dev: false },
    ]);
  });

  test("a malformed pom is unreadable (xml), a missing one too (read); a DTD entity is never expanded", () => {
    const unreadable = [];
    assert.deepEqual(collectDependencies(path.join(DEPS, "maven-broken"), unreadable), []);
    assert.deepEqual(unreadable, [{ file: "pom.xml", reason: "xml" }]);
    assertMissingIsUnreadable(["pom.xml", "build.gradle", "build.gradle.kts", "libs.versions.toml", "gradle.lockfile"]);
    const pom =
      '<!DOCTYPE project [<!ENTITY v "6.6.6">]><project><dependencies><dependency><groupId>g</groupId>' +
      "<artifactId>a</artifactId><version>&v;</version></dependency></dependencies></project>";
    withFolder({ "pom.xml": pom, "other/pom.xml": "<settings><dependencies /></settings>" }, (dir) =>
      assert.deepEqual(collectDependencies(dir), [
        { name: "g:a", version: null, spec: "&v;", ecosystem: "maven", direct: true, dev: false, manifest: "pom.xml" },
      ]),
    );
  });
});

describe("nuget: project files, Directory.Packages.props, packages.config, packages.lock.json", () => {
  test("a project file: Version attribute or element, a range in spec, PrivateAssets dev, Update ignored", () => {
    assert.deepEqual(itemsOf("nuget", "src/Orders.Api/Orders.Api.csproj", "nuget"), [
      { name: "Dapper", version: "2.1.28", direct: true, dev: false },
      { name: "Microsoft.EntityFrameworkCore", version: null, direct: true, dev: false },
      { name: "Microsoft.SourceLink.GitHub", version: "8.0.0", direct: true, dev: true },
      { name: "Microsoft.VisualStudio.Web.CodeGeneration.Design", version: "8.0.0", direct: true, dev: false },
      { name: "Newtonsoft.Json", version: null, spec: "13.*", direct: true, dev: false },
      { name: "Polly", version: null, spec: "[8.0,9.0)", direct: true, dev: false },
      { name: "StyleCop.Analyzers", version: "1.1.118", direct: true, dev: true },
      { name: "Swashbuckle.AspNetCore", version: "6.5.0", direct: true, dev: false },
    ]);
  });

  test("a test project, by its name (.Tests.csproj) or by IsTestProject: every reference dev", () => {
    assert.deepEqual(itemsOf("nuget", "tests/Orders.Api.Tests/Orders.Api.Tests.csproj", "nuget"), [
      { name: "Moq", version: "4.20.70", direct: true, dev: true },
      { name: "xunit", version: null, direct: true, dev: true },
    ]);
    assert.deepEqual(itemsOf("nuget", "tests/Reports.Specs/Reports.Specs.fsproj", "nuget"), [
      { name: "FsUnit.xUnit", version: "5.6.1", direct: true, dev: true },
    ]);
  });

  test("central versions, packages.config (no direct mark), packages.lock.json (Direct, Project local)", () => {
    assert.deepEqual(itemsOf("nuget", "Directory.Packages.props", "nuget"), [
      { name: "Microsoft.EntityFrameworkCore", version: "8.0.1", direct: true, dev: false },
      { name: "Serilog.AspNetCore", version: "8.0.0", direct: true, dev: false },
      { name: "xunit", version: "2.6.6", direct: true, dev: false },
    ]);
    assert.deepEqual(itemsOf("nuget", "legacy/Billing/packages.config", "nuget"), [
      { name: "EntityFramework", version: "6.4.4", direct: false, dev: false },
      { name: "Microsoft.CodeDom.Providers.DotNetCompilerPlatform", version: "2.0.1", direct: false, dev: true },
      { name: "Newtonsoft.Json", version: "13.0.3", direct: false, dev: false },
    ]);
    assert.deepEqual(itemsOf("nuget", "src/Orders.Api/packages.lock.json", "nuget"), [
      { name: "Microsoft.EntityFrameworkCore", version: "8.0.1", direct: false, dev: false },
      { name: "orders.domain", version: null, direct: false, dev: false, local: true },
      { name: "Swashbuckle.AspNetCore", version: "6.5.0", direct: true, dev: false },
      { name: "Swashbuckle.AspNetCore.Swagger", version: "6.5.0", direct: false, dev: false },
      { name: "System.Runtime", version: "4.3.1", direct: false, dev: false },
    ]);
  });

  test("malformed XML (xml), invalid JSON (json), a missing file (read); an odd shape gives nothing", () => {
    const unreadable = [];
    assert.deepEqual(collectDependencies(path.join(DEPS, "nuget-broken"), unreadable), []);
    assert.deepEqual(unreadable, [{ file: "Broken.csproj", reason: "xml" }]);
    assertMissingIsUnreadable(["a.csproj", "a.fsproj", "a.vbproj", "directory.packages.props", "packages.config"]);
    assertMissingIsUnreadable(["packages.lock.json"]);
    const files = {
      "a/packages.lock.json": "{ not json",
      "b/packages.lock.json": '{ "dependencies": { "net8.0": 3, "net9.0": { "X": null } } }',
      "c/packages.lock.json": "null",
      "d/packages.config": "<packages><package id='X' version='1.0'></packages>",
      "e/Directory.Packages.props": "<Project><ItemGroup><PackageVersion Include='X' /></ItemGroup></Project>",
    };
    withFolder(files, (dir) => {
      const found = [];
      const items = collectDependencies(dir, found);
      assert.deepEqual(
        items.map((i) => [i.manifest, i.name, i.version]),
        [["e/Directory.Packages.props", "X", null]],
      );
      assert.deepEqual(found, [
        { file: "a/packages.lock.json", reason: "json" },
        { file: "d/packages.config", reason: "xml" },
      ]);
    });
  });
});

describe("composer: composer.json and composer.lock", () => {
  test("composer.json: require and require-dev, no platform requirement, local from its own repositories", () => {
    assert.deepEqual(itemsOf("composer", "composer.json", "composer"), [
      { name: "acme/billing", version: null, spec: "@dev", direct: true, dev: false, local: true },
      { name: "acme/legacy-sdk", version: null, spec: "dev-main", direct: true, dev: false, local: true },
      { name: "acme/shared-kernel", version: null, spec: "*@dev", direct: true, dev: false, local: true },
      { name: "acme/test-helpers", version: null, spec: "dev-main", direct: true, dev: true, local: true },
      { name: "fakerphp/faker", version: null, spec: "^1.9.1", direct: true, dev: true },
      { name: "guzzlehttp/guzzle", version: "7.8.1", direct: true, dev: false },
      { name: "laravel/framework", version: null, spec: "^10.10", direct: true, dev: false },
      { name: "php-http/discovery", version: "v1.19.2", direct: true, dev: false },
      { name: "phpunit/phpunit", version: null, spec: "^10.1", direct: true, dev: true },
    ]);
  });

  test("composer.lock: packages and packages-dev, licenses joined, a path package local, never direct", () => {
    assert.deepEqual(itemsOf("composer", "composer.lock", "composer"), [
      { name: "acme/billing", version: "dev-main", direct: false, dev: false, license: "proprietary", local: true },
      { name: "guzzlehttp/guzzle", version: "7.8.1", direct: false, dev: false, license: "MIT" },
      { name: "laravel/framework", version: "v10.40.0", direct: false, dev: false, license: "MIT" },
      { name: "phpunit/phpunit", version: "10.5.5", direct: false, dev: true, license: "BSD-3-Clause" },
      { name: "ramsey/uuid", version: "4.7.5", direct: false, dev: false, license: "MIT OR Apache-2.0" },
    ]);
  });

  test("a path repository given as a folder pattern; invalid JSON, a missing file, an odd shape", () => {
    const json = {
      require: { "acme/a": "@dev", "acme/b": "dev-main", "vendor/public": "*", "vendor/pinned": "^1.0" },
      repositories: { local: { type: "path", url: "packages/*" } },
    };
    const files = {
      "composer.json": JSON.stringify(json),
      "a/composer.json": '{ "require": "x", "repositories": "y" }',
      "b/composer.lock": '{ "packages": {}, "packages-dev": [null, 3, { "name": 7 }] }',
      "c/composer.lock": "{ broken",
    };
    withFolder(files, (dir) => {
      const unreadable = [];
      assert.deepEqual(
        collectDependencies(dir, unreadable).map((i) => [i.name, !!i.local]),
        [
          ["acme/a", true],
          ["acme/b", true],
          ["vendor/pinned", false],
          ["vendor/public", true],
        ],
        "a folder pattern: every package at a development version, or at any version, is taken as local",
      );
      assert.deepEqual(unreadable, [{ file: "c/composer.lock", reason: "json" }]);
    });
    assertMissingIsUnreadable(["composer.json", "composer.lock"]);
  });
});

describe("go: go.mod", () => {
  test("require lines and blocks, // indirect not direct, a replace to a folder local", () => {
    assert.deepEqual(itemsOf("go", "go.mod", "go"), [
      { name: "github.com/acme/shared", version: "v0.3.0", direct: true, dev: false, local: true },
      { name: "github.com/bytedance/sonic", version: "v1.10.2", direct: false, dev: false },
      { name: "github.com/gin-gonic/gin", version: "v1.9.1", direct: true, dev: false },
      { name: "github.com/google/uuid", version: "v1.5.0", direct: true, dev: false, local: true },
      { name: "github.com/jackc/pgx/v5", version: "v5.5.1", direct: true, dev: false },
      { name: "github.com/quoted/module", version: "v1.0.0", direct: true, dev: false },
      { name: "github.com/stretchr/testify", version: "v1.8.4", direct: false, dev: false },
      { name: "golang.org/x/crypto", version: "v0.17.0", direct: false, dev: false },
    ]);
    assertMissingIsUnreadable(["go.mod"]);
  });
});

describe("rubygems: Gemfile and Gemfile.lock", () => {
  test("Gemfile: gem lines, groups (blocks and options), path/git/github and a private source local", () => {
    assert.deepEqual(itemsOf("rubygems", "Gemfile", "rubygems"), [
      { name: "acme-sso", version: null, direct: true, dev: false, local: true },
      { name: "acme-theme", version: null, direct: true, dev: false, local: true },
      { name: "billing", version: null, direct: true, dev: false, local: true },
      { name: "bootsnap", version: null, direct: true, dev: false },
      { name: "capybara", version: null, direct: true, dev: true },
      { name: "debug", version: null, direct: true, dev: true },
      { name: "devise", version: "4.9.3", spec: "= 4.9.3", direct: true, dev: false },
      { name: "factory_bot_rails", version: null, direct: true, dev: true },
      { name: "newrelic_rpm", version: null, direct: true, dev: false },
      { name: "pg", version: null, spec: "~> 1.1, >= 1.1.4", direct: true, dev: false },
      { name: "puma", version: null, spec: ">= 5.0", direct: true, dev: false },
      { name: "rack-mini-profiler", version: null, direct: true, dev: true },
      { name: "rails", version: null, spec: "~> 7.1.2", direct: true, dev: false },
      { name: "rspec-rails", version: null, spec: "~> 6.1", direct: true, dev: true },
      { name: "rubocop", version: null, direct: true, dev: true },
      { name: "sidekiq", version: "7.2.0", direct: true, dev: false },
      { name: "tzinfo-data", version: null, direct: true, dev: false },
      { name: "web-console", version: null, direct: true, dev: true },
    ]);
  });

  test("Gemfile.lock: four-space specs, PATH, GIT and a private remote local, direct from DEPENDENCIES", () => {
    assert.deepEqual(itemsOf("rubygems", "Gemfile.lock", "rubygems"), [
      { name: "acme-sso", version: "0.4.2", direct: true, dev: false, local: true },
      { name: "acme-theme", version: "2.0.1", direct: true, dev: false, local: true },
      { name: "actioncable", version: "7.1.2", direct: false, dev: false },
      { name: "billing", version: "0.1.0", direct: true, dev: false, local: true },
      { name: "nokogiri", version: "1.15.5-x86_64-linux", direct: false, dev: false },
      { name: "pg", version: "1.5.4", direct: true, dev: false },
      { name: "rails", version: "7.1.2", direct: true, dev: false },
    ]);
    assertMissingIsUnreadable(["gemfile", "gemfile.lock"]);
  });
});

describe("cargo: Cargo.toml and Cargo.lock", () => {
  test("Cargo.toml: every table and form, a requirement in spec, path/git/registry/patch local", () => {
    assert.deepEqual(itemsOf("cargo", "Cargo.toml", "cargo"), [
      { name: "acme-auth", version: null, direct: true, dev: false, local: true },
      { name: "axum", version: null, spec: "0.7.4", direct: true, dev: false },
      { name: "insta", version: null, spec: "1.34", direct: true, dev: true },
      { name: "internal-metrics", version: null, spec: "0.9", direct: true, dev: false, local: true },
      { name: "jemallocator", version: null, spec: "0.5", direct: true, dev: false },
      { name: "mockall", version: null, spec: "0.12", direct: true, dev: true },
      { name: "orders-core", version: null, direct: true, dev: false, local: true },
      { name: "patched-lib", version: null, spec: "1.2", direct: true, dev: false, local: true },
      { name: "procfs", version: null, spec: "0.16", direct: true, dev: true },
      { name: "prost-build", version: null, spec: "0.12", direct: true, dev: false },
      { name: "quoted-name", version: null, spec: "0.2", direct: true, dev: false },
      { name: "reqwest", version: null, spec: "0.11.23", direct: true, dev: false },
      { name: "serde", version: null, spec: "1.0.195", direct: true, dev: false },
      { name: "serde", version: null, direct: true, dev: false },
      { name: "serde_json", version: null, direct: true, dev: false },
      { name: "tokio", version: null, spec: "1.35", direct: true, dev: false },
      { name: "tokio-postgres", version: null, spec: ">=0.7, <0.8", direct: true, dev: false },
      { name: "uuid", version: "1.6.1", spec: "=1.6.1", direct: true, dev: false },
      { name: "winapi", version: null, spec: "0.3", direct: true, dev: false },
    ]);
    assert.deepEqual(itemsOf("cargo", "crates/orders-core/Cargo.toml", "cargo"), [
      { name: "serde", version: null, direct: true, dev: false },
      { name: "thiserror", version: null, spec: "1", direct: true, dev: false },
    ]);
  });

  test("Cargo.lock: every package, crates.io public, git, another registry and the workspace local", () => {
    assert.deepEqual(itemsOf("cargo", "Cargo.lock", "cargo"), [
      { name: "acme-auth", version: "0.2.0", direct: false, dev: false, local: true },
      { name: "axum", version: "0.7.4", direct: false, dev: false },
      { name: "internal-metrics", version: "0.9.3", direct: false, dev: false, local: true },
      { name: "orders-api", version: "0.3.0", direct: false, dev: false, local: true },
      { name: "syn", version: "1.0.109", direct: false, dev: false },
      { name: "syn", version: "2.0.48", direct: false, dev: false },
    ]);
    assertMissingIsUnreadable(["cargo.toml", "cargo.lock"]);
  });
});

describe("every ecosystem together", () => {
  test("collectDependencies on all the fixtures: the six ecosystems, the two malformed XML files unreadable", () => {
    const unreadable = [];
    const items = collectDependencies(DEPS, unreadable);
    assert.deepEqual([...new Set(items.map((i) => i.ecosystem))].sort(), [
      "cargo",
      "composer",
      "go",
      "maven",
      "nuget",
      "rubygems",
    ]);
    assert.deepEqual(unreadable, [
      { file: "maven-broken/pom.xml", reason: "xml" },
      { file: "nuget-broken/Broken.csproj", reason: "xml" },
    ]);
  });

  test("installed dependencies (vendor/) and build output (target/) are never taken for the application's manifests", () => {
    const files = {
      "composer.json": JSON.stringify({ require: { "acme/a": "^1.0" } }),
      "vendor/acme/a/composer.json": JSON.stringify({ require: { "acme/b": "^1.0" } }),
      "target/package/x-0.1.0/Cargo.toml": '[dependencies]\nserde = "1"\n',
    };
    withFolder(files, (dir) =>
      assert.deepEqual(
        collectDependencies(dir).map((i) => `${i.manifest} ${i.name}`),
        ["composer.json acme/a"],
      ),
    );
  });

  test("no item of these ecosystems is ever sent: the gateway refuses them, fetch is never called (RULES.md S12)", async () => {
    const registries = { names: new Set(), npmAll: false, npmScopes: new Set(), pipAll: false };
    let calls = 0;
    const client = createRegistryClient({ fetch: async () => (calls++, { ok: true }), registries });
    const items = collectDependencies(DEPS).filter((i) => i.direct);
    assert.ok(items.length > 50);
    for (const item of items) {
      assert.equal(isPrivatePackage(item, registries), true, `${item.ecosystem}:${item.name}`);
      await assert.rejects(client.exists(item));
    }
    assert.equal(calls, 0);
  });
});

describe("linear on what a crafted manifest holds (RULES.md S5)", () => {
  test("every expression of every reader reaches the ReDoS harness: no two share a name (a merge would drop one)", () => {
    const groups = [
      NPM_PATTERNS,
      PYTHON_PATTERNS,
      JVM_PATTERNS,
      DOTNET_PATTERNS,
      PHP_PATTERNS,
      GO_PATTERNS,
      RUBY_PATTERNS,
      RUST_PATTERNS,
    ];
    const names = groups.flatMap((g) => Object.keys(g));
    assert.equal(new Set(names).size, names.length, "two readers name an expression alike");
    assert.deepEqual(Object.keys(DEPENDENCY_PATTERNS).sort(), [...names, "URL_CREDENTIALS"].sort());
    for (const g of groups) assert.ok(Object.isFrozen(g) && Object.values(g).every((re) => re instanceof RegExp));
  });
});
