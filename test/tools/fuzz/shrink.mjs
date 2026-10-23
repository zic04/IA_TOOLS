// Bounded shrinking of a failing case of the property tests (critic's design, §3): the operators first (ddmin: halves,
// then one by one), then the model (a package, an instance, an own name, a declaration less, plainer packages), the
// style and the placement back to the canonical ones, then the lines of the files (ddmin on their ids: a line's tag
// goes with it, so that a group whose line is dropped is no longer intact and the oracle never lies). A smaller case
// is kept only when it fails with the same signature: the same property id and the same name.
import { smallerModels } from "./model.mjs";

/** Whether two failures are the same failure (shrinking must not turn one finding into another). */
const same = (a, b) => !!b && a.id === b.id && (a.name === undefined || a.name === b.name);

/**
 * The cases with the operators of `c` taken out by ddmin's chunks: halves, quarters…, then one by one. A `pin`ned
 * operator is the property's own (the production of a grammar under test): it always stays.
 */
function fewerOps(c) {
  const ops = c.ops ?? [];
  const out = [];
  for (let chunk = Math.ceil(ops.length / 2); chunk >= 1; chunk = chunk > 1 ? Math.ceil(chunk / 2) : 0)
    for (let at = 0; at < ops.length; at += chunk) {
      const kept = [...ops.slice(0, at), ...ops.slice(at + chunk)];
      if (ops.slice(at, at + chunk).some((o) => o.pin)) continue;
      out.push({ ...c, ops: kept });
    }
  return out;
}

/** The cases with a smaller model, a canonical style, no relocation, no unrelated files. */
function simpler(c) {
  const out = smallerModels(c.model).map((model) => ({ ...c, model }));
  if (c.style && Object.keys(c.style).length) {
    out.push({ ...c, style: {} });
    for (const k of Object.keys(c.style)) out.push({ ...c, style: { ...c.style, [k]: undefined } });
  }
  if (c.sub) out.push({ ...c, sub: "" });
  if (c.unrelated) out.push({ ...c, unrelated: false });
  return out;
}

/** The cases with some lines of the files dropped (ddmin on the ids of the lines still there). */
function fewerLines(c, ids) {
  const out = [];
  for (let chunk = Math.ceil(ids.length / 2); chunk >= 1; chunk = chunk > 1 ? Math.ceil(chunk / 2) : 0)
    for (let at = 0; at < ids.length; at += chunk)
      out.push({ ...c, drop: [...(c.drop ?? []), ...ids.slice(at, at + chunk)] });
  return out;
}

/**
 * The smallest case found that fails like `c` (bounded by `budget` evaluations of `check`), the evaluations it took,
 * and its failure. `lineIds(c)`: the ids of a case's lines (shrinking of the lines), from `check`'s property.
 * @param {any} c
 * @param {{ id: string, name?: string }} failure
 * @param {(c: any) => Promise<any>} check
 * @param {number} budget
 * @param {(c: any) => string[]} [lineIds]
 */
export async function shrink(c, failure, check, budget, lineIds) {
  let best = c;
  let last = failure;
  let tries = 0;
  const attempt = async (x) => {
    if (tries >= budget) return false;
    tries++;
    const f = await check(x);
    if (!same(failure, f)) return false;
    best = x;
    last = f;
    return true;
  };
  const steps = [fewerOps, simpler, ...(lineIds ? [(x) => fewerLines(x, lineIds(x))] : [])];
  for (const step of steps)
    for (let moved = true; moved && tries < budget;) {
      moved = false;
      for (const x of step(best))
        if (await attempt(x)) {
          moved = true;
          break;
        }
    }
  return { best, tries, failure: last };
}
