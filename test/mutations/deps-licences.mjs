// Mutants of engine/facts/deps/licences.mjs: the rules by which a licence is kept only as a licence's name (RULES.md
// M16), which the dependency tests must catch.
import { DEPENDENCY_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/deps/licences.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "a licence of any length (a whole text)",
      find: "const LICENCE_TEXT = /^[A-Za-z0-9(][A-Za-z0-9 .+\\-_()/,:]{0,99}$/;",
      replace: "const LICENCE_TEXT = /^[A-Za-z0-9(][A-Za-z0-9 .+\\-_()/,:]*$/;",
    },
    {
      name: "any character in a licence",
      find: "const LICENCE_TEXT = /^[A-Za-z0-9(][A-Za-z0-9 .+\\-_()/,:]{0,99}$/;",
      replace: "const LICENCE_TEXT = /^[^\\n]{1,100}$/;",
    },
    {
      name: "a secret kept as a licence",
      find: "|| !LICENCE_TEXT.test(text) || looksSecret(text)) return null;",
      replace: "|| !LICENCE_TEXT.test(text)) return null;",
    },
    {
      name: "UNKNOWN taken for a licence",
      find: "  if (NONE.has(text.toLowerCase()) || ",
      replace: "  if (",
    },
    {
      name: "npm: an object's type not read",
      find: 'v && typeof v === "object" && typeof v.type === "string" ? v.type : null;',
      replace: "null;",
    },
    {
      name: "Python: every classifier a licence",
      find: '.filter((c) => typeof c === "string" && c.length <= 200 && CLASSIFIER.test(c))',
      replace: '.filter((c) => typeof c === "string" && c.length <= 200)',
    },
    {
      name: "Python: OSI Approved taken for a licence",
      find: '.filter((leaf) => leaf && leaf !== "OSI Approved" && leaf !== "License");',
      replace: ".filter(Boolean);",
    },
    {
      name: "the same licence twice",
      find: "  const kept = [...new Set(names.map(safeLicence).filter(Boolean))].slice(0, MAX_PARTS);",
      replace: "  const kept = names.map(safeLicence).filter(Boolean).slice(0, MAX_PARTS);",
    },
  ],
};
