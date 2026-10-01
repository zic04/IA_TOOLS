## In short

- **The strict build writes nothing while an error remains**: the old `dist/` file stays, unchanged. Read the lines
  above the last one; `doc-kit build --draft` lists every problem at once.
- **Everything is checked against the table of contents**: page ids, link targets, journey steps, page types. Most
  errors are a name that does not match.
- **Legends and zones are counted**: a `:::screen` legend has exactly one item per zone of its capture.
- **The configuration is validated strictly**: an unknown key is an error, with its path and the closest known key.

## Building

### "N errors — site NOT generated."

- **Likely causes**
  1. A declared page has no file yet (`missing page: content/…`).
  2. A capture is cited but not taken, or its image is missing.
  3. A typed page lacks a required section.
- **Check**: the lines above, one per error, each with the page id in brackets.
- **Fix**: write the page (`doc-kit new`), take the capture, add the section; while writing, use `--draft`.
- **Understand**: [Build the site](#/publish/build).

### "the project's dependencies are not installed"

- **Likely causes**
  1. `npm install` was not run in the documentation project.
  2. The `file:` path of `package.json` does not reach the kit (the project or the kit moved).
- **Check**: `doc-kit doctor`, line "project dependencies".
- **Fix**: `npm install` in the project, after fixing the path if needed.
- **Understand**: [Install doc-kit](#/start/install~step-3-put-the-command-on-your-path).

### "the project requires kit ^1.0.0, but the installed kit is version 0.1.0"

- **Likely causes**
  1. The project was created or upgraded with another kit.
- **Check**: `kit` in `doc.config.mjs`, and `doc-kit --version`.
- **Fix**: `doc-kit upgrade`, then `doc-kit upgrade --apply`; or use the kit the project expects.
- **Understand**: [Upgrade to a newer kit](#/migrate/upgrade).

## Writing

### "[use/orders] broken link: #/use/order" or "anchor not found"

- **Likely causes**
  1. A typo in the page id, or a page that was renamed.
  2. An anchor written by hand that does not match the heading (accents, punctuation).
- **Check**: the id in `content/toc.json`; the anchor appears in the address when you click `#` next to the heading.
- **Fix**: correct the link; anchors are the heading in lower case, without accents, with `-` instead of the rest.
- **Understand**: [Extended Markdown](#/write/markdown~links).

### "screen “orders-list”: 4 captured zone(s) but 3 item(s) in the legend"

- **Likely causes**
  1. A zone was added to the plan, or a legend item removed.
  2. Two legend items are on one line, or a sub-list counts as items.
- **Check**: `images/zones/orders-list.json` lists the zones; the legend is the numbered list inside the block.
- **Fix**: one numbered item per zone, in the plan's order; or change the zones and capture again.
- **Understand**: [Zones, union and legends](#/capture/zones).

### "required section missing for template “screen”: “Required permissions”"

- **Likely causes**
  1. The section is missing, or its heading does not **start** with the label ("Permissions" instead of
     "Required permissions").
  2. The page is not of that type.
- **Check**: the `##` headings of the page; the labels in `standard/templates.json`.
- **Fix**: add or rename the section; or remove `template` from the page's entry.
- **Understand**: [Page templates](#/write/page-templates~how-a-section-is-recognised).

### "the page already exists: content/…" with `doc-kit new`

- **Likely causes**
  1. The file was created before; `new` never overwrites.
- **Check**: `content/<page-id>.md`.
- **Fix**: edit the existing file, or choose another id.
- **Understand**: [Page templates](#/write/page-templates~creating-a-page-doc-kit-new).

## Configuring

### "doc.config.mjs › capture.storgae: unknown key"

- **Likely causes**
  1. A typo; the message suggests the closest key ("did you mean “storage”?").
  2. A key of another version of the kit.
- **Check**: the list of allowed keys printed after `→`.
- **Fix**: correct the key; `doc-kit doctor` validates the file again.
- **Understand**: [Configuration](#/reference/configuration).

### "texts: unknown i18n key …" (warning)

- **Likely causes**
  1. A key that does not exist in the kit's texts, often a typo.
- **Check**: `doc-kit build --verbose` prints the closest key.
- **Fix**: correct the key in `texts`.
- **Understand**: [Languages and texts](#/reference/i18n).

## Further reading

- [Troubleshooting by symptom](#/faq/troubleshooting): the reflexes and the first checks.
- [Capture and session problems](#/faq/troubleshooting/capture): the other area.
- [The checks](#/publish/checks): what the build does not check.
