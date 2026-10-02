// Capture engine (Playwright, headless: no visible window). For each plan entry: prepares localStorage, opens the
// route, plays the actions, masks sensitive values, measures each annotated zone (percentages of the image),
// screenshots, converts to WebP (Chromium canvas) and writes images/<id>.webp + images/zones/<id>.json (one file
// per capture, so that several runs can work side by side).
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
import { forbiddenMatch } from "./plans.mjs";
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
    if (forbidden.length && u.origin === appOrigin && forbiddenMatch(u.pathname, forbidden)) {
      const line = `${req.method()} ${u.pathname}`;
      if (forbiddenRequestKind(req) === "navigation") {
        result.refused.push(line);
        onNavigation(u.pathname);
      } else result.prefetched.push(line);
      return route.abort("blockedbyclient");
    }
    if (readOnly && !SAFE_METHODS.includes(req.method())) {
      result.blocked.push(`${req.method()} ${u.origin === appOrigin ? u.pathname : u.host + u.pathname}`);
      return route.abort("blockedbyclient");
    }
    return route.fallback();
  };
}

/** localStorage values: "{version}" substituted; other types written as JSON. */
export function storageValues(storage, version) {
  return Object.fromEntries(Object.entries(storage).map(([k, v]) => [k, (typeof v === "string" ? v : JSON.stringify(v)).replaceAll("{version}", version)]));
}

/** Zone file of a capture (ARCHITECTURE.md §6.2). */
export function zoneFile({ entry, clip, zones, version, captured }) {
  return {
    file: `${entry.id}.webp`,
    title: entry.title || "",
    route: entry.route,
    width: Math.round(clip.width),
    height: Math.round(clip.height),
    version,
    captured,
    zones,
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
 * @param {(event: object) => void} [p.onEvent]   { type: "ok", id, zones, bytes, ms } | { type: "failed", id, key, vars }
 * @returns {Promise<{ ok: object[], failed: object[], blocked: string[], refused: string[], prefetched: string[],
 *   expired: object|null, who: string|null }>}
 *   refused: navigations to forbidden routes (each one stopped its capture); prefetched: other requests to
 *   forbidden routes, aborted silently
 * @throws {KitError} exit code 3: application unreachable, session expired before the run
 */
export async function runCaptures({ root, config, entries, appUrl, auth, session, readOnly, forbidden = [], preview = false, previews, captured, onEvent = () => {}, launch = launchBrowser }) {
  await registerSelectors();
  const cap = config.capture;
  const sel = cap.selectors;
  const appOrigin = new URL(appUrl).origin;
  const version = readProjectVersion(root, config.version);
  const date = captured || new Date().toISOString().slice(0, 10);
  const imagesDir = path.join(root, config.paths.images);
  const zonesDir = path.join(imagesDir, "zones");
  const previewDir = previews || path.join(root, ".doc-kit");
  const source = maskSource(sensitiveValues(root, config.masking), config.masking);
  const baseline = sessionStorageOf(session, appOrigin);
  const checksSignIn = !auth.adapter.none;
  const result = { ok: [], failed: [], blocked: [], refused: [], prefetched: [], expired: null, who: null };
  let current = { forbidden: null };
  const guarded = readOnly || forbidden.length > 0;
  const guard = requestGuard({ appOrigin, forbidden, readOnly, result, onNavigation: (p) => (current.forbidden ??= p) });

  fs.mkdirSync(zonesDir, { recursive: true });
  const browser = await launch(browserLaunch(auth, { headless: true }));
  try {
    const encoder = await createWebpEncoder(browser);
    const pages = new Map();
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
        ...(session ? { storageState: session } : {}),
        // A service worker could answer or send requests outside the guard: none is registered.
        ...(guarded ? { serviceWorkers: "block" } : {}),
      });
      if (guarded) await context.route("**/*", guard);
      if (cap.cookies.length) await context.addCookies(cap.cookies.map((c) => (c.url || c.domain ? c : { ...c, url: appUrl })));
      const page = await context.newPage();
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
      await page.waitForTimeout(entry.delay ?? 2500);
      for (const [i, a] of (entry.actions || []).entries()) {
        try {
          await play(page, a, sel);
        } catch (e) {
          if (current.forbidden) throw stop();
          if (e instanceof CaptureError) throw e;
          throw new CaptureError("action", { n: i + 1, kind: actionKind(a), error: firstLine(e) });
        }
      }
      await page.waitForTimeout(entry.settle ?? 600);
      // A client-side navigation (history API) to a forbidden route: its payload was aborted, the page shown is
      // not the route of the plan.
      if (!current.forbidden && forbidden.length && onOrigin()) {
        const shown = new URL(page.url()).pathname;
        if (forbiddenMatch(shown, forbidden)) current.forbidden = shown;
      }
      if (current.forbidden) throw stop();
      if (signedOut(page, null, entry)) throw new SessionExpired(page.url());

      try {
        await maskPage(page, { source, masks: entry.masks || [], selectors: sel });
      } catch (e) {
        if (e instanceof CaptureError) throw e;
        throw new CaptureError("mask", { error: firstLine(e) });
      }
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
      const png = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
      if (preview && zones.length) await writePreview(page, clip, zones, path.join(previewDir, `${entry.id}.zones.png`));
      const webp = await encoder.encode(png, cap.webpQuality);
      fs.writeFileSync(path.join(imagesDir, `${entry.id}.webp`), webp);
      fs.writeFileSync(path.join(zonesDir, `${entry.id}.json`), JSON.stringify(zoneFile({ entry, clip, zones, version, captured: date }), null, 2) + "\n");
      return { zones: zones.length, bytes: webp.length };
    }

    for (const entry of entries) {
      const t0 = Date.now();
      try {
        const r = await takeOne(entry);
        const event = { type: "ok", id: entry.id, ...r, ms: Date.now() - t0 };
        result.ok.push(event);
        onEvent(event);
      } catch (e) {
        if (e instanceof SessionExpired) {
          result.expired = { id: entry.id, url: e.url };
          break;
        }
        if (e instanceof KitError) throw e;
        const event = e instanceof CaptureError ? { type: "failed", id: entry.id, key: e.key, vars: e.vars } : { type: "failed", id: entry.id, key: "generic", vars: { error: firstLine(e) } };
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
