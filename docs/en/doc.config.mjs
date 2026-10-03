// The documentation of doc-kit itself, written and built with doc-kit (English).
// Its twin is ../fr. Both capture the fictional demo app of the kit (examples/demo-app) and their own built site.
//   node examples/demo-app/serve.mjs                       the app, on http://127.0.0.1:4173
//   doc-kit demo && doc-kit capture --preview              the app screens (session: see CONTRIBUTING.md)
//   doc-kit capture --plans captures/plans-site --no-session   the site screens, with KIT_DOCS_URL pointing to
//                                                          `doc-kit dev` of this project (see CONTRIBUTING.md)
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.3.0",
  product: { name: "doc-kit", slug: "doc-kit" },
  language: "en",
  // The documented version is the kit's own.
  version: { file: "../../package.json", fallback: "0.0.0" },
  // KIT_DOCS_URL, KIT_DOCS_SESSION, KIT_DOCS_PLANS, KIT_DOCS_READONLY.
  env: { prefix: "KIT_DOCS" },
  app: { url: "http://127.0.0.1:4173" },
  auth: { adapter: "manual" },
  capture: {
    setup: "../shared/setup-demo.mjs",
    // Opening the approval chain of an order creates it on the server: never opened.
    forbidden: ["^/orders/\\d+/approval$"],
  },
  // Every configuration key, CLI option and built-in adapter is cited; every command too.
  coverage: [
    { adapter: "local:../shared/kit-reference.mjs", kit: "../.." },
    { adapter: "glob", family: "Commands", base: "../../cli/commands", pattern: "*.mjs", match: "doc-kit {name}" },
  ],
  // [[status open]], [[status shipped]], [[status cancelled]] in the page examples.
  statuses: {
    open: ["st-1", "Open"],
    shipped: ["st-0", "Shipped"],
    cancelled: ["#64748b", "Cancelled"],
  },
  texts: {
    "home.title": "Document a web app with {accent}",
    "home.titleAccent": "{product}",
    "home.primaryAction": "Start in five minutes",
  },
});
