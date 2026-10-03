## In short

The kit itself calls no LLM: `build`, `check`, `audit`, `facts` and `sync` run on plain code, for free, however
large the project. Tokens are only spent where the skill puts an agent to work — reading a page's context and
writing or reviewing its Markdown. Four things cut that cost: reading **less** (`doc-kit context`), starting from
what is already known (`new --prefill`), matching the **model** to the task, and keeping to a **step budget**
instead of exploring — measured to be the biggest lever of the four (see "Measured, not estimated" below).

## Reading less: `doc-kit context`

```bash
doc-kit context use/orders/approval --budget 8000
```

Writes `.doc-kit/context/<page>.md`: the only reading an agent needs for that one page, instead of the whole code
inventory and table of contents. Built from the page's own dependencies (the same ones `doc-kit sync` computes) —
direct files before shared ones, each trimmed to the lines near a cited proof, a short file given whole — plus the
required sections of its template, the exact labels and facts rows these files touch, and the glossary terms that
match. Tokens are estimated as characters ÷ 4; past the budget (default 16,000), the farthest excerpts are cut
first, each cut leaving a one-line note. `--update` adds the page's entry of the last `sync` report, its diff, and
the paths of its captures' before/after sheets.

A context folder runs from a few hundred tokens, for a page with one or two small dependencies, to a few thousand
for most pages — always far under the roughly 15,000 tokens an agent used to read in full (the whole inventory and
table of contents) before every page it wrote.

## Starting from the facts: `new --prefill`

```bash
doc-kit new take-over/deployment/variables --template variables --prefill
```

For the five takeover types built directly from one facts source (`variables` from `env`, `api-surface` from
`api`, `data-model` from `db`, `dependencies` from `dependencies`, `agent-instructions` from `agents`), the page's
main table is filled row by row from `facts/<source>.json` before the agent even opens the file: the key cells
(variable name, route, table, package, instruction file) and their proof; the other cells keep the template's
guidance until someone — person or agent — writes them. Without the facts file, `--prefill` refuses to run
(`doc-kit facts` first); on a type with nothing to prefill, it is a usage error.

## Three agent types, three prices

| Agent | Model | Tools | Used for |
|---|---|---|---|
| `doc-kit-triage` | Haiku | Read, Grep, Glob (read-only) | Deciding whether a page is intact, to edit, or to rewrite |
| `doc-kit-writer` | Sonnet | Read, Grep, Glob, Edit, Write, Bash | Writing and updating pages |
| `doc-kit-reviewer` | Opus | Read, Grep, Glob, Edit, Write, Bash (read-only use) | The inventory, verifying findings, the production dossier |

`doc-kit skill install` copies the three Claude Code agent definitions next to the skills folder; `doctor` reports
them like the skill itself (current, missing, outdated, modified). Every brief names its agent type in a front
matter line, and is split so that its common part (rules, safety, syntax) comes first, byte for byte identical
whatever the variables: agents of the same wave share their prompt cache instead of paying for it again each time.

## Estimating before you spend: `brief.mjs --estimate`

```bash
node <skill>/scripts/brief.mjs writing-batch --project docs/manual --var code=u1 --var pages=@pages-u1.txt --estimate
```

Input tokens: the brief itself, plus every context file and the files it lists, ÷ 4. Output tokens: 1.4 per word of
the template's `maxWords` for a new page, 0.3 per word for an update. Priced only when `llm.prices` is set in
`doc.config.mjs` — **there is no default price**, because prices change and differ by contract:

```js
llm: { currency: "EUR", prices: { haiku: { input: 0.9, output: 3.6 }, sonnet: { input: 3, output: 15 } } }
```

Without `llm.prices`, the estimate still prints the token counts; it only omits a cost. `doc-kit sync --estimate`
prices the pages a sync report lists for review the same way, one `doc-kit-writer` agent per page.

## Measuring what was actually spent

```bash
node <skill>/scripts/usage.mjs log --brief writing-batch --agent doc-kit-writer --model sonnet --tokens 42000
node <skill>/scripts/usage.mjs report
```

`log` appends one line to `.doc-kit/usage.jsonl` (the orchestrator records what Claude Code reports when an agent
ends); `report` totals by phase, brief, agent type, model and page, with the cost when `llm.prices` is set, next to
the last estimate; `scan --transcripts <folder>` reads Claude Code's own transcripts to split input, output and
cached tokens, when the orchestrator did not log them by hand.

## Measured, not estimated

Measured on a real application (FastAPI + Next.js, 81 pages): nine admin screen pages, one `doc-kit-writer`
agent per page, three methods compared.

| Method | Avg. cost (token-equivalent) | Round-trips | Duration | Words | Proofs | Conformant |
|---|---|---|---|---|---|---|
| Old brief: writing guide + reference page + full inventory + free exploration + repeated checks | 1,039,000 | 47 | 13.6 min | 1,719 | 52 | 3/3 |
| + a context folder (`doc-kit context`), same free exploration | 890,000 (−14 %) | 42 | 11.4 min | 1,652 | 54 | 3/3 |
| **Sober**: context folder + template only, at most 3 targeted reads, the page written once, one build, `view` only with screenshots | **323,000 (−69 %)** | **21** | **7 min (−49 %)** | 1,303 | 42 | 3/3 |

"Token-equivalent" cost: input × 1 + cache write × 1.25 + cache read × 0.1 + output × 5. Cache reads are the
cheapest kind, per token — but every round-trip rereads the whole context accumulated so far, so there are far
more of them than any other kind: **an agent's cost ≈ its round-trips × its context size**. The context folder
alone bought 14 %; capping the step budget — at most 3 extra reads per page, one `Write`, one build, no
mid-way `view` — bought the other 55 points. Conformance to the standard did not move (3/3 throughout): fewer
steps meant fewer *exploratory* ones, not fewer checks. `writing-batch` and `update` (ARCHITECTURE.md §6.11,
`references/agent-orchestration.md` §8 of the skill) state this step budget in their own text, so an agent that
would exceed it stops and reports rather than exploring further.

## Pitfalls and observed gaps

> [!NOTE] No price does not mean no cost
> Without `llm.prices`, every estimate and every report still shows tokens — only the currency column is empty.
> Set it once the actual contract prices are known, so that a figure is never guessed.

## Further reading

- [The phases of the skill](#/skill/phases): where triage, writing and review fit in the method.
- [Keeping up with the application](#/publish/sync): `--estimate` on the pages a sync report lists.
- [Commands: write and check](#/reference/cli/write-check~doc-kit-context): `doc-kit context`, in full.
