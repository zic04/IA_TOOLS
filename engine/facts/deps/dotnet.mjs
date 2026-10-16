// .NET manifests and lock files of the `dependencies` source (engine/facts/dependencies.mjs), ecosystem `nuget`:
// the project files (*.csproj, *.fsproj, *.vbproj), Directory.Packages.props (central package management),
// packages.config and packages.lock.json. Each file is read on its own: a version a project takes from
// Directory.Packages.props stays null in the project's own items. A `<ProjectReference>` is no package.
import { readJson, readXml, xmlChildren, xmlText, xmlAttr } from "./read.mjs";

/** The manifests are untrusted: this expression is anchored and bounded, so linear (RULES.md S5). */
export const DOTNET_PATTERNS = Object.freeze({
  /** An exact NuGet version: no range (`[1.0,2.0)`), no floating version (`1.*`), no MSBuild property (`$(V)`). */
  nugetVersion: /^\d[\w.-]{0,100}$/,
});

/** The extensions of the project files. */
const PROJECT_EXTENSIONS = [".csproj", ".fsproj", ".vbproj"];

/** The fields of an item whose version is exact only when written so; `spec` keeps what is written otherwise. */
function versionFields(written) {
  const version = written && DOTNET_PATTERNS.nugetVersion.test(written) ? written : null;
  return { version, ...(written && written !== version ? { spec: written } : {}) };
}

/** Every element of a tree, depth first (a project's items sit in any `<ItemGroup>`, conditional ones included). */
function descendants(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    out.push(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
  return out;
}

/** A metadata of an MSBuild item: its attribute, or its child element (`<Version>1.0</Version>`). */
const metadata = (node, name) => xmlAttr(node, name) ?? xmlText(node, name);

/** A test project: `<IsTestProject>true</IsTestProject>`, or a file name ending in `.Tests.csproj`, `.Test.csproj`. */
function isTestProject(nodes, manifest) {
  const file = manifest.split("/").pop().toLowerCase();
  const base = file.slice(0, file.lastIndexOf("."));
  if (base.endsWith(".tests") || base.endsWith(".test")) return true;
  return nodes.some((n) => n.name.toLowerCase() === "istestproject" && n.text.trim().toLowerCase() === "true");
}

/**
 * One project file: its `<PackageReference Include="X" Version="1.2.3" />` (or a `<Version>` child), direct; dev in
 * a test project, or with `PrivateAssets="all"` (a build-time tool, an analyzer). An `Update=` entry changes a
 * reference made elsewhere: not read.
 */
function fromProject(abs, manifest, unreadable) {
  const root = readXml(abs, manifest, unreadable);
  if (!root) return [];
  const nodes = descendants(root);
  const testProject = isTestProject(nodes, manifest);
  const out = [];
  for (const node of nodes) {
    const name = node.name.toLowerCase() === "packagereference" ? xmlAttr(node, "Include") : null;
    if (!name) continue;
    const written = metadata(node, "Version") ?? metadata(node, "VersionOverride");
    const privateAssets = (metadata(node, "PrivateAssets") || "").toLowerCase() === "all";
    out.push({
      name,
      ...versionFields(written),
      ecosystem: "nuget",
      direct: true,
      dev: testProject || privateAssets,
      manifest,
    });
  }
  return out;
}

/** One Directory.Packages.props: its `<PackageVersion Include="X" Version="1.2.3" />`, direct, not dev. */
function fromPackagesProps(abs, manifest, unreadable) {
  const root = readXml(abs, manifest, unreadable);
  if (!root) return [];
  return descendants(root)
    .filter((n) => n.name.toLowerCase() === "packageversion" && xmlAttr(n, "Include"))
    .map((n) => ({
      name: xmlAttr(n, "Include"),
      ...versionFields(metadata(n, "Version")),
      ecosystem: "nuget",
      direct: true,
      dev: false,
      manifest,
    }));
}

/**
 * One packages.config: `<package id="X" version="1.2.3" developmentDependency="true" />`. NuGet writes the
 * dependencies of the packages there too, with no mark: every item is `direct: false`.
 */
function fromPackagesConfig(abs, manifest, unreadable) {
  const root = readXml(abs, manifest, unreadable);
  if (!root || root.name !== "packages") return [];
  return xmlChildren(root, "package")
    .filter((n) => xmlAttr(n, "id"))
    .map((n) => ({
      name: xmlAttr(n, "id"),
      ...versionFields(xmlAttr(n, "version")),
      ecosystem: "nuget",
      direct: false,
      dev: (xmlAttr(n, "developmentDependency") || "").toLowerCase() === "true",
      manifest,
    }));
}

/**
 * One packages.lock.json: `dependencies.<framework>.<name>` with its `type` (Direct, Transitive,
 * CentralTransitive, Project) and its `resolved` version; one item per name across the frameworks (the first
 * wins). A `Project` entry is another project of the solution: local.
 */
function fromNugetLock(abs, manifest, unreadable) {
  const lock = readJson(abs, manifest, unreadable);
  const frameworks = lock && typeof lock === "object" ? lock.dependencies : null;
  if (!frameworks || typeof frameworks !== "object") return [];
  const out = [];
  const seen = new Set();
  for (const packages of Object.values(frameworks)) {
    if (!packages || typeof packages !== "object") continue;
    for (const [name, info] of Object.entries(packages)) {
      if (seen.has(name) || !info || typeof info !== "object") continue;
      seen.add(name);
      const local = info.type === "Project";
      out.push({
        name,
        version: typeof info.resolved === "string" ? info.resolved : null,
        ecosystem: "nuget",
        direct: info.type === "Direct",
        dev: false,
        manifest,
        ...(local ? { local } : {}),
      });
    }
  }
  return out;
}

/** The readers of the .NET files known by their whole name (lower case). */
const BY_NAME = Object.freeze({
  "directory.packages.props": fromPackagesProps,
  "packages.config": fromPackagesConfig,
  "packages.lock.json": fromNugetLock,
});

/** The reader of a .NET manifest or lock file, by file name (lower case) or by extension, or null. */
export const dotnetReader = (name) =>
  Object.hasOwn(BY_NAME, name) ? BY_NAME[name] : PROJECT_EXTENSIONS.some((e) => name.endsWith(e)) ? fromProject : null;
