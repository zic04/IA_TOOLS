// One capture of a run (capture.mjs, runCaptures): opens the plan entry's route with its localStorage, plays its
// actions, masks the sensitive values, measures the frame and the zones, then screenshots, encodes and writes
// images/<id>.webp and images/zones/<id>.json — or, with `verify`, stops before taking anything. Each part is a
// span of the production statistics (ETUDE-CAPTURES.md §6).
//
// `rc` is the run's context (capture.mjs, prepareRun): options, paths, guard state, encoder and pages.
import fs from "node:fs";
import path from "node:path";
import { KitError, EXIT } from "../project/errors.mjs";
import { CaptureError, firstLine, zoneBox, frameClip, measureZone, play, actionKind, describeTarget, routeWithView } from "./actions.mjs";
import { maskPage } from "./masking.mjs";
import { compareImages, beforeAfterSheet, compareOutcome } from "./compare.mjs";
import { forbiddenMatch } from "./plans.mjs";
import { waitForStable } from "./stable.mjs";
import { TIMINGS } from "./timings.mjs";
import { isSignInUrl } from "./session.mjs";

/** Raised when the application sends the browser to a sign-in page during the run. */
export class SessionExpired extends Error {
  constructor(url) {
    super(`session expired: ${url}`);
    this.url = url;
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
export function zoneFile({ entry, clip, zones, version, captured, commit = null, plan = null, scale = 1 }) {
  return {
    file: `${entry.id}.webp`,
    title: entry.title || "",
    route: entry.route,
    width: Math.round(clip.width),
    height: Math.round(clip.height),
    // The image holds scale × width pixels (capture.scale, for high-density screens); width and height stay
    // the size it is shown at.
    ...(scale > 1 ? { scale } : {}),
    version,
    captured,
    zones,
    ...(commit ? { commit } : {}),
    ...(plan ? { plan } : {}),
  };
}

/**
 * Takes one capture with worker `w` (its pages, guard state, span and trace).
 * @returns {Promise<{ zones: number, bytes: number, verified?: true, compared?: { ratio, changed } }>}
 * @throws {CaptureError|SessionExpired|KitError}
 */
export async function takeOne(rc, entry, w) {
  const name = entry.context || "desktop";
  const page = await rc.pageFor(w, name);
  const network = rc.networks.get(page);
  if (rc.trace) {
    await page.context().tracing.startChunk({ title: entry.id });
    w.tracing.context = page.context();
  }
  const part = startSpans(rc, entry, w);
  part("navigate");
  const current = (w.state = { forbidden: null });
  const stop = () => new CaptureError("forbiddenHit", { path: current.forbidden });
  await openRoute(rc, page, entry, { name, current, stop });
  await playEntry(rc, page, entry, { network, current, stop, part });

  part("mask");
  await mask(rc, page, entry);
  part("measure");
  const { clip, zones } = await measureEntry(rc, page, entry);
  // --verify: the page opened, the actions played and every zone and the frame were found; nothing is
  // written (ETUDE-CAPTURES.md D6: the plans replayed as tests).
  if (rc.verify) {
    w.span.close();
    if (rc.trace) await w.tracing.stop(null);
    return { zones: zones.length, bytes: 0, verified: true };
  }
  const { bytes, compared } = await writeEntry(rc, page, entry, { clip, zones, part });
  w.span.close();
  if (rc.trace) await w.tracing.stop(null);
  return { zones: zones.length, bytes, ...(compared ? { compared } : {}) };
}

/**
 * One span per part of the capture (ETUDE-CAPTURES.md §6): `part(name)` closes the open one and opens the next;
 * the last one still open when an error is thrown is closed by the caller (`w.span.close`).
 */
function startSpans(rc, entry, w) {
  let open = null;
  w.span.close = () => {
    open?.();
    open = null;
  };
  return (name) => {
    open?.();
    open = rc.timer ? rc.timer.start("capture", { sub: entry.id, part: name }) : null;
  };
}

/** Has the application sent the browser to its sign-in page (or answered 401)? */
function signedOut(rc, page, response, entry) {
  const { auth, appUrl } = rc;
  return rc.checksSignIn && !isSignInUrl(appUrl + entry.route, appUrl, auth.options.loginPattern) && (response?.status() === 401 || isSignInUrl(page.url(), appUrl, auth.options.loginPattern));
}

/** Viewport, localStorage (the session's own, then capture.storage, then the entry's), then the entry's route. */
async function openRoute(rc, page, entry, { name, current, stop }) {
  const { cap, appUrl, appOrigin, auth } = rc;
  await page.setViewportSize({ ...cap.viewports[name], ...(entry.viewport || {}) });
  const storage = { ...rc.baseline, ...storageValues({ ...cap.storage, ...(entry.storage || {}) }, rc.version) };
  if (!onOrigin(page, appOrigin)) {
    try {
      await page.goto(appUrl + auth.options.start, { waitUntil: "domcontentloaded", timeout: TIMINGS.start });
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
    response = await page.goto(appUrl + routeWithView(entry.route, entry.view, cap.map), { waitUntil: "load", timeout: TIMINGS.page });
  } catch (e) {
    if (current.forbidden) throw stop();
    throw new CaptureError("navigation", { route: entry.route, error: firstLine(e) });
  }
  await waitForChallenge(page);
  if (signedOut(rc, page, response, entry)) throw new SessionExpired(page.url());
}

/** Is the page on the application's origin? */
function onOrigin(page, appOrigin) {
  try {
    return new URL(page.url()).origin === appOrigin;
  } catch {
    return false;
  }
}

/** Waits for the page, plays the entry's actions, waits again, then checks it is still allowed and signed in. */
async function playEntry(rc, page, entry, { network, current, stop, part }) {
  const { forbidden } = rc;
  // On conditions (network quiet, fonts, DOM still, animations ended); `delay` is only a floor now.
  part("wait");
  await waitForStable(page, { network, min: entry.delay ?? 0 });
  part("actions");
  for (const [i, a] of (entry.actions || []).entries()) {
    try {
      await play(page, a, rc.sel);
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
  if (!current.forbidden && forbidden.length && onOrigin(page, rc.appOrigin)) {
    const shown = new URL(page.url()).pathname;
    if (forbiddenMatch(shown, forbidden)) current.forbidden = shown;
  }
  if (current.forbidden) throw stop();
  if (signedOut(rc, page, null, entry)) throw new SessionExpired(page.url());
}

/** The frame's clip and each zone measured in it (percentages of the image). */
async function measureEntry(rc, page, entry) {
  let clip;
  try {
    clip = await frameClip(page, entry.frame, rc.sel);
  } catch (e) {
    if (e instanceof CaptureError) throw e;
    throw new CaptureError("frame", { target: describeTarget(entry.frame), error: firstLine(e) });
  }
  const zones = [];
  for (const [i, z] of (entry.zones || []).entries()) {
    let box;
    try {
      box = await zoneBox(page, z, rc.sel);
    } catch (e) {
      if (e instanceof CaptureError) throw e;
      throw new CaptureError("zone", { n: i + 1, target: describeTarget(z), caption: z.caption || "", error: firstLine(e) });
    }
    zones.push(measureZone(i + 1, box, clip, z));
  }
  return { clip, zones };
}

/** Masks again, screenshots, encodes, then writes (or compares with the image on disk) and writes the zone file. */
async function writeEntry(rc, page, entry, { clip, zones, part }) {
  const { cap, encoder, imagesDir } = rc;
  // Masked again just before the shot: the application may have rendered data again while the zones were
  // being waited for (SECURITY.md, ETUDE-CAPTURES.md C7).
  part("mask");
  await mask(rc, page, entry, { required: false });
  part("shot");
  const png = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
  if (rc.preview && zones.length) await writePreview(page, clip, zones, path.join(rc.previewDir, `${entry.id}.zones.png`));
  part("encode");
  const webp = await encoder.encode(png, cap.webpQuality);
  const imageFile = path.join(imagesDir, `${entry.id}.webp`);
  part(rc.compare ? "compare" : "write");
  const compared = rc.compare ? await compareAndWrite(rc, entry, { webp, imageFile, zones }) : (fs.writeFileSync(imageFile, webp), undefined);
  fs.writeFileSync(
    path.join(rc.zonesDir, `${entry.id}.json`),
    JSON.stringify(zoneFile({ entry, clip, zones, version: rc.version, captured: rc.date, commit: rc.commit, plan: rc.planHash(entry), scale: cap.scale ?? 1 }), null, 2) + "\n"
  );
  return { bytes: webp.length, compared };
}

/**
 * `compare` (ARCHITECTURE.md §6.10): the new image against the one on disk. Unchanged: the image on disk is left
 * exactly as it was (no binary change for git); changed: replaced, and a before/after sheet is written.
 */
async function compareAndWrite(rc, entry, { webp, imageFile, zones }) {
  const { encoder, compareDir } = rc;
  fs.mkdirSync(compareDir, { recursive: true });
  fs.writeFileSync(path.join(compareDir, `${entry.id}.webp`), webp);
  if (!fs.existsSync(imageFile)) {
    fs.writeFileSync(imageFile, webp);
    return { ratio: 1, changed: true };
  }
  const before = fs.readFileSync(imageFile);
  const { ratio, sameSize } = await compareImages(encoder.page, before, webp, { tolerance: 16 });
  const outcome = compareOutcome({ ratio, sameSize, threshold: rc.compareThreshold });
  if (outcome === "changed") {
    fs.writeFileSync(imageFile, webp);
    const sheet = await beforeAfterSheet(encoder.page, { before, after: webp, zonesBefore: previousZones(rc, entry.id), zonesAfter: zones, labels: rc.labels });
    fs.writeFileSync(path.join(compareDir, `${entry.id}.png`), sheet);
  }
  return { ratio, changed: outcome === "changed" };
}

/** Zones of the zone file written by a previous run (for the before/after sheet), or []. */
function previousZones(rc, id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rc.zonesDir, `${id}.json`), "utf8")).zones || [];
  } catch {
    return [];
  }
}

async function mask(rc, page, entry, { required = true } = {}) {
  try {
    await maskPage(page, { source: rc.source, masks: entry.masks || [], selectors: rc.sel, required });
  } catch (e) {
    if (e instanceof CaptureError) throw e;
    throw new CaptureError("mask", { error: firstLine(e) });
  }
}

/** Is the page a bot challenge (an interstitial "Just a moment…" page)? */
async function isChallenge(page) {
  const title = await page.title().catch(() => "");
  if (/just a moment|attention required|checking your browser/i.test(title)) return true;
  return (await page.locator("#challenge-form, #challenge-running, #cf-challenge-running").count().catch(() => 0)) > 0;
}

/** Waits for a bot challenge to clear by itself (20 s at most). */
async function waitForChallenge(page, timeout = TIMINGS.challenge) {
  if (!(await isChallenge(page))) return;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    await page.waitForTimeout(TIMINGS.challengePoll);
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
