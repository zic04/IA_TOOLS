// Mutants of engine/facts/deps/installed.mjs: the rules by which a licence is read from an installed copy — inside the
// application, the item's own copy (its name, its version), the nearest one judged alone, within bounds, never over a
// lock's — taken out, which the dependency tests must catch (RULES.md M16).
import { DEPENDENCY_TESTS, GROWTH_TESTS } from "./_tests.mjs";

/** `return null` turned into `continue`: a copy further up stands in for the one judged. */
const standsIn = (name, line) => ({ name, find: line, replace: line.replace("return null;", "continue;") });

export default {
  target: "engine/facts/deps/installed.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "no confinement: a link out of the application followed",
      find: '  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);',
      replace: "  return true;",
    },
    {
      name: "the lock's licence replaced by the installed one",
      find: "    if (item.license || !Object.hasOwn(COPIES, item.ecosystem)) return item;",
      replace: "    if (!Object.hasOwn(COPIES, item.ecosystem)) return item;",
    },
    {
      name: "a name looked up as a path (`..` taken for an entry)",
      find: "    if (!folder.names.has(part)) return null;\n",
      replace: "",
    },
    {
      name: "npm: package.json resolved by the system, links out of the application followed",
      find: '    const file = dir && resolveInside(run, path.join(dir, "package.json"));',
      replace: '    const file = dir && fs.realpathSync(path.join(dir, "package.json"));',
    },
    {
      name: "npm: the version not checked",
      find: "    if (item.version && doc.version !== item.version) return null; // another copy of the package\n",
      replace: "",
    },
    {
      name: "npm: the name not checked",
      find: "    if (!doc || doc.name !== item.name) return null;",
      replace: "    if (!doc) return null;",
    },
    standsIn(
      "npm: a copy further up stands in for another version",
      "    if (item.version && doc.version !== item.version) return null;",
    ),
    standsIn(
      "npm: a copy further up stands in for another name",
      "    if (!doc || doc.name !== item.name) return null;",
    ),
    standsIn("npm: a copy further up stands in for one out of the application", "    if (!file) return null;"),
    {
      name: "npm: the farthest copy first",
      find: "  for (const folder of folders) {\n    const dir = lookUp(",
      replace: "  for (const folder of [...folders].reverse()) {\n    const dir = lookUp(",
    },
    {
      name: "npm: a package.json of any size",
      find: "const MAX_PACKAGE_JSON = 1024 * 1024;",
      replace: "const MAX_PACKAGE_JSON = Infinity;",
    },
    {
      name: "pip: METADATA resolved by the system, links out of the application followed",
      find: "  const real = resolveInside(run, file);\n  if (!real) return null;",
      replace: "  const real = fs.realpathSync(file);\n  if (!real) return null;",
    },
    {
      name: "pip: the version not checked",
      find: "      if (item.version && meta.version !== item.version) return null; // a folder's name is no proof of its version\n",
      replace: "",
    },
    {
      name: "pip: the name not checked",
      find: '      if (!meta || typeof meta.name !== "string" || packageKey("pip", meta.name) !== key) return null;',
      replace: "      if (!meta) return null;",
    },
    standsIn(
      "pip: a site-packages further up stands in for another version",
      "      if (item.version && meta.version !== item.version) return null;",
    ),
    standsIn(
      "pip: a site-packages further up stands in for another name",
      '      if (!meta || typeof meta.name !== "string" || packageKey("pip", meta.name) !== key) return null;',
    ),
    standsIn(
      "pip: a site-packages further up stands in for one without the item's version",
      "      if (!copy) return null;",
    ),
    standsIn("pip: a site-packages further up stands in for a refused environment", "    if (!sites) return null;"),
    {
      name: "pip: a refused environment skipped",
      find: "    if (venv === false) return false;",
      replace: "    if (venv === false) continue;",
    },
    {
      name: "pip: the farthest environment first",
      find: "  for (const folder of folders) {\n    const sites",
      replace: "  for (const folder of [...folders].reverse()) {\n    const sites",
    },
    {
      name: "pip: the item's version not used to choose among its copies",
      find: "        ? copies.find((c) => c.version === item.version)",
      replace: "        ? copies.length === 1 ? copies[0] : null",
    },
    {
      name: "pip: one of several copies taken when the item has no version",
      find: "        : copies.length === 1\n          ? copies[0]\n          : null;",
      replace: "        : copies[0];",
    },
    {
      name: "a folder listed whatever its size",
      find: "      if (names.size >= max) return false;\n",
      replace: "",
    },
    { name: "the bound of a folder's entries raised", find: "  entries: 10_000,", replace: "  entries: Infinity," },
    {
      name: "pip: a site-packages of any size",
      find: "    if (++count > run.limits.distInfos) {",
      replace: "    if (++count > Infinity) {",
    },
    { name: "the bound of dist-info folders raised", find: "  distInfos: 5000,", replace: "  distInfos: Infinity," },
    {
      name: "pip: any number of python* folders",
      find: "const MAX_PYTHONS = 4;",
      replace: "const MAX_PYTHONS = Infinity;",
    },
    {
      name: "METADATA: no bound on the header read",
      find: "const MAX_HEADER = 64 * 1024;",
      replace: "const MAX_HEADER = Infinity;",
    },
    {
      name: "METADATA: read past its header's blank line",
      find: '    if (line === "") ended = true;',
      replace: '    if (line === "") continue;',
    },
    {
      name: "METADATA: a cut header keeps the field it was cut in",
      find: "  if (cut && !ended) fields.pop();\n",
      replace: "",
    },
    {
      // One continuation line in 256, so that the growth test ends in a minute rather than at the time-out: a quadratic
      // part that small is still past ×8 at 16 times its size.
      name: "METADATA: the field folded so far scanned again at its lines (quadratic)",
      find: "      if (fields.length) to = stop;",
      replace:
        '      if (fields.length) to = (stop & 255) === 0 && body.slice(from, stop).includes("\\0") ? to : stop;',
      tests: [...DEPENDENCY_TESTS, ...GROWTH_TESTS],
    },
    {
      name: "METADATA: a cut header read as a whole one",
      find: "{ cut: bytes.length > MAX_HEADER }",
      replace: "{ cut: false }",
    },
  ],
};
