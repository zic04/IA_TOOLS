// Demo documentation project of the kit (fictional product), also used by the tests.
// Try the whole flow: `node ../demo-app/serve.mjs` in one terminal, then in this folder:
//   doc-kit connect            (sign in with any e-mail and password, then press Enter)
//   doc-kit capture --preview
//   doc-kit dev
// Capturing rewrites images/ and images/zones/: work on a copy to keep the reference screenshots.
export default {
  kit: "^0.1.0",
  product: { name: "Acme Orders", slug: "acme-orders" },
  language: "en",
  version: { file: "version.txt", pattern: "^([\\d.]+)", fallback: "0.0.0" },
  app: { url: "http://127.0.0.1:4173" },
  auth: { adapter: "manual", loginPattern: "^/login" },
  capture: {
    setup: "captures/setup.mjs",
    // The approval page creates an approval chain on the server while it renders: the browser-side read-only
    // mode cannot block that, so the route is never opened.
    forbidden: ["^/orders/\\d+/approval$"],
  },
  theme: { logo: "theme/logo.svg" },
  statuses: {
    open: ["st-0", "Open"],
    cancelled: ["#64748b", "Cancelled"],
  },
  texts: { "home.primaryAction": "Explore the architecture" },
};
