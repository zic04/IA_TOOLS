---
agent: doc-kit-writer
---
# Brief — functional specification: features, rules, roles, process

You write part of the PRODUCT space, in the project's language: what a batch of features does, for whom, and by
which rule — for readers who do not read code (product owners, business analysts, key users). Other agents write the
other batches of the same wave AT THE SAME TIME (see Variables for who). Run every command from the documentation
folder.

Your pages are ALREADY declared in the table of contents (ids, titles, the `feature` id of a sheet, `level: 2` for
sub-pages): change neither ids nor titles. File of a page = the content folder's `<id>.md`.

## Read first

1. The features file (path in Variables): the features assigned to you — id, title, routes, API routes, i18n
   keys — and, for each page, its context file (path pattern in Variables, written by `doc-kit context <page>`
   when the orchestrator ran it before this brief): exact labels, the glossary terms that apply, and excerpts of
   the files behind the feature, read for understanding only (see "Nothing to cite" below).
2. The writing guide, and the templates of your page types (`feature`, `business-rules`, `roles-matrix`,
   `process`; path in Variables): the required sections, and the directives `::features{}`, `::rules{}`,
   `::roles{}` that build a table from every sheet instead of one written by hand.
3. The REFERENCE feature sheet, if one is given (see Variables): match its depth and tone.
4. Existing business pages on nearby features or the same process (listed in Variables, if any): cite them
   (`[[feature F-0x]]`), do not copy them.
5. The findings page (path in Variables), for its numbers only: a feature's "Limits" section never describes a
   defect as if it were a feature (that is the Develop space's job). If a limit looks like a defect, report it
   as a candidate finding instead of writing it into the sheet.

## What each page holds

- **Feature sheet** (`feature`): a specification the product owner can check against the application.
  `## What it is for` (2 to 4 sentences, business language); `## Who uses it` (Role · What they do with it);
  `## User stories` (one `:::story{id="US-xx" title role since ref}` per need: "As a …, I want … so that …");
  `## Main path` (`:::steps`; a `:::screen` or `::capture` only when a screenshot makes a step clearer — neither
  is required here, unlike a `screen`/`editor` page); `## Variants` (optional, numbered after the step they branch
  from, "3a."); `## Behaviours` (one `:::behaviour{kind title id="B-xx"}` card per behaviour — search, filter, sort,
  pagination, list, form, import, export, calculation, notification, workflow, scheduled-job, permission-check — with
  one `Rubric: value` line for each rubric of its kind in `standard/behaviours.json` of the kit, answered as
  precisely as a test would check it, or "n/a — reason", or "unknown — the question"); `## Business rules`
  (`:::rule` for a rule that belongs only to this feature, `[[rule BR-xx]]` for a shared one — never redefine a rule
  that already has an id elsewhere); `## Fields and inputs`, `## States` (optional); `## Messages` (word for word);
  `## Rights by action` (Action · Right `[[perm …]]` · Condition); `## Acceptance criteria` (one
  `:::scenario{title story="US-xx" behaviour="B-xx"}` per criterion, Given / When / Then, one step per line, real
  values); `## Limits`, `## Open questions` (optional; every "unknown — …" of a card goes there too). A section that
  does not apply stays, with "Not applicable — the reason".
- **Business rules register** (`business-rules`, usually one page for the whole project): `## How to read this
  page`; `## The rules` (`:::rule`, for every rule with no single owning feature); `## Rules by feature`
  (`::rules{}`); `## Retired rules` (optional — keep a retired rule's id, never reuse it for another rule).
- **Roles matrix** (`roles-matrix`): `## In short`; `## The roles` (one bullet per role, bold name, who holds it,
  what sets it apart); `## Who can do what` (`::roles{}`, or a table by hand while there are no feature sheets
  yet); `## Responsibilities`, `## How to get a role` (optional).
- **Process** (`process`): `## In short`; `## Who takes part`; `## The steps` (`:::steps`, cite a step's feature
  with `[[feature F-0x]]` when it has a sheet); `## The states` (optional, a table `State · What it means`);
  `## What happens on its own, and what waits for someone`; `## Deadlines and reminders`, `## When it goes
  wrong`, `## Features involved` (optional, `::features{}` or `[[feature …]]`).

## Nothing to cite: the Product space names no code

A business page cites **no `file:line`**: the build warns (`business.technical`) the moment one slips in, because
the technical reason belongs to the page's `counterpart` in the Develop space, not here. What you still owe the
reader:

- the **exact** on-screen or business wording, in bold, the way the people who use the feature actually say it —
  checked (message files, the screen itself, an existing capture), never invented, just never cited by
  `file:line`; a value you cannot observe this way is marked **inferred**;
- every permission named with `[[perm module:action]]`, never a raw code identifier;
- a feature id (`toc.json` field `feature`, pattern `F-01`) and a rule id (pattern `BR-01`, or the project's own)
  defined exactly once; every other mention is a citation, never a redefinition;
- when a feature's behaviour raises a technical question (how a rule is actually enforced, what happens on
  failure), say so in your report rather than answering it here: the orchestrator links your sheet and its
  `counterpart` page in the Develop space.

## Rules

- Write ONLY your page files in the content folder (path in Variables). Touch neither the table of contents, the
  glossary, the configuration, the targets file, the kit, nor the files of other batches. No `doc-kit new`,
  `connect`, `demo` or `capture`: this brief takes no screenshot. No git command.
- Nothing invented: a rule, a role, a step and a permission are checked against the features file, the context
  files and, when you read it for understanding, the application; what you cannot check is **inferred**.
- Internal links: ids of the table of contents (`#/id`); a feature or rule chip (`[[feature F-0x]]`,
  `[[rule BR-xx]]`) in preference to a plain link once the target exists.
- A page longer than its template's `maxWords`: propose a split into sub-pages in your report, do not split it
  yourself.
- Once a page's checks pass, run `npx doc-kit sync --mark <page id> --sources …` (from the documentation folder),
  naming the features file and, when you read one for understanding, the application file it points to: this
  records the page as checked against the current application.

## Checks (from the documentation folder)

- `npx doc-kit build --draft`: no ✖ or ⚠ for your pages, and no `business.technical` warning.
- `npx doc-kit check tables`: no table overflow.

## Final report (300 words at most, in the project's language)

1. Pages written (word counts); feature and rule ids defined; roles and process steps described.
2. Features whose behaviour raises a technical question worth a counterpart in Develop (feature id, the question).
3. **Candidate findings**: a "limit" that is really a defect (severity, finding, where you read it).
4. Errors found in existing business pages (file, sentence, proof); proposed glossary terms.
5. What could not be resolved from the features file or the context files, and why.

## Variables

- Product: {{product}}{{#if description}} ({{description}}){{/if}}
- Batch: {{code}}
- Documentation folder: `{{docDir}}`
- Application code (read for understanding, never cited): `{{appDir}}`{{#if labels}} (exact labels:
  `{{labels}}`){{/if}}, version {{version}} ({{date}})
- Features file: `{{featuresFile}}`
- Your pages: {{pages}}
- Context files: `{{docDir}}/.doc-kit/context/<page id, "/" -> "__">.md` (one per page above, when the
  orchestrator prepared them)
{{#if referencePage}}- Reference feature sheet: `{{contentDir}}/{{referencePage}}.md`
{{/if}}{{#if otherWriters}}- Other writers, at the same time: {{otherWriters}}
{{/if}}{{#if reads}}- Also read: {{reads}}
{{/if}}- Writing guide: `{{guideFile}}`
- Page templates: `{{kitPath}}/templates/pages/{{language}}/<type>.md`
- Table of contents: `{{tocFile}}`
- Content folder: `{{contentDir}}`
- Glossary file: `{{glossaryFile}}`
- Findings page and sub-pages: `{{contentDir}}/{{findingsPage}}.md`
- Language: {{languageName}}
