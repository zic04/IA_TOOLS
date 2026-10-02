## In short

<!-- doc-kit:capture=app -->
<!-- guidance: complete the lines marked "to complete": where this folder lives, where the captures come from (production read-only or a demo), the documented version and the date of the latest capture run. -->
<!-- doc-kit:capture=none -->
<!-- guidance: complete the lines marked "to complete": where this folder lives and the documented version. -->
<!-- doc-kit:end -->

<!-- doc-kit:capture=app -->
This site is built from this folder with **doc-kit**. The pages are written in Markdown, the captures are taken automatically on the application, and the kit assembles everything into **a single self-contained HTML file**, readable offline, with search, light and dark themes, guided tours and printing.
<!-- doc-kit:capture=none -->
This site is built from this folder with **doc-kit**. The pages are written in Markdown, without screenshots (`capture.mode: "none"`): each screen is described by a table of its elements. The kit assembles everything into **a single self-contained HTML file**, readable offline, with search, light and dark themes, guided journeys and printing.
<!-- doc-kit:end -->

| Need | Command (in this folder) | Application needed? |
|---|---|---|
| Install the tools | `npm ci` | No |
| Rebuild the site | `npm run site` (`doc-kit build`) | No |
| Work while seeing the result | `npm run dev` (`doc-kit dev`) | No |
| Rebuild while tolerating missing pages | `doc-kit build --draft` | No |
| Check that every screen is documented | `npm run coverage` | The application's code |
| Run every check | `doc-kit check all` | The application's code |
| Measure the quality and the maturity level | `npm run audit` | No |
<!-- doc-kit:capture=app -->
| Sign in to the application | `doc-kit connect` | **Yes** (a person signs in) |
| Retake captures | `doc-kit capture "<pattern>" --preview` | **Yes** |
<!-- doc-kit:end -->

- **Documented version**: to complete.
<!-- doc-kit:capture=app -->
- **Latest capture run**: to complete (date, production or demo).
<!-- doc-kit:end -->

## How the site is built

<!-- doc-kit:capture=app -->
<!-- guidance: optional. A diagram of the three stages (captures, writing, build and checks) if the team needs one. -->
<!-- doc-kit:capture=none -->
<!-- guidance: optional. A diagram of the stages (writing, build and checks) if the team needs one. -->
<!-- doc-kit:end -->

<!-- doc-kit:capture=app -->
1. **The captures**: `captures/plans/*.mjs` describes each screen to capture; `doc-kit capture` produces `images/<id>.webp` and `images/zones/<id>.json`.
<!-- doc-kit:capture=none -->
1. **The screens**: described in the pages themselves, one table of elements per screen; no screenshot is taken.
<!-- doc-kit:end -->
2. **The writing**: `content/toc.json` declares each page; `content/<id>.md` holds it, following the template it declares.
<!-- doc-kit:capture=app -->
3. **The build**: `doc-kit build` assembles pages, captures and diagrams into `dist/`, after its checks.
<!-- doc-kit:capture=none -->
3. **The build**: `doc-kit build` assembles pages and diagrams into `dist/`, after its checks.
<!-- doc-kit:end -->

## How the folder is organised

| Path | Role | Who changes it |
|---|---|---|
<!-- doc-kit:capture=app -->
| `doc.config.mjs` | Project configuration: product, application, captures, masking, coverage, theme | Managed centrally |
<!-- doc-kit:capture=none -->
| `doc.config.mjs` | Project configuration: product, application, masking, coverage, theme | Managed centrally |
<!-- doc-kit:end -->
| `content/toc.json` | Plan of the site: sections, groups, pages (`template`, `level`), guided tours, suggestions | Managed centrally |
| `content/<id>.md` | One page per entry of the plan | Writers |
| `content/home.md`, `content/glossary.json` | Home page and glossary | Managed centrally |
<!-- doc-kit:capture=app -->
| `captures/plans/*.mjs` | Capture plans, one file per batch of pages | Writers |
| `captures/targets.mjs` | Helpers to point at an element | Managed centrally |
| `images/`, `images/zones/` | Captures and positions of their zones | Generated |
<!-- doc-kit:end -->
| `diagrams/*.svg` | Diagrams, with the site's classes | Writers |
| `theme/logo.svg` | Logo of the site | Managed centrally |
| `dist/` | **The deliverable**, ignored by git | Generated |
<!-- doc-kit:capture=app -->
| `.doc-kit/` | Session, zone previews, work files; ignored by git | Local |
<!-- doc-kit:capture=none -->
| `.doc-kit/` | Audit reports, work files; ignored by git | Local |
<!-- doc-kit:end -->

<!-- doc-kit:capture=app -->
## Retaking captures

<!-- guidance: say whether the captures are taken on production (written decision of the owner) or on a demo, and list here the pages whose rendering writes on the server (capture.forbidden in doc.config.mjs), and the records already opened that stay allowed. -->

> [!WARNING] Production is never written to
> As soon as a session is used, the kit blocks every request that is not a read. Clicking a button that writes (Save, Create, Approve, Delete, Sign, Send, Import, Synchronise, Reindex, Sign out) remains forbidden. A write made **by the server while it renders** a page is not blocked: read the code of a detail page before you open it.

:::steps
1. **Sign in**: `doc-kit connect` opens a window; the person signs in themselves. The session is saved in `.doc-kit/`, ignored by git.
2. **Declare the captures** in `captures/plans/<batch>.mjs`: an id prefixed by the batch, the route, the frame, the zones in reading order (3 to 12).
3. **Capture** in small batches: `doc-kit capture "<pattern>" --preview`.
4. **Check** each zone preview (`<id>.zones.png` in `.doc-kit/`) and review each image: no secret, no data that is not allowed.
5. **Read the last line**: "Read-only: N write request(s) blocked".
6. **Delete the session**: `doc-kit connect --forget`. If it expires on the way, stop and sign in again.
:::
<!-- doc-kit:capture=none -->
## Screenshots

<!-- guidance: say who decided that this documentation takes no screenshot, and why (no access to the application, sensitive data…). -->

This documentation takes no screenshot (`capture.mode: "none"` in `doc.config.mjs`): each screen is described by a table of its elements, in reading order, with their exact labels. To add screenshots later, set `capture.mode: "app"`, sign in with `doc-kit connect`, declare the captures in `captures/plans/` and run `doc-kit capture --preview`, following the capture rules of the kit's standard.
<!-- doc-kit:end -->

## Writing or changing a page

:::steps
1. Declare the page in `content/toc.json`, with its `template`.
2. Create it from the template: `doc-kit new <page-id> --template <type>`.
3. Fill in each section by following its guidance, then remove the guidance. Check every label in the application's translation files and every behaviour in the code; report the gaps in an "Observed gaps" box.
4. Run `doc-kit build --draft`: no ✖ or ⚠ line may concern the page.
5. Review the page in light and dark themes: `doc-kit view <page-id> --theme dark`.
:::

The complete rules are in `WRITING-GUIDE.md` and in the kit's standard (`node_modules/doc-kit/standard/`).

## The checks

| Check | Command | Blocking |
|---|---|---|
<!-- doc-kit:capture=app -->
| Pages, captures, diagrams, links, anchors, legends, required sections | `doc-kit build` | Yes |
<!-- doc-kit:capture=none -->
| Pages, diagrams, links, anchors, required sections | `doc-kit build` | Yes |
<!-- doc-kit:end -->
| Coverage of the application | `doc-kit check coverage` | Yes |
| Secrets | `doc-kit check secrets` | Yes |
| Tables too wide, heavy images | `doc-kit check tables`, `doc-kit check images` | No |
| Pages too long, guidance left, maturity level | `doc-kit audit` | No |

## Transferring the folder

<!-- doc-kit:capture=app -->
`doc-kit export <target>` produces a self-contained copy of the project, without `node_modules/` or `.doc-kit/`. In the copy: `npm ci`, then `npm run site` (Node.js 20 or later). The site rebuilds without the application; only the coverage check and the captures need it.
<!-- doc-kit:capture=none -->
`doc-kit export <target>` produces a self-contained copy of the project, without `node_modules/` or `.doc-kit/`. In the copy: `npm ci`, then `npm run site` (Node.js 20 or later). The site rebuilds without the application; only the coverage check needs its code.
<!-- doc-kit:end -->

## Pitfalls and observed gaps

<!-- doc-kit:capture=app -->
<!-- guidance: the known limits of the tooling for this project (pages loaded by a write request, and therefore incomplete read-only; production values that masking does not know), and the doc-kit audit warnings left on purpose, with their justification. -->

> [!NOTE] What the tooling cannot do
> - Block a write made by the server while it renders a page.
> - Show in full a page that loads its data through a write request.
> - Mask a value specific to production that is not in the local `.env`: only the review of every image guarantees it.
<!-- doc-kit:capture=none -->
<!-- guidance: the known limits of the tooling for this project, and the doc-kit audit warnings left on purpose, with their justification. -->

> [!NOTE] What the tooling cannot do
> - Tell whether the table of a screen still matches the real screen: check the labels in the code at each version.
<!-- doc-kit:end -->

## Further reading

- [The architecture overview](#/take-over/architecture): what this site documents.
- [The findings](#/take-over/findings): where the findings noted while writing go.
