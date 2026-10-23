// Mutants of engine/facts/network.mjs: the rules taken out, which the dependency tests must catch (RULES.md M16).
import { DEPENDENCY_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/network.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "the gateway refuses only the private",
      find: "    if (isPrivatePackage(item, registries)) throw",
      replace: '    if (privacyOf(item, registries) === "private") throw',
    },
    {
      name: "an unread own name trusted",
      find: "        if (name === null) out.pipAll = true;\n        else if (name) names.add(",
      replace: "        if (name) names.add(",
    },
    {
      name: "a pyproject.toml no item names not judged",
      find: "      readPythonIndexes(text, out);\n",
      replace: "",
    },
    {
      name: "a uv.toml no item names not judged",
      find: "      readPythonIndexes(readIf(path.join(appDir, rel)), out, { uvToml: true });\n",
      replace: "",
    },
    {
      name: "a slash in a range",
      find: "registryRange: /^[\\w.*<>=!~^|+, \\t-]*$/,",
      replace: "registryRange: /^[\\w.*<>=!~^|+, \\t\\/:-]*$/,",
    },
    {
      name: "protocols listed",
      find: "/^(?:(?!npm:|patch:)[a-z][\\w+.-]*:|\\.|",
      replace: "/^(?:file:|link:|workspace:|portal:|git(?:\\+|:|hub:)|https?:|[A-Za-z]:|\\.|",
    },
    {
      name: "uv source names not private",
      find: 'for (const name of uvSourceNames(leaves)) names.add(keyOf("pip", name));',
      replace: "",
    },
    {
      name: "a slash not a folder",
      find: "|\\.|[^\\\\/]*[\\\\/]|[\\w.-]+@",
      replace: "|\\.|[\\\\/]|~[\\\\/]|[\\w.-]+@",
    },
    {
      name: "a tilde range taken for a folder",
      find: "|\\.|[^\\\\/]*[\\\\/]|[\\w.-]+@",
      replace: "|\\.|~|[^\\\\/]*[\\\\/]|[\\w.-]+@",
    },
    {
      name: "an item's place private here only",
      find: "for (const i of items) if (itemPlace(i) && i.name)",
      replace: "for (const i of items) if (i.local && i.name)",
    },
    {
      name: "unproven marked private",
      find: ": { ...i, unproven: true, exists: null };",
      replace: ": { ...i, private: true, exists: null };",
    },
    {
      name: "no range allowlist",
      find: "  return ranges.some((r) => r != null && !NETWORK_PATTERNS.registryRange.test(String(r)));",
      replace: "  return false;",
    },
    {
      name: "no proof needed",
      find: '  return registries.proven?.has(proofId(item)) ? null : "unproven";',
      replace: "  return null;",
    },
    {
      name: "the npm proof case-insensitive",
      find: "const proofId = packageId;",
      replace: "const proofId = (item) => packageId(item).toLowerCase();",
    },
    {
      name: "a package.json that is not valid JSON names nothing (its declarations dropped, its lock still proving)",
      find: "        out.npmAll = true;\n      }",
      replace: "      }",
    },
    {
      name: "a name no public registry can hold is sent when a lock proves it",
      find: '  if (!registryName(item)) return "private";\n',
      replace: "",
    },
    {
      name: "an npm name of any length is sent",
      find: "item.name.length <= NPM_NAME_MAX && ",
      replace: "",
    },
  ],
};
