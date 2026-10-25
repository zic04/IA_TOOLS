// Mutants of engine/core/versions.mjs: how far behind its latest version a dependency is, the rule `majorsBehind` of
// `--network` and the outdated count of `quality` share (RULES.md M16), which the dependency tests must catch.
import { DEPENDENCY_TESTS } from "./_tests.mjs";

export default {
  target: "engine/core/versions.mjs",
  tests: [...DEPENDENCY_TESTS, "test/unit/reviews.test.mjs"],
  mutants: [
    {
      name: "majorsBehind allowed to go negative",
      find: "Math.max(0, newest - current)",
      replace: "newest - current",
    },
    {
      name: "a lower bound taken to name the major",
      find: '["^", "~", "=="].some((op) => spec.startsWith(op))',
      replace: '["^", "~", "==", ">="].some((op) => spec.startsWith(op))',
    },
    {
      name: "any range taken to name the major",
      find: "majorOf(item.version ?? (namesMajor ? item.spec : null))",
      replace: "majorOf(item.version ?? item.spec)",
    },
    {
      name: "a range read before the exact version",
      find: "majorOf(item.version ?? (namesMajor ? item.spec : null))",
      replace: "majorOf((namesMajor ? item.spec : null) ?? item.version)",
    },
  ],
};
