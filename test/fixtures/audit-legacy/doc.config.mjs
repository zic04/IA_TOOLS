// Audit test fixture: a site written before page types, in the legacy French-keyed format (contenu/sommaire.json,
// titre, groupes…). No page declares a template, but most of them already follow one.
export default {
  kit: "^0.2.0",
  product: { name: "Acme Orders" },
  language: "fr",
  paths: { content: "contenu", diagrams: "schemas" },
};
