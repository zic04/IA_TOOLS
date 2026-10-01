// Coverage adapter of the kit's own documentation (docs/en, docs/fr): every configuration key of
// schemas/config.schema.json, every CLI option of cli/commands/*.mjs and every built-in adapter must be cited.
// It is also the worked example of "Writing an adapter" (reference/adapters in the documentation).
//   coverage: [{ adapter: "local:../shared/kit-reference.mjs", kit: "../.." }]
// An item is covered when one of its `match` texts appears in the documentation (case and white space ignored):
//   configuration key   `capture.readOnly`       (the full dotted path, in backticks)
//   CLI option          --no-session              (with its two dashes)
//   adapter             `api-me`                  (in backticks)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Dotted paths of the configuration keys: nested `properties` only (map values and array items are not keys). */
export function configKeys(schema, prefix = "") {
  const out = [];
  for (const [key, def] of Object.entries(schema.properties || {})) {
    const p = prefix ? `${prefix}.${key}` : key;
    out.push(p);
    if (def && def.type === "object" && def.properties) out.push(...configKeys(def, p));
  }
  return out;
}

export default {
  name: "kit-reference",
  options: {
    kit: { type: "string", minLength: 1, default: "../.." },
  },
  async inventory({ options, tools }) {
    const schemaFile = path.join(options.kit, "schemas", "config.schema.json");
    const commands = path.join(options.kit, "cli", "commands");
    for (const p of [schemaFile, commands]) if (!tools.exists(p)) return { available: false, reason: "notFound", vars: { path: p } };

    const keys = configKeys(tools.json(schemaFile)).map((k) => ({ id: k, match: ["`" + k + "`"] }));

    // Global options (cli/doc-kit.mjs) and the options of every command module.
    const options_ = new Map([["project", "global"], ["json", "global"], ["verbose", "global"], ["lang", "global"], ["help", "global"], ["version", "global"]]);
    for (const f of fs.readdirSync(tools.resolve(commands)).filter((x) => x.endsWith(".mjs")).sort()) {
      const mod = await import(pathToFileURL(path.join(tools.resolve(commands), f)).href);
      for (const name of Object.keys(mod.options || {})) if (!options_.has(name)) options_.set(name, f.slice(0, -4));
    }
    const cli = [...options_].map(([name, command]) => ({ id: `--${name}`, label: command, match: [`--${name}`] }));

    const adapters = ["auth", "coverage"].flatMap((kind) =>
      tools
        .glob("*.mjs", path.join(options.kit, "adapters", kind))
        .map((f) => f.slice(0, -4))
        .map((name) => ({ id: `${kind}/${name}`, match: ["`" + name + "`"] }))
    );

    return {
      available: true,
      families: [
        { name: "Configuration keys", items: keys },
        { name: "CLI options", items: cli },
        { name: "Built-in adapters", items: adapters },
      ],
    };
  },
};
