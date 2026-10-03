// Test project for the business space (ARCHITECTURE.md §6.8): a feature sheet, a shared business rule cited
// before it is defined (further down the table of contents), the generated tables, a glossary technical
// correspondence, and a business page that wrongly cites code. Used by the unit and end-to-end tests of
// engine/build/business.mjs.
export default {
  kit: "^0.2.0",
  product: { name: "Acme Orders", slug: "acme-orders" },
  language: "en",
  app: { url: "http://127.0.0.1:4173" },
  auth: { adapter: "none" },
};
