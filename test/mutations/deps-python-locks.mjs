// Mutants of engine/facts/deps/python-locks.mjs: the rules taken out, which the dependency tests must catch (RULES.md M16).
import { DEPENDENCY_TESTS, GROWTH_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/deps/python-locks.mjs",
  tests: DEPENDENCY_TESTS,
  // No mutant: uvBlocks' `if (b.source) report.doubt` — a block's `source` given twice is a key given twice under one
  // header, already a doubt of tomlEntries (read.mjs); the check stays as a guard should that reader change.
  mutants: [
    {
      name: "uv.lock's duplicate by a scan (quadratic)",
      find: "      const first = byKey.get(key);",
      replace: "      const first = [...byKey.values()].find((i) => i.name.toLowerCase() === key);",
      tests: [...DEPENDENCY_TESTS, ...GROWTH_TESTS],
    },
    {
      name: "uv.lock: a doubt still proves",
      find: "...(local ? { local: true } : doubt ? {} : { public: true }),",
      replace: "...(local ? { local: true } : { public: true }),",
    },
    {
      name: "Pipfile.lock: an index a proof again",
      find: "...(pipenvLocal(fields, sources, PIPENV_LOCK_PUBLIC) ? { local: true } : {}),",
      replace: "...(pipenvLocal(fields, sources, PIPENV_LOCK_PUBLIC) ? { local: true } : { public: true }),",
    },
    {
      name: "uv.lock: files elsewhere trusted",
      find: " || !!b.elsewhere;",
      replace: ";",
    },
    {
      name: "uv.lock read by its raw header and key",
      find: "  for (const { block, value, path: keys } of tomlEntries(text, report)) {",
      replace:
        '  for (const { block, value, section, key } of tomlEntries(text, report)) {\n    const keys = [...section.split("."), ...key.split(".")];',
    },
    {
      name: "uv.lock: its source's doubt dropped",
      find: "      b.source = inlineFields(value, report) ?? new Map();",
      replace: "      b.source = inlineFields(value) ?? new Map();",
    },
    {
      name: "uv.lock: a name that is no string trusted",
      find: "      if (b[field] === null) report.doubt = true;\n",
      replace: "",
    },
    {
      name: "uv.lock: a dependency's name read raw",
      find: 'tomlString(inlineFields(el)?.get("name") ?? "")',
      replace: '(inlineFields(el)?.get("name") ?? "").slice(1, -1)',
    },
    {
      name: "uv.lock: the root read raw",
      find: 'isProject(b) && tomlString(b.source.get("editable") ?? b.source.get("virtual") ?? "") === "."',
      replace: 'isProject(b) && (b.source.get("editable") ?? b.source.get("virtual") ?? "") === \'"."\'',
    },
    {
      name: "uv.lock: the registry read raw",
      find: "!isPyPI(tomlString(registry))",
      replace: "!isPyPI(String(registry).slice(1, -1))",
    },
    {
      name: "uv.lock: a file's URL read raw",
      find: 'tomlString(inlineFields(table, report)?.get("url") ?? "", report) ?? ""',
      replace: '(inlineFields(table, report)?.get("url") ?? "").slice(1, -1)',
    },
    {
      name: "Pipfile: an undeclared index public",
      find: "!(sources.has(index) && isPyPI(sources.get(index)))",
      replace: "sources.has(index) && !isPyPI(sources.get(index))",
    },
    {
      name: "a lock's hashes refused",
      find: 'const PIPENV_LOCK_PUBLIC = new Set([...PIPENV_PUBLIC, "hashes"]);',
      replace: "const PIPENV_LOCK_PUBLIC = PIPENV_PUBLIC;",
    },
    {
      name: "uv.lock: a later local duplicate trusted",
      find: "      if (local && first) ((first.local = true), delete first.public);\n",
      replace: "",
    },
    {
      name: "uv.lock: a form uv never writes trusted",
      find: 'if (["source", "sdist", "wheels"].includes(field) && keys.length !== 2) report.doubt = true;\n    else if (field === "sdist" || field === "wheels") {',
      replace: 'if (field === "sdist" || field === "wheels") {',
    },
    {
      name: "uv.lock: its files' doubt dropped",
      find: 'inlineFields(table, report)?.get("url")',
      replace: 'inlineFields(table)?.get("url")',
    },
    {
      name: "uv.lock in UTF-16 read",
      find: '  const text = readText(abs, manifest, unreadable, "strict");\n  if (text === null) return [];\n  const { blocks: all, doubt }',
      replace:
        "  const text = readText(abs, manifest, unreadable);\n  if (text === null) return [];\n  const { blocks: all, doubt }",
    },
    {
      name: "Pipfile: any field public",
      find: "  if ([...fields.keys()].some((f) => !allowed.has(f))) return true;\n",
      replace: "",
    },
    {
      name: "uv.lock: no source public",
      find: "const local = registry === undefined || !isPyPI(tomlString(registry))",
      replace: "const local = registry !== undefined && !isPyPI(tomlString(registry))",
    },
    {
      name: "uv.lock: never a proof",
      find: "...(local ? { local: true } : doubt ? {} : { public: true }),",
      replace: "...(local ? { local: true } : {}),",
    },
    {
      name: "a uv.lock [[package]] with no name is no doubt",
      find: "doubt: report.doubt === true || nameless };",
      replace: "doubt: report.doubt === true };",
    },
  ],
};
