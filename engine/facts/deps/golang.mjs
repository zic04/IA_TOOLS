// Go manifests of the `dependencies` source (engine/facts/dependencies.mjs), ecosystem `go` (module paths): go.mod,
// read on its own (go.sum lists checksums, not dependencies: not read).
import { readText, textLines } from "./read.mjs";

/** The manifests are untrusted: these expressions are anchored and bounded, so linear (RULES.md S5). */
export const GO_PATTERNS = Object.freeze({
  /** A directive of go.mod at the start of a line (`require`, `replace`, a block of either, or another one). */
  goDirective: /^(require|replace|exclude|retract|module|go|toolchain|tool|godebug|ignore)(?![\w.-])/,
  /** A requirement: a module path (quoted or not) and its version (`github.com/a/b v1.2.3`). */
  goRequirement: /^"?([^\s"]{1,500})"?\s{1,50}"?(v[^\s"]{1,200})"?$/,
  /** The right of a `replace`: a folder (`./x`, `../x`, `/x`, `C:\x`), not a module. */
  goLocalPath: /^(?:\.{1,2}(?:[\\/]|$)|[\\/]|[A-Za-z]:[\\/])/,
});

/** A go.mod line split into its code and its `//` comment (a comment holds `indirect`). */
function split(line) {
  const at = line.indexOf("//");
  return at < 0 ? { code: line.trim(), comment: "" } : { code: line.slice(0, at).trim(), comment: line.slice(at + 2) };
}

/** The module a `replace` sends to a folder (`old [v] => ./path`), or null. */
function replacedByFolder(code) {
  const arrow = code.indexOf("=>");
  if (arrow < 0) return null;
  const target = code.slice(arrow + 2).trim();
  const module = code.slice(0, arrow).trim().split(" ")[0].split("\t")[0];
  return module && GO_PATTERNS.goLocalPath.test(target) ? module.split('"').join("") : null;
}

/**
 * One go.mod: its `require` lines and blocks, direct unless marked `// indirect`; a module a `replace` of the same
 * file sends to a folder is local. Nothing in go.mod is a development dependency (dev: false).
 */
function fromGoMod(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const out = [];
  const replaced = new Set();
  let block = null;
  const add = (code, comment) => {
    const m = GO_PATTERNS.goRequirement.exec(code);
    if (!m) return;
    const indirect = comment.split(";")[0].trim() === "indirect";
    out.push({ name: m[1], version: m[2], ecosystem: "go", direct: !indirect, dev: false, manifest });
  };
  const replace = (code) => {
    const module = replacedByFolder(code);
    if (module) replaced.add(module);
  };
  for (const raw of textLines(text)) {
    const { code, comment } = split(raw);
    if (block) {
      if (code === ")") block = null;
      else if (block === "require") add(code, comment);
      else if (block === "replace") replace(code);
      continue;
    }
    const directive = GO_PATTERNS.goDirective.exec(code)?.[1];
    if (!directive) continue;
    const rest = code.slice(directive.length).trim();
    if (rest === "(") block = directive;
    else if (directive === "require") add(rest, comment);
    else if (directive === "replace") replace(rest);
  }
  return out.map((item) => (replaced.has(item.name) ? { ...item, local: true } : item));
}

/** The reader of each Go manifest, by file name (lower case). */
export const GO_READERS = Object.freeze({ "go.mod": fromGoMod });
