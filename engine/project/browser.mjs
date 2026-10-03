// Playwright browser (Chromium) for the commands that open the site: view, check tables, optimize.
// Missing browser → KitError with exit code 3 (environment) and the install command.
import { KitError, EXIT } from "./errors.mjs";

export async function launchBrowser(options = {}) {
  const { chromium } = await import("playwright");
  try {
    return await chromium.launch(options);
  } catch (e) {
    if (/Executable doesn't exist|playwright install/i.test(e.message))
      throw new KitError(EXIT.ENVIRONMENT, "browser.missing", {}, { cause: e });
    throw e;
  }
}
