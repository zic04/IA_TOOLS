// The script of the site: engine/site/app.js with its modules (engine/site/lib/*.js) spliced in at its "@lib" line,
// in file name order, each in a block of its own so that its declarations stay its own (app.js runs in strict mode:
// a function declared in a block is local to it). A module sees what app.js gives it (EXT.api) and adds to EXT. A site
// folder without lib/ (an older engine: test/tools/equivalence.mjs) gives app.js as it is.
import fs from "node:fs";
import path from "node:path";

/** The line of app.js where the modules go. */
const LIB_MARKER = "/* @lib */";

/**
 * @param {string} siteDir   the folder of app.js (engine/site, or options.siteDir)
 * @returns {string}
 */
export function siteScript(siteDir) {
  const app = fs.readFileSync(path.join(siteDir, "app.js"), "utf8");
  const dir = path.join(siteDir, "lib");
  const at = app.indexOf(LIB_MARKER);
  if (at === -1 || !fs.existsSync(dir)) return app;
  const modules = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => `{\n${fs.readFileSync(path.join(dir, f), "utf8")}\n}`);
  return app.slice(0, at) + modules.join("\n") + app.slice(at + LIB_MARKER.length);
}
