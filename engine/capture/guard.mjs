// The safety guard of a capture run (capture.mjs installs it on every browser context, SECURITY.md › Read-only
// captures have limits):
//   read-only   every request other than GET/HEAD/OPTIONS is aborted in the browser and counted (on whenever a
//               session is used, with capture.readOnly "auto"; always with capture.target "production");
//   forbidden   capture.forbidden routes are never requested, whatever the method: a write made by the server
//               while rendering cannot be blocked by the browser, so the request must never leave it. A request
//               that only PREFETCHES such a route (fetch, XHR, framework payload, <link rel=prefetch>, iframe,
//               any sub-resource) is aborted silently and counted: aborting it is what prevents the render. Only a
//               navigation of a top-level frame (the plan's route, a click on a link, a pop-up) stops the capture;
//   redirects   with capture.forbidden, every GET navigation is fetched here hop by hop, within bounds (one hop,
//               the whole chain, the answer held): the browser never follows a redirect itself.
import { forbiddenMatch, shownPath, applicationKey } from "./plans.mjs";
import { isLoopbackUrl } from "./session.mjs";
import { TIMINGS } from "./timings.mjs";

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

/**
 * Kind of a request to a forbidden route.
 *   "navigation"  a top-level frame opens the route (the plan's route, a click on a link, a pop-up, a redirect):
 *                 the capture would show it, so it stops;
 *   "prefetch"    anything else (fetch, XHR, framework payload, <link rel=prefetch>, iframe, sub-resource): aborted
 *                 silently, the capture goes on.
 * A navigation whose frame is not known yet (a pop-up being created) counts as a navigation.
 * @param {import("playwright").Request} request
 * @returns {"navigation"|"prefetch"}
 */
export function forbiddenRequestKind(request) {
  if (!request.isNavigationRequest()) return "prefetch";
  let frame;
  try {
    frame = request.frame();
  } catch {
    return "navigation";
  }
  return frame?.parentFrame() ? "prefetch" : "navigation";
}

/** A URL without its fragment: what a request asks the server for. */
const withoutHash = (href) => href.split("#")[0];

/**
 * The page a navigation is answered with when the guard has followed its redirects itself: it sends the browser on
 * to the end of the chain, a new navigation that the guard sees, where a redirect would be followed unseen.
 */
const landingPage = (href) =>
  `<!doctype html><meta charset="utf-8"><script>location.replace(${JSON.stringify(href).replace(/</g, "\\u003c")})</script>`;

/** The frame of a request, or null (a pop-up being created). */
function frameOf(request) {
  try {
    return request.frame();
  } catch {
    return null;
  }
}

/** Frees an answer the guard fetched (Playwright keeps its body until then); one already freed is no error. */
const dispose = (response) => response.dispose().catch(() => {});

/** Longest redirect chain followed before a navigation; a longer one is refused like a forbidden route. */
const MAX_REDIRECTS = 10;

/**
 * The bounds of a chain the guard follows (SECURITY.md): one hop and the whole chain (timings.mjs), and the largest
 * answer it holds for a frame, in bytes (a larger one is refused).
 */
const LIMITS = Object.freeze({ hop: TIMINGS.redirectHop, chain: TIMINGS.redirectChain, bytes: 32 * 1024 * 1024 });

/**
 * @typedef {{ url: string, response: import("playwright").APIResponse, opened: boolean, committed: Promise<unknown>,
 *   open: (committed: Promise<unknown>) => void, drop: () => void }} Landing  the end of a redirect chain the guard
 *   followed for a frame, its answer, whether the frame has opened it yet, and `committed`: settled once the frame
 *   has committed that answer (rejected when the frame goes elsewhere first)
 * @typedef {((route: import("playwright").Route) => Promise<void>) & { landing: (frame: object) => Landing|undefined }}
 *   Guard
 */

/** The end of a chain held for a frame (a Landing). */
function newLanding(url, response) {
  let settle;
  const committed = new Promise((resolve, reject) => (settle = { resolve, reject }));
  committed.catch(() => {}); // awaited only after a goto (afterRedirects, take.mjs)
  return {
    url,
    response,
    opened: false,
    committed,
    open: (p) => settle.resolve(p),
    drop: () => {
      settle.reject(new Error("the frame went elsewhere before the end of its redirects"));
      dispose(response);
    },
  };
}

/** Settled when `frame` commits its next navigation (TIMINGS.page at most). */
const nextCommit = (frame) =>
  frame.page().waitForEvent("framenavigated", { predicate: (f) => f === frame, timeout: TIMINGS.page });

/**
 * Route handler of the safety guard (installed on every page of the browser context).
 *   - a request to a capture.forbidden path of the application (any of its addresses: `applicationKey`) is aborted:
 *     a navigation is listed in `result.refused` and reported through `onNavigation(path)` (the capture stops),
 *     anything else is listed in `result.prefetched` (the capture goes on);
 *   - with forbidden routes, a GET navigation (any origin) is fetched here hop by hop (`redirectChain`, within
 *     `limits`); the browser only gets the end of its chain: the answer itself, or a page that sends the frame on to
 *     the end, whose answer is held for that frame's next navigation (`landing(frame)`, for `afterRedirects`,
 *     take.mjs); a chain too slow, or an answer too large to hold, is reported through `onStop(key, vars)`;
 *   - with `readOnly`, any other method than GET/HEAD/OPTIONS is aborted and listed in `result.blocked`.
 * A path is reported without its path parameters (`shownPath`).
 * @param {{ appOrigin: string, forbidden: Array<{pattern, re}>, readOnly: boolean,
 *   result: { blocked: string[], refused: string[], prefetched: string[] }, onNavigation?: (path: string) => void,
 *   onStop?: (key: string, vars: object) => void, limits?: { hop: number, chain: number, bytes: number },
 *   now?: () => number }} p   `limits` and `now` (the clock): test seams
 * @returns {Guard}
 */
export function requestGuard({
  appOrigin,
  forbidden,
  readOnly,
  result,
  onNavigation = () => {},
  onStop = () => {},
  limits = LIMITS,
  now = Date.now,
}) {
  const app = applicationKey(appOrigin);
  const onApp = (u) => applicationKey(u) === app;
  /** What a request is reported as: its path on the application, its host and path elsewhere. */
  const shown = (u) => (onApp(u) ? "" : u.host) + shownPath(u.pathname);
  /** @type {WeakMap<object, Landing>} */
  const landings = new WeakMap();
  const followed = { landings, onApp, forbidden, limits, now };
  const guard = async (route) => {
    const req = route.request();
    let u;
    try {
      u = new URL(req.url());
    } catch {
      return route.fallback();
    }
    const refuse = (pathname) => {
      const line = `${req.method()} ${shownPath(pathname)}`;
      if (forbiddenRequestKind(req) === "navigation") {
        result.refused.push(line);
        onNavigation(shownPath(pathname));
      } else result.prefetched.push(line);
      return route.abort("blockedbyclient");
    };
    // A navigation the guard could not complete: the capture stops when it is the page's own.
    const stop = (key, vars, reason) => {
      if (forbiddenRequestKind(req) === "navigation") onStop(key, { route: shown(u), ...vars });
      return route.abort(reason);
    };
    if (forbidden.length && onApp(u) && forbiddenMatch(u.pathname, forbidden)) return refuse(u.pathname);
    // The browser follows a redirect without calling this handler again, and a stateful server may answer the
    // browser otherwise than the guard: with forbidden routes, the browser never gets a redirect (SECURITY.md).
    if (
      forbidden.length &&
      req.isNavigationRequest() &&
      SAFE_METHODS.includes(req.method()) &&
      /^https?:$/.test(u.protocol)
    )
      return navigate(followed, route, u, { refuse, stop });
    if (readOnly && !SAFE_METHODS.includes(req.method())) {
      result.blocked.push(`${req.method()} ${shown(u)}`);
      return route.abort("blockedbyclient");
    }
    return route.fallback();
  };
  return Object.assign(guard, { landing: (frame) => landings.get(frame) });
}

/** Drops what was held for a frame (it goes elsewhere): an answer it has not opened is freed, its wait fails. */
function forget(landings, frame) {
  const held = landings.get(frame);
  landings.delete(frame);
  if (held && !held.opened) held.drop();
}

/** An answer the browser gets as is, freed once it has it. */
async function answer(route, response) {
  try {
    await route.fulfill({ response });
  } finally {
    await dispose(response);
  }
}

/**
 * A navigation of a frame (requestGuard): the end of the chain the guard's page sent this frame to (its answer, once),
 * or the chain followed here. Another frame, or one not known yet (a pop-up being created), asks the server again.
 */
async function navigate({ landings, onApp, forbidden, limits, now }, route, u, { refuse, stop }) {
  const key = withoutHash(u.href);
  const frame = frameOf(route.request());
  const held = frame && landings.get(frame);
  if (held && !held.opened && withoutHash(held.url) === key) {
    held.opened = true;
    held.open(nextCommit(frame));
    return answer(route, held.response);
  }
  if (frame) forget(landings, frame);
  const started = now();
  let chain;
  try {
    chain = await redirectChain(route, u, { onApp, forbidden, limits, now });
  } catch {
    return route.abort("failed");
  }
  if (chain.forbidden) return refuse(chain.forbidden);
  if (chain.late) return stop("redirectTimeout", { seconds: Math.ceil((now() - started) / 1000) }, "timedout");
  if (!chain.url) return route.abort("failed");
  if (withoutHash(chain.url.href) === key) return answer(route, chain.response);
  if (!frame) await dispose(chain.response);
  else if ((await chain.response.body()).length > limits.bytes) {
    await dispose(chain.response);
    return stop("landingTooLarge", { mb: Math.round(limits.bytes / 2 ** 20) }, "failed");
  } else landings.set(frame, newLanding(chain.url.href, chain.response));
  return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: landingPage(chain.url.href) });
}

/**
 * Fetches a navigation, then each hop of its redirect chain, without following redirects, whatever their origin
 * (an identity provider and back), each hop once, each answer freed once read; a hop on the application is tested
 * before it is requested, and a forbidden one never is. A hop gets `limits.hop` at most, and the whole chain
 * `limits.chain`.
 * @returns {Promise<{ response?: import("playwright").APIResponse, url?: URL, forbidden?: string, late?: true }>}
 *   the end of the chain and its URL; or the forbidden path the chain leads to; or `late`, past its bounds; or
 *   nothing, for a redirect off the web (never followed)
 */
async function redirectChain(route, url, { onApp, forbidden, limits, now }) {
  const deadline = now() + limits.chain;
  let at = url;
  for (let hop = 0; ; hop++) {
    const left = deadline - now();
    if (left <= 0) return { late: true };
    let response;
    try {
      response = await route.fetch({
        ...(hop ? { url: withoutHash(at.href), headers: hopHeaders(route.request(), at) } : {}),
        maxRedirects: 0,
        timeout: Math.min(limits.hop, left),
      });
    } catch (e) {
      if (e?.name === "TimeoutError") return { late: true };
      throw e;
    }
    const status = response.status();
    const location = status >= 300 && status < 400 ? response.headers().location : null;
    if (!location) return { response, url: at };
    await dispose(response);
    const next = new URL(location, at);
    if (!/^https?:$/.test(next.protocol)) return {};
    // A browser keeps the fragment through a redirect whose location has none.
    if (!next.hash && at.hash) next.hash = at.hash;
    if (onApp(next) && forbiddenMatch(next.pathname, forbidden)) return { forbidden: next.pathname };
    if (hop >= MAX_REDIRECTS) return { forbidden: next.pathname };
    at = next;
  }
}

/**
 * Headers of a hop after the first: the request's own, never its Cookie header (built for the first URL: the
 * browser's cookies for the hop are added instead, those set on the way included) and, on another origin than the
 * referrer's, only the referrer's origin (what a browser sends by default).
 */
function hopHeaders(request, url) {
  const headers = { ...request.headers() };
  // request.headers() leaves the Cookie header out in Playwright's browsers today: removed all the same, so that a
  // hop never carries the first URL's cookies whatever a browser hands over. The guarantee itself (the identity
  // provider gets none of the application's cookies) is test/e2e/capture-redirects.test.mjs.
  delete headers.cookie;
  if (headers.referer) {
    let referrer = null;
    try {
      referrer = new URL(headers.referer);
    } catch {
      // unreadable: left out below
    }
    if (!referrer) delete headers.referer;
    else if (referrer.origin !== url.origin) headers.referer = `${referrer.origin}/`;
  }
  return headers;
}

/**
 * The permission a browser context needs so that the application's pages still reach a local address (its API on
 * another port): a page the guard answers itself comes from no address, so Chromium refuses those calls (Local
 * Network Access). Given back only with forbidden routes (the guard answers navigations), only to a loopback
 * application, and only for its own origin (SECURITY.md).
 * @returns {[string[], { origin: string }]|null}  the arguments of `context.grantPermissions`, or null
 */
export function localNetworkGrant(appUrl, forbidden) {
  if (!forbidden.length || !isLoopbackUrl(appUrl)) return null;
  return [["local-network-access"], { origin: new URL(appUrl).origin }];
}
