// Capture plan of the demo documentation: two screens of Acme Orders, the fictional app of examples/demo-app.
// The committed images were taken with this plan, from the kit's folder:
//   node examples/demo-app/serve.mjs                          the app, on http://127.0.0.1:4173
//   export DOC_KIT_URL=http://127.0.0.1:4173                  the URL of the app (PowerShell: $env:DOC_KIT_URL = "…");
//                                                             the demo's doc.config.mjs has none, on purpose: the
//                                                             kit's tests run it without an application
//   doc-kit connect --project examples/demo-docs              sign in with any e-mail and password, then press Enter
//   doc-kit capture --project examples/demo-docs --preview    read-only: the settings page's heartbeat is blocked
//   doc-kit connect --forget --project examples/demo-docs     the session is deleted
// The ids and the number of zones match the :::screen legends of content/use/orders.md and settings.md, and the
// kit's tests (snapshots, end-to-end capture). After a new capture: UPDATE=1 npm run test:snapshot.
import { button, card, field, union } from "../targets.mjs";

// The page without the top bar: the default horizontal margin of a frame (34 px) leaves room for the markers on the
// left of the zones; no vertical margin, which would take in the bottom of the top bar.
const page = { css: "main", marginY: 0 };

export const CAPTURES = [
  {
    id: "orders-list",
    title: "Acme Orders › Orders",
    route: "/orders",
    delay: 400,
    frame: page,
    zones: [
      // ① the three filters, one marker over the bounding box of the fields
      { ...union(field("Status"), field("Customer"), field("Date")), caption: "Filters" },
      // ② the bordered panel that holds "Today"
      { ...card("Today"), caption: "Order summary" },
      // ③ the main action
      { ...button("New order"), caption: "New order" },
    ],
  },
  {
    id: "settings-profile",
    title: "Acme Orders › Settings",
    route: "/settings",
    delay: 400,
    frame: page,
    // The workspace GUID is masked automatically (masking.guid).
    zones: [
      { ...card("Profile"), caption: "Profile" },
      { ...button("Save", true), caption: "Save", side: "right" },
    ],
  },
];
