## What it is for

The **generated site** is what your readers receive: one HTML file, `dist/<Product>-Documentation.html`, that opens
offline in any recent browser. It needs no server, no internet access and no installation: it can be sent by e-mail,
stored in a document library or attached to a ticket.

> [!NOTE] Where to find this file
> After `doc-kit build`, in the `dist/` folder of the documentation project (the `output` key changes its name).
> `doc-kit open` opens it in your default browser.

## How it works

Everything the site needs is inside the file: the pages already converted to HTML, the search index, the glossary,
the images (as base64 WebP), the diagrams (as inline SVG), the style and the script. Nothing is loaded from the
network.

> [!HOW] What happens when a reader opens the file
> 1. The theme is chosen **before the first paint**: the reader's last choice, kept in the browser's local storage
>    under `theme.key`, otherwise the system preference (light or dark).
> 2. The script reads the address after `#`: `#/` is the home page, `#/write/markdown` a page,
>    `#/write/markdown~callouts` a section of a page, `#/capture` the overview of a section.
> 3. The page is displayed from the embedded data; its images are decoded only when they are shown.
> 4. The first occurrence of each glossary term in the page gets a tooltip.

Every address is a link you can share: it opens the same page, at the same section, for anyone who has the file.

## The screen

:::screen{capture="site-page" title="A page of the generated site"}
1. **Sections**: the short titles of the sections (`shortTitle` in the table of contents); the current one is
   highlighted.
2. **Search**: full-text search over every section of every page, opened with [[key Ctrl+K]] or [[key /]]; arrows
   choose a result, Enter opens it, Escape closes.
3. **Theme**: switches between light and dark; the choice is remembered for this file in this browser.
4. **Print**: prints the current page, or the **whole documentation** with its outline, ready to save as PDF.
5. **Menu**: every section, its groups and its pages. A sub-page appears under its parent while you read it or one of
   its siblings; the number next to a parent is its count of sub-pages.
6. **Guided tour**: walks through the markers of the screen one by one, with **Previous**, **Next** and **Finish**,
   or the left and right arrow keys.
7. **Annotated screen**: hovering a numbered marker highlights its legend item, and the other way round; a click on
   the image opens it full screen.
8. **On this page**: the `##` and `###` headings of the page; the current one follows your reading.
:::

## Each action

### The guided tour

The tour opens the screen full size and frames one zone at a time, with its legend item in a card.

::capture{id="site-tour" title="The guided tour, at step 2 of the orders list"}

### Search

Each result is one section of a page, with its path, its heading and an excerpt; the words you typed are highlighted.
A word found in a heading ranks higher than a word found in the text. With an empty field, the search offers the
pages listed in `suggestions` (table of contents).

::capture{id="site-search" title="Search, while typing a word"}

### The light and dark themes

Every colour of the site, the diagrams included, comes from the theme's colour tokens. Drag the handle to compare.

::before-after{before="site-light" after="site-dark" before-label="Light" after-label="Dark" title="The same page in both themes"}

## Settings reference

The reader has two settings; everything else is decided by the project's configuration.

| Setting | Control | Values · default | Effect |
|---|---|---|---|
| **Theme** | Button in the top bar | Light · Dark · default: the system's | Colours of the whole site, remembered per browser |
| **Print** | Button in the top bar | This page · whole documentation | What the print dialog receives |

## Step by step: share a precise section

:::steps
1. Open the page and scroll to the section.
2. Click the `#` sign that appears next to its heading: the address now ends with `~` and the section's anchor.
3. Copy the address from the browser's address bar.
4. Send it with the file: the link opens the same section.
:::

## Common use cases

:::steps
1. **A user asks how a screen works**: send the address of its page; the guided tour does the explaining.
2. **An auditor wants a PDF**: **Print**, then **OK** for the whole documentation, then "Save as PDF".
3. **A reader is lost**: [[key Ctrl+K]] and a word of the screen; every heading of every page is indexed.
:::

## Pitfalls and limits

> [!WARNING] One file, one weight
> The images are inside the file. A site with hundreds of captures can weigh tens of megabytes: keep the captures
> framed on their panel and run `doc-kit optimize` to recompress the heavy ones.

> [!NOTE] Links between two files
> A link to another documentation file cannot be checked by the build. Prefer one site per product, with links
> between its pages.

The home page of the site shows the sections, the figures of the documentation and the guided reading paths
(`journeys` of the table of contents):

::capture{id="site-home" title="The home page of this documentation"}

## Required permissions

> [!PERMISSIONS] Who can read the site
> - **Anyone who has the file.** The site has no access control: share it as you would share the application's
>   screenshots.
> - The file contains no session and no secret of the capture; `doc-kit check secrets` checks its text before
>   delivery.
