// Targets → Playwright locators, measured boxes, and the actions played before a capture.
// Syntax: header of engine/capture/plans.mjs. Errors carry an i18n key (cli.capture.error.*) and variables.
import { selectors } from "playwright";
import { TIMINGS } from "./timings.mjs";

/** Error of one capture, translated by the CLI (key `cli.capture.error.<key>`). */
export class CaptureError extends Error {
  constructor(key, vars = {}, cause) {
    super(`${key} ${JSON.stringify(vars)}`, cause ? { cause } : undefined);
    this.key = key;
    this.vars = vars;
  }
}

/** First line of an error message (Playwright messages are long). */
export const firstLine = (e) => String(e?.message ?? e).split("\n")[0];

// Custom selector engine for the `framed` option: the closest ancestor (or the element itself) that matches a
// CSS selector, or, with an empty selector, that has a border on its four sides. Registered once per process.
const FRAME_ENGINE = "doc-kit-frame";
let registered;
export function registerSelectors() {
  registered ??= selectors
    .register(FRAME_ENGINE, () => ({
      query(root, selector) {
        const bordered = (el) => {
          const s = getComputedStyle(el);
          return ["Top", "Right", "Bottom", "Left"].every((k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== "none");
        };
        for (let el = root; el && el.nodeType === 1; el = el.parentElement) if (selector ? el.matches(selector) : bordered(el)) return el;
        return null;
      },
      queryAll(root, selector) {
        const el = this.query(root, selector);
        return el ? [el] : [];
      },
    }))
    .catch((e) => {
      if (!/already registered/i.test(e.message)) throw e;
    });
  return registered;
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Locator of a target.
 * @param {import("playwright").Page} page
 * @param {object} t        target (header of plans.mjs)
 * @param {{ block?: string|null, frame?: string|null }} [sel]   capture.selectors
 * @param {import("playwright").Locator|import("playwright").Page} [root]
 * @param {{ all?: boolean }} [how]   all: every match (masks), unless nth or last is given
 */
export function locate(page, t, sel = {}, root = page, { all = false } = {}) {
  if (Array.isArray(t) || t.union) throw new CaptureError("unionHere");
  const base = t.within ? locate(page, t.within, sel, root) : root;
  const exact = t.exact ?? false;
  let l;
  if (t.role) l = base.getByRole(t.role, t.name === undefined ? {} : { name: t.name, exact });
  else if (t.text !== undefined) l = base.getByText(t.text, { exact });
  else if (t.label !== undefined) l = base.getByLabel(t.label, { exact });
  else if (t.placeholder !== undefined) l = base.getByPlaceholder(t.placeholder, { exact });
  else if (t.css) l = base.locator(t.css);
  else if (t.field) l = base.locator("label").filter({ has: page.getByText(t.field, { exact: true }) });
  else if (t.block) {
    if (!sel.block) throw new CaptureError("blockSelector");
    const name = new RegExp("^\\s*" + escapeRegex(t.block));
    l = base.locator(sel.block).filter({ has: page.getByRole("button", { name }).or(page.getByRole("heading", { name })) });
  } else throw new CaptureError("target", { target: JSON.stringify(t) });
  if (t.has !== undefined) l = l.filter({ hasText: t.has });
  // Which match: nth, last, or the first one (the last one for a block: nested containers match too).
  if (!(all && t.nth === undefined && !t.last)) l = t.nth !== undefined ? l.nth(t.nth) : t.last || (t.block && t.last === undefined) ? l.last() : l.first();
  for (let i = 0; i < (t.up || 0); i++) l = l.locator("xpath=..");
  if (t.framed) l = l.locator(`${FRAME_ENGINE}=${sel.frame || ""}`);
  return l;
}

/** Short description of a target, for messages. */
export function describeTarget(t) {
  if (!t || typeof t !== "object") return String(t);
  if (Array.isArray(t.union)) return t.union.map(describeTarget).join(" + ");
  const kind = ["role", "text", "field", "label", "placeholder", "css", "block"].find((k) => k in t);
  const v = kind === "role" ? `${t.role}${t.name !== undefined ? ` “${t.name}”` : ""}` : `“${t[kind]}”`;
  return `${kind} ${v}`;
}

/**
 * Box of a zone (a target or { union }), in page pixels, with its margin.
 * @returns {Promise<{ x: number, y: number, width: number, height: number }>}
 */
export async function zoneBox(page, zone, sel, { timeout = TIMINGS.element } = {}) {
  const targets = Array.isArray(zone.union) ? zone.union : [zone];
  let b = null;
  for (const t of targets) {
    const l = locate(page, t, sel);
    await l.waitFor({ state: "visible", timeout });
    const r = await l.boundingBox();
    if (!r) throw new Error(`no box: ${describeTarget(t)}`);
    b = b
      ? { x: Math.min(b.x, r.x), y: Math.min(b.y, r.y), x2: Math.max(b.x2, r.x + r.width), y2: Math.max(b.y2, r.y + r.height) }
      : { x: r.x, y: r.y, x2: r.x + r.width, y2: r.y + r.height };
  }
  const m = zone.margin ?? 4;
  return { x: b.x - m, y: b.y - m, width: b.x2 - b.x + 2 * m, height: b.y2 - b.y + 2 * m };
}

/**
 * Clip of a capture: the frame target (with its margins, kept inside the viewport) or the whole viewport.
 */
export async function frameClip(page, frame, sel) {
  const vp = page.viewportSize();
  if (!frame) return { x: 0, y: 0, width: vp.width, height: vp.height };
  const l = locate(page, frame, sel);
  await l.waitFor({ state: "visible", timeout: TIMINGS.element });
  await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox();
  if (!b) throw new Error(`no box: ${describeTarget(frame)}`);
  // Wide horizontal margin (room for the markers, placed left of the zones), tight vertical margin.
  const mx = frame.margin ?? 34;
  const my = frame.marginY ?? 10;
  // Whole pixels, inside the viewport: the image has exactly the size written in the zone file.
  const x = Math.max(0, Math.floor(b.x - mx));
  const y = Math.max(0, Math.floor(b.y - my));
  const x2 = Math.min(vp.width, Math.ceil(b.x + b.width + mx));
  const y2 = Math.min(vp.height, Math.ceil(b.y + b.height + my));
  return { x, y, width: x2 - x, height: y2 - y };
}

/**
 * Zones measured in a clip, as percentages of the image (ARCHITECTURE.md §6.2).
 * The marker sits left of the zone; at the inner corner when there is no room (< 32 px).
 */
export function measureZone(n, box, clip, zone = {}) {
  const auto = box.x - clip.x < 32 ? "corner" : "";
  const side = zone.side || auto;
  return {
    n,
    x: +(((box.x - clip.x) / clip.width) * 100).toFixed(2),
    y: +(((box.y - clip.y) / clip.height) * 100).toFixed(2),
    w: +((box.width / clip.width) * 100).toFixed(2),
    h: +((box.height / clip.height) * 100).toFixed(2),
    ...(side ? { side } : {}),
    ...(zone.caption ? { label: zone.caption } : {}),
  };
}

/** Plays one action. */
export async function play(page, a, sel) {
  const timeout = TIMINGS.element;
  if (a.wait !== undefined) {
    if (typeof a.wait === "number") await page.waitForTimeout(a.wait);
    else await locate(page, a.wait, sel).waitFor({ state: "visible", timeout: TIMINGS.waitTarget });
  } else if (a.click) await locate(page, a.click, sel).click({ timeout, ...(a.options || {}) });
  else if (a.hover) await locate(page, a.hover, sel).hover({ timeout });
  else if (a.type) await locate(page, a.type, sel).fill(String(a.value), { timeout });
  else if (a.select) await locate(page, a.select, sel).selectOption(a.value, { timeout });
  else if (a.press) await page.keyboard.press(a.press);
  else if (a.scroll) await locate(page, a.scroll, sel).scrollIntoViewIfNeeded({ timeout });
  else if (a.wheel) {
    const { x, y, steps = 1, direction = -1 } = a.wheel;
    await page.mouse.move(x, y);
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, direction * 360);
      await page.waitForTimeout(TIMINGS.wheelStep);
    }
  } else if (a.eval !== undefined) await page.evaluate(a.eval);
  else throw new CaptureError("actionUnknown", { action: JSON.stringify(a) });
}

/** Name of an action's kind, for messages. */
export const actionKind = (a) => ["click", "hover", "type", "select", "press", "scroll", "wait", "wheel", "eval"].find((k) => k in a) || "?";

/**
 * Route with the map framing of `view` (capture.map gives the URL parameter names).
 * { lon, lat, zoom } → Web Mercator metres (EPSG:3857); { x, y, z } → as is.
 */
export function routeWithView(route, view, map) {
  if (!view || !map) return route;
  let x;
  let y;
  let z;
  if (view.lon !== undefined && view.lat !== undefined) {
    const R = 6378137;
    const fixed = (n) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
    x = fixed((view.lon * Math.PI * R) / 180);
    y = fixed(R * Math.log(Math.tan(Math.PI / 4 + (view.lat * Math.PI) / 360)));
    z = view.zoom;
  } else ({ x, y, z } = view);
  const params = [
    [map.x, x],
    [map.y, y],
    [map.z, z],
  ]
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return params ? route + (route.includes("?") ? "&" : "?") + params : route;
}
