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
import { CaptureError, firstLine, registerSelectors, zoneBox, frameClip, measureZone, play, actionKind, describeTarget, routeWithView } from "./actions.mjs";
import { sensitiveValues, maskSource, maskPage } from "./masking.mjs";
import { createWebpEncoder } from "./webp.mjs";
import { compareImages, beforeAfterSheet, compareOutcome } from "./compare.mjs";
import { forbiddenMatch } from "./plans.mjs";
import { trackNetwork, waitForStable } from "./stable.mjs";
import { checkSession, isSignInUrl, sessionStorageOf, browserLaunch } from "./session.mjs";

export const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

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

/** Raised when the application sends the browser to a sign-in page during the run. */
export class SessionExpired extends Error {
  constructor(url) {
    super(`session expired: ${url}`);
    this.url = url;
  }
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
    if (forbidden.length && u.origin === appOrigin && req.isNavigationRequest() && SAFE_METHODS.includes(req.method())) {
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
export const MAX_REDIRECTS = 10;

/**
 * Fetches a navigation without following redirects, then each hop of its redirect chain on the application's
 * origin, stopping before any forbidden route (never requested). A hop on another origin (an identity provider)
 * ends the check: capture.forbidden only covers the application.
 * @returns {Promise<{ response?: object, forbidden?: string }>} the first response, for the browser to follow; or
 *   the forbidden path the chain leads to
 */
export async function redirectChain(route, url, { appOrigin, forbidden }) {
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

/** localStorage values: "{version}" substituted; other types written as JSON. */
export function storageValues(storage, version) {
  return Object.fromEntries(Object.entries(storage).map(([k, v]) => [k, (typeof v === "string" ? v : JSON.stringify(v)).replaceAll("{version}", version)]));
}

/**
 * Zone file of a capture (ARCHITECTURE.md §6.2). `commit` (the application's git HEAD) and `plan` (hash of the
 * plan entry, ARCHITECTURE.md §6.10) are omitted when absent, so that a run without `sync` support keeps
 * writing the same shape as before (test parity, byte-identical files).
 */
export function zoneFile({ entry, clip, zones, version, captured, commit = null, plan = null }) {
  return {
    file: `${entry.id}.webp`,
    title: entry.title || "",
    route: entry.route,
    width: Math.round(clip.width),
    height: Math.round(clip.height),
    version,
    captured,
    zones,
    ...(commit ? { commit } : {}),
    ...(plan ? { plan } : {}),
  };
}

/** Is the page a bot challenge (an interstitial "Just a moment…" page)? */
async function isChallenge(page) {
  const title = await page.title().catch(() => "");
  if (/just a moment|attention required|checking your browser/i.test(title)) return true;
  return (await page.locator("#challenge-form, #challenge-running, #cf-challenge-running").count().catch(() => 0)) > 0;
}

/** Waits for a bot challenge to clear by itself (20 s at most). */
async function waitForChallenge(page, timeout = 20_000) {
  if (!(await isChallenge(page))) return;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    await page.waitForTimeout(1000);
    if (!(await isChallenge(page))) {
      await page.waitForLoadState("load").catch(() => {});
      return;
    }
  }
  throw new CaptureError("challenge", { url: page.url() });
}

/** Draws the measured zones over the page and screenshots the clip (control image, never published). */
async function writePreview(page, clip, zones, file) {
  await page.evaluate(
    ({ zones, clip }) => {
      for (const z of zones) {
        const d = document.createElement("div");
        d.className = "__doc_kit_preview";
        d.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;border:2px solid #e0443e;background:rgba(224,68,62,.08);left:${clip.x + (z.x / 100) * clip.width}px;top:${clip.y + (z.y / 100) * clip.height}px;width:${(z.w / 100) * clip.width}px;height:${(z.h / 100) * clip.height}px`;
        const b = document.createElement("b");
        b.textContent = String(z.n);
        b.style.cssText = "position:absolute;top:-10px;left:-10px;background:#e0443e;color:#fff;border-radius:50%;width:20px;height:20px;font:700 12px/20px sans-serif;text-align:center";
        d.appendChild(b);
        document.body.appendChild(d);
      }
    },
    { zones, clip }
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ clip, path: file });
  await page.evaluate(() => document.querySelectorAll(".__doc_kit_preview").forEach((d) => d.remove()));
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
 * @param {string|null} [p.trace]       folder where a failed capture leaves its Playwright trace (<id>.zip, opened
 *   with `npx playwright show-trace`); null: no trace (default)
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
}) {
  await registerSelectors();
  const cap = capture || config.capture;
  // A fixed clock (capture.clock): "today", relative dates and countdowns are the same on every run.
  if (cap.clock && !Number.isFinite(Date.parse(cap.clock))) throw new KitError(EXIT.USAGE, "option.value", { option: "capture.clock", value: cap.clock, expected: "an ISO date, e.g. 2026-01-15T09:00:00Z" });
  const sel = cap.selectors;
  const appOrigin = new URL(appUrl).origin;
  const version = readProjectVersion(root, config.version);
  const date = captured || new Date().toISOString().slice(0, 10);
  const imagesDir = path.join(root, imagesDirOption || config.paths.images);
  const zonesDir = path.join(imagesDir, "zones");
  const previewDir = previews || path.join(root, ".doc-kit");
  /** Zones of the zone file written by a previous run (for the before/after sheet), or []. */
  const previousZones = (id) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(zonesDir, `${id}.json`), "utf8")).zones || [];
    } catch {
      return [];
    }
  };
  const source = maskSource(sensitiveValues(root, config.masking), config.masking);
  const baseline = sessionStorageOf(session, appOrigin);
  const checksSignIn = !auth.adapter.none;
  const result = { ok: [], failed: [], blocked: [], refused: [], prefetched: [], expired: null, who: null, compared: [] };
  let current = { forbidden: null };
  const guarded = readOnly || forbidden.length > 0;
  const guard = requestGuard({ appOrigin, forbidden, readOnly, result, onNavigation: (p) => (current.forbidden ??= p) });

  fs.mkdirSync(zonesDir, { recursive: true });
  const browser = await launch(browserLaunch(auth, { headless: true }));
  try {
    const encoder = await createWebpEncoder(browser);
    const pages = new Map();
    const networks = new Map();
    async function pageFor(name) {
      if (pages.has(name)) return pages.get(name);
      const viewport = cap.viewports[name];
      const mobile = name === "mobile";
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
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
      if (guarded) await context.route("**/*", guard);
      if (cap.cookies.length) await context.addCookies(cap.cookies.map((c) => (c.url || c.domain ? c : { ...c, url: appUrl })));
      if (trace) await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      if (cap.clock) await page.clock.setFixedTime(new Date(cap.clock));
      networks.set(page, trackNetwork(page));
      pages.set(name, page);
      return page;
    }

    if (session) {
      const page = await pageFor(entries[0]?.context || "desktop");
      const s = await checkSession(page, { url: appUrl, auth });
      if (!s) throw new KitError(EXIT.ENVIRONMENT, "capture.sessionExpired", { url: page.url() });
      result.who = s.who || null;
    }

    const signedOut = (page, response, entry) =>
      checksSignIn && !isSignInUrl(appUrl + entry.route, appUrl, auth.options.loginPattern) && (response?.status() === 401 || isSignInUrl(page.url(), appUrl, auth.options.loginPattern));

    async function takeOne(entry) {
      const name = entry.context || "desktop";
      const page = await pageFor(name);
      const network = networks.get(page);
      if (trace) {
        await page.context().tracing.startChunk({ title: entry.id });
        tracing.context = page.context();
      }
      // One span per part of the capture (ETUDE-CAPTURES.md §6); the last one still open when an error is thrown
      // is closed by the caller.
      let open = null;
      const part = (name) => {
        open?.();
        open = timer ? timer.start("capture", { sub: entry.id, part: name }) : null;
      };
      parts.close = () => {
        open?.();
        open = null;
      };
      part("navigate");
      current = { forbidden: null };
      const stop = () => new CaptureError("forbiddenHit", { path: current.forbidden });
      await page.setViewportSize({ ...cap.viewports[name], ...(entry.viewport || {}) });

      // localStorage: the session's own, then capture.storage, then the entry's (on the application's origin).
      const storage = { ...baseline, ...storageValues({ ...cap.storage, ...(entry.storage || {}) }, version) };
      const onOrigin = () => {
        try {
          return new URL(page.url()).origin === appOrigin;
        } catch {
          return false;
        }
      };
      if (!onOrigin()) {
        try {
          await page.goto(appUrl + auth.options.start, { waitUntil: "domcontentloaded", timeout: 30_000 });
        } catch (e) {
          if (current.forbidden) throw stop();
          throw new KitError(EXIT.ENVIRONMENT, "capture.unreachable", { url: appUrl, error: firstLine(e) }, { cause: e });
        }
      }
      await page.evaluate((kv) => {
        localStorage.clear();
        for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
      }, storage);

      let response;
      try {
        response = await page.goto(appUrl + routeWithView(entry.route, entry.view, cap.map), { waitUntil: "load", timeout: 45_000 });
      } catch (e) {
        if (current.forbidden) throw stop();
        throw new CaptureError("navigation", { route: entry.route, error: firstLine(e) });
      }
      await waitForChallenge(page);
      if (signedOut(page, response, entry)) throw new SessionExpired(page.url());
      // On conditions (network quiet, fonts, DOM still, animations ended); `delay` is only a floor now.
      part("wait");
      await waitForStable(page, { network, min: entry.delay ?? 0 });
      part("actions");
      for (const [i, a] of (entry.actions || []).entries()) {
        try {
          await play(page, a, sel);
        } catch (e) {
          if (current.forbidden) throw stop();
          if (e instanceof CaptureError) throw e;
          throw new CaptureError("action", { n: i + 1, kind: actionKind(a), error: firstLine(e) });
        }
      }
      part("settle");
      if ((entry.actions || []).length || entry.settle) await waitForStable(page, { network, min: entry.settle ?? 0 });
      // A client-side navigation (history API) to a forbidden route: its payload was aborted, the page shown is
      // not the route of the plan.
      if (!current.forbidden && forbidden.length && onOrigin()) {
        const shown = new URL(page.url()).pathname;
        if (forbiddenMatch(shown, forbidden)) current.forbidden = shown;
      }
      if (current.forbidden) throw stop();
      if (signedOut(page, null, entry)) throw new SessionExpired(page.url());

      part("mask");
      await mask(page, entry);
      part("measure");
      let clip;
      try {
        clip = await frameClip(page, entry.frame, sel);
      } catch (e) {
        if (e instanceof CaptureError) throw e;
        throw new CaptureError("frame", { target: describeTarget(entry.frame), error: firstLine(e) });
      }
      const zones = [];
      for (const [i, z] of (entry.zones || []).entries()) {
        let box;
        try {
          box = await zoneBox(page, z, sel);
        } catch (e) {
          if (e instanceof CaptureError) throw e;
          throw new CaptureError("zone", { n: i + 1, target: describeTarget(z), caption: z.caption || "", error: firstLine(e) });
        }
        zones.push(measureZone(i + 1, box, clip, z));
      }
      // Masked again just before the shot: the application may have rendered data again while the zones were
      // being waited for (SECURITY.md, ETUDE-CAPTURES.md C7).
      part("mask");
      await mask(page, entry, { required: false });
      part("shot");
      const png = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
      if (preview && zones.length) await writePreview(page, clip, zones, path.join(previewDir, `${entry.id}.zones.png`));
      part("encode");
      const webp = await encoder.encode(png, cap.webpQuality);
      const imageFile = path.join(imagesDir, `${entry.id}.webp`);
      let compared;
      part(compare ? "compare" : "write");
      if (compare) {
        fs.mkdirSync(compareDir, { recursive: true });
        fs.writeFileSync(path.join(compareDir, `${entry.id}.webp`), webp);
        if (fs.existsSync(imageFile)) {
          const before = fs.readFileSync(imageFile);
          const { ratio, sameSize } = await compareImages(encoder.page, before, webp, { tolerance: 16 });
          const outcome = compareOutcome({ ratio, sameSize, threshold: compareThreshold });
          compared = { ratio, changed: outcome === "changed" };
          if (outcome === "changed") {
            fs.writeFileSync(imageFile, webp);
            const sheet = await beforeAfterSheet(encoder.page, { before, after: webp, zonesBefore: previousZones(entry.id), zonesAfter: zones, labels });
            fs.writeFileSync(path.join(compareDir, `${entry.id}.png`), sheet);
          }
          // unchanged: the image on disk is left exactly as it was (no binary change for git).
        } else {
          fs.writeFileSync(imageFile, webp);
          compared = { ratio: 1, changed: true };
        }
      } else {
        fs.writeFileSync(imageFile, webp);
      }
      fs.writeFileSync(
        path.join(zonesDir, `${entry.id}.json`),
        JSON.stringify(zoneFile({ entry, clip, zones, version, captured: date, commit, plan: planHash(entry) }), null, 2) + "\n"
      );
      parts.close();
      if (trace) await tracing.stop(null);
      return { zones: zones.length, bytes: webp.length, ...(compared ? { compared } : {}) };
    }
    // The trace of the capture in progress: kept on failure only (ETUDE-CAPTURES.md C3).
    const tracing = {
      context: null,
      async stop(file) {
        const context = tracing.context;
        tracing.context = null;
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
    const parts = { close: () => {} };
    async function mask(page, entry, { required = true } = {}) {
      try {
        await maskPage(page, { source, masks: entry.masks || [], selectors: sel, required });
      } catch (e) {
        if (e instanceof CaptureError) throw e;
        throw new CaptureError("mask", { error: firstLine(e) });
      }
    }

    for (const entry of entries) {
      const t0 = Date.now();
      try {
        const r = await takeOne(entry);
        const event = { type: "ok", id: entry.id, ...r, ms: Date.now() - t0 };
        result.ok.push(event);
        if (r.compared) result.compared.push({ id: entry.id, ...r.compared });
        onEvent(event);
      } catch (e) {
        parts.close();
        const traceFile = trace ? await tracing.stop(path.join(trace, `${entry.id}.zip`)) : null;
        if (e instanceof SessionExpired) {
          result.expired = { id: entry.id, url: e.url };
          break;
        }
        if (e instanceof KitError) throw e;
        const event = e instanceof CaptureError ? { type: "failed", id: entry.id, key: e.key, vars: e.vars } : { type: "failed", id: entry.id, key: "generic", vars: { error: firstLine(e) } };
        if (traceFile) event.trace = traceFile;
        result.failed.push(event);
        onEvent(event);
      }
    }
    await encoder.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return result;
}
