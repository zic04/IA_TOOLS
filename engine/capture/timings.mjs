// Every duration of a capture run, in one place (AUDIT.md M11), in milliseconds. Waits are on conditions
// (stable.mjs, ETUDE-CAPTURES.md §5): these are their caps, never fixed sleeps, except `wheelStep` (a wheel
// scroll has no condition to wait for) and `challengePoll` (the polling period of a bot challenge).
export const TIMINGS = Object.freeze({
  /** Stability (stable.mjs): quiet period of the network and the DOM, overall cap, cap of the network part. */
  quiet: 150,
  stableMax: 10_000,
  networkMax: 3_000,
  /** Quiet period on the built site (`view`, `check tables`): a local file, no network, light rendering. */
  siteQuiet: 60,
  /** An element of a plan (target, frame, zone) to become visible, and an action on it. */
  element: 8_000,
  /** `{ wait: target }` in a plan. */
  waitTarget: 15_000,
  /** Pause after each wheel step of `{ wheel }`. */
  wheelStep: 350,
  /** Navigation: the sign-in start page (and a session refresh request), a captured page. */
  start: 30_000,
  page: 45_000,
  /** The network to go idle after the session check. */
  sessionIdle: 5_000,
  /** A bot challenge (Cloudflare and the like) clearing by itself, and how often it is checked. */
  challenge: 20_000,
  challengePoll: 1_000,
  /** `connect`: the person signing in, and how often the session is checked meanwhile. */
  signIn: 15 * 60_000,
  signInPoll: 2_000,
});
