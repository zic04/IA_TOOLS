// The files of the application as the readers of its code see them (ARCHITECTURE.md §6.9: sources `api`, `screens`,
// `behaviours`, `stack`): every file but those of the dependencies, builds and caches of each ecosystem, never a test,
// a fixture or a story, never a minified or generated file — and never one over 512 KB (a bundle, a generated file:
// it is listed, not read).
import fs from "node:fs";
import path from "node:path";
import { listFiles, SKIP_DIRS } from "./common.mjs";

/** A file larger than this is not read. */
const MAX_BYTES = 512 * 1024;

/** Folders of dependencies and builds of the other ecosystems (PHP and Go vendor, Maven and Cargo target, .NET obj…). */
const CODE_SKIP = Object.freeze([
  ...SKIP_DIRS,
  "vendor",
  "target",
  "obj",
  "bin",
  ".gradle",
  "out",
  "Pods",
  ".dart_tool",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".terraform",
]);

/** A folder of tests whatever its place (__tests__/, a Cypress or Playwright folder, a .NET Orders.Tests/ project). */
const TEST_TOOL_DIR = /(^|\/)(__tests__|__mocks__|cypress|playwright)\/|(^|\/)[^/]{1,200}\.Tests?\//;
/** A folder of tests by its name (tests/, spec/, src/test/, fixtures/, e2e/, stories/) — a URL segment in a router. */
const TEST_DIR = /(^|\/)(tests?|spec|e2e|fixtures?|stories)\//;
/** A test file (*.test.ts, test_x.py, x_test.go, x_spec.rb, OrderTest.java). */
const TEST_NAME =
  /\.(test|spec|stories|cy)\.[cm]?[jt]sx?$|(^|\/)(test_[^/]*|[^/]*_test|conftest|tests)\.py$|_test\.go$|_spec\.rb$|Tests?\.(?:java|kt|cs|php|scala)$/;
/** A folder whose sub-folders are routes (Next.js app/ and pages/): app/api/test/route.ts is the route /api/test. */
const ROUTER_DIR = /^(?:src\/)?(?:app|pages)\//;
/** The name of a file of a route of the App Router (a handler, a page). */
const ROUTE_NAME = /^(?:route|page)\.(?:ts|tsx|js|jsx|mdx)$/;
/** A script of the Pages Router. */
const SCRIPT = /\.(?:ts|tsx|js|jsx|mdx)$/;
/** A minified bundle or a generated declaration. */
const GENERATED = /\.min\.[cm]?js$|\.d\.ts$|(^|\/)(vendor|public\/build|static\/dist)\//;

/** The expressions of this module, on the paths of the application (test/tools/redos-worker.mjs, RULES.md S5). */
export const CODE_PATTERNS = Object.freeze({
  TEST_TOOL_DIR,
  TEST_DIR,
  TEST_NAME,
  ROUTER_DIR,
  ROUTE_NAME,
  SCRIPT,
  GENERATED,
});

/**
 * A file of a Next.js route: a `route.*` or `page.*` under app/, a script under pages/ — where a folder named
 * like tests is a segment of the route. Any other file under app/ (a Python package, an Angular module) is not.
 */
function routeFile(file) {
  const router = ROUTER_DIR.exec(file);
  if (!router) return false;
  return router[0].endsWith("pages/") ? SCRIPT.test(file) : ROUTE_NAME.test(file.slice(file.lastIndexOf("/") + 1));
}

/**
 * A test, a fixture or a story: never the behaviour of the application itself — a test file, a folder of tests,
 * or a folder named like one (tests/, spec/…) except for the file of a Next.js route, where it is a segment of it.
 */
export const isTestFile = (file) =>
  TEST_NAME.test(file) || TEST_TOOL_DIR.test(file) || (!routeFile(file) && TEST_DIR.test(file));

/** The files of the application its code readers may read: relative paths, sorted; tests and generated files left out. */
export const readableFiles = (appDir) =>
  listFiles(appDir, { skip: [...CODE_SKIP] }).filter((f) => !isTestFile(f) && !GENERATED.test(f));

/**
 * The text of a file of the application, or why it is not read: over MAX_BYTES (`tooLarge`), or not readable.
 * @param {string} appDir
 * @param {string} rel
 * @returns {{ text: string } | { reason: "tooLarge"|"read" }}
 */
export function readCode(appDir, rel) {
  const abs = path.join(appDir, rel);
  try {
    if (fs.statSync(abs).size > MAX_BYTES) return { reason: "tooLarge" };
    return { text: fs.readFileSync(abs, "utf8") };
  } catch {
    return { reason: "read" };
  }
}
