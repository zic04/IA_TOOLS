// Screens of Acme Orders, the fictional demo app of the kit (examples/demo-app), used by the page examples and by
// the Capture section. The number of zones of each entry is the number of items of its :::screen legend.
//   doc-kit demo                     resets the demo data (capture.setup)
//   doc-kit capture --preview        read-only: the presence heartbeat of the settings page is blocked
import { button, card, field, link, main, union } from "../targets.mjs";

export const CAPTURES = [
  {
    // examples/screen, capture/zones
    id: "orders-list",
    title: "Acme Orders › Orders",
    route: "/orders",
    delay: 600,
    frame: main,
    zones: [
      { ...union(field("Status"), field("Customer"), field("Date")), caption: "Filters" }, // ① one marker, three fields
      { ...card("Today"), caption: "Today" }, // ② the bordered panel that holds "Today"
      { ...button("New order"), caption: "New order" }, // ③
      { css: "main table", caption: "Orders" }, // ④
    ],
  },
  {
    // capture/targets-actions: the whole window before the actions (left side of a before / after slider; the
    // two images of a slider have the same size, so both are the whole viewport)
    id: "orders-all",
    title: "Acme Orders › Orders",
    route: "/orders",
    viewport: { width: 1360, height: 720 },
    delay: 600,
  },
  {
    // examples/screen, capture/targets-actions: the same screen after two actions
    id: "orders-open",
    title: "Acme Orders › Orders, open orders of one customer",
    route: "/orders",
    viewport: { width: 1360, height: 720 },
    delay: 600,
    actions: [
      { select: { label: "Status" }, value: "Open" },
      { type: { label: "Customer" }, value: "north" },
    ],
  },
  {
    // examples/editor, capture/masking: the workspace GUID is masked automatically (masking.guid)
    id: "settings-profile",
    title: "Acme Orders › Settings",
    route: "/settings",
    delay: 600,
    frame: main,
    zones: [
      { ...card("Profile"), caption: "Profile" }, // ①
      { ...card("Workspace"), caption: "Workspace" }, // ②
      { ...button("Save", true), caption: "Save", side: "right" }, // ③
    ],
  },
  {
    // examples/journey-step, capture/safety: the "Approval chain" link leads to a forbidden route
    id: "order-detail",
    title: "Acme Orders › Order #1041",
    route: "/orders/1041",
    delay: 600,
    frame: main,
    zones: [
      { css: "main h1", caption: "Order number" }, // ①
      { ...card("Details"), caption: "Details" }, // ②
      { ...link("Approval chain"), caption: "Approval chain" }, // ③
    ],
  },
  {
    // capture/sessions: the sign-in page of the demo (any e-mail and password)
    id: "sign-in",
    title: "Acme Orders › Sign in",
    route: "/login",
    delay: 400,
    frame: { css: "form" },
    zones: [
      { ...field("E-mail"), caption: "E-mail" }, // ①
      { ...field("Password"), caption: "Password" }, // ②
      { ...button("Sign in"), caption: "Sign in" }, // ③
    ],
  },
];
