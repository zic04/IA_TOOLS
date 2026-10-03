> [!NOTE] About this example
> This page is the example of the `agent-instructions` template, written for Acme Orders, the kit's fictional product. The table below is generated from `facts/agents.json`, written by `doc-kit facts --source agents`.

## In short

Two instruction files, 760 words combined; no hidden character was found. Most of `AGENTS.md`'s rules still match the code; one is already contradicted.

## The files

::facts{source="agents" columns="file,lines,words"}

## Each rule

| Rule | File:line | Status | Proof |
|---|---|---|---|
| "Filter by `region_id` on every customer-facing query" | `AGENTS.md:14` | Contradicted (C2) | [[verified approvalService.ts:88]] |
| "Use `acme-date-utils`, never a third-party date library" | `AGENTS.md:22` | Confirmed, not followed once | [[verified approvalService.ts:3]] |
| "Every scheduled job is declared in `infra/jobs.tf`" | `orders.md:4` | Contradicted (C1) | [[verified infra/jobs.tf:8]] |

## Hidden characters

No hidden character was found in either instruction file.

## What to keep

- Keep "filter by `region_id`" and "use `acme-date-utils`": both describe the intended design, even where the code does not yet follow them. Fold them into [Database access rules](#/examples/api-surface~database-access-rules) and [Direct dependencies](#/examples/dependencies~direct-dependencies) respectively, then retire the instruction files once every rule has a status here.
