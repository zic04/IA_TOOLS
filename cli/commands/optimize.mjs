// optimize [--threshold <KB>=200] [--quality <0..1>=0.68]
// Lightens the single file: re-encodes the HEAVY screenshots (maps over aerial photos, mostly).
// Only images above the threshold are re-encoded; the new version is kept only when it saves at least 20 %.
// Interface screenshots (fine text) stay below the threshold and keep their sharpness.
// WebP encoding by Chromium's canvas (Playwright), with no native dependency.
import fs from "node:fs";
import path from "node:path";
import { launchBrowser } from "../../engine/project/browser.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";

export const options = {
  threshold: { type: "string" },
  quality: { type: "string" },
};

export async function run({ ctx, values }) {
  const { project, config } = await ctx.loadProject();
  const thresholdKb = Number(values.threshold ?? 200);
  const quality = Number(values.quality ?? 0.68);
  if (!(thresholdKb > 0)) throw new KitError(EXIT.USAGE, "option.value", { option: "threshold", value: values.threshold, expected: "number > 0 (KB)" });
  if (!(quality > 0 && quality <= 1)) throw new KitError(EXIT.USAGE, "option.value", { option: "quality", value: values.quality, expected: "number between 0 and 1" });
  const folder = path.join(project.root, config.paths.images);
  const threshold = thresholdKb * 1024;
  const heavy = (fs.existsSync(folder) ? fs.readdirSync(folder) : [])
    .filter((f) => f.endsWith(".webp"))
    .map((f) => ({ f, size: fs.statSync(path.join(folder, f)).size }))
    .filter((x) => x.size > threshold);

  let saved = 0;
  const lighter = [];
  if (heavy.length) {
    const browser = await launchBrowser();
    try {
      const page = await (await browser.newContext()).newPage();
      for (const { f, size } of heavy) {
        const b64 = fs.readFileSync(path.join(folder, f)).toString("base64");
        const encoded = await page.evaluate(
          async ({ b64, q }) => {
            const img = new Image();
            img.src = "data:image/webp;base64," + b64;
            await img.decode();
            const c = document.createElement("canvas");
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext("2d").drawImage(img, 0, 0);
            return c.toDataURL("image/webp", q).split(",")[1];
          },
          { b64, q: quality }
        );
        const buf = Buffer.from(encoded, "base64");
        if (buf.length < size * 0.8) {
          fs.writeFileSync(path.join(folder, f), buf);
          saved += size - buf.length;
          lighter.push({ file: f, before: Math.round(size / 1024), after: Math.round(buf.length / 1024) });
          if (!ctx.json) ctx.print(ctx.t("cli.optimize.line", lighter.at(-1)));
        }
      }
    } finally {
      await browser.close();
    }
  }
  if (ctx.json) ctx.print(JSON.stringify({ heavy: heavy.length, lighter, saved }, null, 2));
  else ctx.print(`\n${ctx.t("cli.optimize.summary", { n: heavy.length, threshold: thresholdKb, saved: (saved / 1024 / 1024).toFixed(1) })}`);
  return 0;
}
