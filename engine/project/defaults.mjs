// Default values of doc.config.mjs. Plain defaults live in the schema (schemas/config.schema.json, `default`
// keyword); the ones that depend on other values are derived here. Exported as `doc-kit/config`:
//   import { defineConfig } from "doc-kit/config";
//   export default defineConfig({ product: { name: "Acme Orders" }, … });
import { LOCALES } from "../i18n.mjs";

/** Identity, for editor autocompletion. */
export const defineConfig = (c) => c;

/** Slug of a product name: lowercase, no accents, [a-z0-9-]. */
export const productSlug = (name) =>
  String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "docs";

/**
 * Completes a validated configuration (schema defaults already applied) with the derived values:
 *   product.slug    ← slug of the name                        ("Acme Orders" → "acme-orders")
 *   output          ← dist/<name>-Documentation.html          (spaces and reserved characters → "-")
 *   theme.key       ← <slug>-doc-theme                        (localStorage key of the theme choice)
 *   env.prefix      ← SLUG in upper case                      (ACME_ORDERS_URL, ACME_ORDERS_SESSION…)
 *   capture.locale  ← locale of the language                  (en → en-US, fr → fr-FR)
 * Mutates and returns `config`.
 */
export function completeConfig(config) {
  const name = config.product.name;
  config.product.slug ??= productSlug(name);
  config.output ??= `dist/${String(name).replace(/[\\/:*?"<>|\s]+/g, "-")}-Documentation.html`;
  config.theme.key ??= `${config.product.slug}-doc-theme`;
  config.env.prefix ??= config.product.slug.toUpperCase().replace(/-/g, "_");
  config.capture.locale ??= LOCALES[config.language];
  return config;
}
