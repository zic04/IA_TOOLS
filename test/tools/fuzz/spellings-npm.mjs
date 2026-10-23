// The spellings of the npm grammars (E) of the property tests (critic's design, §3): the names, locations and specs a
// tool reads as the same folder or the same place, each a production the TAINT grammar plants (ops.mjs) and the npm
// renderer writes (render-npm.mjs). A spelling is built by construction from the name it twins, never drawn.
import { OTHER } from "./model.mjs";

export const baseOf = (name) => name.split("/").pop();
/** The fullwidth form of the first ASCII letter of a name (NFKC folds it back: the same folder on Windows, macOS). */
const fullwidth = (name) => name.replace(/[a-z]/i, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
/** A "k" written as the Kelvin sign (NFKC: K, then k), else the fullwidth form. */
const kelvin = (name) => (/k/i.test(name) ? name.replace(/k/i, "\u212A") : fullwidth(name));

/** Spellings of a folder twin of `name`: another name a case-folding, NFKC filesystem reads as the same folder. */
const NAME_TWINS = Object.freeze([
  ["upper case", (n) => n.toUpperCase()],
  ["trailing dot", (n) => `${n}.`],
  ["trailing space", (n) => `${n} `],
  ["fullwidth letter", fullwidth],
  ["Kelvin sign", kelvin],
]);

/** The absolute folder of the lock with "/" (C:/Users/…/App-Fuzz) and its segments after the drive. */
const absPosix = (ctx) => ctx.abs.split("\\").join("/");
const absSegments = (ctx) =>
  absPosix(ctx)
    .split("/")
    .filter((s) => s && !s.endsWith(":"));

/** package-lock v2/v3 locations that npm resolves to `node_modules/<name>` (critic's design, location twins (E)). */
export const V3_TWINS = Object.freeze([
  ...NAME_TWINS.map(([label, f]) => [label, (n) => `node_modules/${f(n)}`]),
  ["empty folder", (n) => `node_modules//${n}`],
  ["dot folder", (n) => `node_modules/./${n}`],
  ["folder and back", (n) => `node_modules/x/../${n}`],
  ["trailing slash", (n) => `node_modules/${n}/`],
  ["backslash", (n) => `node_modules\\${n}`],
  ["back in by the folder's name", (n, ctx) => `../${ctx.dirName}/node_modules/${n}`],
  ["absolute, slashes", (n, ctx) => `${absPosix(ctx)}/node_modules/${n}`],
  ["absolute, backslashes", (n, ctx) => `${ctx.abs.split("/").join("\\")}\\node_modules\\${n}`],
  ["drive relative", (n) => `C:node_modules/${n}`],
  ["UNC", (n, ctx) => `//?/${absPosix(ctx)}/node_modules/${n}`],
  [
    "climb past the root",
    (n, ctx) => `${"../".repeat(absSegments(ctx).length + 2)}${absSegments(ctx).join("/")}/node_modules/${n}`,
  ],
  [
    "8.3 short name",
    (n) =>
      `node_modules/${baseOf(n)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6)}~1`,
  ],
]);

/** package-lock v1 top-level keys npm 7+ places in `node_modules/<name>`, or a name with a path in it. */
export const V1_TWINS = Object.freeze([
  ...NAME_TWINS,
  ["name with a trailing slash", (n) => `${n}/`],
  ["dot slash", (n) => `./${n}`],
  ["folder and back", (n) => `x/../${n}`],
  ["backslash", (n) => `${n}\\x`],
]);

/** Specs of a v1 link back to the lock's own folder ("Link to the root (E)"), in `version`, `from` or `resolved`. */
export const ROOT_LINKS = Object.freeze([
  ["file:.", () => "file:."],
  ["file:./", () => "file:./"],
  ["file:../<dir>", (ctx) => `file:../${ctx.dirName}`],
  ["FILE:.", () => "FILE:."],
  ["file:a/b/../..", () => "file:a/b/../.."],
  ["file:a\\..", () => "file:a\\.."],
  ["file:///<abs>", (ctx) => `file:///${absPosix(ctx)}`],
  [".", () => "."],
  ["../<dir>", (ctx) => `../${ctx.dirName}`],
]);
export const LINK_FIELDS = Object.freeze(["version", "from", "resolved"]);

/** A direct dependency's spec that names a place, not a registry release ("Root spec", TAINT). */
export const ROOT_SPECS = Object.freeze([
  (n) => `file:../corp-${baseOf(n)}`,
  () => `npm:${OTHER}@^1.0.0`,
  (n) => `github:corp/${baseOf(n)}`,
  (n) => `git+ssh://git@git.corp.internal/corp/${baseOf(n)}.git`,
  (n) => `link:../corp-${baseOf(n)}`,
  () => "workspace:*",
  (n) => `../corp-${baseOf(n)}`,
  (n) => `corp/${baseOf(n)}`,
  (n) => `https://files.corp.internal/${baseOf(n)}-1.0.0.tgz`,
]);

/** Yarn 1's second `resolved` in one block ("Second resolved (E)"): the spellings, `%s` the URL. */
export const YARN_RESOLVED2 = Object.freeze([
  '  resolved "%s"',
  '  resolved: "%s"',
  '  "resolved" "%s"',
  '  resolved\t"%s"',
  '  resolved  "%s"',
  '  resolved "%s" # c',
  '  resolved "%s" ',
]);
export const YARN_TWINS = NAME_TWINS;
