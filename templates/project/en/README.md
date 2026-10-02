# {{name}} documentation

<!-- doc-kit:capture=app -->
The documentation site of **{{name}}**, delivered as **a single self-contained HTML file** in `dist/`. It opens offline in a browser, with interactive captures (markers, guided tour), search (Ctrl+K), light and dark themes, and printing of the whole documentation.
<!-- doc-kit:capture=none -->
The documentation site of **{{name}}**, delivered as **a single self-contained HTML file** in `dist/`. It opens offline in a browser, with search (Ctrl+K), light and dark themes, and printing of the whole documentation. It takes no screenshot (`capture.mode: "none"` in `doc.config.mjs`): each screen is described by a table of its elements.
<!-- doc-kit:end -->

The engine is **doc-kit**, linked by `package.json`. This folder only holds the content.

## Requirements

Node.js 20 or later, then:

```bash
npm ci
```

If the capture browser is missing: `npx playwright install chromium`.

## Commands

| Script | doc-kit command | Role |
|---|---|---|
| `npm run site` | `doc-kit build` | Builds `dist/`; strict: stops on a missing page, capture or link |
| `npm run dev` | `doc-kit dev` | Local server that rebuilds and reloads on every change |
<!-- doc-kit:capture=app -->
| `npm run captures` | `doc-kit capture` | Retakes the captures declared in `captures/plans/` |
<!-- doc-kit:end -->
| `npm run coverage` | `doc-kit check coverage` | Is every screen of the application documented? |
| `npm run tables` | `doc-kit check tables` | No table overflows at 1,440 px |
| `npm run optimize` | `doc-kit optimize` | Recompresses heavy images |
| `npm run audit` | `doc-kit audit` | Score, maturity level, warnings |
<!-- doc-kit:capture=app -->
| `npm run all` | Captures, optimisation, build, every check, audit | The whole chain |
<!-- doc-kit:capture=none -->
| `npm run all` | Optimisation, build, every check, audit | The whole chain |
<!-- doc-kit:end -->

While writing, `doc-kit build --draft` tolerates missing pages and captures, and reports them ("Capture to produce" box).

## The workflow

1. **Declare** the page in `content/toc.json`, with its `template` (page type).
2. **Create** the page from the template: `npx doc-kit new <page-id> --template <type>`.
3. **Write** each section by following its `<!-- guidance: … -->` comment, then remove the comment.
<!-- doc-kit:capture=app -->
4. **Capture**: declare the screen in `captures/plans/<batch>.mjs`, then `npx doc-kit capture "<pattern>" --preview` and look at the zone preview in `.doc-kit/`.
<!-- doc-kit:capture=none -->
4. **Describe the screens**: in the "The screen" section, a table of the elements in reading order, with their exact labels.
<!-- doc-kit:end -->
5. **Check**: `npm run site`, `npx doc-kit check all`, `npm run audit`.
6. **Hand over**: `npx doc-kit export <folder>`, and the checklist of the kit's standard (`delivery.md`).

Running `npx doc-kit` with no command starts the guided mode: it suggests the next step.

<!-- doc-kit:capture=app -->
## Captures on production

```bash
npx doc-kit connect                       # the person signs in themselves
npx doc-kit capture "prod-*" --preview    # every write request is blocked in the browser
npx doc-kit connect --forget              # delete the session after use
```

Never commit `.doc-kit/` (session, previews): it is in `.gitignore`.
<!-- doc-kit:capture=none -->
## Adding screenshots later

Set `capture.mode: "app"` in `doc.config.mjs`, then follow the capture phase of the kit's method: `npx doc-kit connect`, a plan in `captures/plans/`, `npx doc-kit capture --preview`. Never commit `.doc-kit/`: it is in `.gitignore`.
<!-- doc-kit:end -->

## Further reading

- `WRITING-GUIDE.md`: the rules specific to this project.
- The kit's standard, `node_modules/doc-kit/standard/`: structure, templates, writing, captures, quality, maturity, delivery.
- The "Maintaining this documentation" page of the site: the same content, for whoever takes the project over.
