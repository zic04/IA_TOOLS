// PNG → WebP with Chromium's canvas (Playwright): no native dependency.

/**
 * Encoder bound to a browser: one hidden page, reused for every image. `page` is exposed so that other
 * features needing a throwaway canvas (capture --compare: engine/capture/compare.mjs) share it instead of
 * opening one of their own.
 * @param {import("playwright").Browser} browser
 * @returns {Promise<{ page: import("playwright").Page, encode(png: Buffer, quality: number): Promise<Buffer>, close(): Promise<void> }>}
 */
export async function createWebpEncoder(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return {
    page,
    async encode(png, quality = 0.82) {
      const b64 = await page.evaluate(
        async ({ b64, q }) => {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          return c.toDataURL("image/webp", q).split(",")[1];
        },
        { b64: png.toString("base64"), q: quality }
      );
      return Buffer.from(b64, "base64");
    },
    close: () => context.close(),
  };
}

/** Size of a WebP image (VP8, VP8L or VP8X header), or null. */
export function webpSize(buf) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: (buf.readUIntLE(24, 3) & 0xffffff) + 1, height: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
  return null;
}
