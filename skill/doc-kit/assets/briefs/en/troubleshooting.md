---
agent: doc-kit-writer
---
# Brief — troubleshooting by symptom

You write part of a documentation site, in the project's language: the **troubleshooting by symptom** of the
product. An operator or a support person starts from a message or an observed behaviour; they must find the
probable causes, what to check, how to fix it, and where to understand the mechanism.

Your pages are ALREADY declared in the table of contents (a parent page and one `level: 2` sub-page per area):
change neither ids nor titles. Your pages, your diagram and other paths are in Variables.

## Read first

1. Your pages' context files (path pattern in Variables, written by `doc-kit context <page>` when the
   orchestrator ran it before this brief): the files to read with excerpts, exact labels and the relevant facts
   — the reading you need for the application, besides what is listed below.
2. The writing guide, and the `troubleshooting` and `troubleshooting-area` templates (path in Variables).
3. The pages that explain the mechanisms: the Take over section (security, operations, integrations, AI…),
   administration pages, end-to-end journeys if they exist (further reading, if any, is listed in Variables).
   Cite them, do not copy them, and re-check in the code what you state.
4. The findings page and its sub-pages (path in Variables): a symptom that comes from an existing finding
   cites it by number, with a link.

## Where to find the symptoms

- The **exact messages** displayed: the labels file and the error strings of the code. Check which error page
  is really shown: an error boundary does not always catch the errors of its own layout.
- The **audit log**: the actions written, and the reasons written on failure (`file:line` of the write).
- The **server logs**: the prefixes of the lines the code writes (for example `[auth]`, `[search]`), with
  their file.
- The **administration screens** that show a state: health of a scheduled task, effective configuration,
  counters.
- **Scheduled tasks** and **external services**: what does not happen when they are missing.

## Template

**Parent page**: `## In short`; `## The diagram` (`::diagram{id="<your diagram id>" title="…"}`, your diagram
id is in Variables: where to start — a few preliminary questions, then the symptom families, each with its
first checks and its sub-page); `## First of all: the checks that explain half the symptoms`; `## Where to
look` (administration screens, audit log, server logs, log queries); `## In this part`; `## Further reading`.

**Sub-page per area**: `## In short` (3 to 6 bullets: the mechanisms that explain almost everything); then one
`##` section per family and, for each symptom, `### "exact message"` (or a short description when there is no
message):
- **Probable causes**: numbered list, each with `file:line`;
- **Check**: the log line, the audit action, the screen, the value to look at;
- **Fix**: the precise action (setting, variable, permission, group membership), never a code change;
- **Understand**: links to the pages that explain the mechanism.

An existing screenshot may illustrate a symptom (`:::screen` with as many items as zones). The exact and
required headings are those of the kit's templates.

## Log queries

If you write queries (KQL, CloudWatch Logs Insights, Cloud Logging, Loki…), use only table and field names you
have checked in the existing documentation or in the infrastructure code. A query you could not run is
presented as such ("not run").

## Screenshots and diagram

No new screenshot: reuse at most 1 or 2 existing screenshots per page (look at them with Read first;
`::capture` is refused for a screenshot with zones). Diagram (path in Variables): `viewBox` 900 wide, no
hard-coded colour, the site's `d-*` diagram classes only (table in the kit's writing standard), `<marker>` ids
prefixed with a code of your own diagram, text from 11 to 14 px.

## Rules

- Nothing invented: every cause is checked in the code (`file:line`); messages copied exactly; what is
  inferred is said to be inferred. PRODUCTION facts only come from existing pages.
- Internal links only to ids of the table of contents; anchors only to your own pages. Other writers may be
  working AT THE SAME TIME (see Variables for who): link their pages by id, without an anchor.
- Write ONLY your pages and your diagram. Touch neither the table of contents, the glossary, the kit, other
  pages, nor the application. No git command, no access to production.
- Defects found: candidates in your report (finding, `file:line`, proposed severity); if it is an existing
  finding, quote its number. Errors in existing pages: report them, do not fix them.
- Once a page's checks pass, run `npx doc-kit sync --mark <page id> --sources …` (from the documentation
  folder), naming the application files you read for it: this records the page as checked against the current
  application.

## Checks (from the documentation folder)

- `npx doc-kit build --draft`: no ✖ or ⚠ for your pages.
- `npx doc-kit check tables`: no table overflow on your pages.
- Review the diagram in light and dark (`npx doc-kit view "<parent-id>~the-diagram" --theme dark --output …`)
  and one sub-page; Read the pictures; fix; delete your pictures.

## Final report (300 words at most, in the project's language)

Pages written (words) and number of symptoms per sub-page; queries written (run or not); **candidate
findings** (severity — finding — `file:line`); errors in existing pages (file, sentence, proof); proposed
glossary terms (with a one-sentence definition).

## Variables

- Product: {{product}}{{#if description}} ({{description}}){{/if}}
- Batch: {{code}}
- Documentation folder: `{{docDir}}`
- Application code: `{{appDir}}`{{#if labels}} (exact labels: `{{labels}}`){{/if}}, version {{version}}
- Your pages: {{pages}}
- Context files: `{{docDir}}/.doc-kit/context/<page id, "/" -> "__">.md` (one per page above, when the
  orchestrator prepared them)
- Your diagram: `{{diagramsDir}}/{{diagram}}.svg`
{{#if reads}}- Also read: {{reads}}
{{/if}}{{#if otherWriters}}- Other writers, at the same time: {{otherWriters}}
{{/if}}- Table of contents: `{{tocFile}}`
- Page templates: `{{kitPath}}/templates/pages/{{language}}/`
- Writing standard (diagram classes): `{{kitPath}}/standard/writing.md`
- Glossary file: `{{glossaryFile}}`
- Findings page and sub-pages: `{{contentDir}}/{{findingsPage}}.md`
- Writing guide: `{{guideFile}}`
- Language: {{languageName}}
