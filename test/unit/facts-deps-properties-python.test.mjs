// Property, metamorphic and fuzz tests of the lock proof of `--network` (SECURITY.md "Network", ARCHITECTURE.md §6.9)
// for Python: uv.lock and poetry.lock, each beside its pyproject.toml, generated from an abstract model whose negative
// evidence is tagged in the rendered lines (test/tools/fuzz/). Each evaluation is checked against the invariants (I1
// provenance, I2 privacy, I3 the gateway, I4 totality, I5 the shape of a sent name) and the ground truth of the tags
// (I2′), then its relation: R-MODEL, R-EQ, R-TAINT, R-LE, R-DECL, R-RELOCATE; the TOML errors uv and Poetry refuse
// prove nothing (I7). Pipfile.lock: the invariants only (it never proves a name). A fixed run seed: the same cases
// every run; the long run on random seeds is `node test/tools/fuzz/soak.mjs`. No clock here (test/tools/run-plan.mjs).
import { test, describe, after } from "node:test";
import { PY_FORMATS } from "../tools/fuzz/render-python.mjs";
import { propertiesOf, grammarsOf } from "../tools/fuzz/properties.mjs";
import { createSandbox, assertProperty, RUN_SEED } from "../tools/fuzz/runner.mjs";
import { hex } from "../tools/fuzz/prng.mjs";

const sandbox = createSandbox("doc-kit-fuzz-python-");
after(() => sandbox.dispose());

describe(`the Python lock proof on generated locks (run seed ${hex(RUN_SEED)})`, () => {
  for (const p of propertiesOf(PY_FORMATS)) test(p.title, () => assertProperty(p, { sandbox }));
});

describe("the Python grammars (E): each production a single operator on a fixed base", () => {
  for (const f of Object.values(PY_FORMATS))
    for (const p of grammarsOf(f)) test(p.title, () => assertProperty(p, { sandbox }));
});
