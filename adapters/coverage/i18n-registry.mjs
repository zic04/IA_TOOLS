// Coverage adapter of a registry of the application (blocks, widgets, tools, report types…) whose labels live
// in an i18n file: the ids are extracted from a source file, each id's label is read in the messages, and the
// item is covered when its label is cited in the documentation.
//   source     file holding the registry (relative to the documentation project)
//   block      optional regular expression whose first group is the part of the source to read
//              (e.g. "WIDGET_IDS\\s*=\\s*\\[([^\\]]+)\\]")
//   pattern    regular expression extracting the ids (named group `id`, else the first group); default: "…"
//   flags      flags of block and pattern (default "m"; "g" is always added to pattern)
//   messages   i18n JSON file (nested objects or flat dotted keys)
//   key        key template of a label, {id} replaced (e.g. "dashboard.widget.{id}.title")
//   aliases    { id: otherId }: id used in the key when the id has no label of its own
//   fallback   key used when neither the id nor its alias has a label
//   exclude    ids to leave out (exact ids or regular expressions)
//   family     name shown in the report
// Example:
//   coverage: [{ adapter: "i18n-registry", family: "Widgets", source: "../../src/widgets/registry.ts",
//                pattern: "^\\s*\\w+: \\{ id: \"(?<id>[a-z0-9_]+)\"", messages: "../../src/i18n/en.json",
//                key: "dashboard.widget.{id}.title" }]
import { excludeItems } from "../../engine/check/coverage.mjs";

export default {
  name: "i18n-registry",
  options: {
    source: { type: "string", minLength: 1, required: true },
    messages: { type: "string", minLength: 1, required: true },
    key: { type: "string", minLength: 1, default: "{id}" },
    block: { type: ["string", "null"], default: null },
    pattern: { type: "string", minLength: 1, default: "[\"'`]([^\"'`]+)[\"'`]" },
    flags: { type: "string", pattern: "^[imsu]*$", default: "m" },
    aliases: { type: "object", additionalProperties: { type: "string" }, default: {} },
    fallback: { type: ["string", "null"], default: null },
    exclude: { type: "array", items: { type: "string" }, default: [] },
    family: { type: "string", minLength: 1, default: "Registry" },
  },
  async inventory({ options, tools }) {
    for (const f of [options.source, options.messages]) if (!tools.exists(f)) return { available: false, reason: "notFound", vars: { path: f } };
    let text = tools.read(options.source);
    if (options.block) {
      const b = new RegExp(options.block, options.flags).exec(text);
      if (!b) return { available: false, reason: "blockNotFound", vars: { block: options.block, path: options.source } };
      text = b[1] ?? b[0];
    }
    const messages = tools.json(options.messages);
    const ids = [...new Set([...text.matchAll(new RegExp(options.pattern, "g" + options.flags))].map((m) => m.groups?.id ?? m[1]).filter(Boolean))];
    const value = (k) => {
      const v = tools.i18nKey(messages, k);
      return typeof v === "string" && v.trim() ? v : undefined;
    };
    const label = (id) =>
      value(options.key.replaceAll("{id}", id)) ??
      (options.aliases[id] ? value(options.key.replaceAll("{id}", options.aliases[id])) : undefined) ??
      (options.fallback ? value(options.fallback) : undefined);
    const items = ids.map((id) => {
      const l = label(id);
      return { id, label: l ?? null, match: l ? [l] : [] };
    });
    return { available: true, families: [{ name: options.family, items: excludeItems(items, options.exclude) }] };
  },
};
