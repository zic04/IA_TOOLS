// Waiting for a page to be ready for its screenshot (ETUDE-CAPTURES.md §5, A1): on conditions, never a fixed
// sleep. A page is stable when
//   - no request of the page has been in flight for `quietMs` (counted by `trackNetwork`, capped: a page that
//     polls or streams never goes quiet),
//   - its fonts are loaded and its images decoded,
//   - its DOM has not changed for `quietMs`,
//   - its finite animations have ended,
//   - two frames have been painted.
// `min` keeps a floor (a plan's explicit `delay` or `settle`, for a map whose tiles draw on a canvas).

import { TIMINGS } from "./timings.mjs";

/** Defaults: quiet period, overall cap, cap of the network part. */
const STABLE = Object.freeze({ quietMs: TIMINGS.quiet, max: TIMINGS.stableMax, networkMax: TIMINGS.networkMax });

/**
 * Counts a page's requests in flight. Call once per page, before its first navigation.
 * @returns {{ idle(quietMs: number, timeout: number): Promise<boolean> }} idle: true when the page went quiet
 */
export function trackNetwork(page) {
  let inflight = 0;
  let last = Date.now();
  const up = () => {
    inflight++;
    last = Date.now();
  };
  const down = () => {
    inflight = Math.max(0, inflight - 1);
    last = Date.now();
  };
  page.on("request", up);
  page.on("requestfinished", down);
  page.on("requestfailed", down);
  // A navigation forgets the previous document's requests (some never report an end).
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) inflight = 0;
  });
  return {
    async idle(quietMs, timeout) {
      const until = Date.now() + timeout;
      while (Date.now() < until) {
        if (inflight === 0 && Date.now() - last >= quietMs) return true;
        await new Promise((r) => setTimeout(r, 25));
      }
      return false;
    },
  };
}

/**
 * Waits until the page is stable (see above), then for what is left of `min`.
 * @param {import("playwright").Page} page
 * @param {{ network?: { idle: Function }, min?: number, quietMs?: number, max?: number, networkMax?: number }} [o]
 */
export async function waitForStable(page, { network, min = 0, quietMs = STABLE.quietMs, max = STABLE.max, networkMax = STABLE.networkMax } = {}) {
  const t0 = Date.now();
  const left = () => Math.max(0, max - (Date.now() - t0));
  if (network) await network.idle(quietMs, Math.min(networkMax, left()));
  await page
    .evaluate(
      async ({ quietMs, budget }) => {
        const until = performance.now() + budget;
        const remaining = () => Math.max(0, until - performance.now());
        const capped = (p) => Promise.race([p, new Promise((r) => setTimeout(r, remaining()))]);
        if (document.fonts && document.fonts.ready) await capped(document.fonts.ready);
        await capped(Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => (i.addEventListener("load", r, { once: true }), i.addEventListener("error", r, { once: true }))))));
        await new Promise((resolve) => {
          let timer;
          const done = () => {
            observer.disconnect();
            clearTimeout(timer);
            clearTimeout(cap);
            resolve();
          };
          const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(done, quietMs);
          });
          observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
          timer = setTimeout(done, quietMs);
          const cap = setTimeout(done, remaining());
        });
        const running = (document.getAnimations ? document.getAnimations() : []).filter((a) => a.playState === "running" && Number.isFinite(a.effect?.getComputedTiming?.().endTime));
        await capped(Promise.all(running.map((a) => a.finished.catch(() => {}))));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      },
      { quietMs, budget: left() }
    )
    .catch(() => {});
  const rest = min - (Date.now() - t0);
  if (rest > 0) await page.waitForTimeout(rest);
}
