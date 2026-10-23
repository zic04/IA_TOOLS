// The seeded randomness of the property tests of the lock proof (test/tools/fuzz/): mulberry32 for each case's own
// stream, and fmix32 (MurmurHash3's finaliser) to derive a case's seed from the run's seed and its index, so that one
// case is reproduced from its seed alone, whatever ran before it. No clock and no Math.random: a run is a function of
// its seed (test/unit/facts-deps-properties-*.test.mjs use a fixed one; test/tools/fuzz/soak.mjs prints its own).

/** MurmurHash3's 32-bit finaliser: every bit of `h` moves every bit of the result. */
export function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The seed of case `index` of a run: independent streams, one per case. */
export const caseSeed = (run, index) => fmix32((run ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);

/** A 32-bit number as the reports print it: `0x0d0c11a1`. */
export const hex = (n) => `0x${(n >>> 0).toString(16).padStart(8, "0")}`;

/** A seed written `0x…` or in decimal, as soak.mjs reads it from its arguments; NaN when it is none. */
export const parseSeed = (text) => (/^0x[0-9a-f]{1,8}$/i.test(text) ? parseInt(text, 16) : Number(text)) >>> 0;

/**
 * @typedef {{ u32: () => number, int: (n: number) => number, chance: (p: number) => boolean,
 *   pick: <T>(list: readonly T[]) => T, shuffle: <T>(list: readonly T[]) => T[] }} Rng
 */

/**
 * A stream of numbers from `seed` (mulberry32): `u32`, `int(n)` in [0, n), `chance(p)`, `pick(list)`, `shuffle(list)`
 * (a new array). Every draw a case needs is taken at generation time and stored in the case: shrinking never draws.
 * @param {number} seed
 * @returns {Rng}
 */
export function rng(seed) {
  let s = seed >>> 0;
  const u32 = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const int = (n) => (n > 0 ? u32() % n : 0);
  return {
    u32,
    int,
    chance: (p) => u32() < p * 2 ** 32,
    pick: (list) => list[int(list.length)],
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
