<!-- guidance: sample page. In content/toc.json, rename its id and its title after the first real feature of {{name}}, move this file accordingly, keep its "feature" id (or renumber it) and fill in every section, then remove the guidance. -->

## Access

<!-- guidance: a two-column table, four fixed rows: Module (the area of the application the feature lives in), Who can use it ([[perm …]], every permission that unlocks it), Prerequisites (what must exist first, for example "an account with an open order"), Checked on (the version and date this page was last read against the application). -->

| | |
|---|---|
| Module | Name of the module |
| Who can use it | [[perm module:action]] |
| Prerequisites | What must exist first |
| Checked on | v0.0.0, YYYY-MM-DD |

## What it is for

<!-- guidance: the business need in 2 to 4 sentences, business language only, no code: who wants this feature, and what it is for them. Put the page's title, in bold, in the first sentence. -->

## Who uses it

<!-- guidance: the roles or audiences that use the feature, and what each one does with it. One line per role. -->

- **Role**: what they do with this feature.

## Trigger and preconditions

<!-- guidance: optional. What starts the feature (an action, a schedule, another feature's outcome), and what must be true first. Delete this section when the trigger is simply "someone opens the screen". -->

## Main scenario

<!-- doc-kit:capture=app -->
<!-- guidance: the happy path, as numbered steps (actor, action, result). Add a :::screen or a ::capture only when a screenshot makes a step clearer; neither is required here, unlike on a screen or editor page. -->
<!-- doc-kit:capture=none -->
<!-- guidance: the happy path, as numbered steps (actor, action, result). -->
<!-- doc-kit:end -->

:::steps
1. **Actor** does the first thing.
2. The feature reacts: what changes.
3. **Actor** sees the result.
:::

## Variants and exceptions

<!-- guidance: optional. Branches of the main scenario, numbered after the step they branch from ("3a. If …"), each with what happens instead. -->

- **3a.** If a condition holds, what happens instead.

## Business rules

<!-- guidance: the rules that belong only to this feature are defined here with :::rule (one container per rule: a one- or two-sentence statement, then a "Given / When / Then" example with real numbers); a rule shared with other features is only cited with [[rule …]], never redefined here. -->

:::rule{id="BR-01" title="One short, checkable statement"}
The rule, in one or two sentences.

**Example.** **Given** a starting condition, **when** the triggering action happens, **then** the result that follows.
:::

## Data handled

<!-- guidance: optional. The business data this feature reads or changes, named the way a business reader knows it (never a table or column name): what each one means, and who else depends on it. -->

## Notifications and effects

<!-- guidance: optional. What the feature sets off beyond the screen itself: an e-mail, an entry in another feature's list, a counter that changes elsewhere. One line per effect. -->

## Limits

<!-- guidance: optional. What the feature deliberately does not do, or does only partly, in business terms (never a code pitfall: this page cites no code — the technical detail belongs on its counterpart). -->

## Questions people ask

<!-- guidance: optional. 2 to 5 real questions a user, a support person or a product owner has asked, each with a short, direct answer. -->

**Question, as it was asked?** The direct answer, in one or two sentences.
