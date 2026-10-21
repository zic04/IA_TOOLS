## What it is for

<!-- guidance: the business need in 2 to 4 sentences, business language only, no code: who wants this, and what it is for them. Assign this page's "feature" id (toc.json, field "feature", e.g. "F-01") and give it a title (bold, exact name) in the first sentence. A section that does not apply to this feature stays, with one line: "Not applicable — the reason." -->

## Who uses it

<!-- guidance: the roles that use the feature, and what each one does with it: a two-column table, Role · What they do with it. -->

| Role | What they do with it |
|---|---|
| **Role** | What they do with this feature. |

## User stories

<!-- guidance: one :::story per need, in the words of the person who has it: "As a <role>, I want <action> so that <benefit>." Attributes: id US-xx (unique across the documentation), title (a short verb phrase), role, since (the version that brought it), ref (its ticket, e.g. ADO#1234, PROJ-12, owner/repo#42) when there is one. Its acceptance criteria are the scenarios of "Acceptance criteria" that name it (story="US-xx"). -->

:::story{id="US-00" title="Short verb phrase" role="Role" since="1.0"}
As a **role**, I want to do something so that I get a benefit.
:::

## Main path

<!-- guidance: the usual path, as numbered steps (actor, action, result), from opening the screen to the result. Name each field, button and message exactly as the screen shows it, in bold. Add a :::screen or a ::capture when a screenshot makes a step clearer; neither is required. -->

:::steps
1. **Actor** does the first thing.
2. The feature reacts: what changes.
3. **Actor** sees the result.
:::

## Variants

<!-- guidance: optional. Branches of the main path, numbered after the step they branch from ("3a. If …"), each with what happens instead: another choice, an exception, a cancellation. -->

- **3a.** If a condition holds, what happens instead.

## Behaviours

<!-- guidance: one :::behaviour card per behaviour of the feature, of one of the kinds of standard/behaviours.json: search, filter, sort, pagination, list, form, import, export, calculation, notification, workflow, scheduled-job, permission-check. Answer each rubric of its kind on a "Rubric: value" line, as precisely as a test would check it ("contains, case ignored, accents count: cafe does not find Café"); write "n/a — the reason" when a rubric does not apply, and "unknown — the question" when nobody knows yet (the question goes to "Open questions" too). A required rubric left out is reported by the build (behaviour.missing). -->

:::behaviour{kind="search" title="Search …" id="B-00"}
Where: the field, its label and placeholder, and where it sits.
Fields searched: which data the typed text is compared with, and which it is not.
Matching: contains, starts with or exact; whether case and accents count.
Several words: one phrase, every word, or any of the words.
Trigger: at each keystroke, on Enter or with a button.
Order of results: the order of the results, and whether the reader can change it.
No result: what the reader sees when nothing matches.
Permissions: who can search, and whether the results are limited to what the reader may see.
:::

## Business rules

<!-- guidance: the rules that belong only to this feature are defined here with :::rule (one container per rule, a statement then a "Given / When / Then" example); a rule shared with other features is only cited with [[rule …]], never redefined. -->

:::rule{id="BR-00" title="One short, checkable statement"}
The rule, in one or two sentences.

**Example.** **Given** a starting condition, **when** the triggering action happens, **then** the result that follows.
:::

## Fields and inputs

<!-- guidance: optional; needed as soon as the feature has a form. One row per field: Field (its label on the screen) · Required · Format and accepted values · Default · Check and its message. -->

| Field | Required | Format and accepted values | Default | Check and its message |
|---|---|---|---|---|
| **Label** | Yes | What can be typed or chosen | — | What is checked, and the message shown |

## States

<!-- guidance: optional. The states an item of this feature goes through, as the reader sees them ([[status …]]), what moves it from one to the next, and who can. Delete the section when the feature has no states. -->

## Messages

<!-- guidance: every message the reader can see — confirmations, errors, warnings, empty lists — word for word, with when it appears and what to do. When the screen shows none, say so and what the reader sees instead ("Not applicable — an empty result leaves the table empty, with no message"). -->

| Message | When it appears | What to do |
|---|---|---|
| “The exact text” | The situation | What the reader does next |

## Rights by action

<!-- guidance: one row per action of the feature: Action · Right ([[perm …]]) · Condition (the data it covers: their own items, their region's…). Then what a reader without the right sees: the action hidden, greyed out, or refused with a message. -->

| Action | Right | Condition |
|---|---|---|
| See the list | [[perm module:read]] | — |

## Acceptance criteria

<!-- guidance: one :::scenario per criterion, in Given / When / Then (one step per line; And and But allowed), with real values (a customer's name, an order number), naming the story it checks (story="US-xx") and, when it checks a card, the card (behaviour="B-xx"). Each story has at least one; a "No result" or an error deserves its own. -->

:::scenario{title="What it checks" story="US-00" behaviour="B-00"}
Given a starting situation, with real values
When the reader does something
Then what they see
:::

## Limits

<!-- guidance: optional. What the feature deliberately does not do, or does only partly, in business terms (never a code pitfall: this page cites no code). Example: "The feature does not retry a failed notification; a support request is needed." -->

## Open questions

<!-- guidance: optional. Each question nobody could answer yet (the "unknown — …" of the cards included), for the product owner: one line each, with who can answer it. Remove a question once it is answered, and write the answer where it belongs. -->

- **The question?** Who can answer it.
