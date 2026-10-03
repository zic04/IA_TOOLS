// Coverage adapter of any set of files: one item per file of `base` matching `pattern` (a glob: **, *, ?, {a,b}),
// cited in the documentation under the form given by `match`, a template where {path} is the path relative to
// `base` without extension, {name} the file name without extension, {dir} its folder and {file} the file name.
//   one page per specification:  { adapter: "glob", family: "Specifications", base: "../../specs", pattern: "**/*.md", match: "{name}" }
//   one route per file:           { adapter: "glob", family: "Routes", base: "../../src/routes", pattern: "**/*.tsx", match: "/{path}" }
import { excludeItems } from "../../engine/check/coverage.mjs";

/** Applies a `match` template to a file path (relative to `base`, forward slashes). */
export function render(template, file) {
  const noExt = file.replace(/\.[^./]+$/, "");
  const slash = noExt.lastIndexOf("/");
  const vars = {
    path: noExt,
    name: noExt.slice(slash + 1),
    dir: slash < 0 ? "" : noExt.slice(0, slash),
    file: file.slice(file.lastIndexOf("/") + 1),
  };
  return template.replace(/\{(path|name|dir|file)\}/g, (m, k) => vars[k]);
}

export default {
  name: "glob",
  options: {
    pattern: { type: "string", minLength: 1, required: true },
    base: { type: "string", minLength: 1, default: "." },
    match: { type: "string", minLength: 1, default: "{name}" },
    family: { type: "string", minLength: 1, default: "Files" },
    exclude: { type: "array", items: { type: "string" }, default: [] },
  },
  async inventory({ options, tools }) {
    if (!tools.exists(options.base)) return { available: false, reason: "notFound", vars: { path: options.base } };
    const items = tools.glob(options.pattern, options.base).map((f) => ({ id: f, match: [render(options.match, f)] }));
    return { available: true, families: [{ name: options.family, items: excludeItems(items, options.exclude) }] };
  },
};
