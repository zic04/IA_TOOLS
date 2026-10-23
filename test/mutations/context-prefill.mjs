// Mutants of engine/context/prefill.mjs: the dependency rows a page is prefilled with (RULES.md M16).

export default {
  target: "engine/context/prefill.mjs",
  tests: ["test/unit/prefill.test.mjs"],
  mutants: [
    {
      name: "a name cell not escaped",
      find: "    0: `\\`${cellText(item.name)}\\``,\n    1: cellText(",
      replace: "    0: `\\`${item.name}\\``,\n    1: cellText(",
    },
    {
      name: "the licence cell not escaped",
      find: "{ 3: cellText(item.license) }",
      replace: "{ 3: item.license }",
    },
  ],
};
