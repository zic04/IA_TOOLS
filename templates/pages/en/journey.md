## In short

<!-- guidance: the short answer to the question of the journey, in 3 to 6 lines: what is followed, in how many steps, according to which version of the code. Then a HOW box that answers the question everyone asks. Example: "What happens when a sales rep submits an order? Less than you think: nothing moves until an approver opens their inbox." -->

> [!HOW] What happens when someone performs the starting action?
> The real answer, with its proof (`path/file.ts:139-142`).

## The diagram

<!-- guidance: an SVG diagram of the steps. Show visually what chains on its own (solid line, d-line), what waits for a person (dotted line, d-dashed) and what depends on a scheduled task (alert colour, d-warn or d-danger). Only the site's d-* classes, no hard-coded colour. The caption says how to read it. -->

::diagram{id="r-journey-name" title="The steps of the journey: trigger, writes and services called. Solid line: chained; dotted line: waits for a person; in red: what depends on a scheduled task."}

## In this part

<!-- guidance: one row per sub-page (step), in order; column 1 = a link "n. Title". -->

| Step | Trigger | Automatic or human | What changes |
|---|---|---|---|
| 1. Title of the step | The action or the event | Human, automatic, or scheduled task | Writes and statuses |

## The states

<!-- guidance: optional. A step × object table, with the technical values (code) and the displayed labels (in bold). -->

| Step | Object followed | Other object |
|---|---|---|
| 1. Title of the step | `VALUE` (**Label**) | — |

## What happens on its own, and what waits for someone

<!-- guidance: optional but widely read. Two lists: what the code chains without anybody, and what stays waiting for an action. Point out what depends on a scheduler, and whether it really runs. -->

### On its own

- What chains, and when.

### Waits for a person

- The expected action, with its exact label in bold.

## Surprises to know about

<!-- guidance: 6 to 10 numbered items, each one: the surprise in one sentence in bold, the explanation, the number of the finding if there is one (I17), and the link to the sub-page that details it. -->

1. **The surprise, in one sentence.** The explanation, the related finding if there is one, and the sub-page that details it.

## Further reading

<!-- guidance: 3 to 6 links: architecture overview, technical architecture document, the screens concerned, the home-page guided tour that follows the same object on screen. -->

- Title of the linked page: what it holds.
