## Access

<!-- guidance: a two-column table, four fixed rows: Module (the section of the application it lives in), Who can use it ([[perm …]], every permission that unlocks it), Prerequisites (data or state the feature needs to exist, e.g. "a customer with an open account"), Checked on (the version and date this page was last read against the application). -->

| | |
|---|---|
| Module | Name of the module |
| Who can use it | [[perm module:action]] |
| Prerequisites | What must exist first |
| Checked on | vX.Y.Z, YYYY-MM-DD |

## What it is for

<!-- guidance: the business need in 2 to 4 sentences, business language only, no code: who wants this, and what it is for them. Assign this page's "feature" id (toc.json, field "feature", e.g. "F-01") and give it a title (bold, exact name) in the first sentence. -->

## Who uses it

<!-- guidance: the roles or audiences that use the feature, and what each one does with it. One line per role, "**Role**: what they do". -->

- **Role**: what they do with this feature.

## Trigger and preconditions

<!-- guidance: optional. What starts the feature (an action, a schedule, another feature's outcome), and what must be true first. Delete the section when the trigger is simply "someone opens the screen". -->

## Main scenario

<!-- guidance: the happy path, as numbered steps (actor, action, result). Add a :::screen or a ::capture when a screenshot makes a step clearer; neither is required. -->

:::steps
1. **Actor** does the first thing.
2. The feature reacts: what changes.
3. **Actor** sees the result.
:::

## Variants and exceptions

<!-- guidance: optional. Branches of the main scenario, numbered after the step they branch from ("3a. If …"), each with what happens instead. -->

- **3a.** If a condition holds, what happens instead.

## Business rules

<!-- guidance: the rules that belong only to this feature are defined here with :::rule (one container per rule, a statement then a "Given / When / Then" example); a rule shared with other features is only cited with [[rule …]], never redefined. -->

:::rule{id="BR-00" title="One short, checkable statement"}
The rule, in one or two sentences.

**Example.** **Given** a starting condition, **when** the triggering action happens, **then** the result that follows.
:::

## Data handled

<!-- guidance: optional. The business data this feature reads or changes, named the way a business reader knows them (never table or column names): what each one means, and who else depends on it. -->

## Notifications and effects

<!-- guidance: optional. What the feature sets off beyond the screen itself: an email, an entry in another feature's list, a counter that changes elsewhere. One line per effect, who or what receives it. -->

## Limits

<!-- guidance: optional. What the feature deliberately does not do, or does only partly, in business terms (never a code pitfall: this page cites no code). Example: "The feature does not retry a failed notification; a support request is needed." -->

## Questions people ask

<!-- guidance: optional. 2 to 5 real questions a user, a support person or a product owner has asked, each with a short, direct answer. -->

**Question, as it was asked?** The direct answer, in one or two sentences.
