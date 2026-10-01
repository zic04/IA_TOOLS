# Handover checklist

Go through it before you hand a site over to its owner, or to the team that takes the project over. Every line comes from a real handover; the "Proof" column says how to show that it is done.

## 1. Checks

| ✓ | Item | Command | Proof |
|---|---|---|---|
| ☐ | Strict build without errors | `doc-kit build` | "site built", no ✖ line |
| ☐ | All blocking checks green | `doc-kit check all` | Exit code 0 |
| ☐ | Warnings handled or justified | `doc-kit audit` | The remaining warnings are explained on "Maintaining the docs" |
| ☐ | Target maturity level reached (3 at least, 4 for a takeover) | `doc-kit audit` | Level shown; see [maturity.md](maturity.md) |
| ☐ | Visual review of at least one page per section, in light and dark themes, and of one guided tour | `doc-kit view <page> --theme dark`, `--tour 2` | Review images looked at, then deleted |

## 2. Safety

| ✓ | Item | How |
|---|---|---|
| ☐ | **Production session deleted** | `doc-kit connect --forget`; no session file left in the project |
| ☐ | No secret in the images | Every image reviewed after the last capture run |
| ☐ | Decision about real data written down | In the project's writing guide (for example: "real production data, by decision of the owner on <date>") |
| ☐ | No write left in production | The "Read-only: N write request(s) blocked" summaries reviewed; the known server writes listed as findings (for Acme Orders: P9) |
| ☐ | `.doc-kit/` empty or excluded from the export | It holds the session, previews and work files |

## 3. Takeover content up to date

| ✓ | Item | Where |
|---|---|---|
| ☐ | Documented version of the application, and date of the capture run | "Maintaining the docs" (for example: version 2.4.0, captures of 1 October 2026) |
| ☐ | Records already opened in production listed (server writes while rendering) | "Maintaining the docs" |
| ☐ | Known limits of the tooling | "Maintaining the docs", "Known limits" |
| ☐ | Findings consolidated: writers' candidates re-checked, deduplicated, numbered | `take-over/findings` |
| ☐ | Proposed terms added to the glossary | `content/glossary.json` |
| ☐ | Project memory up to date: takeover notes, the assistant's memory if there is one, the documentation's `CHANGELOG` | Depends on the project |

## 4. Export

| ✓ | Item | Command or rule |
|---|---|---|
| ☐ | A **self-contained** copy of the project, without `node_modules/`, `.doc-kit/` or session | `doc-kit export <target>`; `--with-dist` to include the built site, `--zip` for an archive |
| ☐ | A handover README at the root | What the site is, how to open it, how to rebuild it (`npm ci`, `npm run site`), how to retake the captures, where the writing guide is |
| ☐ | The export rebuilds elsewhere | In the copy: `npm ci`, then `npm run site`; Node.js 20 or later; `npx playwright install chromium` if the browser is missing |
| ☐ | The coverage check is documented as skipped outside the repository | It needs the application's code |

## 5. Distribution

The deliverable is **a single HTML file** that opens offline. Its size decides how it is distributed.

| Site | Typical size | Distribution |
|---|---|---|
| About 200 images | About 18 MB | Project repository, shared document space, static hosting |
| About 400 images | About 35 MB | The same; too heavy for most e-mail systems |

| ✓ | Item | Rule |
|---|---|---|
| ☐ | File size noted | Above about 10 MB, no attachment: a link to a shared space |
| ☐ | Images lightened | `doc-kit optimize` (recompresses above 200 KB) before the last build |
| ☐ | Restricted access if the site shows real data | A shared space limited to the people the owner allows |
| ☐ | Recipients and handover date noted | On "Maintaining the docs" or in the handover README |
