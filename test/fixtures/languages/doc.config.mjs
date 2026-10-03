// Test project with two languages (fictional product, Acme Orders), copied from the spaces fixture (so that the
// cohabitation of the two lots is tested too: ARCHITECTURE.md §6.1a and §6.12). English is the source; French is
// translated in translations/fr/ with one page of every state: current, stale (use/api-limits), unmarked
// (take-over/architecture) and missing (take-over/orders-api). Each space's pages still carry a marker text
// (marker-business-7q, marker-takeover-9z), unaffected by the translations.
export default {
  kit: "^0.3.0",
  product: { name: "Acme Orders", slug: "acme-orders" },
  languages: ["en", "fr"],
  version: { file: "version.txt", pattern: "^([\\d.]+)", fallback: "0.0.0" },
  app: { url: "http://127.0.0.1:4173" },
  auth: { adapter: "none" },
  statuses: { open: ["st-0", "Open"] },
};
