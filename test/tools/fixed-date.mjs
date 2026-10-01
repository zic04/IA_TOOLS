// Freezes the clock of a Node process, for a reproducible build by an older engine:
//   DOC_KIT_FIXED_DATE=2026-10-01 node --import <URL of this file> <script>
// `new Date()` (no argument) and `Date.now()` return that day at noon, local time; `new Date(x)` is unchanged.
// Without the variable, this module does nothing. (On Windows, pass the file:// URL produced by
// pathToFileURL, never a raw path.)
const value = process.env.DOC_KIT_FIXED_DATE;

if (value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`invalid DOC_KIT_FIXED_DATE: ${value} (expected YYYY-MM-DD)`);
  const RealDate = globalThis.Date;
  const fixed = new RealDate(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0).getTime();

  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  }
  // Called without `new`, Date() returns a string: keep it consistent with the frozen clock.
  globalThis.Date = new Proxy(FixedDate, { apply: () => new RealDate(fixed).toString() });
}
