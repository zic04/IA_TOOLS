// Capture engine (Playwright, headless: no visible window). For each plan entry: prepares localStorage, opens the
// route, plays the actions, masks sensitive values, measures each annotated zone (percentages of the image),
// screenshots, converts to WebP (Chromium canvas) and writes images/<id>.webp + images/zones/<id>.json (one file
// per capture, so that several runs can work side by side).
//
// `compare` (ARCHITECTURE.md §6.10, capture --compare): the new image is compared with the one already on disk
// (engine/capture/compare.mjs, same WebP encoder on both sides); below `compareThreshold` the image on disk is
// left byte for byte untouched (no binary diff for git), only its zone file is rewritten; above it, the image is
// replaced and a before/after sheet is written next to the comparison copy in `compareDir`.
//
// Safety:
//   read-only   every request other than GET/HEAD/OPTIONS is aborted in the browser and counted (on whenever a
//               session is used, with capture.readOnly "auto"; always with capture.target "production");
//   forbidden   capture.forbidden routes are never requested, whatever the method: a write made by the server
//               while rendering cannot be blocked by the browser, so the request must never leave it. A request
//               that only PREFETCHES such a route (fetch, XHR, framework payload, <link rel=prefetch>, iframe,
//               any sub-resource) is aborted silently and counted: aborting it is what prevents the render. Only a
//               navigation of a top-level frame (the plan's route, a click on a link, a pop-up) stops the capture;
//   service workers   blocked whenever a guard is active, so that every request goes through it;
//   session     checked before the first capture; a redirect to a sign-in page during the run stops it.
import fs from "node:fs";
import path from "node:path";
import { launchBrowser } from "../project/browser.mjs";
import { KitError, EXIT } from "../project/errors.mjs";
import { readProjectVersion } from "../build/build.mjs";
import { CaptureError, firstLine, registerSelectors } from "./actions.mjs";
import { sensitiveValues, maskSource } from "./masking.mjs";
import { createWebpEncoder } from "./webp.mjs";
import { forbiddenMatch } from "./plans.mjs";
import { trackNetwork } from "./stable.mjs";
import { checkSession, sessionStorageOf, browserLaunch } from "./session.mjs";
import { takeOne, SessionExpired, storageValues, zoneFile } from "./take.mjs";

// Kept as exports of the capture module for the tests and commands that import them from here.
export { storageValues, zoneFile };

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

/**
 * Effective read-only mode of a run (ARCHITECTURE.md §3): always on for a production target, even without a session
 * (the configuration refuses readOnly false there); otherwise "auto" follows the session.
 * @param {{ readOnly: "auto"|boolean, target?: "local"|"demo"|"production" }} capture   config.capture
 * @param {boolean} hasSession
 */
export function readOnlyMode(capture, hasSession) {
  if (capture.target === "production") return true;
  return capture.readOnly === "auto" ? hasSession : capture.readOnly === true;
}

/** Unique list of blocked requests; the paths of bot challenges are grouped. */
export function summarizeRequests(list) {
  return [...new Set(list.map((b) => b.replace(/\/cdn-cgi\/challenge-platform\/.*/, "/cdn-cgi/challenge-platform/…")))];
}

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

/**
 * Route handler of the safety guard (installed on every page of the browser context).
 *   - a request to a capture.forbidden path of the application is aborted: a navigation is listed in
 *     `result.refused` and reported through `onNavigation(path)` (the capture stops), anything else is listed in
 *     `result.prefetched` (the capture goes on);
 *   - with `readOnly`, any other method than GET/HEAD/OPTIONS is aborted and listed in `result.blocked`.
 * @param {{ appOrigin: string, forbidden: Array<{pattern, re}>, readOnly: boolean,
 *   result: { blocked: string[], refused: string[], prefetched: string[] }, onNavigation?: (path: string) => void }} p
 * @returns {(route: import("playwright").Route) => Promise<void>}
 */
export function requestGuard({ appOrigin, forbidden, readOnly, result, onNavigation = () => {} }) {
  return async (route) => {
    const req = route.request();
    let u;
    try {
      u = new URL(req.url());
    } catch {
      return route.fallback();
    }
    const refuse = (pathname) => {
      const line = `${req.method()} ${pathname}`;
      if (forbiddenRequestKind(req) === "navigation") {
        result.refused.push(line);
        onNavigation(pathname);
      } else result.prefetched.push(line);
      return route.abort("blockedbyclient");
    };
    if (forbidden.length && u.origin === appOrigin && forbiddenMatch(u.pathname, forbidden)) return refuse(u.pathname);
    // A redirect is followed by the browser without calling this handler again: a navigation of the application
    // is fetched here without following redirects, and the chain is checked before the browser sees it, so that
    // a server redirect never leads to a forbidden route (SECURITY.md).
    if (
      forbidden.length &&
      u.origin === appOrigin &&
      req.isNavigationRequest() &&
      SAFE_METHODS.includes(req.method())
    ) {
      let chain;
      try {
        chain = await redirectChain(route, u, { appOrigin, forbidden });
      } catch {
        return route.abort("failed");
      }
      if (chain.forbidden) return refuse(chain.forbidden);
      return route.fulfill({ response: chain.response });
    }
    if (readOnly && !SAFE_METHODS.includes(req.method())) {
      result.blocked.push(`${req.method()} ${u.origin === appOrigin ? u.pathname : u.host + u.pathname}`);
      return route.abort("blockedbyclient");
    }
    return route.fallback();
  };
}

/** Longest redirect chain checked before a navigation; a longer one is refused like a forbidden route. */
const MAX_REDIRECTS = 10;

/**
 * Fetches a navigation without following redirects, then each hop of its redirect chain on the application's
 * origin, stopping before any forbidden route (never requested). A hop on another origin (an identity provider)
 * ends the check: capture.forbidden only covers the application.
 * @returns {Promise<{ response?: object, forbidden?: string }>} the first response, for the browser to follow; or
 *   the forbidden path the chain leads to
 */
async function redirectChain(route, url, { appOrigin, forbidden }) {
  const response = await route.fetch({ maxRedirects: 0 });
  let current = response;
  let at = url;
  for (let hop = 0; ; hop++) {
    const status = current.status();
    const location = status >= 300 && status < 400 ? current.headers().location : null;
    if (!location) return { response };
    const next = new URL(location, at);
    if (next.origin !== appOrigin) return { response };
    if (forbiddenMatch(next.pathname, forbidden)) return { forbidden: next.pathname };
    if (hop >= MAX_REDIRECTS) return { forbidden: next.pathname };
    current = await route.fetch({ url: next.href, maxRedirects: 0 });
    at = next;
  }
}

/**
 * Takes captures.
 * @param {object} p
 * @param {string} p.root                project root
 * @param {object} p.config              validated configuration
 * @param {object[]} p.entries           normalised, validated plan entries (plans.mjs)
 * @param {string} p.appUrl              application URL, without trailing slash
 * @param {{ adapter, options }} p.auth  authentication adapter (loaded)
 * @param {string|null} p.session        session file, or null (no session)
 * @param {boolean} p.readOnly
 * @param {Array<{pattern, re}>} [p.forbidden]   compiled capture.forbidden
 * @param {boolean} [p.preview]          also writes <previews>/<id>.zones.png
 * @param {string} [p.previews]          folder of the previews (default <root>/.doc-kit)
 * @param {string} [p.captured]          date written in the zone files (default: today, YYYY-MM-DD)
 * @param {boolean} [p.compare]          ARCHITECTURE.md §6.10 (capture --compare): compares each new image with
 *   the one already on disk before replacing it; unchanged (below `compareThreshold`): the image is left byte
 *   for byte as it was, only its zone file is rewritten; changed: the image is replaced and a before/after
 *   sheet is written next to the comparison copy
 * @param {number} [p.compareThreshold]  share of differing pixels above which an image counts as changed (0-1)
 * @param {string} [p.compareDir]        where the comparison copies and sheets are written (default <root>/.doc-kit/compare)
 * @param {string} [p.imagesDir]         where the images and their zone files are written (default config.paths.images,
 *   relative to root); `capture --lang <l>` (ARCHITECTURE.md §6.12) passes `<paths.images>/<l>`
 * @param {object} [p.capture]           capture options (default config.capture); `capture --lang <l>` passes
 *   `mergeLanguageCapture(config.capture, l)` (engine/build/languages.mjs): the same shape, that language's locale,
 *   cookies and storage merged over the defaults
 * @param {string|null} [p.commit]       application's git HEAD, written to the zone files when given
 * @param {(entry: object) => string|null} [p.planHash]   hash of a plan entry, written to its zone file
 * @param {{ before: string, after: string }} [p.labels]  before/after sheet captions
 * @param {(event: object) => void} [p.onEvent]   { type: "ok", id, zones, bytes, ms, compared? } | { type: "failed", id, key, vars,
 *   trace? }
 * @param {boolean} [p.verify]          open, play and locate every zone and the frame, but take and write nothing
 * @param {string|null} [p.trace]       folder where a failed capture leaves its Playwright trace (<id>.zip, opened
 *   with `npx playwright show-trace`); null: no trace (default)
 * @param {Function} [p.launch]         opens the browser (test seam; default: launchBrowser)
 * @param {object} [p.timer]             engine/stats/usage.mjs createTimer(): each capture's parts are measured
 *   (navigate, wait, actions, settle, mask, measure, shot, encode, compare, write) under step "capture"
 * @returns {Promise<{ ok: object[], failed: object[], blocked: string[], refused: string[], prefetched: string[],
 *   expired: object|null, who: string|null, compared: Array<{ id, ratio, changed }> }>}
 *   refused: navigations to forbidden routes (each one stopped its capture); prefetched: other requests to
 *   forbidden routes, aborted silently; compared: only with `compare` (ARCHITECTURE.md §6.10)
 * @throws {KitError} exit code 3: application unreachable, session expired before the run
 */
export async function runCaptures({
  root,
  config,
  entries,
  appUrl,
  auth,
  session,
  readOnly,
  forbidden = [],
  preview = false,
  previews,
  captured,
  compare = false,
  compareThreshold = 0.005,
  compareDir = path.join(root, ".doc-kit", "compare"),
  imagesDir: imagesDirOption,
  capture,
  commit = null,
  planHash = () => null,
  labels = { before: "Before", after: "After" },
  onEvent = () => {},
  launch = launchBrowser,
  timer = null,
  trace = null,
  verify = false,
}) {
  await registerSelectors();
  const cap = capture || config.capture;
  // A fixed clock (capture.clock): "today", relative dates and countdowns are the same on every run.
  if (cap.clock && !Number.isFinite(Date.parse(cap.clock)))
    throw new KitError(EXIT.USAGE, "option.value", {
      option: "capture.clock",
      value: cap.clock,
      expected: "an ISO date, e.g. 2026-01-15T09:00:00Z",
    });
  const appOrigin = new URL(appUrl).origin;
  const imagesDir = path.join(root, imagesDirOption || config.paths.images);
  const rc = {
    cap,
    sel: cap.selectors,
    appUrl,
    appOrigin,
    auth,
    session,
    readOnly,
    forbidden,
    version: readProjectVersion(root, config.version),
    date: captured || new Date().toISOString().slice(0, 10),
    imagesDir,
    zonesDir: path.join(imagesDir, "zones"),
    previewDir: previews || path.join(root, ".doc-kit"),
    source: maskSource(sensitiveValues(root, config.masking), config.masking),
    baseline: sessionStorageOf(session, appOrigin),
    checksSignIn: !auth.adapter.none,
    result: { ok: [], failed: [], blocked: [], refused: [], prefetched: [], expired: null, who: null, compared: [] },
    guarded: readOnly || forbidden.length > 0,
    preview,
    compare,
    compareThreshold,
    compareDir,
    commit,
    planHash,
    labels,
    timer,
    trace,
    verify,
    networks: new Map(),
  };
  // Captures in parallel (ETUDE-CAPTURES.md A2): each worker has its own browser contexts, its own guard state
  // and its own spans; production is always captured one at a time.
  const concurrency = Math.max(
    1,
    Math.min(cap.concurrency ?? 4, entries.length || 1, config.capture?.target === "production" ? 1 : Infinity),
  );

  fs.mkdirSync(rc.zonesDir, { recursive: true });
  const browser = await launch(browserLaunch(auth, { headless: true }));
  try {
    rc.encoder = await createWebpEncoder(browser);
    rc.pageFor = (w, name) => pageFor(rc, browser, w, name);
    const workers = Array.from({ length: concurrency }, () => newWorker(rc));
    if (session) {
      const page = await rc.pageFor(workers[0], entries[0]?.context || "desktop");
      const s = await checkSession(page, { url: appUrl, auth });
      if (!s) throw new KitError(EXIT.ENVIRONMENT, "capture.sessionExpired", { url: page.url() });
      rc.result.who = s.who || null;
    }
    await runWorkers(rc, workers, entries, onEvent);
    await rc.encoder.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return rc.result;
}

/** A worker: its own pages (one per context name), guard state, open span and trace. */
function newWorker(rc) {
  const w = { pages: new Map(), state: { forbidden: null }, span: { close: () => {} }, tracing: null };
  w.guard = requestGuard({
    appOrigin: rc.appOrigin,
    forbidden: rc.forbidden,
    readOnly: rc.readOnly,
    result: rc.result,
    onNavigation: (p) => (w.state.forbidden ??= p),
  });
  w.tracing = {
    context: null,
    // The trace of the capture in progress: kept on failure only (ETUDE-CAPTURES.md C3).
    async stop(file) {
      const context = w.tracing.context;
      w.tracing.context = null;
      if (!context) return null;
      try {
        if (file) fs.mkdirSync(path.dirname(file), { recursive: true });
        await context.tracing.stopChunk(file ? { path: file } : {});
        return file;
      } catch {
        return null;
      }
    },
  };
  return w;
}

/** The worker's page for a context name (desktop, mobile…), created on first use with the run's settings. */
async function pageFor(rc, browser, w, name) {
  if (w.pages.has(name)) return w.pages.get(name);
  const { cap, session, guarded } = rc;
  const viewport = cap.viewports[name];
  const mobile = name === "mobile";
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: cap.scale ?? 1,
    locale: cap.locale,
    timezoneId: cap.timezone,
    colorScheme: "light",
    isMobile: mobile,
    hasTouch: mobile,
    ...(cap.geolocation ? { geolocation: cap.geolocation, permissions: ["geolocation"] } : {}),
    // Animations and transitions an application ties to the user's preference stay still (ETUDE-CAPTURES.md B2).
    reducedMotion: "reduce",
    ...(session ? { storageState: session } : {}),
    // A service worker could answer or send requests outside the guard: none is registered.
    ...(guarded ? { serviceWorkers: "block" } : {}),
  });
  if (guarded) await context.route("**/*", w.guard);
  if (cap.cookies.length)
    await context.addCookies(cap.cookies.map((c) => (c.url || c.domain ? c : { ...c, url: rc.appUrl })));
  if (rc.trace) await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  if (cap.clock) await page.clock.setFixedTime(new Date(cap.clock));
  rc.networks.set(page, trackNetwork(page));
  w.pages.set(name, page);
  return page;
}

/**
 * Runs the entries on the workers; events and results come out in the order of the plan, whatever order the
 * workers finish in. A session that expires stops the run: the captures not started yet are skipped.
 */
async function runWorkers(rc, workers, entries, onEvent) {
  const { result } = rc;
  const done = new Array(entries.length);
  let flushed = 0;
  const flush = () => {
    while (flushed < entries.length && done[flushed]) {
      const { event, compared } = done[flushed++];
      if (event.type === "ok") result.ok.push(event);
      else if (event.type === "failed") result.failed.push(event);
      if (compared) result.compared.push(compared);
      if (event.type !== "skipped") onEvent(event);
    }
  };
  let next = 0;
  /** @type {{ entry?: any, url?: string, fatal?: Error } | null} */
  let expired = null;
  async function work(w) {
    while (next < entries.length) {
      const i = next++;
      const entry = entries[i];
      if (expired) {
        done[i] = { event: { type: "skipped", id: entry.id } };
        flush();
        continue;
      }
      const t0 = Date.now();
      try {
        const r = await takeOne(rc, entry, w);
        done[i] = {
          event: { type: "ok", id: entry.id, ...r, ms: Date.now() - t0 },
          compared: r.compared ? { id: entry.id, ...r.compared } : null,
        };
      } catch (e) {
        w.span.close();
        const traceFile = rc.trace ? await w.tracing.stop(path.join(rc.trace, `${entry.id}.zip`)) : null;
        if (e instanceof SessionExpired) {
          // The first expiry (in plan order) is reported; the captures not started yet are skipped.
          if (!expired || entries.indexOf(expired.entry) > i) expired = { entry, url: e.url };
          done[i] = { event: { type: "skipped", id: entry.id } };
        } else if (e instanceof KitError) {
          expired = expired || { fatal: e };
          throw e;
        } else {
          const event =
            e instanceof CaptureError
              ? { type: "failed", id: entry.id, key: e.key, vars: e.vars }
              : { type: "failed", id: entry.id, key: "generic", vars: { error: firstLine(e) } };
          if (traceFile) event.trace = traceFile;
          done[i] = { event };
        }
      }
      flush();
    }
  }
  await Promise.all(workers.map(work));
  if (expired?.entry) result.expired = { id: expired.entry.id, url: expired.url };
}
