// PHP manifests and lock files of the `dependencies` source (engine/facts/dependencies.mjs), ecosystem `composer`
// (Packagist names, `vendor/package`): composer.json and composer.lock, each read on its own.
import { readJson } from "./read.mjs";

/** The manifests are untrusted: this expression is anchored and bounded, so linear (RULES.md S5). */
export const PHP_PATTERNS = Object.freeze({
  /** An exact Composer version (`1.2.3`, `v1.2.3`): no range (`^1.2`), no wildcard (`1.*`), no branch (`dev-main`). */
  composerVersion: /^v?\d[\w.-]{0,100}$/,
});

/** The folders of a path, without the empty and "." ones (`./packages/acme/billing/` → packages, acme, billing). */
const folders = (url) =>
  url
    .split("\\")
    .join("/")
    .split("/")
    .filter((s) => s && s !== ".");

/** The repository types that take a package from a version control system rather than Packagist. */
const VCS_TYPES = new Set(["vcs", "git", "github", "gitlab", "bitbucket", "hg", "fossil", "svn"]);

/**
 * What composer.json's own `repositories` say of the packages that are not from Packagist: a `path` repository
 * names a folder (its package is named in that folder's own composer.json, which is another file: matched by the
 * folder's name, `acme/billing` or `billing`; a folder pattern `packages/*` matches every package required at a
 * development version); a version control repository is matched by the end of its address
 * (`https://github.com/acme/legacy-sdk.git`: acme/legacy-sdk); a `package` repository names its package.
 */
function localRepositories(repositories) {
  const local = { names: new Set(), folders: new Set(), wildcard: false };
  const entries = Array.isArray(repositories) ? repositories : Object.values(Object(repositories));
  for (const repo of entries) if (repo && typeof repo === "object") addRepository(local, repo);
  return local;
}

/** What one repository of composer.json says is local (see localRepositories). */
function addRepository(local, repo) {
  const parts = typeof repo.url === "string" ? folders(repo.url.toLowerCase()) : [];
  const last = parts.at(-1) || "";
  if (repo.type === "path" && last.includes("*")) local.wildcard = true;
  else if (repo.type === "path" && last) {
    local.folders.add(last);
    local.names.add(parts.slice(-2).join("/"));
  } else if (VCS_TYPES.has(repo.type) && parts.length > 1)
    local.names.add(`${parts.at(-2)}/${last.endsWith(".git") ? last.slice(0, -4) : last}`);
  else if (repo.type === "package")
    for (const p of [repo.package].flat()) if (typeof p?.name === "string") local.names.add(p.name.toLowerCase());
}

/** True when a required package comes from one of the file's own local repositories. */
function isLocal(name, spec, local) {
  const lower = name.toLowerCase();
  if (local.names.has(lower) || local.folders.has(lower.slice(lower.indexOf("/") + 1))) return true;
  return local.wildcard && (spec.includes("@dev") || spec.startsWith("dev-") || spec === "*");
}

/**
 * One composer.json: `require` (dev: false) and `require-dev` (dev: true), direct. A platform requirement (`php`,
 * `ext-*`, `lib-*`, `composer-plugin-api`…: a name without a vendor) is no package. The constraint is kept in
 * `spec`; `version` only for an exact one (`1.2.3`).
 */
function fromComposerJson(abs, manifest, unreadable) {
  const pkg = readJson(abs, manifest, unreadable);
  if (!pkg || typeof pkg !== "object") return [];
  const local = localRepositories(pkg.repositories);
  const out = [];
  for (const [dev, deps] of [
    [false, pkg.require],
    [true, pkg["require-dev"]],
  ]) {
    if (!deps || typeof deps !== "object") continue;
    for (const [name, constraint] of Object.entries(deps)) {
      if (!name.includes("/")) continue; // a platform requirement
      const spec = String(constraint);
      const version = PHP_PATTERNS.composerVersion.test(spec) ? spec : null;
      const isPath = isLocal(name, spec, local);
      out.push({
        name,
        version,
        ...(spec !== version ? { spec } : {}),
        ecosystem: "composer",
        direct: true,
        dev,
        manifest,
        ...(isPath ? { local: true } : {}),
      });
    }
  }
  return out;
}

/** The license of a composer.lock package: an array joined with " OR " (Composer's meaning), or nothing. */
function license(value) {
  const list = [value]
    .flat()
    .filter((l) => typeof l === "string" && l)
    .join(" OR ");
  return list ? { license: list } : {};
}

/**
 * One composer.lock: `packages` (dev: false) and `packages-dev` (dev: true), with their version as written; it does
 * not say which are direct (every item `direct: false`). A package installed from a folder (`dist` or `source` of
 * type "path") is local.
 */
function fromComposerLock(abs, manifest, unreadable) {
  const lock = readJson(abs, manifest, unreadable);
  if (!lock || typeof lock !== "object") return [];
  const out = [];
  for (const [dev, packages] of [
    [false, lock.packages],
    [true, lock["packages-dev"]],
  ]) {
    if (!Array.isArray(packages)) continue;
    for (const p of packages) {
      if (!p || typeof p !== "object" || typeof p.name !== "string") continue;
      const local = p.dist?.type === "path" || p.source?.type === "path";
      out.push({
        name: p.name,
        version: typeof p.version === "string" ? p.version : null,
        ecosystem: "composer",
        direct: false,
        dev,
        manifest,
        ...license(p.license),
        ...(local ? { local } : {}),
      });
    }
  }
  return out;
}

/** The reader of each Composer manifest or lock file, by file name (lower case). */
export const PHP_READERS = Object.freeze({
  "composer.json": fromComposerJson,
  "composer.lock": fromComposerLock,
});
