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
      find: "? { ...i, unproven: true, ...unknown }",
      replace: "? { ...i, private: true, ...unknown }",
    },
    {
      name: "no range allowlist",
      find: "  return ranges.some((r) => r != null && !NETWORK_PATTERNS.registryRange.test(String(r)));",
      replace: "  return false;",
    },
    {
      name: "no proof needed",
      find: '  if (!registries.proven?.has(proofId(item))) return "unproven";\n',
      replace: "",
    },
    // The configuration's list (facts.network.allow): facts-network-allow.test.mjs.
    {
      name: "the list judged first (an unlisted private or unproven name given as unlisted: a candidate)",
      find: 'function privacyOf(item, registries) {\n  if (itemPlace(item)) return "private";\n',
      replace:
        'function privacyOf(item, registries) {\n  if (!registries.allowed?.has(packageId(item))) return "unlisted";\n' +
        '  if (itemPlace(item)) return "private";\n',
    },
    {
      name: "the list removed (every proven, public name sent)",
      find: '  return registries.allowed?.has(packageId(item)) ? null : "unlisted";',
      replace: "  return null;",
    },
    {
      name: "the gate after the run's answers (an answer already there given for an unlisted package)",
      find: "      const registry = guard(item);\n      if (!registry) return null;\n      const id = packageId(item);\n",
      replace:
        "      const id = packageId(item);\n      if (answers.has(id)) return answers.get(id);\n" +
        "      const registry = guard(item);\n      if (!registry) return null;\n",
    },
    {
      name: "a listed pip name not normalised (PEP 503)",
      find: "    if (!listed.error) ids.add(packageId(listed));",
      replace: "    if (!listed.error) ids.add(`${listed.ecosystem}\\0${listed.name}`);",
    },
    {
      name: "a listed name compared in any case (npm's are exact)",
      find: "    if (!listed.error) ids.add(packageId(listed));",
      replace: "    if (!listed.error) ids.add(packageId({ ...listed, name: listed.name.toLowerCase() }));",
    },
    {
      name: "an unlisted item not marked",
      find: ": { ...i, unlisted: true, ...unknown };",
      replace: ": { ...i, ...unknown };",
    },
    {
      name: "the candidates include the private and unproven names",
      find: '    if (why === "unlisted" && i.direct)',
      replace: "    if (why !== null && i.direct)",
    },
    {
      name: "the candidates include transitive packages",
      find: '    if (why === "unlisted" && i.direct)',
      replace: '    if (why === "unlisted")',
    },
    {
      name: "a package another item keeps back still a candidate",
      find: '    else if (why === "private" || why === "unproven") kept.add(packageId(i));\n',
      replace: "",
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
    // What is kept of a registry's answer (describe, checkExistence): facts-network-describe.test.mjs.
    {
      name: "the version allowlist removed",
      find: 'typeof value === "string" && NETWORK_PATTERNS.version.test(value) && !looksSecret(value)',
      replace: 'typeof value === "string" && !looksSecret(value)',
    },
    {
      name: "a version of any length",
      find: "version: /^\\d[0-9A-Za-z.+!-]{0,63}$/,",
      replace: "version: /^\\d[0-9A-Za-z.+!-]*$/,",
    },
    {
      name: "a secret kept as a version",
      find: "NETWORK_PATTERNS.version.test(value) && !looksSecret(value) ? value : null;",
      replace: "NETWORK_PATTERNS.version.test(value) ? value : null;",
    },
    {
      name: "npm's licence not filtered",
      find: "    license: (doc) => npmLicence(doc),",
      replace: "    license: (doc) => doc?.license ?? null,",
    },
    {
      name: "PyPI's licence not filtered",
      find: "    license: (doc) =>\n      pythonLicence({",
      replace: "    license: (doc) =>\n      doc?.info?.license_expression ?? doc?.info?.license ?? pythonLicence({",
    },
    {
      name: "the offline licence overwritten",
      find: "  if (!licensed && answer?.exists && answer.license) {",
      replace: "  if (answer?.exists && answer.license) {",
    },
    {
      name: "the offline licence judged per item, not per package",
      find: "licensed.has(packageId(i)));",
      replace: "Boolean(i.license));",
    },
    {
      name: "one request a package removed (the answers of the run not kept)",
      find: "      if (!answers.has(id))\n",
      replace: "      if (true)\n",
    },
    {
      name: "transitive items described",
      find: "const direct = items.filter((i) => i.direct && !isPrivate(i));",
      replace: "const direct = items.filter((i) => !isPrivate(i));",
    },
    {
      name: "a body of any size read",
      find: '  if (Number(res.headers?.get?.("content-length")) > MAX_BODY_BYTES) {',
      replace: "  if (false) {",
    },
    {
      name: "a body that never settles holds the worker",
      find: "    return await Promise.race([answer, expired]);",
      replace: "    return await answer;",
    },
  ],
};
