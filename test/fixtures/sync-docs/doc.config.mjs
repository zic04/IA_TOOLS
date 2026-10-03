// Fixture documentation project for `doc-kit sync` tests (ARCHITECTURE.md §6.10): a fictional "Acme Orders"
// application, paired with test/fixtures/sync-app. Never used to build a real site; small on purpose.
export default {
  product: { name: "Acme Orders" },
  language: "en",
  app: { dir: "../sync-app" },
  coverage: [
    { adapter: "next-app-router", app: "../sync-app/app" },
    { adapter: "fastapi", app: "../sync-app/backend" },
    {
      adapter: "i18n-registry",
      family: "Labels",
      source: "../sync-app/components/order-table.tsx",
      messages: "../sync-app/messages/en.json",
      key: "orders.{id}",
      pattern: 't\\("orders\\.(?<id>\\w+)"\\)',
    },
  ],
  sync: { labels: ["../sync-app/messages/*.json"] },
};
