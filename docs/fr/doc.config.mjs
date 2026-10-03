// La documentation de doc-kit, écrite et construite avec doc-kit (français).
// Son jumeau est ../en. Les deux capturent l'application de démonstration fictive du kit (examples/demo-app) et
// leur propre site construit.
//   node examples/demo-app/serve.mjs                       l'application, sur http://127.0.0.1:4173
//   doc-kit demo && doc-kit capture --preview              les écrans de l'application (session : voir CONTRIBUTING.md)
//   doc-kit capture --plans captures/plans-site --no-session   les écrans du site, avec KIT_DOCS_URL qui pointe vers
//                                                          `doc-kit dev` de ce projet (voir CONTRIBUTING.md)
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.3.0",
  product: { name: "doc-kit", slug: "doc-kit" },
  language: "fr",
  // La version documentée est celle du kit.
  version: { file: "../../package.json", fallback: "0.0.0" },
  // KIT_DOCS_URL, KIT_DOCS_SESSION, KIT_DOCS_PLANS, KIT_DOCS_READONLY.
  env: { prefix: "KIT_DOCS" },
  app: { url: "http://127.0.0.1:4173" },
  auth: { adapter: "manual" },
  capture: {
    setup: "../shared/setup-demo.mjs",
    // Ouvrir le circuit de validation d'une commande le crée sur le serveur : jamais ouvert.
    forbidden: ["^/orders/\\d+/approval$"],
  },
  // Chaque clé de configuration, option de la ligne de commande et adaptateur intégré est cité ; chaque commande aussi.
  coverage: [
    { adapter: "local:../shared/kit-reference.mjs", kit: "../.." },
    { adapter: "glob", family: "Commandes", base: "../../cli/commands", pattern: "*.mjs", match: "doc-kit {name}" },
  ],
  // [[statut open]], [[statut shipped]], [[statut cancelled]] dans les exemples de pages : les libellés de
  // l'application de démonstration, qui est en anglais.
  statuses: {
    open: ["st-1", "Open"],
    shipped: ["st-0", "Shipped"],
    cancelled: ["#64748b", "Cancelled"],
  },
  texts: {
    "home.title": "Documentez vos applis avec {accent}",
    "home.titleAccent": "{product}",
    "home.primaryAction": "Démarrer en cinq minutes",
  },
});
