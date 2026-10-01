# Brief — end-to-end journey: {{topic}} ({{product}}, code {{code}})

You write, in {{languageName}}, part of the documentation site of **{{product}}**{{#if description}} ({{description}}){{/if}}{{#if stack}}; {{stack}}{{/if}}.
An **end-to-end journey** tells what really happens, step by step, in the code and the data, for this topic:
**{{topic}}**. What is automatic, what waits for someone, what is written where, what breaks.

- Documentation folder: `{{docDir}}`. Code: `{{appDir}}`{{#if labels}} (exact labels: `{{labels}}`){{/if}}, version {{version}}.
- Your pages are ALREADY declared in `{{tocFile}}` (ids, titles, summaries, `level: 2` for sub-pages): change neither
  ids nor titles. File of a page = `{{contentDir}}/<id>.md`. Your pages: {{pages}}
- Your diagram: `{{diagramsDir}}/{{diagram}}.svg`.

## Read first

- `{{guideFile}}` (extended syntax: `:::steps`, `:::screen`, `::capture`, `::diagram`, callouts `> [!HOW]`,
  `> [!WARNING]`, `> [!NOTE]`, chips `[[perm …]]`, `[[menu …]]`, `[[status …]]`, `[[route …]]`, links `#/id` and
  `#/id~anchor`, diagrams).
- The `journey` (parent page) and `journey-step` (sub-page) templates: `{{kitPath}}/templates/pages/{{language}}/`.
{{#if referenceJourney}}- **The reference for structure and depth**: `{{contentDir}}/{{referenceJourney}}.md` (parent page), its sub-pages and
  its diagram. Match them.
{{/if}}- The existing pages on your topic{{#if reads}}: {{reads}}{{/if}}. Summarise and cite them, do not copy them. They have been
  checked, but re-check in the code everything you state.
- `{{contentDir}}/{{findingsPage}}.md` and its sub-pages: cite existing findings by their number (C1, I17, P10…) with a
  link to the sub-page, rather than describing them again.
{{#if factSheet}}
## Fact sheet first

Before the pages, write `.doc-kit/{{code}}.md`: one section per step, titled "## n. Title (sub-page id)", with short
bullets:
- **Trigger**: whose action, with which permission, or time; synchronous or not; durations and limits.
- **Functions**, in call order, with `file:line`.
- **Writes**: tables, fields, files, audit log; **does not write**, when that is surprising.
- **External calls**.
- **Statuses**: value before → after, and the displayed label.
- **Failures**: what breaks, what is left half done, numbers of existing findings.
{{/if}}
## Template

**Parent page** (1,200 to 1,600 words): `## In short` (the short answer to the journey's question, in a `> [!HOW]`
callout when useful); `## The diagram` (`::diagram{id="{{diagram}}" title="…"}`); `## In this part` (one row per
sub-page, column 1 = link `[n. Title](#/<id>)`); `## The states` when the object has statuses; `## What happens on its
own, and what waits for someone`; `## Surprises to know about` (6 to 10 points, each with a link to the sub-page and the
finding number if there is one); `## Further reading`.

**Sub-page** (1,200 to 1,800 words): `## In short` (3 to 6 lines); `## What happens, step by step` (`:::steps`, each step
= what happens + `file:line` + what is read or written + external call); `## What is read and written` (table
`| Where | What | When |`); `## What the user sees`; `## When things go wrong` (exact messages, what is left half done,
how to resume); `## Further reading`.

The exact and required headings are those of the kit's templates. Adapt a heading when the topic requires it, without
losing the spirit: real mechanism, proofs, what is automatic, what breaks.

## Screenshots (no new screenshot)

Reuse at most 1 or 2 EXISTING screenshots per page (`{{imagesDir}}/*.webp`; look at them with Read first). The build
REFUSES `::capture` for a screenshot with zones (`{{imagesDir}}/zones/<id>.json`): in that case use
`:::screen{capture="<id>" title="…"}` with a numbered list of EXACTLY as many items as zones, or leave it out.

## SVG diagram

`{{diagramsDir}}/{{diagram}}.svg`: `viewBox` 900 wide; NO hard-coded colour; the site's `d-*` diagram classes only
(`d-box`, `d-line`, `d-dashed`, `d-text`, `d-arrow`…: table in `{{kitPath}}/standard/writing.md`); `<marker>` ids
prefixed with a code of your own diagram; text from 11 to 14 px; nothing overflows.
Make visible what is automatic, what waits for a person, and what depends on a scheduler or on a missing service,
when relevant.{{#if referenceJourney}} Take the reference page's diagram as a model.{{/if}}

## Rules

- Nothing invented: every behaviour is checked in the code (`file:line`); exact screen labels, in bold; what is
  inferred is said to be inferred. PRODUCTION facts only come from existing pages: you have no access to production.
- Internal links only to ids of `{{tocFile}}` (`#/id`, or `#/id~anchor` to your own pages: heading in lower case,
  without accents, with dashes).{{#if otherWriters}} Other writers work AT THE SAME TIME: {{otherWriters}}. You may link their
  pages by id, without an anchor.{{/if}}
- Write ONLY your pages, your diagram{{#if factSheet}} and your fact sheet `.doc-kit/{{code}}.md`{{/if}}. Touch neither
  `{{tocFile}}`, `{{glossaryFile}}`, the kit, other pages (not even to fix an error), nor the application. No git
  command, no access to production.
- Defects found: do NOT change the findings pages. List them in your report as **candidates** (finding, `file:line`,
  proposed severity), after checking they are not already an existing finding (otherwise quote its number).
- Errors found in existing pages: do not fix them; report them (file, sentence, proof).

## Checks (from `{{docDir}}`)

- `npx doc-kit build --draft`: no ✖ or ⚠ about YOUR pages ("missing page" messages from other writers are normal).
- `npx doc-kit check tables`: no table overflow on your pages.
- Review: `npx doc-kit view "<parent-id>~the-diagram" --theme light --height 1100 --output .doc-kit/{{code}}-light.png`,
  the same with `--theme dark`, and one sub-page; Read the pictures; fix; then delete your pictures.

## Final report ({{languageName}}, 300 words at most)

Pages written (words), screenshots reused, surprising points, **candidate findings** (severity — finding —
`file:line`), errors in existing pages (file, sentence, proof), proposed glossary terms (with a one-sentence
definition).
