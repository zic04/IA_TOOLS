// Mutants of engine/facts/deps/graph.mjs: the rules taken out, which the dependency tests must catch (RULES.md M16).
import { DEPENDENCY_TESTS, GROWTH_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/deps/graph.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "a shared list walked for each name (quadratic)",
      find: "    if (!children || walked.has(children)) continue;",
      replace: "    if (!children) continue;",
      tests: [...DEPENDENCY_TESTS, ...GROWTH_TESTS],
    },
  ],
};
