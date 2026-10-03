// Pixel comparison of two WebP images, decoded in the browser (same encoder on both sides: no false positive
// caused by the compression itself), and the before/after sheet shown when a capture changed (ARCHITECTURE.md
// §6.10). Both run in the hidden page of the WebP encoder (`createWebpEncoder`, webp.mjs): no
// browser window, no extra page.
const ZONE_COLOUR = "#e0443e";

/**
 * Compares a new WebP image against the previous one on a hidden canvas.
 * @param {import("playwright").Page} page   the WebP encoder's hidden page
 * @param {Buffer} oldWebp
 * @param {Buffer} newWebp
 * @param {{ tolerance?: number }} [options]  per-channel tolerance (0-255), default 16
 * @returns {Promise<{ ratio: number, sameSize: boolean, width: number, height: number }>}
 *   ratio: share of differing pixels (1 when the sizes differ); width/height: the new image's
 */
export async function compareImages(page, oldWebp, newWebp, { tolerance = 16 } = {}) {
  return page.evaluate(
    async ({ a, b, tolerance }) => {
      const load = (b64) => {
        const img = new Image();
        img.src = "data:image/webp;base64," + b64;
        return img.decode().then(() => img);
      };
      const [before, after] = await Promise.all([load(a), load(b)]);
      if (before.naturalWidth !== after.naturalWidth || before.naturalHeight !== after.naturalHeight)
        return { ratio: 1, sameSize: false, width: after.naturalWidth, height: after.naturalHeight };
      const width = after.naturalWidth;
      const height = after.naturalHeight;
      const pixelsOf = (img) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const cx = c.getContext("2d");
        cx.drawImage(img, 0, 0);
        return cx.getImageData(0, 0, width, height).data;
      };
      const p1 = pixelsOf(before);
      const p2 = pixelsOf(after);
      let differing = 0;
      for (let i = 0; i < p1.length; i += 4) {
        if (
          Math.abs(p1[i] - p2[i]) > tolerance ||
          Math.abs(p1[i + 1] - p2[i + 1]) > tolerance ||
          Math.abs(p1[i + 2] - p2[i + 2]) > tolerance ||
          Math.abs(p1[i + 3] - p2[i + 3]) > tolerance
        )
          differing++;
      }
      return { ratio: differing / (width * height), sameSize: true, width, height };
    },
    { a: oldWebp.toString("base64"), b: newWebp.toString("base64"), tolerance },
  );
}

/** "changed" when the sizes differ or the ratio of differing pixels is above the threshold, else "unchanged". */
export function compareOutcome({ ratio, sameSize, threshold }) {
  return !sameSize || ratio > threshold ? "changed" : "unchanged";
}

/**
 * Draws a before/after control sheet (PNG), the two images side by side with their zones outlined, in the
 * same style as the capture preview (writePreview, capture.mjs): a 24 px gutter, a 28 px banner with the two
 * labels, zones in red with a numbered disc.
 * @param {import("playwright").Page} page   the WebP encoder's hidden page
 * @param {{ before: Buffer, after: Buffer, zonesBefore?: Array<{n,x,y,w,h}>, zonesAfter?: Array<{n,x,y,w,h}>,
 *   labels: { before: string, after: string } }} p
 * @returns {Promise<Buffer>} PNG
 */
export async function beforeAfterSheet(page, { before, after, zonesBefore = [], zonesAfter = [], labels }) {
  const b64 = await page.evaluate(
    async ({ beforeB64, afterB64, zonesBefore, zonesAfter, labelBefore, labelAfter, colour }) => {
      const load = (b64) => {
        const img = new Image();
        img.src = "data:image/webp;base64," + b64;
        return img.decode().then(() => img);
      };
      const [imgBefore, imgAfter] = await Promise.all([load(beforeB64), load(afterB64)]);
      const gutter = 24;
      const banner = 28;
      const wA = imgBefore.naturalWidth;
      const hA = imgBefore.naturalHeight;
      const wB = imgAfter.naturalWidth;
      const hB = imgAfter.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = wA + gutter + wB;
      canvas.height = banner + Math.max(hA, hB);
      const cx = canvas.getContext("2d");
      cx.fillStyle = "#fff";
      cx.fillRect(0, 0, canvas.width, canvas.height);
      cx.fillStyle = "#111";
      cx.font = "600 14px sans-serif";
      cx.textBaseline = "middle";
      cx.textAlign = "left";
      cx.fillText(labelBefore, 4, banner / 2);
      cx.fillText(labelAfter, wA + gutter + 4, banner / 2);
      cx.drawImage(imgBefore, 0, banner);
      cx.drawImage(imgAfter, wA + gutter, banner);

      const drawZones = (zones, offsetX, w, h) => {
        for (const z of zones) {
          const x = offsetX + (z.x / 100) * w;
          const y = banner + (z.y / 100) * h;
          const zw = (z.w / 100) * w;
          const zh = (z.h / 100) * h;
          cx.strokeStyle = colour;
          cx.lineWidth = 2;
          cx.strokeRect(x, y, zw, zh);
          cx.beginPath();
          cx.fillStyle = colour;
          cx.arc(x, y, 10, 0, Math.PI * 2);
          cx.fill();
          cx.fillStyle = "#fff";
          cx.font = "700 12px sans-serif";
          cx.textAlign = "center";
          cx.fillText(String(z.n), x, y + 1);
        }
      };
      drawZones(zonesBefore, 0, wA, hA);
      drawZones(zonesAfter, wA + gutter, wB, hB);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    {
      beforeB64: before.toString("base64"),
      afterB64: after.toString("base64"),
      zonesBefore,
      zonesAfter,
      labelBefore: labels.before,
      labelAfter: labels.after,
      colour: ZONE_COLOUR,
    },
  );
  return Buffer.from(b64, "base64");
}
