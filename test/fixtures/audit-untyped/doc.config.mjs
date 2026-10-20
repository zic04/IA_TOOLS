// Audit test fixture: a French site written before page types, its folders named in French through `paths`
// (contenu/, schemas/). No page declares a template, but most of them already follow one.
export default {
  kit: "^0.3.0",
  product: { name: "Acme Orders" },
  language: "fr",
  paths: { content: "contenu", diagrams: "schemas" },
};
