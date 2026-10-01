// The kit's name, defined once. The product name and the command name are provisional: change them here
// (and in package.json "name" / "bin"); nothing else in the code hard-codes them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "package.json"), "utf8"));

export const BRAND = Object.freeze({
  /** Displayed product name. */
  name: "doc-kit",
  /** Command typed by users (must match package.json "bin"). */
  command: Object.keys(pkg.bin || {})[0] || "doc-kit",
  /** npm package name. */
  packageName: pkg.name,
  /** Kit version. */
  version: pkg.version,
});

/** Value of the <meta name="generator"> tag and of meta.generator in the site data. */
export const generatorTag = () => `${BRAND.name} ${BRAND.version}`;
