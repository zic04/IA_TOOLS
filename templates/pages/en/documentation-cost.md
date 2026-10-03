## In short

<!-- guidance: one paragraph: what producing and maintaining this documentation cost so far — time, AI agents and models, tokens, cost when llm.prices is set — and the trend from one version to the next. The tables are generated from usage/<version>.jsonl (doc-kit stats). -->

::usage{view="summary"}

## Per version

<!-- guidance: generated: one row per version of the application — creation first, then each update. Comment only what stands out (an update that cost more than the creation, a version with no agent at all). -->

::usage{view="versions"}

## Where the time goes

<!-- guidance: generated: each block (captures, facts, generation, translation, update, build, checks) with its parts under it, and the slowest parts. -->

::usage{view="steps"}

::usage{view="slowest"}

## Models and agents

<!-- guidance: optional. Generated: the agents run per model, their tokens (input, output, cache) and their cost. -->

::usage{view="models"}

## What to optimise next

<!-- guidance: optional. Two or three concrete actions drawn from the tables above: the slowest part to speed up, a step that could use a cheaper model, a page rewritten when a small edit would do. -->

- The longest part of the captures is the wait: check the pages that never go quiet.
