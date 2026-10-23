// Mutants of engine/facts/deps/toml-values.mjs: the rules taken out, which the dependency tests must catch (RULES.md M16).
import { DEPENDENCY_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/deps/toml-values.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "a string read raw",
      find: "  return keyPart(value.slice(0, end + 1), report);",
      replace: "  return value.slice(1, end);",
    },
    {
      name: "a string followed by more trusted",
      find: "  if (end >= value.length || value.slice(end + 1).trim()) return null;",
      replace: "  if (end >= value.length) return null;",
    },
    {
      name: "an inline key twice trusted",
      find: "    if (fields.has(key)) report.doubt = true;\n",
      replace: "",
    },
    {
      name: "an inline key read raw",
      find: '    const key = dottedParts(piece.slice(0, eq), report).join(".");',
      replace: "    const key = unquote(piece.slice(0, eq).trim());",
    },
    {
      name: "a long inline key followed",
      find: "    if (piece.slice(0, eq).trim().length > MAX_NAME) {",
      replace: "    if (false) {",
    },
  ],
};
