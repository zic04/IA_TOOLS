// view <page[~anchor]> [--theme light|dark] [--height 900] [--tour N] [--output <png>]
// Screenshots a page of the BUILT site, to review it visually.
//   view use/orders/list
//   view "use/orders/list~the-screen" --theme dark --height 1100
//   view use/orders/list --tour 3
// In Git Bash, do NOT start the id with "/" (automatic path conversion).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createI18n } from "../../engine/i18n.mjs";
import { launchBrowser } from "../../engine/project/browser.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { builtSite } from "../common.mjs";

export const options = {
  theme: { type: "string" },
  height: { type: "string" },
  tour: { type: "string" },
  output: { type: "string" },
};

export async function run({ ctx, values, positionals }) {
  const { project, config } = await ctx.loadProject();
  const hash = (positionals[0] || "").replace(/^\/+/, "");
  const theme = values.theme || "light";
  if (!["light", "dark"].includes(theme)) throw new KitError(EXIT.USAGE, "option.value", { option: "theme", value: theme, expected: "light | dark" });
  const height = Number(values.height ?? 900);
  if (!Number.isInteger(height) || height < 200) throw new KitError(EXIT.USAGE, "option.value", { option: "height", value: values.height, expected: "integer ≥ 200" });
  const step = values.tour === undefined ? 0 : Number(values.tour);
  if (!Number.isInteger(step) || step < 0) throw new KitError(EXIT.USAGE, "option.value", { option: "tour", value: values.tour, expected: "integer ≥ 1" });
  const output = path.resolve(values.output ? process.cwd() : project.root, values.output || ".doc-kit/page.png");
  fs.mkdirSync(path.dirname(output), { recursive: true });

  // Label of the tour's "Next" button, in the site's language.
  const next = createI18n({ language: config.language, overrides: config.texts }).t("ui.tour.next");
  const site = await builtSite(ctx);
  const browser = await launchBrowser();
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height }, colorScheme: theme })).newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(site.file).href + "#" + hash);
    await page.waitForTimeout(900);
    if (step > 0) {
      await page.locator("[data-action=visite]").first().click();
      await page.waitForTimeout(500);
      for (let i = 1; i < step; i++) {
        await page.getByRole("button", { name: next }).click();
        await page.waitForTimeout(450);
      }
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: output });
  } finally {
    await browser.close();
    site.release();
  }
  if (ctx.json) ctx.print(JSON.stringify({ output, errors }, null, 2));
  else ctx.print(`${output}${errors.length ? " — " + ctx.t("cli.view.jsErrors", { errors: errors.join(" | ") }) : ""}`);
  return errors.length ? 1 : 0;
}
