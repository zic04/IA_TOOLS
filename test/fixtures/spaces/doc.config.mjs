// Test project with two spaces (fictional product): the business space (using Acme Orders) and the takeover space
// (its architecture and API). Used by the unit and end-to-end tests of the spaces (ARCHITECTURE.md §6.1a).
// Each space's pages carry a marker text (marker-business-7q, marker-takeover-9z), so that a test can prove that
// an export holds nothing of the other space.
export default {
  kit: "^0.1.0",
  product: { name: "Acme Orders", slug: "acme-orders" },
  language: "en",
  version: { file: "version.txt", pattern: "^([\\d.]+)", fallback: "0.0.0" },
  app: { url: "http://127.0.0.1:4173" },
  auth: { adapter: "none" },
  statuses: { open: ["st-0", "Open"] },
};
