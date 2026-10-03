// view <page[~anchor]> [--theme light|dark] [--height 900] [--full] [--tour N] [--output <png>] [--space <id>]
// Screenshots a page of the BUILT site, to review it visually (--space: the export of that space, §6.1a).
//   view use/orders/list
//   view "use/orders/list~the-screen" --theme dark --height 1100
//   view use/orders/list --full          the whole page, from its top, in one image
//   view use/orders/list --tour 3
// In Git Bash, do NOT start the id with "/" (automatic path conversion).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createI18n } from "../../engine/i18n.mjs";
import { launchBrowser } from "../../engine/project/browser.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";
import { declaredSpaceIds, checkSpaceOption } from "../../engine/build/spaces.mjs";
import { checkLanguageOption } from "../../engine/build/languages.mjs";
import { builtSite } from "../common.mjs";
import { waitForStable } from "../../engine/capture/stable.mjs";
import { TIMINGS } from "../../engine/capture/timings.mjs";

export const options = {
  theme: { type: "string" },
  height: { type: "string" },
  full: { type: "boolean" },
  tour: { type: "string" },
  output: { type: "string" },
  space: { type: "string" },
};

export async function run({ ctx, values, positionals }) {
  const { project, config } = await ctx.loadProject();
  // --lang (ARCHITECTURE.md §6.12): the built site is already multilingual; only the opened URL changes.
  const lang = config.languages && ctx.globals.lang ? checkLanguageOption({ languages: config.languages, lang: ctx.globals.lang, t: ctx.t }) : null;
  const hash = (lang ? `${lang}/` : "") + (positionals[0] || "").replace(/^\/+/, "");
  const theme = values.theme || "light";
  if (!["light", "dark"].includes(theme)) throw new KitError(EXIT.USAGE, "option.value", { option: "theme", value: theme, expected: "light | dark" });
  const height = Number(values.height ?? 900);
  if (!Number.isInteger(height) || height < 200) throw new KitError(EXIT.USAGE, "option.value", { option: "height", value: values.height, expected: "integer ≥ 200" });
  const step = values.tour === undefined ? 0 : Number(values.tour);
  if (!Number.isInteger(step) || step < 0) throw new KitError(EXIT.USAGE, "option.value", { option: "tour", value: values.tour, expected: "integer ≥ 1" });
  const space = values.space === undefined ? undefined : checkSpaceOption({ ids: declaredSpaceIds(project.root, config), space: values.space, t: ctx.t });
  const output = path.resolve(values.output ? process.cwd() : project.root, values.output || ".doc-kit/page.png");
  fs.mkdirSync(path.dirname(output), { recursive: true });

  // Label of the tour's "Next" button, in the site's language.
  const next = createI18n({ language: config.language, overrides: config.texts }).t("ui.tour.next");
  const site = await builtSite(ctx, { space });
  const browser = await launchBrowser();
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height }, colorScheme: theme })).newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(site.file).href + "#" + hash);
    await waitForStable(page, { quietMs: TIMINGS.siteQuiet });
    if (step > 0) {
      // No annotated screen on the page (or a documentation without screenshots): say so at once, instead of
      // waiting for a button that will never appear.
      if (!(await page.locator("[data-action=visite]").count())) throw new KitError(EXIT.USAGE, "view.noTour", { page: hash });
      // Each step's card is shown once the zone has scrolled into view (a timer in the site, hidden meanwhile):
      // wait for it, then for the page to settle.
      const card = page.locator(".vis-carte");
      const shown = async () => {
        await card.waitFor({ state: "visible", timeout: TIMINGS.element });
        await waitForStable(page, { quietMs: TIMINGS.siteQuiet });
      };
      await page.locator("[data-action=visite]").first().click();
      await shown();
      for (let i = 1; i < step; i++) {
        await page.getByRole("button", { name: next }).click();
        await shown();
      }
    }
    // --full: the whole page in one image. The window first takes the height of the page, so that the elements
    // sized on the window (menu, sticky panels) follow the page instead of stopping after the first screen.
    if (values.full) {
      const full = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
      if (full > height) {
        await page.setViewportSize({ width: 1440, height: Math.min(full, 32000) });
        await waitForStable(page, { quietMs: TIMINGS.siteQuiet });
      }
    }
    await page.screenshot({ path: output, fullPage: !!values.full });
  } finally {
    await browser.close();
    site.release();
  }
  if (ctx.json) ctx.print(JSON.stringify({ output, errors }, null, 2));
  else ctx.print(`${output}${errors.length ? " — " + ctx.t("cli.view.jsErrors", { errors: errors.join(" | ") }) : ""}`);
  return errors.length ? 1 : 0;
}
