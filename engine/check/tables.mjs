// Layout check: opens EVERY page of the built site and reports the tables that are wider than the reading
// column (horizontal scrolling means a squeezed or cut column).
import { pathToFileURL } from "node:url";
import { launchBrowser } from "../project/browser.mjs";

/**
 * @param {{ file: string, width?: number, topOfPage?: string }} p
 * @returns {Promise<{ pages: number, width: number, problems: Array<{page: string, heading: string, wide: number, visible: number}> }>}
 */
export async function checkTables({ file, width = 1440, topOfPage = "(top of page)" }) {
  const browser = await launchBrowser();
  try {
    const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    await page.goto(pathToFileURL(file).href);
    await page.waitForTimeout(500);
    const ids = await page.evaluate(() => JSON.parse(document.getElementById("donnees").textContent).ordre);
    const problems = [];
    for (const id of ids) {
      await page.evaluate((h) => (location.hash = h), "#/" + id);
      await page.waitForTimeout(120);
      const wide = await page.evaluate(
        (top) =>
          [...document.querySelectorAll(".contenu .tableau")]
            .filter((t) => t.scrollWidth > t.clientWidth + 2)
            .map((t) => {
              let h = t.previousElementSibling;
              while (h && !/^H[23]$/.test(h.tagName)) h = h.previousElementSibling;
              return { heading: h ? h.textContent.replace("#", "").trim() : top, wide: t.scrollWidth, visible: t.clientWidth };
            }),
        topOfPage
      );
      for (const w of wide) problems.push({ page: id, ...w });
    }
    return { pages: ids.length, width, problems };
  } finally {
    await browser.close();
  }
}
