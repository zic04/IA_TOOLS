## In short

<!-- guidance: the overall state in one paragraph: the worst rating, and whether it is improving or worsening. Generate the facts first: `doc-kit facts`. `::health` sums them up: ratings, security, tests, architecture, knowledge, dependencies, tooling, and the main risks. -->

::health{}

Example: "Mostly healthy; one function carries most of the complexity and is also today's biggest security gap."

## Ratings

<!-- guidance: the A-to-E ratings of `facts/quality.json` (duplication, complexity, size, tests), each with its measure. -->

| Rating | Grade | Measure |
|---|---|---|
| Duplication | B | 4% of code lines |
| Complexity | B | 2% of functions above 15 |
| Size | A | 0% of files above 500 lines |
| Tests | C | 20% of files have a test |

## Hotspots

<!-- guidance: the files or functions that combine size, complexity and low test coverage — where a change is most likely to break something unseen. `::hotspots` crosses the history and the measures (`doc-kit facts --source history --source quality`): the files that change most often and are the most complex, ranked, and whether a single person knows them (owner share, bus factor). -->

::hotspots{}

## Duplication

<!-- guidance: optional. The largest duplicated blocks, and whether they drifted apart (the surest sign a shared helper is overdue). -->

## Complexity

<!-- guidance: optional. The most complex functions, what makes them hard to follow, and whether tests actually exercise their branches. -->

## Tests

<!-- guidance: the test ratio, and the gap between "has a test" and "the test checks something" (cross-reference `tests-quality` rather than repeating it). -->

## Dependencies

<!-- guidance: optional. Direct dependencies behind their latest version (`--network`); cross-reference the `dependencies` page rather than repeating it. -->

## Recommendations

<!-- guidance: ordered by effort (quick win first), each pointing back to a hotspot above. -->

1. **Quick win**: what to do, and why it is cheap.
2. **Bigger effort**: what to do, and what it unblocks.
