// The compatibility matrix of the kit (ARCHITECTURE.md §5): what it reads of an application — its stacks, the
// dependencies of each ecosystem, the low-code platforms it detects, and each language with what reads it —
// generated from standard/adapters.json for its own documentation (docs/<language>/content/reference/
// compatibility.md, section "In this part", written by test/tools/adapters-matrix.mjs; a test checks it is up to
// date). Pure.
import { loadAdapters } from "./adapters.mjs";

/** A table cell: a pipe would end it. */
const cell = (s) => String(s).replaceAll("|", "\\|");
const code = (s) => `\`${s}\``;

/**
 * The matrix, in Markdown, in the language of `t`.
 * @param {(key: string, vars?: object) => string} t
 * @param {import("./adapters.mjs").AdapterRegistry} [registry]
 */
export function adapterMatrix(t, registry = loadAdapters()) {
  const out = [];
  const table = (head, rows) =>
    out.push(
      `| ${head.join(" | ")} |`,
      `|${head.map(() => "---").join("|")}|`,
      ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
      "",
    );
  const section = (key) =>
    out.push(`### ${t(`cli.adapters.matrix.${key}`)}`, "", t(`cli.adapters.matrix.${key}.intro`), "");
  const family = (name) => registry.adapters.filter((a) => a.family === name);
  const titleOf = (id) => registry.languages.find((l) => l.id === id)?.title ?? id;
  const detectedBy = (a) => [...(a.detect?.dependencies || []), ...(a.detect?.files || [])].map(code).join(", ");

  section("stacks");
  table(
    ["stack", "languages", "detectedBy", "reads"].map((k) => t(`cli.adapters.matrix.${k}`)),
    family("stack").map((a) => [
      a.title,
      (a.languages || []).map(titleOf).join(", "),
      detectedBy(a),
      (a.reads || []).map((r) => t(`cli.adapters.matrix.read.${r}`)).join(", "),
    ]),
  );
  section("deps");
  table(
    ["ecosystem", "files"].map((k) => t(`cli.adapters.matrix.${k}`)),
    family("deps").map((a) => [`${a.title} (${code(a.ecosystem)})`, (a.files || []).map(code).join(", ")]),
  );
  section("infra");
  table(
    ["tool", "detectedBy", "reads"].map((k) => t(`cli.adapters.matrix.${k}`)),
    family("infra").map((a) => [
      a.title,
      detectedBy(a),
      (a.reads || []).map((r) => t(`cli.adapters.matrix.read.${r}`)).join(", "),
    ]),
  );
  section("lowcode");
  table(
    ["platform", "detectedBy"].map((k) => t(`cli.adapters.matrix.${k}`)),
    family("lowcode").map((a) => [a.title, detectedBy(a)]),
  );
  section("languages");
  table(
    ["language", "extensions", "readBy"].map((k) => t(`cli.adapters.matrix.${k}`)),
    registry.languages.map((l) => {
      const stacks = family("stack")
        .filter((a) => (a.languages || []).includes(l.id))
        .map((a) => a.title);
      const by = [...(l.core ? [t("cli.adapters.matrix.core")] : []), ...stacks];
      return [l.title, l.extensions.map(code).join(", "), by.length ? by.join(", ") : t("cli.adapters.matrix.agents")];
    }),
  );
  return out.join("\n");
}
