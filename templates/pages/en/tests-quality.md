## In short

<!-- guidance: the overall state in one paragraph: a number of tests, a coverage percentage when one is measured, and the headline risk (critical flows untested, tests that assert nothing). Generate the facts first: `doc-kit facts --source tests`. -->

Example: "A few hundred tests, about two-thirds line coverage; one critical flow has no test at all."

## What is tested

<!-- guidance: built from `::facts{source="tests"}`. -->

::facts{source="tests" columns="file,tests"}

## Critical flows

<!-- guidance: the flows that must never break (payment, approval, sign-in), and whether each one is actually covered by a test that would fail if it broke. -->

| Flow | Tested? | Proof |
|---|---|---|
| Example flow | No | [[unknown]] |

## Tests that test nothing

<!-- guidance: optional. Tests that always pass regardless of the code (an assertion on a constant, a mocked call never checked): a known AI-generated pattern. -->

- One test never calls the code it names ([[verified path/file.test.ts:40]]).

## How to run them

<!-- guidance: the exact command, and what a healthy run looks like. -->

The test command runs the whole suite in a few seconds.
