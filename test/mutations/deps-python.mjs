// Mutants of engine/facts/deps/python.mjs: the rules by which a Python manifest or lock proves a name public or local.
import { DEPENDENCY_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/deps/python.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "poetry.lock: another array of tables trusted",
      find: '.some((name) => name !== "package");',
      replace: ".some(() => false);",
    },
    {
      name: "poetry.lock: a later local duplicate trusted",
      find: "      if (b.local && first) ((first.local = true), delete first.public);",
      replace: "      void first;",
    },
    {
      name: "uv.lock: any file host",
      find: "  pypiFile: /^https:\\/\\/files\\.pythonhosted\\.org\\/packages\\//i,",
      replace: "  pypiFile: /^https:\\/\\//i,",
    },
    {
      name: "poetry.lock read by its raw header and key",
      find: "    const { block, value, path: keys } = entry;",
      replace:
        '    const { block, value, section, key } = entry;\n    const keys = [...section.split("."), ...key.split(".")];',
    },
    {
      name: "poetry.lock: a name that is no string trusted",
      find: '      if (b[field] === null) report.doubt = true;\n    } else if (keys.length === 2 && field === "groups")',
      replace: '    } else if (keys.length === 2 && field === "groups")',
    },
    {
      name: "poetry.lock: a source field read raw",
      find: "tomlString(leaf.value, report) ?? leaf.value",
      replace: "leaf.value.slice(1, -1)",
    },
    {
      name: "poetry.lock: a group read raw",
      find: 'tomlArray(value).some((g) => tomlString(g) === "main")',
      replace: "tomlArray(value).some((g) => g === '\"main\"')",
    },
    {
      name: "pyproject: a dependency read raw",
      find: '      const r = pep508(tomlString(element) ?? "");',
      replace: "      const r = pep508(element.slice(1, -1));",
    },
    {
      name: "poetry.lock: a source in two forms trusted",
      find: "    if (b.sourceForms.size > 1) report.doubt = true;\n",
      replace: "",
    },
    {
      name: "an unread requirement trusted",
      find: "(element[0] === '\"' || element[0] === \"'\") && tomlString(element) === null",
      replace: "false",
    },
    {
      name: "requirements in an inline table not read",
      find: '    if (value[0] === "{" && depth < 8) {',
      replace: "    if (false) {",
    },
    {
      name: "Poetry: any field public",
      find: "[...fields.keys()].some((f) => !POETRY_PUBLIC.has(f)) ||",
      replace: "",
    },
    {
      name: "Poetry: groups not read",
      find: '(keys[4] === "dependencies" || keys[4] === "dev-dependencies") ? 5 : 0;',
      replace: "false ? 5 : 0;",
    },
    {
      name: "uv source: the last part",
      find: "names.push(keys[3]);",
      replace: "names.push(keys.at(-1));",
    },
    {
      name: "allows-prereleases refused",
      find: '  "allows-prereleases",\n',
      replace: "",
    },
    {
      name: "parentheses kept",
      find: 'const spec = written.startsWith("(") && written.endsWith(")") ? written.slice(1, -1).trim() : written;',
      replace: "const spec = written;",
    },
    {
      name: "options kept in a requirement",
      find: 'const options = [line.indexOf(" --"), line.indexOf("\\t--")].filter((i) => i >= 0);',
      replace: "const options = [];",
    },
    {
      name: "a comment line continued",
      find: '    if (!line.endsWith("\\\\") || isCommentLine(line)) {',
      replace: '    if (!line.endsWith("\\\\")) {',
    },
    {
      name: "joined with a blank",
      find: 'joined = (joined ?? "") + stripBackslashes(line);',
      replace: 'joined = (joined ?? "") + stripBackslashes(line) + " ";',
    },
    {
      name: "an override from a URL public",
      find: "        if (name) names.push(name);",
      replace: "",
    },
    {
      name: "0x1f no blank",
      find: "0x1e, 0x1f, 32,",
      replace: "0x1e, 32,",
    },
    {
      name: "JavaScript's blanks (U+FEFF one)",
      find: "const isBlank = (c) => PY_BLANKS.has(c.charCodeAt(0));",
      replace: 'const isBlank = (c) => c.trim() === "";',
    },
    {
      name: "poetry.lock: type or url enough",
      find: 'source.get("type") === "legacy" && PYTHON_PATTERNS.publicIndex',
      replace: 'source.get("type") === "legacy" || PYTHON_PATTERNS.publicIndex',
    },
    {
      name: "poetry.lock: a doubt still proves",
      find: "...(b.local ? { local: true } : doubt ? {} : { public: true }),",
      replace: "...(b.local ? { local: true } : { public: true }),",
    },
    {
      name: "poetry.lock in UTF-16 read",
      find: '  const text = readText(abs, manifest, unreadable, "strict");\n  if (text === null) return [];\n  const declared',
      replace: "  const text = readText(abs, manifest, unreadable);\n  if (text === null) return [];\n  const declared",
    },
    {
      name: "Poetry: a private source public",
      find: 'sources.some((s) => String(s).toLowerCase() !== "pypi")',
      replace: "false",
    },
    {
      name: "continued lines not joined",
      find: '    if (!line.endsWith("\\\\") || isCommentLine(line)) {',
      replace: "    if (true) {",
    },
    {
      name: "comments not dropped",
      find: 'if (line[i] === "#" && (i === 0 || isBlank(line[i - 1]))) return line.slice(0, i);',
      replace: "void i;",
    },
    {
      name: "poetry.lock: never a proof",
      find: "...(b.local ? { local: true } : doubt ? {} : { public: true }),",
      replace: "...(b.local ? { local: true } : {}),",
    },
    {
      name: "poetry.lock's source by section only",
      find: "  for (const leaf of tomlLeaves([entry], report)) {",
      replace: "  for (const leaf of []) {",
    },
    {
      name: "a poetry.lock [[package]] with no name takes the next tables away silently",
      find: "  return { blocks, doubt: report.doubt === true || otherArrays || nameless };",
      replace: "  return { blocks, doubt: report.doubt === true || otherArrays };",
    },
  ],
};
