## In short

A documentation campaign may run on a **prepared demo** or on **production**, read-only. The kit protects production
in three ways, and the third one depends on you.

1. **Read-only**: as soon as a session is used, every request other than `GET`, `HEAD` and `OPTIONS` is aborted
   **in the browser** and counted. The last line of every run says how many: `Read-only: 1 write request blocked —
   POST /api/presence`.
2. **Forbidden routes**: the routes listed in `capture.forbidden` are never opened. An entry that targets one is
   refused before anything runs (exit code 1). During the run, every request to one is aborted in the browser: a
   **prefetch** (a framework preloading the links of a menu) is only counted, and the capture goes on; a
   **navigation** to one (a click on its link) stops the capture.
3. **Your plan**: a click on **Save** is blocked, but a page whose **server** writes while it renders cannot be
   blocked by any browser. Read the code of a detail page before you open it, and forbid the routes that write.

## The diagram

::diagram{id="safety" title="Where each protection acts. The browser can abort the requests it sends (read-only); it cannot stop what the server does while rendering a page it was allowed to open, so such routes are never opened (forbidden)."}

## Read-only

| `capture.readOnly` | Effect |
|---|---|
| `"auto"` (default) | On whenever a session is used; off without session |
| `true` | Always on, even without session |
| `false` | Off: write requests reach the application. With a session, every run warns: "read-only is OFF although a session is used" |

The variable `<PREFIX>_READONLY` (or `DOC_KIT_READONLY`) overrides it for one run: `1`, `true`, `yes` or `0`,
`false`, `no`, or `auto`.

Some blocks are normal: a presence heartbeat, an analytics beacon, or the server action that loads a page. A page
that loads its data through a `POST` is captured **incomplete**: describe it, do not work around the block.

## Forbidden routes: why the browser is not enough

On the demo application, opening the approval chain of an order **creates it on the server**, and in a real product
it would notify the approvers. The browser only sent a `GET`: read-only has nothing to block.

:::screen{capture="order-detail" title="The record of order 1041 in the demo application"}
1. **Order #1041**: the record is safe to open; its route, `/orders/1041`, only reads.
2. **Details**: customer, status, date, lines and amount, read from the API.
3. **Approval chain**: this link leads to `/orders/1041/approval`, whose server code creates the chain while
   rendering. It is listed in `capture.forbidden` and never opened.
:::

```js
capture: {
  // JavaScript regular expressions on the route path (without query string)
  forbidden: ["^/orders/\\d+/approval$"],
},
```

An entry whose `route` matches is refused before the browser starts:

```text
✖ order-approval: the route /orders/1041/approval is forbidden (capture.forbidden: ^/orders/\d+/approval$)
  → a write made by the server while it renders a page cannot be blocked by the browser: describe the page
    from its code, or reuse a record already opened and adjust capture.forbidden
```

### During the run: prefetch or navigation

A server renders a page for **any** `GET` of its route, whoever sends it. Web frameworks prefetch the links of a page
in the background (a `fetch` of the next page's data, a `<link rel=prefetch>`): on the demo application, the order
record prefetches its approval chain, and an administration menu that links to a forbidden page prefetches it from
every page that shows the menu. The kit therefore aborts **every** request to a forbidden path, in the browser, and
tells two cases apart:

| Request to a forbidden path | Examples | What happens |
|---|---|---|
| A prefetch or a sub-resource | `fetch`, XHR, a framework's page payload, `<link rel=prefetch>`, an iframe | Aborted and counted; the capture goes on |
| A navigation of the page | The plan's own route, a click on the link, a pop-up, a redirect | Aborted; the capture stops (exit code 1) |

Aborting the prefetch is exactly what prevents the render on the server: the request never reaches it. The last
lines of the run count the prefetches:

```text
✔ order-detail (3 zones, 41 KB, 2.1 s)

1/1 capture taken.
1 prefetch request to forbidden routes aborted — GET /orders/1041/approval
Read-only: 0 write requests blocked
```

A navigation stops its capture, and the summary lists it:

```text
✖ order-approval-click: the page requested a forbidden route (/orders/1041/approval): capture stopped
…
✖ forbidden route: 1 request refused — GET /orders/1041/approval
```

Service workers are blocked while the kit captures, so that no request escapes the check.

## Before opening a detail page

:::steps
1. Find the code that renders the route: the page component, a loader, a controller.
2. Look for a write: a function named like `create…`, `ensure…`, `upsert…`, `update…`, a notification, a counter.
3. If there is one, add the route to `capture.forbidden`, and describe the page from its code.
4. If the capture is essential, reuse a record whose write has **already happened**, and note it on the page that
   explains how the documentation is maintained.
:::

## Demo or production

| | Production, read-only | Prepared demo |
|---|---|---|
| What you show | The real state and volumes | A data set chosen to show everything |
| Before / after captures | Impossible: nothing is changed | Possible: set, capture, set back |
| Pages loaded by a `POST` | Incomplete | Complete |
| Server writes while rendering | A real risk: `capture.forbidden` | No consequence |
| Personal data | Only with the owner's written decision; review every image | Fictional |
| Preparation | One sign-in (`doc-kit connect`) | An idempotent script (`capture.setup`, run by `doc-kit demo`) |

The two combine: document the editors on the demo, and the real configuration with read-only production captures
kept in another plans folder (`captures/plans-prod`, ids prefixed `prod-`), selected with `--plans` or
`<PREFIX>_PLANS`.

## The demo data script

`capture.setup` names a script that prepares the demo data; `doc-kit demo` runs it in its own Node process, from the
project folder. When it exports a default function, the function receives `{ config, root, url }`; the variables
`DOC_KIT_PROJECT`, `DOC_KIT_URL` and `DOC_KIT_CONFIG` (JSON) are set too. It must be **idempotent**: run it before
every campaign.

```js
// captures/setup.mjs
export default async function setup({ url }) {
  const r = await fetch(`${url}/api/demo/reset`, { method: "POST" });
  if (!r.ok) throw new Error(`demo reset refused: HTTP ${r.status}`);
}
```

## Pitfalls and observed gaps

> [!CAUTION] Production is shared
> Capture in small batches of 3 to 8 entries (`doc-kit capture "prod-orders-*"`), check the count of blocked writes
> on the last line, and delete the session at the end of the campaign (`doc-kit connect --forget`).

> [!NOTE] What read-only does not cover
> WebSocket messages and requests made by the server to other services are outside the browser's reach. Only the
> plan, and `capture.forbidden`, protect against them.

## Further reading

- [Connect and sessions](#/capture/sessions): the session that turns read-only on.
- [Masking](#/capture/masking): what is hidden in the images.
- `standard/captures.md` in the kit: the safety rules of the standard, with their history.
