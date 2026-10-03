---
agent: doc-kit-writer
---
# Brief — translate pages into {{lang}}

You write the {{lang}} translation of the pages below, from the translator's dossier the kit built for each one.
Every read and every command costs: keep to the step budget instead of exploring.

## Method, per page (the dossier, plus at most 1 further read)

1. Read the page's TRANSLATOR DOSSIER in full (written by `doc-kit context <page> --translate {{lang}}`, path
   in Variables): the page's id and state, the headings to write (already in {{lang}}, from the page template),
   the glossary table (source term → {{lang}} term), the whole source Markdown, the previous translation when
   one exists, and the diff of the source since it was last marked.
2. Write the file at its target path (Variables: Context files give the dossier path; the translation itself
   goes to `{{translationsDir}}/{{lang}}/<the source file's own relative path>`), once. A page already current
   (the dossier's state) needs no change; a `stale` one is rewritten from the diff, not retranslated whole
   unless the diff touches most of it.
3. Keep EXACTLY the source's structure: same headings (now in {{lang}}, from the dossier's section labels),
   same paragraphs, same lists, same directives (`:::screen`, `::diagram`, `:::steps`…) in the same place, with
   the same attributes. Only the prose and the headings are translated.
4. What you cannot translate confidently from the dossier alone: AT MOST ONE further read, the source file
   itself at its full, current version (not through the dossier) — not the application's code, never `app.dir`.

## Never translate

- Ids: page ids, capture ids (`capture="…"`, `id="…"` of `::diagram`/`::capture`), rule and feature ids
  (`BR-…`, `F-…`), schema ids, template names.
- Directives and their syntax: `:::screen`, `::diagram`, `:::rule`, `[[menu …]]`, `[[perm …]]`, `[[status …]]`,
  `[[feature …]]`, `[[rule …]]`, callout markers (`[!NOTE]`…) — translate the callout's own text, never its marker.
- Code spans and code blocks, and any `file:line` proof inside one.
- Links: keep `#/<page>~<anchor>` exactly as written; a wrong anchor is fixed afterwards by
  `translate --fix-anchors`, not by guessing a translated slug yourself.

## Rules

- Write ONLY `{{translationsDir}}/{{lang}}/…`. Never touch `{{contentDir}}/` (the source), the table of
  contents, the glossary, the configuration or the kit. No git command.
- One page, one file, written once — no intermediate draft left behind.
- Nothing invented: a term not in the glossary table is translated plainly, consistently across the pages of
  this batch; do not invent a glossary entry.
- A heading the dossier's template section does not cover (a page with extra headings of its own): translate it
  plainly, keeping its position.

## Checks (from the documentation folder), once every page of the batch is written

- `npx doc-kit translate --fix-anchors <page id…> --lang {{lang}}`: rewrites a link whose anchor is still the
  source's; reports the ones it cannot map (usually a page not yet translated in this batch).
- `npx doc-kit translate --mark <page id…> --lang {{lang}}`: records the translated fingerprint, only once the
  page reads correctly.
- `npx doc-kit build --draft`: no new ✖ or ⚠ for {{lang}} on your pages.

## Final report (300 words at most, in the project's language)

- Pages translated, their state before (stale/unmarked/missing) and the one further read used, if any.
- Links `--fix-anchors` could not map, and why (the usual reason: the target page is translated later in this
  batch — rerun it then).
- Terms translated without a glossary match, for a future glossary entry.

## Variables

- Product: {{product}}
- Documentation folder: `{{docDir}}`
- Target language: {{lang}}
- Pages to translate: {{pages}}
- Translator dossiers: `{{contextFiles}}` (one per page, `{{docDir}}/.doc-kit/context/<page id, "/" -> "__">.{{lang}}.md`)
- Translations folder: `{{translationsDir}}/{{lang}}/`
- Table of contents: `{{tocFile}}`
- Glossary file: `{{glossaryFile}}`
