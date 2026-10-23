// Property, metamorphic and fuzz tests of the lock proof of `--network` (SECURITY.md "Network", ARCHITECTURE.md §6.9)
// for npm: package-lock.json v1, v2 and v3 and yarn.lock v1, each beside its package.json, generated from an abstract
// model whose negative evidence is tagged in the rendered lines (test/tools/fuzz/). Each evaluation is checked against
// the invariants (I1 provenance, I2 privacy, I3 the gateway, I4 totality, I5 the shape of a sent name) and the ground
// truth of the tags (I2′), then its relation: R-MODEL, R-EQ, R-TAINT, R-LE, R-DECL, R-RELOCATE. pnpm-lock.yaml and a
// yarn berry lock: the invariants only (they never prove a name). A fixed run seed: the same cases every run; the
// long run on random seeds is `node test/tools/fuzz/soak.mjs`. No clock here (test/tools/run-plan.mjs).
import { test, describe, after } from "node:test";
import { NPM_FORMATS } from "../tools/fuzz/render-npm.mjs";
import { propertiesOf, grammarsOf } from "../tools/fuzz/properties.mjs";
import { createSandbox, assertProperty, RUN_SEED } from "../tools/fuzz/runner.mjs";
import { hex } from "../tools/fuzz/prng.mjs";

const sandbox = createSandbox("doc-kit-fuzz-npm-");
after(() => sandbox.dispose());

describe(`the npm lock proof on generated locks (run seed ${hex(RUN_SEED)})`, () => {
  for (const p of propertiesOf(NPM_FORMATS)) test(p.title, () => assertProperty(p, { sandbox }));
});

describe("the npm grammars (E): each production a single operator on a fixed base", () => {
  for (const f of Object.values(NPM_FORMATS))
    for (const p of grammarsOf(f)) test(p.title, () => assertProperty(p, { sandbox }));
});
