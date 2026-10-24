// The test files that guard the dependency readers and the network gateway: what a mutant of their engine files is
// run against (test/tools/mutate.mjs). The growth tests (they measure time) only for a mutant that names them.
export const DEPENDENCY_TESTS = Object.freeze([
  "test/unit/facts-deps-text.test.mjs",
  "test/unit/facts-deps-common.test.mjs",
  "test/unit/facts-deps-npm.test.mjs",
  "test/unit/facts-deps-python.test.mjs",
  "test/unit/facts-deps-ecosystems.test.mjs",
  "test/unit/facts-deps-licences.test.mjs",
  "test/unit/facts-deps-installed.test.mjs",
  "test/unit/facts-deps-real-locks.test.mjs",
  "test/unit/facts-network-proof-package-lock.test.mjs",
  "test/unit/facts-network-proof-yarn.test.mjs",
  "test/unit/facts-network-proof-python.test.mjs",
  "test/unit/facts-network-second-net-npm.test.mjs",
  "test/unit/facts-network-second-net-python.test.mjs",
  "test/unit/facts-network-gateway.test.mjs",
  "test/unit/facts-network-describe.test.mjs",
  "test/unit/facts-network-allow.test.mjs",
  "test/unit/facts.test.mjs",
  "test/unit/facts-deps-properties-npm.test.mjs",
  "test/unit/facts-deps-properties-python.test.mjs",
]);

/** The growth tests, added to a mutant that makes a reader slower than linear. */
export const GROWTH_TESTS = Object.freeze(["test/unit/facts-deps-growth.test.mjs"]);
