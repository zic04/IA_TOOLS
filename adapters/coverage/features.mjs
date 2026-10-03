// Coverage adapter of a candidate-features registry (ARCHITECTURE.md §6.8): one item per feature of features.json,
// covered when a written page cites its id — in practice its sheet, the `feature` field of a toc.json page.
//   coverage: [{ adapter: "features", file: "features.json" }]
export default {
  name: "features",
  options: {
    file: { type: "string", minLength: 1, default: "features.json" },
    family: { type: "string", minLength: 1, default: "Features" },
  },
  async inventory({ options, tools }) {
    if (!tools.exists(options.file)) return { available: false, reason: "notFound", vars: { path: options.file } };
    const list = tools.json(options.file);
    const items = (Array.isArray(list) ? list : []).map((f) => ({
      id: String(f.id),
      ...(f.title ? { label: f.title } : {}),
      match: [String(f.id)],
    }));
    return { available: true, families: [{ name: options.family, items }] };
  },
};
