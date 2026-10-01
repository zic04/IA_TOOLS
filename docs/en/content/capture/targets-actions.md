## In short

A **target** tells the kit which element of the page you mean: for a zone, a frame, a mask, or an action. An
**action** is a step played on the page before the screenshot: a click, a field filled in, a key pressed.

1. A target has **exactly one kind**: `role`, `text`, `field`, `label`, `placeholder`, `css` or `block`. Zero or two
   kinds is a plan error.
2. **Options** refine it: `exact`, `nth`, `last`, `has`, `within`, `up`, `framed`, and the margins.
3. An action has **exactly one kind** too: `click`, `hover`, `type`, `select`, `press`, `scroll`, `wait`, `wheel`
   or `eval`.
4. The helpers of `doc-kit/targets` write the frequent targets for you: `field("Customer")`, `button("Save")`…

## Targets

| Kind | Example | Finds |
|---|---|---|
| `role` + `name` | `{ role: "button", name: "Save" }` | An element by its ARIA role and accessible name (text or regular expression) |
| `text` | `{ text: "Total" }` | An element by its visible text |
| `field` | `{ field: "Customer" }` | A whole form field: the `<label>` that contains exactly this text, with its control |
| `label` | `{ label: "E-mail" }` | The control associated with this label |
| `placeholder` | `{ placeholder: "Search…" }` | A field by its placeholder |
| `css` | `{ css: "main .toolbar" }` | A CSS selector |
| `block` | `{ block: "Filters" }` | A container matching `capture.selectors.block` whose button or heading starts with this text |

By default, `name`, `text`, `label` and `placeholder` match a part of the text, ignoring case; `exact: true` asks for
the whole text. When several elements match, the first one is used (the last one for `block`, because containers
nest).

## Target options

| Option | Example | Effect |
|---|---|---|
| `exact` | `{ text: "Open", exact: true }` | Whole text, case included |
| `nth` | `{ css: "tbody tr", nth: 2 }` | The third match (counted from 0); `-1` is the last one |
| `last` | `{ text: "Total", last: true }` | The last match |
| `has` | `{ css: "section", has: "Invoices" }` | Only the matches that contain this text |
| `within` | `{ role: "button", name: "Add", within: { block: "Lines" } }` | Searched inside another target |
| `up` | `{ text: "Notifications", up: 1 }` | The parent element, `n` levels up |
| `framed` | `{ text: "Today", framed: true }` | The nearest bordered box around it: an ancestor matching `capture.selectors.frame`, or else one with a border on its four sides |
| `margin` | `{ css: "form", margin: 8 }` | Pixels around a zone (default 4); for a frame, left and right (default 34). Negative, it tightens the box |
| `marginY` | `{ css: "form", marginY: 20 }` | For a frame: pixels above and below (default 10); negative, it tightens the frame |
| `side` | `{ ...button("Save"), side: "right" }` | Where a zone's marker sits ([Zones](#/capture/zones)) |

## The helpers of `doc-kit/targets`

```js
// captures/targets.mjs of a project (written by doc-kit init)
export * from "doc-kit/targets";
export const dialog = { css: "[role=dialog]" };   // the project's own helpers
```

| Helper | Gives |
|---|---|
| `field("Customer")` | `{ field: "Customer" }` |
| `toggle("Notifications")` | `{ text: "Notifications", up: 1 }`: a row with a switch |
| `card("Today")` | `{ text: "Today", framed: true }`: the bordered panel around a text |
| `button("Save")`, `button("Save", true)` | `{ role: "button", name: "Save", exact }` |
| `link("Orders")` | `{ role: "link", name: "Orders", exact }` |
| `tab("Lines")` | `{ role: "tab", name: "Lines" }` |
| `main` | `{ css: "main", margin: 0, marginY: 0 }`: the main area, without menu or top bar |
| `union(a, b, …)` | `{ union: [a, b, …] }`: one zone over several targets |

## Actions

| Action | Example | Effect |
|---|---|---|
| `click` | `{ click: button("Filters") }` | Click; `options` passes Playwright click options: `{ click: …, options: { position: { x: 5, y: 5 } } }` |
| `hover` | `{ hover: { text: "Help" } }` | Hover |
| `type` | `{ type: { label: "Customer" }, value: "north" }` | Fill a field (its content is replaced) |
| `select` | `{ select: { label: "Status" }, value: "Open" }` | Choose an option of a `<select>`: value, label, or a list |
| `press` | `{ press: "Escape" }` | Press a key or a shortcut (`Control+K`) |
| `scroll` | `{ scroll: { text: "Invoices" } }` | Scroll an element into view |
| `wait` | `{ wait: 500 }` or `{ wait: { css: "[role=dialog]" } }` | Wait n ms, or until the element is visible (15 s at most) |
| `wheel` | `{ wheel: { x: 600, y: 400, steps: 2, direction: -1 } }` | Mouse wheel at a point: steps of 360 px, `-1` is up (zoom in on a map) |
| `eval` | `{ eval: () => window.scrollTo(0, 0) }` | A function (or a string) run in the page |

The entry below opens the orders list, chooses a status and types a customer, then captures the result:

```js
{
  id: "orders-open",
  route: "/orders",
  viewport: { width: 1360, height: 720 },
  actions: [
    { select: { label: "Status" }, value: "Open" },
    { type: { label: "Customer" }, value: "north" },
  ],
}
```

The "before" image is the same entry without its actions (`orders-all`): the two images of a slider must have the
same size, so both keep the whole window.

::before-after{before="orders-all" after="orders-open" before-label="Before the actions" after-label="After the actions" title="The same page before and after the two actions of the entry: drag the handle, or use the arrow keys."}

## Pitfalls and observed gaps

> [!WARNING] On production, click only to navigate
> Pages, tabs, menus, opening a dialog then pressing Escape, hovering. Never **Save**, **Create**, **Approve**,
> **Delete**, **Send**, **Import** or **Sign out**, even though write requests are blocked: a write made by the server
> while it renders a page cannot be blocked ([Demo or production](#/capture/safety)).

> [!NOTE] When an action fails
> "action 2 (click) failed — …": the target was not found within 8 s, or is hidden. Run the capture with `--preview`,
> then make the target more precise (`exact`, `within`, `has`).

> [!NOTE] Maps and live pages
> A page that keeps a connection open never becomes idle: the kit waits for the `load` event, then `delay`. Raise
> `delay` rather than waiting for the network to be quiet.

## Further reading

- [Capture plans](#/capture/plans): the fields of an entry.
- [Zones, union and legends](#/capture/zones): targets used as numbered zones.
- [Masking](#/capture/masking): targets used as masks.
