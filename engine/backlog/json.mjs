// The backlog as JSON (doc-kit/backlog@1, schemas/backlog.schema.json): every item, each before its children, for
// any other tool or script — nothing left out, whatever the references.

/** @type {import("./index.mjs").Exporter} */
export const json = {
  id: "json",
  extension: "json",
  write(items, { product, language }) {
    const out = items.map((x) => ({
      key: x.key,
      kind: x.kind,
      title: x.title,
      description: x.lines,
      criteria: x.criteria,
      version: x.since,
      link: x.link,
      ref: x.ref?.text ?? null,
      parent: x.parent,
      epic: x.epic?.id ?? null,
      feature: x.feature?.id ?? null,
    }));
    const content = JSON.stringify({ schema: "doc-kit/backlog@1", product, language, items: out }, null, 2) + "\n";
    return [{ suffix: ".json", content, items: out.length }];
  },
};
