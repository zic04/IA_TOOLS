// Mutants of engine/facts/quality.mjs: the rules taken out, which the dependency tests must catch (RULES.md M16).
import { DEPENDENCY_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/quality.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "quality's fallback without the items",
      find: "privateRegistries(appDir, { items: dependencies })",
      replace: "privateRegistries(appDir)",
    },
  ],
};
