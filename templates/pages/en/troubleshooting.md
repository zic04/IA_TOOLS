## In short

<!-- guidance: what this part offers (start from a symptom, reach in one minute the cause, the check, the fix and the page that explains it), according to which version of the code. Then the three reflexes that save half of the searching. Example: "Not found often means out of your scope." -->

> [!HOW] Three reflexes before you search further
> - **First reflex.** The most frequent cause, and where to check it.
> - **Second reflex.** Same.
> - **Third reflex.** Same.

## The diagram

<!-- guidance: optional. The preliminary questions, then the families of symptoms with their first checks and their sub-page. -->

::diagram{id="r-troubleshooting" title="Where to start: the preliminary questions, then the families of symptoms, each with its first checks and its sub-page."}

## First of all: the checks that explain half the symptoms

<!-- guidance: 5 to 8 checks, each with the screen or the log where to look and what is misleading. Example: "Has the scheduler run?" -->

| Check | Where to look | What is misleading |
|---|---|---|
| The question to ask | [[menu Administration › Screen]] | What misleads, with its proof |

## Where to look

<!-- guidance: the sources of truth, one subsection per source: administration screens, audit log (useful action codes), server logs (prefixes and the file that writes them), ready-to-use log queries that you have actually run. Give the query in the language of the logging platform in use (for example a KQL query in Azure Log Analytics, a CloudWatch Logs Insights query on AWS, a Logging query on Google Cloud), with the date it was checked. -->

### The administration screens

| Screen | What it tells |
|---|---|
| [[menu Administration › Screen]] | The information useful to the diagnosis |

### The audit log

| Code | What it proves |
|---|---|
| `action.code` | The event recorded |

### The server logs

| Prefix | Written by | When |
|---|---|---|
| `[prefix]` | `path/file.ts:10` | The case that writes this line |

### Ready-to-use queries

```text
logs of the application service
| where time > now - 1 hour and message contains "[prefix]"
| keep time, level, message
```

## In this part

<!-- guidance: one row per sub-page (area), with the symptoms covered and the numbers of the main findings; column 1 = a link "n. Title". -->

| Sub-page | Symptoms covered | Main findings |
|---|---|---|
| 1. Title of the area | The symptoms, as users describe them | C1, I8 |

## Further reading

<!-- guidance: the findings, the end-to-end journeys and the operations pages. -->

- Title of the linked page: what it holds.
