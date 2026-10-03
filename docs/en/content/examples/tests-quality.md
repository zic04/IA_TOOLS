> [!NOTE] About this example
> This page is the example of the `tests-quality` template, written for Acme Orders, the kit's fictional product. The table below is generated from `facts/tests.json`, written by `doc-kit facts --source tests`.

## In short

46 tests across 4 files, about 61% line coverage. The approval flow is well tested; the reminder job, the one that never actually runs in production (C1 of the findings), has a single test — and that test only checks that the function exists.

## What is tested

::facts{source="tests" columns="file,tests"}

## Critical flows

| Flow | Tested? | Proof |
|---|---|---|
| Order creation and search | Yes, including the region-scoping fix | [[verified lib/services/searchService.test.ts:1]] |
| Approval decision | Yes, 9 cases, but none covers the missing scope check (C2) | [[verified lib/services/approvalService.test.ts:1]] |
| Invoice generation | Partially: the happy path only, not the retry behaviour (I5) | [[verified jobs/invoiceJob.test.ts:1]] |
| Reminder e-mail | No real coverage: see below | [[verified jobs/reminderJob.test.ts:1]] |

## Tests that test nothing

- `jobs/reminderJob.test.ts:8` only asserts that `sendReminder` is a function; it never calls it and never checks that an e-mail would be sent ([[verified jobs/reminderJob.test.ts:8]]).

## How to run them

`npm test` runs the whole suite in about 20 seconds against an in-memory database; `npm run test:e2e` additionally needs the application and a local Postgres running.
