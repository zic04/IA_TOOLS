> [!NOTE] About this example
> This page is the example of the `maintainability-review` template, written for Acme Orders, the kit's fictional product. The tables below are generated from `facts/quality.json` (`doc-kit facts --source quality`).

## In short

Mostly healthy: duplication and complexity are both rated B, well within the thresholds. One function, `approvalService.ts`'s `decide`, carries most of both — the same function that is today's biggest access-control gap (C2 of the findings): complexity and risk landed in the same place, which is the usual story.

## Ratings

| Rating | Grade | Measure |
|---|---|---|
| Duplication | B | 4% of code lines |
| Complexity | B | 1.4% of functions above 15 |
| Size | A | 0% of files above 500 lines |
| Tests | C | 20% of files have a test |

## Hotspots

::facts{source="quality" columns="file,lines,functions,longest,complexity,duplicated,todo"}

`lib/services/approvalService.ts` combines the highest complexity (19) and the most duplicated lines (24) of the three files shown: its `decide` function is both the longest in the file ([[verified lib/services/approvalService.ts:88]]) and the one missing a test for its scope check (see Tests below).

## Duplication

`lib/services/approvalService.ts` re-implements its own date arithmetic instead of using the project's own `acme-date-utils` package, which already does the same thing (see [Example · Code map](#/examples/code-map)) — the likely source of the `acme-date-helpers` entry in `package.json` (see [Example · Dependencies](#/examples/dependencies)). The duplicated lines have not drifted apart yet; they still read the same in both places.

## Complexity

`decide` (`lib/services/approvalService.ts:88-97`) branches on the step's role, its status, and three date comparisons for reminders — nineteen decision points in one function. The approval test suite covers 9 cases ([[verified lib/services/approvalService.test.ts:1]]), but none of them covers the missing scope check (C2 of the findings): high complexity made the gap easy to miss, not just easy to introduce.

## Tests

20% of source files have a matching test file; see [Example · Tests and quality](#/examples/tests-quality) for what is actually exercised rather than merely present — `decide`'s own test file exists and runs, but none of its 9 cases supply a step from another region.

## Dependencies

`next` is one minor version behind the latest 14.2.x (see [Example · Dependencies](#/examples/dependencies) for the full list); no breaking change applies.

## Recommendations

1. **Quick win**: extract `decide`'s date comparisons into three named helpers; it will not change behaviour, but it turns one 19-branch function into one that is easier to read a test case against.
2. **Quick win**: replace the hand-rolled date arithmetic with the project's own `acme-date-utils` package, removing the duplication and the confusion with `acme-date-helpers`.
3. **Bigger effort**: once `decide` is split up, add the missing region-scoped test case alongside the `scopeWhere` fix (C2) — the two changes belong together, so the regression test lands with the fix, not after it.
