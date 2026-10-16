// Test project with two of the four spaces (fictional product): the use space (using Acme Orders) and the develop
// space (its architecture and API). Used by the unit and end-to-end tests of the spaces (ARCHITECTURE.md §6.1a).
// Each space's pages carry a marker text (marker-business-7q in use, marker-takeover-9z in develop: named before
// the spaces were), so that a test can prove that an export holds nothing of the other space.
export default {
  kit: "^0.3.0",
  product: { name: "Acme Orders", slug: "acme-orders" },
  language: "en",
  version: { file: "version.txt", pattern: "^([\\d.]+)", fallback: "0.0.0" },
  app: { url: "http://127.0.0.1:4173" },
  auth: { adapter: "none" },
  statuses: { open: ["st-0", "Open"] },
};
