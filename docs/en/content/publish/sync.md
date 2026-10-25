## In short

`doc-kit sync` says exactly what the documentation must follow after the application changes, fixes what is
mechanical, and leaves to a person or an agent only the pages whose subject really changed. It never calls an LLM:
every decision comes from hashes, imports and git, computed and compared.

1. **Mark** the pages that are checked now: their dependencies are recorded in `sync.json`.
2. **Compare**, at any later time, the recorded dependencies with the application as it stands (or with a git
   commit).
3. **Act** on the report: `--apply` rewrites what moved, a person reviews what the report lists as changed.

## The reference: `sync.json`

```bash
doc-kit sync --mark --all
```

Records, for each written page, hashes of the page itself, of the files behind its `routes` (direct: the page's own
route; shared: merely imported, up to 3 levels and 200 files), of every `file:line` proof it cites, of the capture
plan entries behind its `:::screen` blocks, of the message labels it quotes verbatim, and of its `::facts` tables,
topic group (the other pages a `counterpart` joins) and declared `sources`. `sync.json` lives at the project root by default (`paths.sync`) and is
**committed with the documentation**, like `facts/*.json`.

Marking merges into `sync.json`, it never rebuilds it: `--mark <page…>` records those pages and the commit they
were checked at, and acknowledges only what they document. A new route stays `new` until a marked page cites it
or `--mark --all` acknowledges the whole inventory; a renamed label stays reported while a page that was not
marked still quotes its old value — and so does a label whose messages file the application deleted (`→ null`).
A page acknowledges an element only when it names it whole: `/detail` is not in `/orders/detail`, nor `/ord` in
`/orders`, and `/invoices-export`, `/invoices.csv` or `/invoices/2026` do not name `/invoices` — a route ends
before a blank, a quote, a bracket, a backquote, `?`, `#` or sentence punctuation (`/invoices.`); `/invoices/2026`
names `/invoices/[id]`, and `/invoices/2026/edit` names `/invoices/[id]/edit`, never `/invoices/[id]` — a dynamic
route is named with its own number of segments. `--mark --all` also drops a label no page quotes any more; a page no longer written leaves
`sync.json` at the next marking. With no page written — a table of contents that cannot be read — a marking is
refused (exit code 1) and `sync.json` is left as it is: nothing pending is acknowledged. Each page's diff is taken
from its own commit.

## Reading the report

```bash
doc-kit sync
```

Without `--mark`, `sync` only reports — nothing is written but `.doc-kit/sync.md`, `.doc-kit/sync-report.json` and
one `.doc-kit/sync/<page>.diff` per page to review:

| Category | What changed | What to do |
|---|---|---|
| `review` (priority `direct`) | A file the page's own route touches | Review, likely rewrite |
| `review` (priority `shared`) | A file the page merely imports | Review |
| `review` (priority `probablyIntact`) | That shared file changed, but nothing the page names did | Review, likely untouched |
| `proofs.moved` | A cited line's text found elsewhere in the same (or renamed) file | `--apply` fixes it |
| `proofs.broken` | The file was deleted, or the text is nowhere to be found | Review |
| `labels` | A quoted message's value changed, or its key disappeared (a messages file that is not valid JSON only warns: its labels are not compared) | `--apply --labels` fixes it |
| `captures` | The route's files changed, the plan entry changed, or the screenshot's version is stale | Retake: `capture --stale --compare` |
| `new` | A route, API route, table… the reference never saw | Document it |
| `removed` | An element a written page still cites, gone from the application | Correct the pages listed |
| `unchanged` | A marked page, nothing of its dependencies moved | Restamped by `--apply` |
| `edited` | A marked page whose Markdown changed since it was marked | Check it, then `--mark` it (only a warning, never restamped by `--apply`) |
| `unmarked` | A written page never marked | `--mark` it once checked (only a warning, never blocks `--check`) |

A page may appear in several categories at once (`proofs.moved` and `captures`, for instance), but in `review` or
`unchanged` at most once.

## Fixing automatically: `--apply` and `--labels`

```bash
doc-kit sync --apply
doc-kit sync --apply --labels
```

`--apply` rewrites a moved proof's `path:line` wherever it is cited, and restamps every page the run leaves
unchanged — without clearing anything still pending: a screenshot to retake, a new element, a label. `--labels`
goes further: it replaces an old message value with its new one, as a whole word (`No` is never replaced inside
`Note`), but **only** inside `**bold**`, a code span that is the label itself, `[[menu …]]` badges and quotes —
never inside ordinary prose, where a human sentence depends on the old wording, nor in any other code span (even
in bold or between quotes: `` **`getByRole('link', { name: 'Approve' })`** `` stays as it is), a directive's
attributes, a link's target, a bare address (`https://…`), or a label between brackets that names a link definition
(`[Approve]` with `[Approve]: approve.md`). A label in bold written across a line end (`**Approval\nchain**`) is
replaced too. A new value that holds the old one (`Approval chain` → `Approval chain history`) is replaced once: run
it again, nothing changes. `é` written as one character or as `e` and an accent is the same label.

**Every rewrite is checked on the page as the site renders it.** The page is rendered by the kit's own renderer
before and after: the rewrite is kept only when the page after is the page before with the label renamed in its
text, and nothing else — the same links and their targets, the same anchors, the same code blocks and comments —,
and only where the rendered page shows the label in bold, a badge, between quotes or as a code span of its own.
Otherwise the page is left as it is and reported **to update by hand**: a label in a heading, say, whose anchor
would change with it. Its label stays pending until someone updates it. So `--apply --labels` never damages a page
and never clears a signal: where the reading of the Markdown that proposes the rewrites differs from the renderer, the
page is only sent to be updated by hand. Nothing here ever touches prose: a page whose subject changed still needs a
person, and a page nobody marked is never marked by `--apply`, even one whose label it rewrote.

What `--apply` rewrites in a page it leaves to review is no edit by hand: that page is not reported `edited` for
it — nor for a final newline added or removed, a BOM or CRLF line ends.

## A gate for continuous integration: `--check`

```bash
doc-kit sync --check
```

Exit code 1 as soon as any category but `unchanged`, `edited` and `unmarked` is not empty — "the documentation is behind the
application" —, or a messages file cannot be read (not valid JSON): none of its labels is compared then, which the CI
would not see otherwise. `unmarked` only warns, so a project can adopt `sync` one page at a time instead of marking every page
at once.

## Comparing with a commit instead of the reference

```bash
doc-kit sync --since v2.3.0
```

Reads the files behind each page **at that commit** instead of from `sync.json`, through read-only git: only
`review` and `unchanged` are reported this way. Proofs, labels, screenshots and edits are compared with
`sync.json`, and the coverage adapters are not re-run at an old commit, so `proofs`, `labels`, `captures`,
`edited`, `new` and `removed` are always empty. `--since` compares and never records: with `--mark` or `--apply`
it is a usage error (exit code 2).

## Refreshing only what changed: `capture --compare` and `--stale`

```bash
doc-kit capture --stale          # the captures named in the last sync report
doc-kit capture "use-orders-*" --compare
```

Each selected capture is taken again and compared pixel by pixel with the image on disk. Below the threshold
(`capture.compareThreshold`, default 0.5 % of differing pixels), the image is **kept as is** — no binary change for
git — and only its zone file is rewritten; above it, the new image replaces the old one, and
`.doc-kit/compare/<id>.png` shows both side by side with their zones drawn. `--stale` selects the captures
`sync`'s last report named as changed; it implies `--compare`.

## The footer line

Once a page is marked, the site shows, next to the screenshot dates, "Checked against version {version} on
{date}" — the version and date recorded by the `--mark` that last touched it, visible at the next build.

## Pitfalls and observed gaps

> [!WARNING] Without `app.dir`, `sync` cannot run
> Dependencies, proofs and labels are all read from the application's code: configure `app.dir` first
> ([Project, version and sign-in keys](#/reference/configuration/project)).

> [!NOTE] A page quotes a label where the site shows it
> A label is quoted where the page, rendered by the kit's own renderer, shows it as text: `_Approve_` quotes
> `Approve` (an emphasis, shown without its underscores), a link's title or an image's text does too, a code block,
> an HTML comment, a script, a style sheet or a text field never does, nor a link's target. A character reference
> is the character it names: `**R&eacute;gler**` quotes `Régler`, as `**Régler**` does. `保存をクリック` does
> not quote `保存`: a letter follows it, as `Approved` does not quote `Approve`. Set the label apart —
> `**保存**をクリック` — to have it followed. Finding a very long label is slower: up to the page's length times
> the label's.

> [!NOTE] When `--labels` leaves a page to update by hand
> The places to rewrite are found by reading the Markdown, close to how the renderer reads it but not as it does:
> a blockquote opened on a list item's own line (`- > …`), a comment never closed inside a blockquote or a list
> item, or raw HTML the reading does not follow may be read otherwise. The check on the rendered page catches each
> of these cases — as it reads the rendered page, with one limit: a formatting element left open in raw HTML (a
> `<code>` never closed) is read as closed at the end of its block, where a browser opens it again. The page is
> left as it is, reported to update by hand, its label still pending — never damaged.

> [!NOTE] A few shapes Marked renders slowly
> The kit reads a page in linear time, but Marked itself does not on a few shapes repeated over tens of thousands
> of characters: emphasis marks never closed (`*a *a *a …`), `x <!-- a --!> ` again and again, lines alternating
> with quote lines, or a paragraph cut by many `::` lines with no blank line. Such a page takes seconds — minutes
> for the longest — to render, for `sync` as for `build`.

> [!NOTE] Two labels with the same value, a screenshot on several pages
> Two message keys with the same value cannot be told apart: a page that quotes it is listed — and rewritten by
> `--labels` — when either changes. A screenshot shown by several pages is recorded once: marking one of them
> acknowledges it for all.

> [!NOTE] git is only ever read
> `--since`, and the commit shown by a stale facts file, come from `git show` and `git diff` in the application —
> never a write. Without git, the report still runs; it only loses what git would have added.

> [!NOTE] A file outside the application is never read
> A proof (`file:line`) or a dependency of a page whose file lies outside `app.dir` — through `../`, or through a
> link or a junction, whether that file exists or not — is never read, hashed nor recorded: the warning
> `sync.proofOutside` (proof not recorded) or `sync.dependencyOutside` (dependency not followed) says so, at marking
> and in every report. Two limits: a hard link is another name of the same file, so one in the application to a
> file outside is read as a file of the application; and a path is checked, then read, so a file or a folder
> replaced by a link in between, by a process that changes the application while `sync` runs, is not seen.

## Further reading

- [Commands: write and check](#/reference/cli/write-check~doc-kit-sync): every option, in full.
- [Taking over a vibe-coded application](#/spaces/takeover): the pages `sync` keeps honest.
- [Cost and speed](#/skill/cost-and-speed): `doc-kit context --update` reads this report to brief an agent.
