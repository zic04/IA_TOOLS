// Authentication adapter of a public application: no sign-in, no session. `connect` has nothing to do and
// `capture` never loads a session (read-only stays off unless capture.readOnly is true).
//   auth: { adapter: "none" }
export default {
  name: "none",
  options: {},
  browser: "chromium",
  none: true,
  async session() {
    return { who: null };
  },
};
