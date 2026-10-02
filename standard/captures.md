# Captures

A doc-kit capture is a WebP image **and** the position of its annotated zones: `images/<id>.webp` and `images/zones/<id>.json`. The site turns them into an interactive screen, with numbered markers, a legend and a guided tour. This document sets the safety rules first, then the quality rules.

## 1. Safety

### Production is never written to

A whole site can be captured **on production**, when its owner asks for it, "without any change". These rules have made it possible without incident:

| Rule | How | Check |
|---|---|---|
| Every request that is not `GET`, `HEAD` or `OPTIONS` is **blocked in the browser** | Active as soon as a session is used (`capture.readOnly: "auto"`); always with `capture.target: "production"`, where it cannot be turned off; can be forced with `<PREFIX>_READONLY=1` | The last line of every run: "Read-only: N write request(s) blocked" |
| Click **only to navigate** | Pages, tabs, menus, opening a dialog or the assistant then pressing Escape, hovering | Review of the plan |
| Forbidden buttons, even though they are blocked | Save, Create, Approve, Delete, Sign, Send, Import, Synchronise, Reindex, Sign out; any input that triggers an automatic save | Review of the plan |
| Small batches | 3 to 8 captures per command: production is shared | — |
| Production declared | `capture.target: "production"`: a banner and a confirmation (default No) before every capture run, `doc-kit demo` refused | `doc-kit doctor` shows the target, ⚠ while `capture.forbidden` is empty |

Some blocks are normal: a presence heartbeat (for example `POST /api/presence`) and the server actions that load a page. A page that loads its data through a server action (a `POST`) is therefore displayed **incomplete**. Describe it; do not work around the block.

### The limit: writes made by the server while rendering

The block only applies to the requests **of the browser**. A write made **by the server while it renders** a page still goes through.

> [!WARNING] The case of Acme Orders
> Opening the record of an order that has no approval chain yet **creates one**: `app/(app)/orders/[id]/page.tsx:88-92` calls `ensureApprovalChain`, and the approver is notified. Three approvers received notifications for orders nobody had touched before the mechanism was known. It became production finding P9.

Hence three rules:
1. **Before you open a detail page**, read the code that renders it (`page.tsx`, a loader, a controller). If it calls a function such as `create…`, `ensure…`, `upsert…` or `update…`, do not open the page: describe it from the code.
2. Declare these routes in **`capture.forbidden`** (regular expressions on the route path). The engine refuses to open them.
3. When a capture is essential, reuse a record that was **already opened** (its write has already happened), and list these records on the "Maintaining the docs" page.

### The session

| Rule | Detail |
|---|---|
| The person signs in **themselves** | `doc-kit connect` opens a visible browser window; SSO and MFA work. The authentication adapter recognises the session: `manual` checks that the app does not redirect to a sign-in page, `nextauth` reads `/api/auth/session`, `api-me` calls the API's "me" endpoint |
| An administrator account | To see every screen. Never a shared service account |
| Stored outside the repository | In the work folder `.doc-kit/`, ignored by git |
| Never copied, shown or passed on | Not in a report, not in a ticket, not to another agent |
| **Deleted at the end of the run** | `doc-kit connect --forget`. As long as it is valid, it gives access to the application |
| **Stop when it expires** | A redirect to the sign-in page (matched by `auth.loginPattern`, by default `login\|signin\|sign-in\|oauth\|authorize`) or a 401 response: the engine stops (exit code 3). Sign in again; do not work around it |

### Masking

| Masked automatically | Limit |
|---|---|
| GUIDs (`masking.guid: true`) | — |
| The values of the application's **local** `.env` whose name suggests a URL, a tenant, a client, an account, a host, an e-mail address or a user (`masking.env`), except `localhost` (`masking.exclude`) | It does not know the **production** values: a gateway URL, an index name or a partly displayed key are not in the local `.env` |
| The elements listed in the `masks` of a capture | To be written capture by capture |
| The patterns of `masking.patterns` | — |

**Review every image** before keeping it: key, password, token, connection string, internal URL. Automatic masking does not replace this review.

### The data shown

- **Real data in clear** (orders, customers, amounts, names): only with a **written decision** of the application's owner, recorded in the project's writing guide.
- Otherwise, a **prepared demo**, created by an **idempotent** script (`capture.setup`, run by `doc-kit demo`). For Acme Orders: two demo customers, fictional people, orders in every status.
- Third parties' personal data: never. On production, Acme Orders captures neither a customer record nor an invoice PDF (they show postal addresses), and it masks the detail rows of the dashboards.

## 2. Quality

| Rule | Why | How |
|---|---|---|
| **3 to 12 zones** per screen | Fewer, and the capture teaches nothing; more, and the guided tour becomes tiring | Split into several captures, one per panel |
| **Reading order** | The markers follow each other from top to bottom, then left to right | The order of `zones` in the plan |
| **Legend = zones** | Item *n* of the list explains marker *n* | The build blocks when the counts differ |
| **Tight frames** | The image shows the panel, not the whole screen | `frame` (margins of 34 px horizontally and 10 px vertically by default); the `main` target for the main area without the menu |
| **A tall viewport** for long panels | No scrolling, no cut zones | `viewport: { height: 2200 }` |
| Several fields on one row | One marker | A zone `{ union: [target, …] }`: it covers the bounding box of all its targets |
| **Check every preview** | A zone measured on the wrong element only shows on the image | `doc-kit capture "<pattern>" --preview`, then look at `<id>.zones.png` in `.doc-kit/` (zones in red) |
| Stable ids | They are cited in the Markdown | kebab-case, prefixed by batch: `use-orders-list`, `cf-approval-chain-rules`, `prod-admin-users` |
| A map framed deterministically | The same image at every run | `view: { lon, lat, zoom }` in the plan, with `capture.map` in the configuration |
| Enough waiting | The screen has finished loading | `delay`: 2,500 ms by default, 7,000 ms for a map |
| Light images | The site is a single file | `doc-kit optimize` recompresses images above 200 KB |

For example, in a capture plan of Acme Orders, the customer and the order date sit on the same row and get a single marker:

```js
import { button, field } from "../targets.mjs";

zones: [
  { css: "header" },                                       // ① the top bar
  { union: [field("Customer"), field("Order date")] },     // ② one marker for the two fields of the row
  button("Submit for approval"),                           // ③ the main action
],
```

A capture without zones is inserted with `::capture`; a capture with zones requires `:::screen` and its legend.

## 3. Production or demo

| | Production, read-only | Prepared local demo |
|---|---|---|
| What you show | The real state, the real volumes, the real anomalies | A data set chosen to show everything |
| "What it changes" (before / after) | Impossible: nothing is changed | Possible: set, capture, set back |
| Pages loaded by a server action | Incomplete (the `POST` is blocked) | Complete |
| Writes made by the server while rendering | A real risk (`ensureApprovalChain`): `capture.forbidden` | No consequence |
| Personal data | Written decision of the owner; review of every image | Fictional |
| Preparation | One sign-in (`doc-kit connect`) | An idempotent script (`doc-kit demo`), the application running locally |
| Facts "in production" | Observed directly, dated | Taken elsewhere: separate production captures (`captures/plans-prod/`, prefix `prod-`) |

The two combine well: document the editors on the demo, and the production configuration with read-only production captures kept in a separate plans folder, selected with `<PREFIX>_PLANS`.
