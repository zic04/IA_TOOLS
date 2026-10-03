## In short

Short answers to the questions people ask before and during their first site. The answers point to the page that
explains more.

| Topic | Questions |
|---|---|
| [The site](#/faq/questions~the-site) | What readers need, weight, hosting, printing |
| [The application](#/faq/questions~the-application) | Which applications, sign-in, public sites, versions |
| [Writing](#/faq/questions~writing) | Languages, HTML, diagrams, look and feel |
| [Spaces, takeover and agents](#/faq/questions~spaces-takeover-and-agents) | Business vs takeover, LLM use, token cost, keeping up to date |
| [The kit](#/faq/questions~the-kit) | Network, data, licence, name |

## The site

### What does a reader need?

A recent browser. The site is one HTML file with everything inside: it opens from a disk, a file share, a document
library or an e-mail attachment, without a server and without network access.

### How heavy is it?

It depends on the captures: about 18 MB for 200 images, 35 MB for 400. Frame the captures on their panel, and run
`doc-kit optimize` before the last build. Above about 10 MB, share a link rather than an attachment.

### Can it be hosted?

Yes, on any static host or document space: it is one file. Its addresses (`#/use/orders~the-screen`) work the same
online and offline.

### Can it be printed?

Yes: **Print** prints the current page, or the whole documentation with its outline, ready to save as PDF.

## The application

### Which applications can be documented?

Any web application that Chromium can open: rendered by the server or in the browser, behind a sign-in or public.
Next.js (App Router) and React Router applications get a coverage adapter out of the box; for the others, the `glob`
adapter, or a project adapter, lists what must be documented ([Adapters](#/reference/adapters)).

### Does it work with single sign-on and multi-factor authentication?

Yes: `doc-kit connect` opens a real browser window, and you sign in as usual. The kit only keeps the session that
results ([Connect and sessions](#/capture/sessions)).

### And a public website?

`auth: { adapter: "none" }`: no session, no `connect`. Read-only stays off unless `capture.readOnly` is `true`.

### How are versions followed?

The site shows the version read in `version.file`. Every capture records the version it was taken on;
`doc-kit check images` and `doc-kit audit` list the captures of an older version, to take again by pattern:
`doc-kit capture "use-orders-*"`.

## Writing

### Which languages?

English and French: the site, the templates, the messages and the standard. Each project chooses one; a bilingual
documentation is two projects, as this site is (`docs/en` and `docs/fr`). Every command speaks the language of the
project it runs in; `--lang` changes it for one run.

### Can I write HTML in the pages?

The Markdown engine lets HTML through, and the build does not clean it: keep to the extensions, which the checks
understand, and never put a script in a page.

### Can I use another diagram tool?

Any tool that produces SVG, as long as the result uses the site's `d-*` classes instead of colours, so that it follows
the themes ([Diagrams](#/write/diagrams)). Images of diagrams are not supported.

### Can the site look like our product?

The colours, the logo, the icons and every text: yes ([Theme, colours and logo](#/reference/theme),
[Languages and texts](#/reference/i18n)). The layout of the site is the kit's, the same for every project: readers
find their way from one documentation to another.

## Spaces, takeover and agents

### Can I hand out only the business pages, or only the takeover dossier?

Yes: declare `spaces` in `content/toc.json`, then `doc-kit build` — it writes the full site plus one export per
space, each with every other space's content physically removed, not merely hidden
([Two spaces, one source](#/spaces/overview)).

### Does the kit use an LLM to find risks or write the findings?

No. The kit calls no LLM anywhere: `doc-kit facts` reads the application's code with plain parsers, and the claim
badges and the risk register are written by a person or an agent, never generated automatically
([Taking over a vibe-coded application](#/spaces/takeover)).

### How much does running the skill cost, in tokens?

It depends on what an agent reads, not on the kit's size: `doc-kit context` keeps that to one page's own
dependencies (a few hundred to a few thousand tokens) instead of the whole code inventory (about 15,000)
([Cost and speed](#/skill/cost-and-speed)).

### How do I know the documentation is still accurate after a release?

`doc-kit sync` compares what each marked page depends on with the application now, or with a git commit, and
lists exactly what to review — nothing mechanical is left to a person
([Keeping up with the application](#/publish/sync)).

## The kit

### Does the kit need the internet?

Only to install it (npm and the Chromium download). Then it talks to nobody but the application you capture: no
telemetry, no font or script loaded from a network, in the kit or in the site.

### Where is my data?

In your documentation project: pages, images, the session in `.doc-kit/`. The kit keeps nothing elsewhere, except the
Claude Code skill if you install it.

### Under which licence?

MIT: use it, change it, ship it, in any company, with the licence notice.

### Why is it called doc-kit?

The name is provisional. It is defined in one place, `engine/brand.mjs` (and `package.json`), so that it can change
without touching the rest of the code.

## Further reading

- [Troubleshooting by symptom](#/faq/troubleshooting): when something goes wrong.
- [The first five minutes](#/start/first-five-minutes): try it on the demo application.
