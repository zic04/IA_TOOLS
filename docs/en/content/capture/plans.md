## In short

A **capture plan** is a small JavaScript module in `captures/plans/` that exports `CAPTURES`, a list of entries.
Each entry says which page of the application to open, what to do on it, which part of the screen to keep and which
elements to number. `doc-kit capture` plays the entries in a headless Chromium and writes, for each one, an image
and a zone file.

1. **One file per batch of pages** (`use.mjs`, `configure.mjs`…). Files are read in alphabetical order; an id used
   twice, in one file or in two, is an error.
2. **The id names the image**: `images/<id>.webp` and `images/zones/<id>.json`, cited in the Markdown by
   `:::screen{capture="<id>"}` or `::capture{id="<id>"}`. Letters, digits, `.`, `_` and `-`.
3. **Entries are validated** before anything runs (`schemas/capture-plan.schema.json`): every invalid entry of every
   file is listed, each mistake with its file, its id and its path, for example
   `captures/plans/use.mjs › orders-list (CAPTURES[2]) › zones[1].margn: unknown key`, and the command exits with
   code 2.

## The diagram

::diagram{id="capture-flow" title="What doc-kit capture does. Top: the checks made once, before any page is opened. Bottom: the steps of each capture, from left to right, ending with the two files it writes."}

## An entry

```js
import { button, field, main, union } from "../targets.mjs";

export const CAPTURES = [
  {
    id: "orders-list",                 // images/orders-list.webp + images/zones/orders-list.json
    title: "Acme Orders › Orders",     // written in the zone file
    route: "/orders",                  // relative to app.url
    delay: 600,                        // wait after loading, in ms
    frame: main,                       // keep only the main area
    zones: [
      union(field("Status"), field("Customer"), field("Date")),   // ① one marker over three fields
      button("New order"),                                        // ②
    ],
  },
];
```

## The fields of an entry

| Field | Type · default | Role |
|---|---|---|
| `id` | text, required | Name of the image and of the zone file |
| `title` | text | Caption written in the zone file |
| `route` | text starting with `/`, required | Path opened in the application, query string allowed: `/orders?status=open` |
| `context` | a key of `capture.viewports` · `desktop` | `mobile` is a touch screen of 390 × 844 |
| `viewport` | `{ width, height }` | Size for this capture only: `{ height: 2200 }` for a tall panel, `{ height: 150 }` for a strip |
| `view` | `{ lon, lat, zoom }` or `{ x, y, z }` | Frames a map through the URL parameters named in `capture.map` |
| `storage` | object | `localStorage` keys set before the page opens, on top of `capture.storage` |
| `delay` | ms · 2,500 | Wait after loading (7,000 for a map) |
| `actions` | list | Steps played before the screenshot ([Targets and actions](#/capture/targets-actions)) |
| `settle` | ms · 600 | Wait after the actions |
| `frame` | a target | The element whose box is the image; default: the whole viewport |
| `zones` | list of targets or `{ union }` | The numbered elements, in the order of the markers ([Zones](#/capture/zones)) |
| `masks` | list of targets | Elements whose text is replaced by dots ([Masking](#/capture/masking)) |

- `storage` values may contain `{version}`, replaced by the documented version; values that are not strings are
  written as JSON.
- `view` with `{ lon, lat, zoom }` is converted to Web Mercator metres (EPSG:3857); `{ x, y, z }` is passed as it is.
  Example: `capture.map: { x: "mx", y: "my", z: "mz" }` and `view: { lon: 2.35, lat: 48.85, zoom: 12 }` add
  `?mx=…&my=…&mz=12` to the route.
- A frame keeps 34 px of margin on the left and right (room for the markers) and 10 px above and below; change them
  with the target options `margin` and `marginY`. The image never goes beyond the viewport.

## Running the plans

| Command | What it captures |
|---|---|
| `doc-kit capture` | Every entry of every plan |
| `doc-kit capture "use-orders-*"` | The ids matching the patterns (`*` any characters, `?` one character) |
| `doc-kit capture --preview` | Also writes `.doc-kit/<id>.zones.png`, the zones drawn in red, to check them |
| `doc-kit capture --plans captures/plans-prod` | Another plans folder, relative to the project |
| `doc-kit capture --no-session` | Without the saved session (public pages) |

The variable `<PREFIX>_PLANS` (or `DOC_KIT_PLANS`) selects another folder too, and `--plans` wins over it: this is
how one project keeps its demo plans and its production plans apart.

Each capture prints one line (`✔ orders-list (4 zones, 25 KB, 1.7 s)`); a capture that fails prints why and the run
continues with the next one. The last lines give the total, the folder of the previews and the number of write
requests blocked.

## The zone file

```json
{
  "file": "orders-list.webp", "title": "Acme Orders › Orders", "route": "/orders",
  "width": 1280, "height": 583, "version": "2.4.0", "captured": "2026-10-01",
  "zones": [{ "n": 1, "x": 3.18, "y": 7.98, "w": 22.4, "h": 61.2, "side": "corner", "label": "Filters" }]
}
```

`x`, `y`, `w` and `h` are percentages of the image, so the markers stay in place at any size. `version` is the
documented version at capture time: `doc-kit check images` and `doc-kit audit` report the captures of an older
version.

## Pitfalls and observed gaps

> [!WARNING] A plan is code
> Plans are JavaScript modules, imported by the kit: they can import helpers (`../targets.mjs`) and compute their
> entries. They are never rewritten by the kit, even by `doc-kit migrate`. Legacy French keys (`titre`, `contexte`,
> `cadre`, `clic`, `champ`…) are normalised when they are read.

> [!NOTE] "a module cannot be found"
> `import … from "doc-kit/targets"` needs the project's dependencies: run `npm install` in the documentation project.

## Further reading

- [Targets and actions](#/capture/targets-actions): pointing at an element, and playing clicks before the screenshot.
- [Zones, union and legends](#/capture/zones): the markers and their legend.
- [Demo or production](#/capture/safety): what a plan may click, and the routes never to open.
- [Capture and masking keys](#/reference/configuration/capture): the `capture.*` keys of the configuration.
