// The crafted manifests every dependency reader is run against (RULES.md S5), and the file names that pick a reader:
// shared by facts-deps-ecosystems.test.mjs (the base size, "does not throw", read by every mutant of test/mutations/)
// and facts-deps-growth.test.mjs (the same shapes 4 and 16 times larger, measured). No clock here.

/** The hostile shapes, each about `n` characters (some a little shorter: n / 5 repeats of a 5-character unit…). */
export const manifestShapes = (n) => [
  " ".repeat(n),
  '"'.repeat(n),
  "'".repeat(n),
  "[".repeat(n),
  "{".repeat(n),
  "=".repeat(n),
  "#".repeat(n),
  "/*".repeat(n / 2),
  "\\".repeat(n),
  "a".repeat(n) + " v" + "1".repeat(n),
  "[dependencies]\n" + "a = {".repeat(n / 5),
  "[dependencies]\na = { " + 'version = "1", '.repeat(n / 15) + "}",
  "[" + "a".repeat(n),
  "[target.'" + "a".repeat(n),
  "[[package]]\n" + 'name = "'.repeat(n / 8),
  "implementation(" + " ".repeat(n),
  "implementation group: " + "'".repeat(n),
  "implementation 'a:b:1'\n".repeat(n / 22),
  "a:b:" + "1".repeat(n) + "=" + "test,".repeat(n / 5),
  'gem "a", ' + ",".repeat(n),
  'gem "a", group: [' + ":test, ".repeat(n / 7),
  "group :test do\n".repeat(n / 15),
  "end\n".repeat(n / 4),
  "GEM\n  remote: x\n  specs:\n" + "    a (1)\n".repeat(n / 10),
  "    a (" + "(".repeat(n),
  "require (\n" + "a v1 // indirect\n".repeat(n / 17),
  "replace a => " + ".".repeat(n),
  "<project><dependencies>" +
    "<dependency><groupId>g</groupId><artifactId>a</artifactId><version>${x}</version></dependency>".repeat(n / 100) +
    "</dependencies></project>",
  "<a>".repeat(n / 3),
  "<Project><ItemGroup>" + '<PackageReference Include="x" Version="1" />'.repeat(n / 45) + "</ItemGroup></Project>",
  '{"require":{' +
    '"a/b":"1",'.repeat(n / 10) +
    '"c/d":"1"},"repositories":[' +
    '{"type":"path","url":"./a/b"},'.repeat(n / 30) +
    "{}]}",
  '{"dependencies":{"net8.0":{' + '"a":{"type":"Direct","resolved":"1"},'.repeat(n / 40) + '"b":{}}}}',
];

/** The names that pick each of the 16 readers of the dependencies source. */
export const READER_NAMES = [
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "libs.versions.toml",
  "gradle.lockfile",
  "a.csproj",
  "directory.packages.props",
  "packages.config",
  "packages.lock.json",
  "composer.json",
  "composer.lock",
  "go.mod",
  "gemfile",
  "gemfile.lock",
  "cargo.toml",
  "cargo.lock",
];
