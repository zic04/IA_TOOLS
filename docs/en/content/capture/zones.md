## In short

The **zones** of a capture are the elements a reader must understand, numbered in reading order. The kit measures
each zone on the real page, stores its box in percentages, and the site draws a marker on it. In the page, a
`:::screen` block gives the **legend**: one item per zone, in the same order.

1. A zone is **a target** (`button("Save")`), or **`{ union: [target, …] }`**: one marker over the bounding box of
   several targets, for the fields of one row.
2. **3 to 12 zones** per capture: fewer teaches nothing, more tires the guided tour. Split a large screen into
   several captures, one per panel.
3. **Legend = zones**: the strict build refuses a legend that has one item too many or too few.

## A capture and its zones

The plan entry of the capture below has four zones. The first one is a `union` of three fields, under a single
marker:

```js
zones: [
  { ...union(field("Status"), field("Customer"), field("Date")), caption: "Filters" },   // ①
  { ...card("Today"), caption: "Today" },                                                 // ②
  { ...button("New order"), caption: "New order" },                                       // ③
  { css: "main table", caption: "Orders" },                                               // ④
],
```

:::screen{capture="orders-list" title="The four zones of the orders-list capture"}
1. **Filters**: a `union` of the **Status**, **Customer** and **Date** fields: one marker, one box that holds the
   three of them.
2. **Today**: `card("Today")`, the bordered panel that contains the text "Today".
3. **New order**: `button("New order")`, the button found by its accessible name.
4. **The list**: a CSS selector, `main table`.
:::

## Zone options

| Option | Values · default | Effect |
|---|---|---|
| `caption` | text | Written in the zone file as `label`; a reminder for the people who maintain the plan |
| `side` | `corner`, `right`, `bottom`, `bottom-right` · left of the zone | Where the marker sits; `corner` is set by the kit when the zone touches the left edge |
| `margin` | px · 4 | Space added around the zone |

A `union` accepts the options of a zone; each target inside it keeps its own target options (`exact`, `within`…).
`union` is refused anywhere else than in `zones`.

## Writing the legend

- One item per zone, **in the order of the plan**, 1 to 3 sentences each.
- Start with the exact label in bold, then its role, its values, its default and its effect.
- Text before the list, inside the block, becomes a caption under the image.
- The same capture may be shown on several pages, each with its own legend.

## Checking the zones

```bash
doc-kit capture "orders-*" --preview
```

`--preview` writes `.doc-kit/<id>.zones.png`: the captured image with each zone drawn in red and numbered. Look at
every preview before writing the legend: a zone measured on the wrong element only shows on the image. These
previews are never published.

## Pitfalls and observed gaps

> [!WARNING] Change the plan and the legend together
> Adding a zone in the plan without a legend item fails the strict build: "screen “orders-list”: 5 captured zone(s)
> but 4 item(s) in the legend". With `--draft`, it is a warning.

> [!NOTE] A zone that cannot be found
> "zone 3 (role button “New order”) not found — …": the element was not visible within 8 s. Check the target, the
> `delay`, or the actions that should have displayed it.

> [!NOTE] `::capture` refuses zones
> A capture that has zones is shown with `:::screen` only; `::capture` is for captures without zones.

## Further reading

- [Targets and actions](#/capture/targets-actions): every kind of target and option.
- [Extended Markdown](#/write/markdown~annotated-screen-screen): the `:::screen` syntax.
- [The generated site](#/start/generated-site): markers, legend and guided tour, as the reader sees them.
