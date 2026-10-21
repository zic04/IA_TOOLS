// Java and Kotlin manifests and lock files of the `dependencies` source (engine/facts/dependencies.mjs), ecosystem
// `maven` (Maven Central coordinates, `groupId:artifactId`): pom.xml, build.gradle, build.gradle.kts, a Gradle
// version catalog (libs.versions.toml) and gradle.lockfile. Each file is read on its own: a version a pom takes from
// its parent, or a Gradle catalog alias (`implementation(libs.spring.web)`), is in another file and stays unread.
import { jsCommentRanges } from "../behaviour-common.mjs";
import {
  readText,
  readXml,
  xmlChildren,
  xmlText,
  textLines,
  splitTopLevel,
  keyValue,
  quoted,
  inlineTable,
  tomlHeader,
} from "./read.mjs";

/** The manifests are untrusted: these expressions are anchored and bounded, so linear (RULES.md S5). */
export const JVM_PATTERNS = Object.freeze({
  /** A pom.xml property reference, the whole value (`${spring.version}`). */
  mavenProperty: /^\$\{([\w.-]{1,200})\}$/,
  /** An exact version: no range (`[1.0,2.0)`), no variable (`$v`), no dynamic part (`1.+`, `latest.release`). */
  jvmVersion: /^v?\d[\w.-]{0,100}$/,
  /** A group or an artifact written as it is (not a variable). */
  jvmCoordinate: /^[\w.-]{1,200}$/,
  /** A Gradle declaration at the start of a line, its configuration captured. */
  gradleConfiguration:
    /^(implementation|api|compileOnly|runtimeOnly|annotationProcessor|kapt|developmentOnly|testImplementation|testCompileOnly|testRuntimeOnly|testFixturesImplementation|androidTestImplementation)[\s(]/,
  /** One entry of the Gradle map form: `group: 'g'` (Groovy), `group = "g"` (Kotlin). */
  gradleMapEntry: /^(group|name|version)\s{0,20}[:=]\s{0,20}["']([^"']{0,300})["']/,
});

/** The fields of an item whose version is exact only when written so; `spec` keeps what is written otherwise. */
function versionFields(written) {
  const version = written && JVM_PATTERNS.jvmVersion.test(written) ? written : null;
  return { version, ...(written && written !== version ? { spec: written } : {}) };
}

/** A pom value with its `${property}` resolved from the same pom (one level), or null when it cannot be. */
function resolve(value, properties) {
  if (!value || !value.includes("${")) return value;
  const name = JVM_PATTERNS.mavenProperty.exec(value)?.[1];
  const resolved = name ? properties.get(name) : undefined;
  return resolved && !resolved.includes("${") ? resolved : null;
}

/** The properties of a pom: its `<properties>`, and its own coordinates (`${project.version}`). */
function pomProperties(root) {
  const properties = new Map();
  for (const p of xmlChildren(root, "properties")[0]?.children || []) properties.set(p.name, p.text.trim());
  const parent = xmlChildren(root, "parent")[0];
  const own = {
    "project.groupId": xmlText(root, "groupId") || xmlText(parent, "groupId"),
    "project.version": xmlText(root, "version") || xmlText(parent, "version"),
    "project.parent.version": xmlText(parent, "version"),
  };
  for (const [key, value] of Object.entries(own)) if (value && !properties.has(key)) properties.set(key, value);
  return properties;
}

/** The `groupId:artifactId` of a pom dependency (properties resolved; null when it names nothing). */
function pomName(dependency, properties) {
  const group = xmlText(dependency, "groupId");
  const artifact = xmlText(dependency, "artifactId");
  if (!group || !artifact) return null;
  return `${resolve(group, properties) ?? group}:${resolve(artifact, properties) ?? artifact}`;
}

/**
 * One pom.xml: `<project><dependencies><dependency>`, direct; scope `test` is dev, scope `system` (a jar of the
 * disk) is local. A version is the pom's own: written, a `${property}` of its `<properties>`, or its
 * `<dependencyManagement>` when the dependency has none. `<parent>`, plugins, profiles and exclusions are not read.
 */
function fromPom(abs, manifest, unreadable) {
  const root = readXml(abs, manifest, unreadable);
  if (!root || root.name !== "project") return [];
  const properties = pomProperties(root);
  const dependencies = (node) => xmlChildren(xmlChildren(node, "dependencies")[0], "dependency");
  const managed = new Map();
  for (const d of dependencies(xmlChildren(root, "dependencyManagement")[0])) {
    const name = pomName(d, properties);
    if (name && !managed.has(name)) managed.set(name, xmlText(d, "version"));
  }
  const out = [];
  for (const d of dependencies(root)) {
    const name = pomName(d, properties);
    if (!name) continue;
    const written = xmlText(d, "version") || managed.get(name) || null;
    const { version } = versionFields(resolve(written, properties));
    const scope = xmlText(d, "scope");
    // A name left with a ${…} cannot be identified, and a `system` jar comes from the disk: never sent.
    const local = scope === "system" || name.includes("${");
    out.push({
      name,
      version,
      ...(written && written !== version ? { spec: written } : {}),
      ecosystem: "maven",
      direct: true,
      dev: scope === "test",
      manifest,
      ...(local ? { local } : {}),
    });
  }
  return out;
}

/** The text of a Gradle script without its comments (`//`, `/* … *\/`), lines kept in place. */
function withoutComments(text) {
  let out = "";
  let from = 0;
  for (const [start, end] of jsCommentRanges(text)) {
    out += text.slice(from, start) + "\n".repeat(text.slice(start, end).split("\n").length - 1);
    from = end;
  }
  return out + text.slice(from);
}

/** `g:a:v` (with a classifier or an `@ext`) as a name and a written version, or null when it is not literal. */
function coordinates(text) {
  const [group, artifact, written] = text.split("@")[0].split(":");
  if (!JVM_PATTERNS.jvmCoordinate.test(group || "") || !JVM_PATTERNS.jvmCoordinate.test(artifact || "")) return null;
  return { name: `${group}:${artifact}`, written: written || null };
}

/** What a Gradle declaration names after its configuration: `"g:a:v"`, `platform("g:a:v")`, the map form. */
function gradleTarget(rest) {
  let s = rest.trimStart();
  for (const wrapper of ["(", "platform(", "enforcedPlatform("])
    if (s.startsWith(wrapper)) s = s.slice(wrapper.length).trimStart();
  const literal = quoted(s);
  if (literal !== null) return coordinates(literal);
  if (!s.startsWith("group")) return null; // a catalog alias, project(…), files(…), a variable: not read
  const map = /** @type {Record<string, string>} */ ({});
  for (const piece of splitTopLevel(s)) {
    const m = JVM_PATTERNS.gradleMapEntry.exec(piece);
    if (m) map[m[1]] = m[2];
  }
  return map.group && map.name ? coordinates(`${map.group}:${map.name}:${map.version || ""}`) : null;
}

/**
 * One build.gradle or build.gradle.kts: a declaration per line, at its start, direct; the test configurations are
 * dev. A library declared in several configurations (compileOnly and annotationProcessor) is one item, dev only
 * when every declaration is a test one, its version from the first.
 */
function fromGradle(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const items = new Map();
  for (const raw of textLines(withoutComments(text))) {
    const line = raw.trim();
    const m = JVM_PATTERNS.gradleConfiguration.exec(line);
    const target = m ? gradleTarget(line.slice(m[1].length)) : null;
    if (!target) continue;
    const dev = m[1].startsWith("test") || m[1].startsWith("androidTest");
    const seen = items.get(target.name);
    if (seen) seen.dev = seen.dev && dev;
    else
      items.set(target.name, {
        name: target.name,
        ...versionFields(target.written),
        ecosystem: "maven",
        direct: true,
        dev,
        manifest,
      });
  }
  return [...items.values()];
}

/** The written version of a catalog library: `version = "1"`, or `version.ref = "k"` from its own [versions]. */
function catalogVersion(fields, versions) {
  const literal = fields.has("version") ? quoted(fields.get("version")) : null;
  if (literal !== null) return literal;
  const ref = fields.has("version.ref") ? quoted(fields.get("version.ref")) : null;
  return ref !== null && versions.has(ref) ? versions.get(ref) : null;
}

/** One catalog library: `"g:a:v"`, `{ module = "g:a", version… }` or `{ group = "g", name = "a", version… }`. */
function catalogLibrary(value, versions) {
  const literal = quoted(value);
  if (literal !== null) return coordinates(literal);
  const fields = inlineTable(value);
  if (!fields) return null;
  const field = (k) => (fields.has(k) ? quoted(fields.get(k)) : null);
  const module = field("module") ?? (field("group") !== null ? `${field("group")}:${field("name") ?? ""}` : null);
  const target = module === null ? null : coordinates(module);
  return target && { name: target.name, written: catalogVersion(fields, versions) };
}

/** One Gradle version catalog (libs.versions.toml): its [libraries], direct, versions from its own [versions]. */
function fromVersionCatalog(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const versions = new Map();
  const libraries = [];
  let section = null;
  for (const raw of textLines(text)) {
    const line = raw.trim();
    const header = tomlHeader(line);
    if (header !== null) section = header;
    const kv = header === null && !line.startsWith("#") ? keyValue(line) : null;
    if (!kv) continue;
    if (section === "versions" && quoted(kv.value) !== null) versions.set(kv.key, quoted(kv.value));
    else if (section === "libraries") libraries.push(kv.value);
  }
  const out = [];
  for (const value of libraries) {
    const target = catalogLibrary(value, versions);
    if (target)
      out.push({
        name: target.name,
        ...versionFields(target.written),
        ecosystem: "maven",
        direct: true,
        dev: false,
        manifest,
      });
  }
  return out;
}

/** One gradle.lockfile: `g:a:v=conf1,conf2`, every entry resolved (direct: false); dev when only test configurations. */
function fromGradleLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const out = [];
  for (const raw of textLines(text)) {
    const line = raw.trim();
    const eq = line.indexOf("=");
    if (line.startsWith("#") || eq <= 0 || line.startsWith("empty=")) continue;
    const target = coordinates(line.slice(0, eq));
    if (!target || !target.written) continue;
    const configurations = line
      .slice(eq + 1)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const dev =
      configurations.length > 0 && configurations.every((c) => c.startsWith("test") || c.startsWith("androidTest"));
    out.push({ name: target.name, version: target.written, ecosystem: "maven", direct: false, dev, manifest });
  }
  return out;
}

/** The reader of each Maven or Gradle manifest or lock file, by file name (lower case). */
export const JVM_READERS = Object.freeze({
  "pom.xml": fromPom,
  "build.gradle": fromGradle,
  "build.gradle.kts": fromGradle,
  "libs.versions.toml": fromVersionCatalog,
  "gradle.lockfile": fromGradleLock,
});
