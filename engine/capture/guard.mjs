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
//               the whole chain, the answer held for a frame and all of them): the browser never follows a
//               redirect itself;
//   speculation with capture.forbidden, no speculation rule reaches the browser: Chromium fetches their prefetches
//               and prerenders from its own process, where no route sees them. The documents the guard serves lose
//               their Speculation-Rules header, and `blockSpeculationRules` (an init script of every page) removes
//               each <script type="speculationrules"> before the browser reads it.
import { forbiddenMatch, shownPath, applicationKey, isLoopbackUrl } from "./plans.mjs";
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

/** An escape of one ASCII character, in capitals. */
const escaped = (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;

/**
 * An address in one written form, without its fragment, so that the same address written by Node.js (the guard,
 * which reads a Location header) and by Chromium (the browser, which opens it) compares equal: every character
 * outside the unreserved and delimiter ones escaped (Chromium writes `/end|x` as `/end%7Cx`, Node.js keeps it),
 * every escape in capitals. An address is ASCII once read by `new URL`.
 * @param {string} href
 */
export const addressForm = (href) =>
  withoutHash(href).replace(/%[0-9A-Fa-f]{2}|[^\w\-.~!$&()*+,;=:@/?%]/g, (c) =>
    c.length === 3 ? c.toUpperCase() : escaped(c),
  );

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
 * The bounds of a chain the guard follows (SECURITY.md): one hop and the whole chain (timings.mjs), the largest
 * answer it holds for a frame and the most it holds for all its frames at once, in bytes (past them, refused).
 */
const LIMITS = Object.freeze({
  hop: TIMINGS.redirectHop,
  chain: TIMINGS.redirectChain,
  bytes: 32 * 1024 * 1024,
  held: 64 * 1024 * 1024,
});

/** Megabytes, as the messages say them. */
const megabytes = (bytes) => Math.round(bytes / 2 ** 20);

/**
 * @typedef {{ url: string, response: import("playwright").APIResponse, bytes: number, opened: boolean,
 *   committed: Promise<unknown>, open: (committed: Promise<unknown>) => void, drop: () => void }} Landing  the end of
 *   a redirect chain the guard followed for a top-level frame, its answer and its size, whether the frame has opened
 *   it yet, and `committed`: settled once the frame has committed that answer (rejected when the frame goes
 *   elsewhere, or its page closes, first)
 * @typedef {((route: import("playwright").Route) => Promise<void>) & { landing: (frame: object) => Landing|undefined,
 *   held: () => number }} Guard   `held`: the bytes held for all frames at the moment
 */

/**
 * The end of a chain held for a frame (a Landing), counted in `state.held` until the frame opens it or it is
 * dropped.
 */
function newLanding(state, url, response, bytes) {
  let settle;
  const committed = new Promise((resolve, reject) => (settle = { resolve, reject }));
  committed.catch(() => {}); // awaited only after a goto (afterRedirects, take.mjs)
  state.held += bytes;
  const release = () => (state.held -= bytes);
  return {
    url,
    response,
    bytes,
    opened: false,
    committed,
    open: (p) => {
      release();
      settle.resolve(p);
    },
    drop: () => {
      release();
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
 *     `limits`); the browser only gets the end of its chain, without its Speculation-Rules header: the answer itself
 *     (always, in an iframe: a sandboxed one could not run a script), or, in a top-level frame, a page that sends
 *     the frame on to the end, whose answer is held for that frame's next navigation (`landing(frame)`, for
 *     `afterRedirects`, take.mjs) and freed once opened, when the frame goes elsewhere or when its page closes; a
 *     chain too slow, or an answer too large to hold (`limits.bytes`, `limits.held` for all frames), is reported
 *     through `onStop(key, vars)`;
 *   - with `readOnly`, any other method than GET/HEAD/OPTIONS is aborted and listed in `result.blocked`.
 * A path is reported without its path parameters (`shownPath`).
 * @param {{ appOrigin: string, forbidden: Array<{pattern, re}>, readOnly: boolean,
 *   result: { blocked: string[], refused: string[], prefetched: string[] }, onNavigation?: (path: string) => void,
 *   onStop?: (key: string, vars: object) => void,
 *   limits?: { hop: number, chain: number, bytes: number, held: number }, now?: () => number }} p
 *   `limits` and `now` (the clock): test seams
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
  // `held`: the bytes held for all frames; `watched`: the pages whose closing drops what is held for them.
  const followed = { landings, onApp, forbidden, limits, now, held: 0, watched: new WeakSet() };
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
  return Object.assign(guard, { landing: (frame) => landings.get(frame), held: () => followed.held });
}

/** Drops what was held for a frame (it goes elsewhere): an answer it has not opened is freed, its wait fails. */
function forget({ landings }, frame) {
  const held = landings.get(frame);
  landings.delete(frame);
  if (held && !held.opened) held.drop();
}

/**
 * The headers of a document the guard hands to the browser: its own, without `Speculation-Rules`, whose prefetches
 * and prerenders Chromium would fetch from its own process, unseen by the guard (blockSpeculationRules).
 */
function documentHeaders(response) {
  const headers = { ...response.headers() };
  delete headers["speculation-rules"];
  return headers;
}

/** An answer the browser gets as is (its headers: `documentHeaders`), freed once it has it. */
async function answer(route, response) {
  try {
    await route.fulfill({ response, headers: documentHeaders(response) });
  } finally {
    await dispose(response);
  }
}

/**
 * Holds `chain` for a top-level frame (its page's closing drops it).
 * @returns {Promise<{ key: string, vars: object }|null>}  null, or why it is refused
 */
async function hold(state, frame, chain) {
  const { limits } = state;
  const bytes = (await chain.response.body()).length;
  const refused =
    bytes > limits.bytes
      ? { key: "landingTooLarge", vars: { mb: megabytes(limits.bytes) } }
      : state.held + bytes > limits.held
        ? { key: "heldTooLarge", vars: { mb: megabytes(limits.held) } }
        : null;
  if (refused) {
    await dispose(chain.response);
    return refused;
  }
  state.landings.set(frame, newLanding(state, chain.url.href, chain.response, bytes));
  const page = frame.page();
  if (!state.watched.has(page)) {
    state.watched.add(page);
    page.once("close", () => forget(state, frame));
  }
  return null;
}

/**
 * A navigation of a frame (requestGuard): the end of the chain the guard's page sent this frame to (its answer, once),
 * or the chain followed here. Another frame, or one not known yet (a pop-up being created), asks the server again.
 * An iframe gets the end of its chain directly: a sandboxed one could not run the guard's page.
 */
async function navigate(state, route, u, { refuse, stop }) {
  const { landings, onApp, forbidden, limits, now } = state;
  const key = addressForm(u.href);
  const frame = frameOf(route.request());
  const held = frame && landings.get(frame);
  if (held && !held.opened && addressForm(held.url) === key) {
    held.opened = true;
    held.open(nextCommit(frame));
    return answer(route, held.response);
  }
  if (frame) forget(state, frame);
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
  if (addressForm(chain.url.href) === key || frame?.parentFrame()) return answer(route, chain.response);
  if (!frame) await dispose(chain.response);
  else {
    const refused = await hold(state, frame, chain);
    if (refused) return stop(refused.key, refused.vars, "failed");
  }
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

/**
 * The page's half of the guard against speculation rules (SECURITY.md): an init script of every page of a run with
 * forbidden routes (capture.mjs), run in each document before its own scripts. Chromium fetches the prefetches and
 * prerenders of a `<script type="speculationrules">` from its own process, where no route of the guard sees them;
 * neither a launch flag nor a Content-Security-Policy that lets the page's inline scripts run turns them off. So each
 * such script is removed before the browser reads it: a mutation observer of the document, and of every shadow root
 * the page attaches (`attachShadow`) or declares open, sees a script the parser inserts before it is run (the parser
 * runs the microtasks first), and one a script inserts or retypes before its rules are sent. Self-contained: it is
 * serialised into the page.
 * @param {any} [scope]   the page's global object (a test seam)
 */
export function blockSpeculationRules(scope = globalThis) {
  const isRules = (n) =>
    n?.nodeType === 1 && n.localName === "script" && String(n.type).trim().toLowerCase() === "speculationrules";
  const sweep = (root) => {
    for (const s of root.querySelectorAll("script")) if (isRules(s)) s.remove();
  };
  const observer = new scope.MutationObserver((records) => {
    for (const r of records) {
      if (isRules(r.target)) r.target.remove();
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (isRules(n)) n.remove();
        else sweep(n);
        if (n.shadowRoot) watch(n.shadowRoot);
      }
    }
  });
  const watch = (root) => {
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["type"] });
    sweep(root);
  };
  watch(scope.document);
  const proto = scope.Element.prototype;
  // A proxy keeps the method's name, length and native look (a bot challenge may check them).
  proto.attachShadow = new Proxy(proto.attachShadow, {
    apply(target, self, args) {
      const root = Reflect.apply(target, self, args);
      watch(root);
      return root;
    },
  });
}
