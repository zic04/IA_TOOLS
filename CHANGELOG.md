# Changelog

All notable changes to doc-kit are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). `doc-kit upgrade` shows the
entries between a project's `kit` range and the installed version.

## [Unreleased]

### Added

- **The demo in English and French** (ARCHITECTURE.md §6.12): `examples/demo-docs` declares `languages: ["en", "fr"]`
  instead of `language: "en"`, with a French translation of every page, section introduction, the home page, the
  table of contents and the glossary (`translations/fr/`, 16 files, all current), of its diagram, and the French
  labels of its annotated screens' zones (`images/fr/zones/`, the screenshots shared). `doc-kit build --project
  examples/demo-docs` gives one file with a language switch; `--lang fr` the French file alone. The French snapshot
  is now a strict build.

### Fixed

- **`doc-kit new` in a multilingual project** adds the same entry, at the same place, to every translated table of
  contents (`translations/<l>/toc.json`), its texts left to translate: a new page no longer stops every build with
  `translation.toc.structure`. A translated table of contents that is not valid JSON, or already out of step there
  (another section, other pages in that group, the page already declared), is left as it is (the build's structure
  check names it).
- `doc-kit build --lang <source language>` writes the source language's file alone (`-en.html`); it failed with
  `translation.missing`.
- A page not written yet in the source is not written in any language: the links to its anchors are no longer
  errors in the translations, and `page.missing` is reported once, by the source.
- `doc-kit view --tour <n>` on a multilingual site: it clicked the tour's "Next" button by its label in the source
  language and timed out when the browser showed another language. It now clicks the button itself, and, without
  `--lang`, opens the source language, so that the image never depends on the machine's language.
- `doctor`, `export`, `check secrets` and the audit's secrets measure start git through the command's process
  launcher, as the other commands do: in a repository whose git configuration names a program, they now warn and
  name the keys (git is still not run). For the kit's developers: the unit tests no longer start the machine's git
  (`test/unit/git-exec.test.mjs`; `seams.test.mjs` keeps the engine from starting a process outside its two git
  helpers).

### Changed

- **The kit's test suite** (for its developers; RULES.md M4, M17):
  - Time is measured only through `test/tools/growth.mjs` (`assertLinear`, `linearAt`, the ReDoS harness), in
    dedicated `*-growth.test.mjs` files run alone. Every millisecond budget and home-made growth loop is gone:
    80 clock readings in 20 files and 32 budgets in 17. `test/unit/timing-files.test.mjs` keeps them out, and
    `run-plan.mjs` finds a timing file by its import of `growth.mjs`.
  - The stack expressions are measured once, by the ReDoS harness (`test/tools/stack-shapes.mjs`). `npm test` is
    about twice as fast (336 s → 185 s on the reference machine).
  - Temporary folders: `test/run.mjs` gives the tests a fresh temporary root and fails the run if anything is
    left in it. 8 leaks fixed; the demo copies take a destination (`into`).
  - No real git and no Chromium in the unit tests: the CLI tests pass `exec: noExec`, and the session refresh
    test with a real browser moved to `test/e2e/`. `test/unit/seams.test.mjs` is the guard: 64 git starts per
    run before, 0 now.
  - Snapshots: only `UPDATE=1` writes one, and a missing one fails instead of being written. New checks: no orphan
    file, two identical builds, no trace of the machine (`test/tools/snapshot.mjs`).

### Security

- **A redirect through another origin no longer reaches a `capture.forbidden` route** (SECURITY.md › Read-only
  captures have limits). The guard checked a navigation's redirects only until the first hop that left the
  application, then let the browser follow the rest: a sign-in round trip through the identity provider could come
  back to a forbidden route, which the server then received. With `capture.forbidden`, the kit now fetches every `GET`
  navigation hop by hop, whatever its origins, tests each hop back on the application before it is requested, and
  hands the browser only the end of the chain (a page that sends the frame on, whose answer is held for that
  frame's next navigation; in an iframe, the end itself, since a sandboxed iframe could not run that page and stayed
  blank): the browser never follows a redirect itself, so a forbidden route cannot be requested on
  the way, and the server is never asked twice for a hop — one that answers its second request otherwise is no
  longer replayed. A hop sends the cookies the browser holds for its own address, never those of the first request
  (they went to the identity provider), and only the referrer's origin to another origin. These requests are sent by
  Playwright from Node.js, without Chromium's own rules (`SameSite`, HSTS, system proxy): SECURITY.md lists it.
  After a goto, `capture` waits until the frame has committed the answer held for it (the guard's own signal, never
  the address: a sign-in callback or a router that rewrites it with `history.replaceState` is captured, the run's
  session check included). The guard now lives in `engine/capture/guard.mjs`.
  `test/e2e/capture-redirects.test.mjs` (real servers on three ports), mutants `test/mutations/capture-guard.mjs`
  (RULES.md M16, S6).
- **A redirect chain the guard follows has bounds** (RULES.md M7): 20 s for a hop (`TIMINGS.redirectHop`), 25 s for
  the whole chain (`TIMINGS.redirectChain`, below the 30 s of a start page, so the guard gives up first and says why:
  `cli.capture.error.redirectTimeout`), 32 MB for the answer held for a frame (`cli.capture.error.landingTooLarge`)
  and 64 MB for all the answers held at once (`cli.capture.error.heldTooLarge`, en and fr). Each answer the guard
  fetched is freed once used, a held one also when its frame goes elsewhere or its page closes (Playwright kept every
  body until the browser context closed).
- **The end of a chain is recognised in Chromium's form of its address**: Node.js keeps `/end|x` where Chromium
  writes `/end%7Cx`, so the end was asked twice and the guard's own page read as its answer (a 401 there went
  unseen). Both are compared in one written form (`addressForm`).
- **Every address of the application is the application for `capture.forbidden`**: its host and port whatever the
  scheme (an `http` `app.url` its server upgrades to `https` no longer turns the protection off), without a trailing
  dot, and every name of the loopback interface as one host (`applicationKey`): `localhost` and `*.localhost`,
  `127.x`, `[::1]`, and `0.0.0.0`, `[::]` and `[::ffff:127.0.0.1]`, which Node.js (the guard's requests) reaches
  where Chromium refuses them — a redirect there reached a forbidden route. One loopback definition
  (`isLoopbackUrl`, RULES.md M6), which `probe`, `doctor` and `init` now share. With `auth: none`, a start page that
  lands anywhere else stops the run (`capture.offApplication`, exit code 2, en and fr).
- **`capture.forbidden` reads a path as a server does**: also without its path parameters (`/approval;jsessionid=…`,
  `/orders;v=1/7`), dropped before decoding as Tomcat does and after, with each run of escapes decoded on its own (one
  malformed escape, `%zz`, no longer turns all decoding off), decoded twice (`%252e`), with its `.` and `..` segments
  resolved (`/orders/7/x/../approval`, `%2e%2e`), its backslashes read as slashes (`%5C`, IIS) and each segment's
  trailing dots and spaces dropped (`approval.`, `approval%20`, `approval%2e`, IIS). `%u0061` and overlong UTF-8
  are written as limits. Mutants `test/mutations/capture-paths.mjs`.
- **A path parameter is never printed** (RULES.md S7): a refused, aborted or blocked request, and a forbidden route
  shown, are reported by their path without `;jsessionid=…` and without a query string, in the messages and in
  `--json` (`shownPath`); a sign-in page (an expired session, before or during the run, a sign-in asked for) and a
  bot challenge by their origin and that path only (`shownUrl`): their state, code and session id were printed.
- **Speculation rules no longer reach a forbidden route** (SECURITY.md): Chromium fetches the prefetches and
  prerenders of `<script type="speculationrules">` and of a `Speculation-Rules` header from its own process, which
  no route of the guard sees, and no launch flag or Content-Security-Policy turns them off. With
  `capture.forbidden`, the documents the guard serves lose that header, and an init script of every page removes
  each rules script before the browser reads it (in the document and its shadow roots). What stays out of reach (a
  shadow root declared closed, `<link rel="prerender">` with Google Chrome) is written in SECURITY.md.
- **A local application keeps its local API with `capture.forbidden`**: a page the guard answers itself has no
  address for Chromium, which refused its calls to another local port (Local Network Access). The kit allows them
  again for the application's origin only, when it is on a loopback address; on another address, `doctor` warns
  (except on production) when the application's env files name a local address on another origin
  (`cli.doctor.localCalls`).

## [0.4.1] - 2026-10-23

### Added

- A `package.json`'s `optionalDependencies` are read (not dev).
- **Python's modern manifests** (source `dependencies`): PEP 621 `[project]` dependencies and optional dependencies,
  PEP 735 `[dependency-groups]` (dev), `uv.lock`, `Pipfile` and `Pipfile.lock`. A package taken from a folder,
  git, a URL or an index other than PyPI is `local`: its name is never sent.
- **How a transitive dependency comes in** (`via`): the shortest chain of names from a direct dependency to its
  parent, from `package-lock.json`, `yarn.lock`, `poetry.lock` and `uv.lock`.
- **npm workspaces**: the dependencies of a workspace member are direct too (`package-lock.json`'s members, every
  importer of `pnpm-lock.yaml`, the `workspaces` of the `package.json` beside a `yarn.lock` — never a folder
  outside it). The patterns followed are a name, `*`, `**` and a name with one `*` (`pkg-*`); `!` leaves a folder
  out.
- **Tests of the dependency readers by rule** (for the kit's developers): one file per reader and per rule of the
  `--network` proof, shared builders (`test/tools/locks.mjs`, `test/tools/deps-apps.mjs`), every "nothing sent" a
  minimal pair; a corpus of lock files written by npm 11 and uv 0.11 themselves (`test/fixtures/locks/`) checked
  against each tool's own reading of its lock (`test/tools/regen-locks.mjs` rewrites the readings); growth measured
  in one file only (`assertLinear`, `test/tools/growth.mjs`); the mutants of the readers in `test/mutations/`, run by
  `npm run mutate` (RULES.md M16), each one still finding its code checked by `npm test`; property, metamorphic
  and fuzz tests of the lock proof on generated locks (`test/tools/fuzz/`, a fixed seed in `npm test`, random
  seeds in `node test/tools/fuzz/soak.mjs`).

### Changed

- **A lock file without a root entry of its own takes its direct dependencies from the manifest beside it**
  (`yarn.lock` and `package-lock.json` v1 from `package.json`, `poetry.lock` from `pyproject.toml`,
  `Pipfile.lock` from `Pipfile`): they were all `direct: false`. `dev` is now a dev only dependency.
- **A range is never a version**: a `package.json`'s or a Poetry `pyproject.toml`'s range (`^18.2.0`) is now
  `version: null` and `spec` as written (as the other manifests already did); a `package.json` dependency taken
  from a folder, a workspace or git is `local`. A pin `==1.*` or `===1.0` is no exact version. Run
  `doc-kit facts --source dependencies` again.
- `--network`: one request a package, however many manifests name it (a PyPI name compared as PEP 503 says:
  `My_Lib` and `my-lib` are one package, in the page of the dependencies, the health view and the outdated count
  too).
- A Pipfile.lock as Pipenv writes it (`hashes` in every entry) is read without taking its packages for local ones
  (none is sent: a Pipfile.lock proves nothing, see Security); hashed and
  continued requirements (`pip-compile --generate-hashes`), PEP 508's `name (>=1.0)` and Poetry's older
  `allows-prereleases` are read.
- The page of the dependencies (`new --prefill`) lists a package once, with the exact version of its lock file, else
  the range its manifest declares; the health view counts packages, not items. The number of outdated
  dependencies reads a range only when it names the major in use (`^`, `~`, `~=`, `==`), never a lower bound, and
  takes the exact version of a lock file first.

### Fixed

- **Playwright 1.64.0** (Chromium 156), from 1.60.0: `ubuntu-latest` is Ubuntu 26.04 since 2026-10-19, for which
  Playwright 1.60 installs no Chromium (`npx playwright install --with-deps chromium`, in the CI templates
  `ci/github-actions.yml` and `ci/azure-pipelines.yml`, failed before any test); 1.64 has one. The fixed renderer of
  `standard/captures.md` is `mcr.microsoft.com/playwright:v1.64.0-noble`. Run `npm ci`, then
  `npx playwright install chromium`.
- The PEP 508 reader (`requirements*.txt`, now `pyproject.toml`) was cubic on a run of spaces followed by a line
  ending (a carriage return, U+2028): a 2 KB file took five seconds. The ReDoS test now tries each dependency
  pattern with a line ending after its run.
- A TOML multi-line string (`"""…"""`) is text: a section written in it no longer moves the entries after it.
- A `package-lock.json` v1 nested thousands of levels deep no longer stops `doc-kit facts` (its dependencies are
  walked with a stack of their own, in the same order).

### Security

- **`--network` sends a name only when a lock file proves its public registry served the package**: a
  `package-lock.json` or Yarn 1 `yarn.lock` entry resolved to that package's own tarball on npm's registry (an
  alias proves nothing, nor does another entry of the name resolved to another package's tarball or written without `resolved` — a
  bundled copy apart —, whatever the order of the lock's keys; a `yarn.lock`
  proves only when written as a whole as Yarn 1 writes one — no lone carriage return, no blank or comment line
  inside a block, no berry metadata, no git conflict marker, no string left open on its line, no backslash — and a name only when every
  block naming it does and no other name of the lock goes into the same folder (`corp-lib.`, `Corp-Lib`), each in
  Yarn 1's own form), a `poetry.lock` entry with no other source (read in any TOML form; a lock holding an
  array of tables other than `[[package]]` proves nothing), a `uv.lock` entry from PyPI's registry whose files
  are on PyPI's file host (`public: true` on that item); the TOML locks are read by the decoded path of each value,
  as their tools read them (`[["package"]]`, `[package . sdist]`, an escaped key or value — a name that is no
  one-line string is a doubt); a package-lock proves nothing when one of its locations is not written as npm
  writes them, read as npm resolves them — a v1 link that may bring dependencies onto the root's (counted at every
  place npm may put them), a link to `~`, an absolute path or a drive, two locations a case-insensitive filesystem
  reads as one or a Windows 8.3 short name, a `packages` npm refuses — (a `file:` link outside its folder,
  `../shared`, is npm's own form and keeps its proofs), and so does a lock in UTF-16 (its tool reads none); a TOML lock with what TOML and
  its tool refuse (a key given twice under one header or in an inline table, a table defined twice in one block, a table over an array of tables, what
  no value holds inside an array or an inline table, a control character or a lone carriage return) an escape it does not know, a key with no value or a value
  followed by more, a bare key holding a blank, a `[[package]]` with no name) or a key or a table name over 1,000
  characters as written (what it holds is left out) proves nothing; a `poetry.lock` or a
  `uv.lock` that is not valid UTF-8 is unreadable. A name known only from a manifest, a
  `pnpm-lock.yaml`, a Yarn berry lock or a `Pipfile.lock` (Pipenv's mirror is not written in it), or a name its
  registry cannot hold (`café`, `_corp`, `corp-`: a forged proof), is never sent: `unproven:
  true`, `exists: null` — wherever its private registry is declared (a CI file, a Dockerfile, a monorepo's root, the
  first team's `~/.npmrc`). The declarations of private registries below stay, as a second net; Poetry's PyPI
  mirror plugin, whose mirror no `poetry.lock` names, is one of them (`POETRY_PYPI_MIRROR_URL`, its table in
  Poetry's configuration or a project's `poetry.toml`, a `pyproject.toml` that requires it: every pip package
  private). A lock whose URLs name the public registry while the installs go through a registry declared nowhere
  the kit reads (npm's `replace-registry-host`) is a limit, written in SECURITY.md.
- **A name stays private through the new manifests**: every package a `[tool.uv.sources]` names, whatever its form
  and in any `pyproject.toml` of the application (the root of a uv workspace names its members' sources), a
  uv.lock workspace member, PDM's and Rye's own indexes, a yarn.lock block taken from a folder, a package-lock.json
  v1 entry from a private registry, and the folder (`./`, `../`, `/`, `~/`, a drive) and git (`git@host:`,
  `gitlab:`, `bitbucket:`, `gist:`) forms of a range, a spec `.`, `..` or `c:lib` (npm reads them as folders), an
  archive (`corp-1.0.0.tgz`) and an npm alias (`npm:@corp/ui@^1`) are never sent. The manifests read beside a lock are read in
  its folder only: never through a link, never a folder the facts skip, never an unusual file; the workspace
  patterns are compared with the folders listed, never resolved: three folders deep, 2,000 folders, 50 patterns of
  8 segments, 100 characters a segment, 200 members; a manifest read beside a lock is 4 MB at most.
- **One TOML reader for the private declarations**: `pyproject.toml`, `Pipfile`, `uv.toml`, `bunfig.toml` and
  Poetry's configuration are now read by the reader of the manifests, each value by its full dotted path. A comment
  after a header (`[[tool.uv.index]] # corp`), an inline table (`[tool.uv]` `sources = { … }`, `index = [{ … }]`) or
  a quoted name with a dot (`"corp.lib"`) no longer hides a source or an index; uv's and pip's `find-links` count as
  an index (in requirements files and the files they include, `pip.conf`, `[tool.uv.pip]`, `uv.toml` `[pip]`,
  `PIP_FIND_LINKS`, `UV_FIND_LINKS`).
- **Allowlists, not lists of forms**: a Poetry or Pipfile dependency with a field that is not a registry's (`path`,
  `git`, `develop`…, in any TOML form: `name.path = …`, a quoted field) is local; a uv.lock package is public only
  from PyPI's registry; any npm protocol but `npm:` is local; and behind every reader, a range or a pip version
  holding anything but a release's characters is never sent, and its name is private in every manifest.
- **Fail closed on what the kit cannot read**: a TOML file left open (a string, a bracket) makes every package of
  its ecosystem private; a requirements option off a short allowlist is an index (pip's abbreviations, `--index`,
  `--find`, included); the person's `pip.conf` keys are read as pip reads them (`index_url`, `Index-Url:`); `.npmrc`
  and `.yarnrc` are read key by key (a quoted key, a registry key not followed); a byte order mark hides no first
  line; a triple-quoted string ended by four or five quotes, or holding an escaped quote, is read as TOML reads it;
  every npm `npm:` spec is an alias (as npm reads them; berry's explicit `npm:^1` too). A TOML key whose `=` sits
  in quotes, every option of a requirements line (its continued lines joined), an `.npmrc` key npm decodes or that
  loads another file (`userconfig`, `globalconfig`), and the `.yarnrc.yml` forms the kit does not follow no longer
  let a name out; a UTF-16 requirements file is read. A requirements file is read as pip's `preprocess` reads it
  (a comment line ending with a backslash continues nothing), every line break the tools read is one, TOML 1.1's
  `\xHH` escapes are decoded in a key, uv's `override-dependencies` and `constraint-dependencies` from a URL, a
  package-lock alias, `YARN_REGISTRY`, `PIPENV_PYPI_MIRROR` and `$XDG_CONFIG_HOME/.bunfig.toml` keep their names
  private.
- A chain (`via`) through a name that looks like a secret, and such an extra, are never kept.

## [0.4.0] - 2026-10-21

### Added

- **The demo declares its features** (`examples/demo-docs/features.json`, coverage adapter `features`: 2/2), and its facts
  are read again with every source of this version (`stack`, `behaviours`, `infra`, `quality`, `security`, `modules`…),
  so that `context`, the analyses and the depth loop run on it end to end.
- **The DAT and the code** (ARCHITECTURE.md §6.19): `doc-kit inputs reconcile` compares the technologies and the
  addresses each ingested technical architecture document names with the facts of the code — found in the code,
  said by the DAT without a trace, in the code but not in the DAT — into `.doc-kit/inputs/reconcile.json`, from a
  registry of 55 technologies (`standard/technologies.json`). The skill's brief `architecture-reconcile` checks this
  first pass and writes the page of the gaps between the DAT and reality.
- **The method uses the analyses** (the skill, ARCHITECTURE.md §6.11a): a scoping question "How detailed?"
  (essential, standard, detailed: `extra.briefs.level`); phase 4b, one analyst per feature, then its digests; phase
  5b, the depth loop (`analysis.mjs depth`, `deepen` on haiku, a second analysis on what is missing, at most two
  rounds, then the open questions for the product owner). `functional-spec` writes each sheet from its Product
  digest; `inventory` gives each feature its size, its epic and the behaviours to document in depth; `triage` may
  decide `deepen`; the orchestration reference shows the words and proofs the sober method had lost.
  `analysis.mjs depth` ends the loop (✔) when nothing is left to deepen or to analyse again, prints each feature
  with its page, and `--reset [<feature>…]` starts a new loop.
- **The analyst agent and its briefs** (ARCHITECTURE.md §6.11a): a fourth agent type, `doc-kit-analyst`
  (sonnet), runs the new brief `behaviour-analysis`: one feature traced in the code, its analysis written and checked,
  the reading budget by its size (S, M, L) and the content by the level of detail (essential, standard, detailed).
  `feature-mechanism` writes a feature's technical counterpart from the Develop digest; `deepen` (haiku) adds to a
  sheet what the depth loop found the analysis answers. The briefs exist in English and French; `doc-kit skill
  install` copies the new agent.
- **The analyses of the features** (ARCHITECTURE.md §6.11a): the format `doc-kit/behaviour-analysis@1`
  (`.doc-kit/analysis/<feature>.json`: each item its text for a reader without the code, its mechanism, a status —
  verified, deduced, unknown, n/a — and its proofs), and the skill's `scripts/analysis.mjs`: `check` (a proof
  outside the application folder refused without being read), `digest` by reader (no mechanism, no proof, no
  finding for Use and Product), `questions` for the product owner, `findings`, and `depth`, one round of the depth loop from
  `audit.json`, whose depth report now says what is open in each sheet (`gaps`). `brief.mjs --estimate` reads a
  brief's `output-tokens` by size (`--var size=S|M|L`).
- **The spaces at `init`** (ARCHITECTURE.md §2.1): `doc-kit init --spaces <id,…>|none`, or the question "Who is the
  documentation for?" — the four spaces (default), users and product, a takeover (administer and develop), users
  alone, or none. The skeleton keeps the sections, pages and journeys of the spaces chosen; with Develop but not
  Administer, the Operate section goes to Develop; with none, one documentation without spaces. The skeleton has one
  journey per audience. The recap and the JSON output show the spaces. The skeleton's writing moves to
  `engine/dev/skeleton.mjs`.
- **A better search** (ARCHITECTURE.md §6.1a): the tables the kit generates and each page's summary are indexed; a
  word in a title before one in the text, its start before its inside; a word the documentation does not hold is
  read as its close words (a typo), said above the results; with spaces, **Search in: All · Use · …** keeps the
  results of one space. The scoring is a module of the site (`engine/site/lib/search-core.js`). On the home in
  "everything" mode, the journeys are grouped by audience.
- **Topic groups** (ARCHITECTURE.md §6.1a): a page's `counterpart` may name a list of pages; the pages it joins,
  either way, form one group, declared once and shown on each: "This topic for: Use · **Product** · Administer ·
  Develop" under the page's badges, the page read marked (without spaces, "Related:" and the titles). `context`
  lists the group's other pages and `sync` follows their files. The site data `pages[].counterpart` becomes
  `pages[].topic`; the texts `ui.counterpart*` become `ui.topic*`; the line is a module of the site
  (`engine/site/lib/topics.js`).
- **The depth of the feature sheets in the audit** (standard/maturity.md): `featureSheets` (every written feature
  sheet has a user story, level 3), `scenarios` (≥ 80 % of their stories have acceptance criteria, level 4) and
  `behaviourDepth` (≥ 90 % of the rubrics of their behaviour cards are answered, level 4), measured on the backlog
  of the strict build; `n/a` without a written sheet, or with spaces declared but no Product space; by space, in
  the Product space only. The actions name the sheets and stories; `audit.md` shows the depth of each feature and
  the backlog in one line (`audit.json` `depth`). New kind flag `depth` (`standard/spaces.json`). A project with
  feature sheets may reach a lower level than before: its sheets' stories, criteria and rubrics now count.
- **The backlog export** (ARCHITECTURE.md §6.8b): `doc-kit backlog export <azure|jira|github|gitlab|json>` writes
  the epics, feature sheets and user stories, with their acceptance criteria, in the import format of Azure DevOps
  (CSV, the types of `backlog.azure.process`), Jira (CSV, `backlog.jira.types`), GitLab (CSV), for GitHub (the
  issues as JSON and how to create them with `gh`) or as JSON (`schemas/backlog.schema.json`). What the tool
  already holds is left out (`--all`); an error of the backlog refuses it; a line where a secret detector fires is
  replaced; formulas, mentions, references and quick actions are inert. New keys `backlog.docUrl`, `backlog.idInTitle`, `backlog.azure`,
  `backlog.jira.types`, `backlog.github.types`. No network, no token.
- **The Product board** (ARCHITECTURE.md §6.8b): the home of the Product space shows the backlog of the feature
  sheets as a story map (epics in columns, their features as cards with a depth gauge, a row of user stories per
  version) or a list (Epic › Feature › Story), with filters (who, epic, version, depth, text); `::board{}` (fr
  `::tableau{}`) shows it in any page. A feature's rules now count those it cites. The site's script takes modules
  (`engine/site/lib/`); the demo's Product space has two epics.
- **The backlog** (ARCHITECTURE.md §6.8b): a group of feature sheets in `toc.json` can be an epic (`epic`,
  `summary`, `ref`); a feature sheet gives `since`, `ref`, `epic`; a story's ticket reference (`ADO#1234`, `AB#1234`,
  `PROJ-123`, `owner/repo#42`, `group/sub/project#7`) is a link with `backlog.refs`; `::stories{}` (fr `::recits{}`)
  lists every user story; one measure of a feature's depth. New checks `epic.duplicate`, `epic.unknown`,
  `story.outside`, `backlog.ref`, `backlog.field`.
- **Where the application runs** (ARCHITECTURE.md §6.9, §6.11): `::c4{view="deployment"}` (fr `vue="deploiement"`)
  draws the deployment view from `facts/infra.json` — one column per environment with its entry points, workloads,
  jobs and cloud resources, the pipelines that deploy to each, and a row per element with its settings and its
  `file:line`. `doc-kit new <page> --template runbook --prefill` fills its scheduled jobs, each with its
  `[[verified file:line]]` proof; `doc-kit context` gives a runbook what the infrastructure declares, by environment
  (a page type's new `digests`).
- **What the infrastructure declares** (ARCHITECTURE.md §5, §6.9, source `infra`): `doc-kit facts` reads the
  Dockerfiles, Terraform, Bicep, ARM and CloudFormation templates, Kubernetes and OpenShift manifests, Helm charts,
  Compose files, GitHub Actions, GitLab CI and Azure Pipelines, and Ansible playbooks: their cloud resources and
  modules, workloads, services and ingresses, images (and their tag), environments and jobs, with a few settings
  (replicas, ports, whether it runs as root, TLS, open to all) and the names of their variables — never a value or a
  secret. A project adds its own with `infra.adapters` and turns one of the kit's off with `infra.disabled`. Shown with
  `::facts{source="infra"}`; new brick `facts.infra`.
- **Thirteen more stacks read** (ARCHITECTURE.md §5): the API routes and their guards of NestJS, Spring (Java,
  Kotlin), ASP.NET Core (controllers and minimal APIs), Laravel, Symfony, Django and Django REST framework, Flask, Go
  (net/http, gin, echo, chi, gorilla/mux), Ruby on Rails and Rust (actix-web, axum); the screens of the Angular, Vue
  Router and React Router routers; the behaviour hints of Spring Data, Bean Validation, EF Core and DataAnnotations,
  Eloquent and Laravel validation, Doctrine and Symfony constraints, class-validator, gorm and ActiveRecord. Each runs
  where its stack is detected (a dependency, a file), or, in an application without a manifest of its ecosystem,
  everywhere — a declaration two adapters read is then the framework's the file names. Each route keeps 32 guards and
  each adapter 5,000 routes at most. The access of a route also recognises the user guards of these stacks (`auth`,
  `Authorize`, `AuthGuard(…)`, `authenticate_user!`, `LoginRequiredMixin`, `jwt_required`); Django's `tests.py` is a test.
- **Stack adapters, and what the kit reads of an application** (ARCHITECTURE.md §5, §6.9): the routes of the API,
  their guards and the screens of a framework are read by **stack adapters** (`adapters/stack/`: `next`, `express`,
  `fastapi`, the readers of 0.3 moved there and hardened). A project adds its own with
  `stacks.adapters: ["local:adapters/x.mjs"]` (a file of the documentation project, never of the application) and
  turns one of the kit's off with `stacks.disabled`. Two new facts sources: `screens` (the pages of the Next.js App
  Router and Pages Router, the routes of the front-end routers) and `stack` (the stacks and low-code platforms the
  application uses — Power Apps, Power Platform, OutSystems, Mendix, Salesforce are detected, never read — and each
  language of its code with its files and lines, and whether the kit reads it). What the kit does not read is told:
  `doc-kit inputs status` shows the part of the code read, and the context of a page tells its agent which code to
  read itself. `standard/adapters.json` lists the languages and adapters; the documentation's new page **What the kit
  reads** is generated from it. The `facts` coverage adapter cites the screens, and the files of a route let sync
  follow its code. New bricks `facts.screens` and `facts.stack`.
- **The dependencies of seven more ecosystems** (source `dependencies`): Maven and Gradle (`pom.xml`,
  `build.gradle`, `build.gradle.kts`, `libs.versions.toml`, `gradle.lockfile`), NuGet (`*.csproj`, `*.fsproj`,
  `*.vbproj`, `Directory.Packages.props`, `packages.config`, `packages.lock.json`), Composer, Go modules, Bundler and
  Cargo — each file read on its own, offline, with what it says itself of each package: its exact version (else the
  constraint as written), whether it is direct, a development one, or not from the public registry. An XML manifest
  that is not well-formed is listed (`unreadable`, reason `xml`). The `vendor/` and `target/` folders are never
  read as manifests.

- **What the code says of each behaviour** (ARCHITECTURE.md §6.9, source `behaviours`): `doc-kit facts` now reads how
  the features behave — how a list is searched (contains, starts with, case ignored, accents, full text, a search
  engine), filtered, sorted and paged, which fields a form checks (required, bounds, pattern, email), the lists of
  values offered, what triggers a search (each keystroke, a delay, a button), the data scope of a query, the exports,
  imports, notifications and scheduled jobs — in an array's `.filter`, Prisma, TypeORM, Sequelize, Mongoose, Drizzle,
  Knex, SQL, Django and DRF, SQLAlchemy, FastAPI, Flask, zod, pydantic, HTML and JSX forms, TypeScript and Python
  enums, and OpenAPI documents. Hints, each from one line of the code; tests, comments and files over 512 KB are
  never read, and what is kept of the code goes through a whitelist (names, numbers, short tokens and lists). A
  feature of `features.json` can name its code (`sources`) and the kinds of card its sheet describes (`behaviours`,
  deduced by `inventory --features`); `doc-kit context` then gives a feature sheet that code — the handlers of its API
  routes and what they import two levels deep — and a part **Behaviours to describe**: the hints, and the cards to
  write with their rubrics. New brick `facts.behaviours`.
- **Feature sheets in depth** (ARCHITECTURE.md §6.8a): a sheet is now a specification a product owner can check
  against the application. Its new sections: User stories, Behaviours, Fields and inputs, States, Messages, Rights
  by action, Acceptance criteria, Open questions (template `feature`, 9 required sections of 14, 4,000 words, a
  context budget of 24,000 tokens). Three new blocks, in English and French:
  - `:::behaviour{kind title id}` (`:::comportement{type titre}`): a **behaviour card**, one `Rubric: value` line per
    rubric of its kind — 13 kinds in `standard/behaviours.json` (search, filter, sort, pagination, list, form,
    import, export, calculation, notification, workflow, scheduled job, permission check), each with the questions a
    reader asks (a search: the fields searched, the matching, case and accents, several words, the trigger, the
    order, no result, the rights). "n/a — reason" and "unknown — question" are answers; a required rubric left out
    is shown as missing and reported (`behaviour.missing`, an error with `behaviours.strict`). A project adds its own
    kinds with `behaviours.file`;
  - `:::story{id title role since ref}` (`:::recit`): a **user story**, with its role, its version, its ticket and the
    number of its acceptance criteria; cited with `[[story US-01]]` (`[[recit …]]`);
  - `:::scenario{title story behaviour}`: an **acceptance criterion** in Given / When / Then (Soit / Quand / Alors),
    linked to its story and its card.
  The demo's two sheets are rewritten from the demo application's code, and the kit's example sheet shows every
  part. "Main scenario" still counts as "Main path". `doc-kit context` gives each page the context budget of its template
  when `--budget` is not given.
- **The sources of a project** (ARCHITECTURE.md §6.19, `inputs.json`): what the kit reads besides the code of
  `app.dir` — other code (folders or **shared repositories**: GitHub, GitLab, Azure Repos), the infrastructure
  code, the application online by environment, the documents a team already has (a **technical architecture
  document** in Word, PDF, Markdown, diagrams; Confluence or SharePoint pages by their address), collaborative
  spaces and the backlog. `doc-kit init` asks for them (optional), `doc-kit inputs add` declares them,
  `doc-kit inputs` shows their state. `doc-kit inputs fetch` clones or updates the repositories into
  `.doc-kit/inputs/repos/` with your own git credentials (never a token in the kit), every clone hardened from its
  creation; `doc-kit inputs ingest` converts the documents into text for the documentation agents
  (`.doc-kit/inputs/docs/`), secrets removed, with the kit's own bounded readers (ZIP bombs, XML entities and macros
  refused or never expanded; SECURITY.md). A page given by its address is read by the skill through the session's
  connectors (Claude Code, Claude Cowork), never by the kit. New bricks `inputs.repos` and `inputs.docs` (preset
  `inputs`), needed by the facts; the skill asks for the sources at the cadrage and checks a DAT against the code.
  RULES.md S2 now allows `clone`, `fetch` and `checkout`, in `engine/inputs/repos.mjs` only.
- **Bricks** (ARCHITECTURE.md §6.18): `doc-kit bricks` gives the state of every part of the project that can be
  run again on its own — each facts source, the external tools, the documentation audit — and why ("read at commit
  939ed0c; the application is at 24b882c", "written by kit 0.1", "never produced"); `doc-kit bricks <id>` shows one
  brick (or the bricks of a preset); `doc-kit bricks run [<id|preset>…]` runs again only what you name, or every brick out of date with
  `--stale`, in the order of their needs (`--deps`, `--force`), the facts read in one run. The bricks are data
  (`standard/bricks.json`); `bricks.enabled` / `bricks.disabled` in `doc.config.mjs` choose them.
- **Developer views** in the site, drawn from the facts at build time (`engine/build/developer.mjs`):
  - `::modules{limit}`: the import graph, its cycles, the files most depended on and the orphan files;
  - `::hotspots{limit}` (`::points-chauds`): the files that change most often and are the most complex (git
    history × quality measures), with their main author and the bus factor;
  - `::health{}` (`::sante`): the state of the application in one view, then its main risks.
  - `::c4{title}`: the container view (users, front end, API, database, external systems such as Stripe or
    OpenAI), deduced from the dependencies, the environment variables and the tables, each with its evidence.
  The `code-map` and `maintainability-review` page templates use them instead of raw `::facts` tables and of a
  hand-drawn context diagram.

- **`doc-kit pack`**: the files the next AI working on the application needs, written in the documentation project:
  `llms.txt` (the outline of the documentation), `llms-full.txt` (all of it as Markdown, without the guidance
  comments), `AGENTS.md` (the application from the facts: stack, commands, environment variable names, data, API,
  tests, tooling, risks, hotspots, existing agent instructions) and `CLAUDE.md` (`@AGENTS.md`). A line where a
  secret detector fires is removed and reported (exit code 1).

- **Guardrail tests for the kit's own code**: `test/unit/layers.test.mjs` now checks RULES.md M1 (the engine never
  imports `cli/`, never calls `process.exit`, never prints); `test/unit/sizes.test.mjs` holds every JavaScript file of
  `engine/`, `cli/`, `adapters/` and `skill/` at 600 lines or fewer, and the four files already over it at their
  current size (a ratchet: they may only shrink);
  `test/unit/skill-briefs.test.mjs` checks the skill's coherence (briefs in English and French with the same front
  matter and placeholders, agent types used and named in their descriptions, routing equal to SKILL.md's model
  table) — new rule M15. The neutrality scan now also reads `.claude/agents/`, `CLAUDE.md`, `RULES*.md` and `AUDIT.md`.
- **Agents for the kit's own development** (`.claude/agents/`): `kit-reviewer` (read-only review against RULES.md,
  security first), `kit-test-author` (tests that follow the repository's patterns), `kit-skill-editor` (one change
  to the skill's texts, everywhere they live). See CLAUDE.md.

### Changed

- **The README says what 0.4.0 brings** (English and French): the four spaces, the feature sheets and their
  behaviour cards, the Product board and the backlog export, the facts of 16 stacks and 12 infrastructure formats,
  the sources, the bricks and the skill, and 31 page templates; a test ties these numbers, and those of the docs,
  to the kit's.
- **The analyst writes its file once, and finds what it names in its context** (measured in the pilot of 0.4.0,
  docs: skill/cost-and-speed, `references/agent-orchestration.md` §8): `behaviour-analysis` writes the analysis
  with Write, then corrects it with Edit (`doc-kit-analyst` gains the Edit tool), never through the shell, even
  where the session suggests it; the context's cards give each rubric's id (Matching, `match`), and the kind's id
  after its French spelling (`recherche` = `search`), so the analyst no longer opens the registry of kinds for
  them; each security fact of the context is a finding to check. Two features of size S cost 71,000 to
  165,000 token-equivalent each, 2 to 5 times their estimate; the total Claude Code reports when an agent ends is its
  last context (a sixth to a third of the tokens used), so the spend is taken from the transcripts. Run
  `doc-kit skill install --force`.
- **The access of a route recognises more user guards by default** (`review.guards`, ARCHITECTURE.md §6.13): besides
  `current_user`, `authenticated`, `login_required`, `require_auth`, `session` and `token`, a guard named exactly
  `auth` or `auth:<guard>`, `Authorize`, `RequireAuthorization`, `AuthGuard(…)`, `authenticate` or `authenticate_user!`, or
  holding `LoginRequired` or `jwt_required`, is a user guard. An Express middleware named `auth`, and a Next.js
  handler that calls `auth()`, were `unknown` in 0.3 and are now `user`: `facts --source api` shows the change. A project
  keeps its own patterns with `review.guards`.
- **A route's secret segment is masked**: a segment of a route that looks like a key or a token (a webhook's path) is
  written `…` in `facts/api.json` and `facts/screens.json`.
- **`check secrets` finds Stripe keys**: a secret or restricted key (`sk_live_`, `sk_test_`, `rk_…`) and a webhook
  secret (`whsec_`) are cloud keys, found in the code and never kept.

- **Four spaces, one per audience** (ARCHITECTURE.md §6.1a, `standard/structure.md`), instead of `business` and
  `takeover`: `use` (the users, screen by screen), `product` (the product owners: features, rules, process),
  `admin` (the administrators and operators: settings, access, operations, the technical architecture document)
  and `develop` (the developers, the takeover team, security). What the kit does for a space is its **kind**,
  data in `standard/spaces.json`, never its id: no code in `use` and `product` (`business.technical`), the
  glossary's technical correspondence in `admin` and `develop` (also in their exports), `file:line` proofs and
  the takeover pages of the audit in `develop`; the required takeover pages are spread — the technical
  architecture document and operations in `admin`, the five others in `develop` — each looked for and suggested
  in its own space, and `takeover4` of a space counts only its own. A space of the project's own declares its
  `kind` (`space.kind`, error, without one); the spaces `business` and `takeover` of 0.3 are no kind
  (`space.kind`): no migration, a project of 0.3 is started again. Site data `spaces[]` gains `kind` and `tech`; exports are named
  after the new ids (`…-use.html`). New projects (`doc-kit init`) and the demo declare the four spaces.
  The takeover dossier of the audit moves to `engine/audit/takeover.mjs`; the lint warning ceiling goes down to 55.
- **Internal, no change of behaviour**: the facts sources are listed by `engine/facts/registry.mjs` (the
  command reads it); the freshness of the facts files is computed once (`engine/facts/freshness.mjs`, used by `sync`,
  `doctor` and `audit`); every request to a public registry goes through one gateway, `createRegistryClient`
  (`engine/facts/network.mjs`), which refuses a private package itself and whose 5 s timeout now also covers reading the answer, as it did before
  for the latest version (new rule S12); the dependency readers are
  split by ecosystem (`engine/facts/deps/`); the directives drawn from the facts leave the Markdown engine
  (`engine/build/fact-directives.mjs`, one function per directive); `withoutSecrets` moves to
  `engine/check/secrets.mjs`. The lint warning ceiling goes down to 56. Visible only in `--profile` and the usage
  records: the time of the `dependencies` source now includes its `--network` existence check.
- **`facts/tool-<name>.json`** is now `{ tool, generator, generated, commit, app, status, reason?, code?,
  truncated?, items }` (normalised items) instead of `{ tool, generator, generated, installed, ok, data }` (the raw
  report). `status` (`ok`, `findings`, `failed`, `missing`) comes from each tool's exit codes and items: a tool that
  found something was reported as failed, semgrep's findings and syft's inventory as "nothing found". Run
  `doc-kit facts --tools` again to rewrite these files.

### Removed

- **The legacy French-keyed formats and `doc-kit migrate`** (ARCHITECTURE.md §6.7): projects start again from
  `doc-kit init`. The kit no longer reads `sommaire.json`, `glossaire.json` or `accueil.md` (only `toc.json`,
  `glossary.json` and `home.md`: a `sommaire.json` alone is `toc.missing`), nor renames the French keys of the
  table of contents, the glossary, the zone files and the capture plans (`titre`, `groupes`, `fichier`, `libelle`,
  `clic`…): each one is now an unknown key reported by the schema (ignored in a zone file, whose required keys are
  then missing). The `legacy.read` warning, `engine/project/legacy.mjs` and `doc-kit migrate` (now an unknown
  command, exit code 2) are gone; folder names stay free through `paths`, and the Markdown keeps its French spelling.

### Fixed

- The security test could not see a quadratic scanner on a fast machine: on GitHub's Linux runners its canary (a
  scanner written to be quadratic) took 10 ms at 16 times its input, under the 20 ms from which a growth is trusted,
  and the test failed there — a real quadratic scanner would have passed unseen the same way. A step that short
  which may hide a quadratic growth (it looks quadratic, or the size below was too fast to measure) is now measured
  on an input 4 times longer, up to 256 times, until it can be trusted; a scanner whose steps stay under 6 times
  still stops at 16 times (`test/tools/growth.mjs`, tested on a clock the test plays). SECURITY.md writes the limit
  that stays: a scanner whose linear part outweighs its quadratic part at every size measured.
- `usage.mjs scan` counted an API response once per line of the transcript — Claude Code writes one per block of a
  response, each repeating its usage — and kept the partial output count a transcript records for a response that
  calls a tool: in the pilot of 0.4.0, 620,529 tokens for 416,653 used. Each response now counts once, even across
  files, and its output at least what it wrote (characters ÷ 4: `output_estimated` in the entry, and a line of its
  own). The statistics hook does the same through the same module (`scripts/transcript-usage.mjs`); its line holds
  `tokens.outEstimated` when the estimate counts. `report` no longer adds the agents' logged totals (each one's last context) to
  a scan of the same work: with a scan, its total is the scans', the logged floor shown apart (`--json`: `logged`,
  `scanned`).
- The skill and the docs said the agents of a wave share the brief's common part through the prompt cache. Measured,
  they do not: the brief travels in one message with its variables. What an agent launched after another reads from
  the cache is the part before it (its definition and Claude Code's tools, 23,000 to 24,000 of its first 37,000 to 38,000
  tokens), which agents launched together each write again. The skill now launches the first agent of a wave alone
  and the others in the next message, and `brief.mjs` says so.
- `npm run test:security` ran the security tests with a bare `node --test`: their ReDoS checks, which measure
  time, had no second run when a measure was noisy, unlike under `npm test`. It now goes through `test/run.mjs`,
  which takes one file as it takes a folder.
- `doc-kit new --help` listed the 13 general page types for `--template`, while `new` accepts the 31 of the
  standard; the glossary, the reference and the summary of "Page templates" said 13 as well. They now say 31 (a test
  ties the help to the number of types).
- `references/method.md` said a writer only receives "Read the brief and carry it out": it receives the brief's
  full text, as SKILL.md says.
- `check coverage` (adapter `features`): a feature id is cited only whole — a page citing `F-010` no longer
  covers `F-01`.
- A `[[rule …]]` chip inherited the frame and the bottom margin of a rule's own block: in a numbered step, it drew a
  bar on its left and pushed the next step down.
- `doctor` reported the skill's agents as current when the kit had added an agent type that was not installed: they
  are now outdated (`doc-kit skill install --force`).
- The descriptions of the `doc-kit-writer` and `doc-kit-reviewer` agents now name every brief they run
  (`capture-plans`; `inventory`, `code-health`, `security-review`, `findings-verification`,
  `production-technical`), and SKILL.md no longer says `findings-verification` runs on `opus` (it runs on
  `sonnet`, as the routing says). Run `doc-kit skill install --force` to update the installed copies.
- `facts --source security`: the `code.eval` rule reported every `pattern.exec(text)` of JavaScript (a regular
  expression) as a high-severity code execution: 131 findings on the kit's own code, 24 after the fix. A method
  `.exec(` now counts only in a file that loads `child_process` (and never right after a regular expression
  literal); `eval(`, Python's `exec(` and `new Function(` are still reported.

### Security

- **The usage scripts keep nothing of a transcript's text** (SECURITY.md): `usage.mjs scan` and the statistics hook
  keep counts, the time span and the model's name only when it reads as one (letters, digits, `. _ : @ -`, at most
  100 characters; any other value is dropped); a block of a response is told apart from its copies by a digest. The
  hook's limit is written: it loads the documentation project's `doc.config.mjs` to read its version, so installed
  in your user settings it runs in every session — keep it to the projects you trust.
- **A token in a dependency's address was kept**: `facts --source dependencies` stored a git dependency of a
  package.json as written (`"x": "git+https://user:TOKEN@github.com/…"`) in `facts/dependencies.json`, and likewise
  a requirements line (`y @ git+https://user:TOKEN@…`). The user and password of an address are now removed from
  every version and constraint kept, of every ecosystem, and a value a secret detector of the kit finds is not kept.
- **A crafted file blocked `facts --source api`**: a file of route calls never closed (`app.get(` written 32,000
  times, 256 KB) took more than three minutes to read, and 32,000 FastAPI decorators more than twelve seconds — each
  call was read to the end of the file, each line counted from its start. The routes are now read by the stack
  adapters, which read each call once (4,000 characters at most), find a line by a binary search, and never read a
  file over 512 KB, a test or a generated file (the same file: a few milliseconds).
- **The `sources` of a page could reach outside the application**: a glob of toc.json such as `../.env` put a file
  of the documentation project — or any secret file — whole into the page's context file for an agent. The globs of
  `sources` (a page's, and now a feature's in features.json) are now confined to `app.dir`, files only, never an
  `.env` or a key — under any name Windows gives it too (a data stream `.env::$DATA`, a short name `ENV~1`).
- **Crafted text slowed three scanners down quadratically**: `facts --source api` (a long run of letters before
  `= APIRouter(`), the pydantic settings of `facts --source env` (a class followed by many blank lines, or a field
  line with blanks after its colon), and the secret detector of an address with credentials (a long run such as
  `a-a-a-…`, read by `check secrets` and by the credential check of the sources). Their expressions are now anchored
  and bounded, and the ReDoS test measures growth: a scanner more than eight times slower on an input four times
  longer fails, measured at 4 and 16 times the size, with a canary written to be quadratic that it must catch.
- **A git setting written on its section's line was not seen** by the check that keeps git from running a
  program named in an untrusted repository (`[core] fsmonitor = …`, `[include] path = …` on one line, or after a
  lone carriage return): git reads it, and the kit now does too (`parseGitConfig`, `riskyGitConfig`).
- **`facts --source quality --network` sent the names of private packages** (an npm scope with its own registry, a
  private pip index, workspace and local packages) to npm and PyPI while looking up their latest version: it now
  goes through the same `isPrivatePackage` check as `dependencies --network` (AUDIT.md S13).
- **More private names were sent and no longer are** (`dependencies` and `quality --network`): PEP 508 direct
  references (`name @ file:…`, `name @ git+https:…`), Poetry `path`, `git`, `url` and private-`source`
  dependencies, the application's own workspace packages (npm workspaces point at their siblings with plain
  ranges), packages a lock file (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) took from a private registry,
  git, a file or a link, the file name of a local archive in a requirements file, scopes declared for yarn
  (`.yarnrc`, `.yarnrc.yml`) or bun (`bunfig.toml`) — a form the kit does not follow makes every npm package
  private —, uv indexes (`uv.toml`, `UV_INDEX_URL`…), and any ecosystem other than npm and pip.
- What is private is now also read in **every folder down to each manifest** (a separate front end or a workspace
  root with its own `.npmrc` was missed), in **your own** configuration (`.npmrc`, `.yarnrc`, `.yarnrc.yml`,
  `.bunfig.toml`, pip, in every home folder — `HOME` and `USERPROFILE` can differ on Windows —, plus
  `NPM_CONFIG_USERCONFIG` and `PIP_CONFIG_FILE`), and in the npm, yarn, bun and pip variables — where a company
  usually declares its private registries. Poetry sources, uv indexes and Pipfile sources other than PyPI make every
  pip package private.
- **`osv-scanner` runs offline only** (`--tools`): its API mode sent every package name and version, private ones
  included, to osv.dev. Its database is downloaded (public files, no name sent) only with `--network`; a version it
  cannot read is never run.
- **The reports of the external tools are normalised through an allowlist** of fields: semgrep's matched lines,
  gitleaks' matches, authors and e-mail addresses no longer reach the facts, whatever a tool adds to its output.

## [0.3.0] - 2026-10-03

### Changed

- The folders of `engine/` no longer import one another in a cycle (they were build, sync, check, capture and facts).
  `engine/core/` holds what they share: `hash.mjs` (was in `sync/`), `text.mjs` and `page-templates.mjs` (were in
  `build/`), and `translations.mjs` (the translated-file state, taken out of `build/languages.mjs`). The import
  resolver moves to `engine/facts/imports.mjs` and `readProjectVersion` to `engine/project/version.mjs`.
  `test/unit/layers.test.mjs` fails on a new folder cycle (RULES.md M14).
- The data embedded in the generated site uses the key names of `toc.json` instead of French ones: `#site-data`
  (was `#donnees`), `title`, `shortTitle`, `subtitle`, `menuTitle`, `summary`, `group(s)`, `level`, `permissions`,
  `icon`, `featured`, `highlights`, `introHtml`, `homeHtml`, `order`, `search`, `journeys` (`steps`), `glossary`
  (`term`, `pattern`), `icons`, `meta.title`, `meta.product`, `meta.tagline`, `meta.stats.diagrams`. Nothing
  changes for a project: the site is self-contained. `test/tools/legacy-data.mjs` translates the data of an older
  build, so the equivalence tools still compare with it.
- `facts`: a manifest that cannot be read, a `package.json` / `package-lock.json` that is not valid JSON, or a broken
  `coverage/coverage-summary.json` is listed in the facts file's `unreadable` and reported as a warning, instead of
  being read as "no dependencies" or "no coverage".
- Direct tests for the build's text helpers and number formats (`text.test.mjs`) and for `optimize` (options,
  threshold, re-encoding).

## [0.2.0] - 2026-10-03

### Added

- **Production statistics** (ARCHITECTURE.md §6.14):
  - each command appends its time, and the time of its parts, to `usage/<version>.jsonl` in the project;
  - captures are measured part by part: navigation, wait, actions, masking, measure, shot, encoding, comparison;
  - `facts` is measured source by source;
  - `doc-kit stats` groups the lines by step, version, command, model, phase, page or actor, with `--since`,
    `--csv` and `--json`;
  - the global `--profile` option prints a run's timings;
  - `init` writes the `usage/` folder, and an older project opts in by creating it.
- **`::usage{view}`** (`::consommation`) and the `documentation-cost` page template (the 31st). They render:
  - a summary: kit, agent and human time, the number of agents and the models used, tokens, and cost from
    `llm.prices`;
  - one row per version;
  - the time per step, with each step's parts;
  - tokens and cost per model;
  - the ten slowest parts.
- **Statistics hook**: `doc-kit skill install --hooks` registers `scripts/usage-hook.mjs` on `SubagentStop` in
  `.claude/settings.json`. Each AI agent's tokens (input, output, cache), model and time are then appended to
  `usage/` automatically. The settings already in the file are kept, and the hook is never added twice.
- `llm.prices.<model>.cacheWrite` (default 1.25 × input); `cacheRead` defaults to 0.1 × input.
- **Model routing per brief**: `llm.routing` in `doc.config.mjs` overrides the skill's `DEFAULT_ROUTING`
  (`haiku`: `triage`, `translate`; `sonnet`: the writing briefs, `findings-verification`,
  `maintainability-review`; `opus`: `inventory`, `code-health`, `security-review`, `production-technical`).
  `brief.mjs` prints the model to launch with, and `--estimate` prices with it.
- **A shared prompt cache per wave**: an agent is launched with the brief's full text as its prompt, common part
  first, instead of "Read <brief>". Every agent of a wave after the first reads that part from the cache.
- **`sync --apply --auto-intact`** marks the pages whose only changes are probably intact without any agent. The
  skill's update cycle uses it, and then works only on the pages still flagged:
  - it stops when none is left;
  - triage runs on haiku, at most 5 pages per agent, with the agents in parallel;
  - each update agent handles one page, up to 8 run in parallel, and edits the page instead of rewriting it.

- **`doc-kit changes [--since <ref>]`**: what changed in the application since a git reference. It compares the
  facts committed at `<ref>` with the facts on disk: routes and their authentication, tables and columns,
  environment variables, dependencies and versions, security findings, secrets (never values), AI agent files,
  import cycles and the number of tests. It writes `.doc-kit/changes.md`, ready for a pull request comment or the
  release notes.
- **The `capture-plans` brief** (skill, sonnet): an agent drafts the capture plans of a set of screens from the
  code and the facts. It writes the frame, 3 to 8 captioned zones on stable targets and masks, then checks every
  entry with `capture --verify` and `--preview`. It never clicks in a live application, and the read-only capture
  stays the only way a page is opened.
- **`capture --verify`** replays the plans as tests. Each page is opened, its actions played, and its frame and
  zones located, read-only, but nothing is written. A screen that changed fails with the zone it could not find.
  Run it in CI against the demo, or before a release.
- **`doc-kit record <route> [--id] [--force]`**: writes a capture plan entry from what a person does in the
  browser. Playwright's recorder (codegen) opens on the application with the saved session. Clicks, typing,
  choices and keys become the entry's route and actions in `captures/plans/<id>.mjs`; the lines it cannot
  translate stay at the top of the file as comments. It is refused on production and on `capture.forbidden`
  routes, because the recorder is not read-only.
- **`changes --record`** keeps each version's changes in `changes/<version>.json`, which is committed. The
  directive `::changes{version, sources}` (`::changements`) shows every recorded version in the site, most recent
  first. The `release-notes` template starts from it.
- **`doc-kit hooks install | uninstall | status`** installs git hooks (`post-merge` after a pull, `post-checkout`
  after a branch switch) that run `facts` then `sync` in the background. They never block git and cost no tokens.
  Existing hooks are kept: the kit only adds or removes its own block, in the folder git reports, so
  `core.hooksPath` is respected.
- **CI on every build of the application**: the new example (c) in `ci/github-actions.yml` runs `facts`,
  `changes` against the base branch and `sync --check`. On a pull request it posts both reports as a single
  comment, updated at each push, then builds the site.
- **Developer overview**:
  - `facts --source modules`: the import graph (JS/TS and Python), with fan-in, fan-out, import cycles and
    orphan files;
  - `facts --source history`: git history per file, with commits, lines changed, authors, main author and their
    share, last change, and the bus factor. It uses read-only, hardened git and records author names only;
  - `db` facts gain `references` (Prisma relations, SQLAlchemy `ForeignKey`, SQL `REFERENCES`);
  - `::erd{title, tables}` (`::mcd`) draws the entity-relationship diagram from `facts/db.json` as inline SVG
    that follows the theme;
  - the `data-model`, `code-map` and `maintainability-review` templates use them.
- **Parallel captures**: `capture.concurrency` (default 4, production always 1). Each capture runs in its own
  browser context, and events and results stay in plan order. On the demo, 12 captures take 2.9 s instead of
  7.3 s one at a time, and about 40 s before the condition-based waits.
- **`capture.scale: 2`**: captures stay sharp on high-density (Retina) screens. The image holds twice the pixels;
  the zone file keeps the size it is shown at and records `scale`; the viewer shows it at that size. Images are
  about 2.3 times heavier, so the default stays 1.
- **`capture.clock`**: a fixed date and time for every capture, so that "today" and relative dates stay the same
  from run to run.
- **`capture --trace`**: a failed capture leaves its Playwright trace in `.doc-kit/traces/<id>.zip`, and the
  command prints how to open it.
- The standard (`standard/captures.md`) documents a pinned Docker renderer, so that committed images are
  identical across machines.

### Changed

- **Maintainability** (AUDIT.md M4, M7, M9 to M11):
  - one table-of-contents reader, `engine/project/toc.mjs`, for `audit`, `context`, `translate` and the CLI.
    `safeToc` now reads a legacy `sommaire.json`; it used to see no table of contents at all;
  - one JavaScript brace scanner, `engine/util/js-scan.mjs`, for `facts --source quality`, `init` and `export`.
    `init` now finds a layout's title after a brace in a block comment, and `export` no longer adds a second
    `fallback` when the version object holds a nested template literal;
  - the capture durations are in `engine/capture/timings.mjs`. `view` and `check tables` wait for the page to
    settle, and `view --tour` for the step's card, instead of fixed delays;
  - `doctor` checks Chromium through a seam (`ctx.chromium`), so its tests no longer depend on the browser
    installed on the machine;
  - dead code removed, and references to a document absent from the repository now point to ARCHITECTURE.md;
  - 109 exports that no other file used are internal again. A new rule (RULES.md M10) and its test,
    `exports.test.mjs`, reject any export that no other file uses; it does the job of knip without adding a
    dependency.
  - `build()` is split into named steps: `engine/build/build-context.mjs` (shared readers and problems) and
    `engine/build/render-language.mjs` (one language's data). It went from 532 lines to 51, with the same
    output byte for byte.
  - `runAudit()` is split the same way: from 239 lines to 59, with its actions in `engine/audit/actions.mjs`
    (one handler per criterion) and the thresholds in `engine/audit/thresholds.mjs`. The output is the same
    on every fixture.
  - `runCaptures()` too: from about 330 lines to 86, with one capture's steps in `engine/capture/take.mjs`
    and the worker pool in `runWorkers`. The images, zone files and reports are the same on the demo.
  - the kit's JavaScript is formatted by Prettier (pinned dev dependency, 120 columns): `npm run format`, and
    `npm run format:check` in the CI. The reformatting commit is listed in `.git-blame-ignore-revs`. Rule
    RULES.md M11.
  - ESLint (pinned dev dependency, `eslint.config.mjs`): the recommended rules, plus the size rules of RULES.md
    M5 as warnings, capped by `--max-warnings` so that their number can only go down. `npm run lint` runs in the
    CI. It found 18 problems, all fixed: unused imports and variables, initial values always overwritten, and
    a regular expression with spaces that were hard to count. Rule RULES.md M12.
  - Type checking of the JavaScript from its JSDoc (TypeScript 6.0.3, pinned dev dependency, `tsconfig.json`,
    nothing compiled): `npm run typecheck` runs in the CI. It found 162 places where the JSDoc no longer matched
    the code: undocumented options, missing type definitions, return types without a property the code sets.
    All are fixed in the JSDoc; no runtime behaviour changed and no bug was found. Rule RULES.md M13.
  - The messages of the skill's scripts are in `skill/doc-kit/i18n/{en,fr}.json`, installed with the skill: a
    `common` section and one section per script, instead of tables in the code. `consolidation.mjs`, whose
    messages were in English only, now speaks the project's language (or `--lang`). Tests check that both
    languages have the same keys and variables, and that every key a script uses exists.
- Captures run with `reducedMotion: "reduce"`.
- **Captures wait on conditions, not on fixed sleeps.** A capture waits until no request is in flight, fonts and
  images are ready, the DOM has been still for 150 ms and animations have ended, capped at 10 s. `delay` and
  `settle` are now minimums, 0 by default; they were fixed waits of 2,500 and 600 ms. On the demo a capture takes
  0.5–0.7 s instead of about 3.3 s.

### Security

- **`facts --network` keeps private package names private, and `probe` respects `capture.forbidden`** (AUDIT.md
  S13). A package the application declares private is no longer sent to npm or PyPI: an npm scope with its own
  registry in `.npmrc`, every npm package when `.npmrc` replaces the default registry, every pip package behind a
  private index, and any package from a folder, a workspace, git or a URL. It is marked `private: true` in
  `facts/dependencies.json`. `probe` never requests a route of `capture.forbidden` (the home page and the sampled API
  route included) and lists them in `forbidden` in `facts/probe.json`.

- **The generated site has a Content Security Policy** (AUDIT.md S9). Pages may hold HTML and diagrams are inlined
  unsanitised; the site now tells the browser to run only its own inline scripts, each allowed by its SHA-256 hash,
  and to load only embedded images and fonts, with no request, frame or form. A script, an inline event handler, a
  `javascript:` link, an iframe or an external image written in a page no longer runs or loads; a page that relied
  on an embedded iframe or an external image must embed it differently. `doc-kit dev` allows its live-reload client.

- **`check secrets` reads more** (AUDIT.md S11): the attribute values of the site's HTML (`href`, `title`, `alt`,
  `data-*`…), which it used to drop with the tags; the translations folder; and the zone files of every language
  (`<images>/<lang>/zones`), not only the source's.

- **The session file is private from its first byte** (AUDIT.md S10). It used to be written, then made readable by
  its owner only; for a moment, and on a failure of that second step, others could read it. It is now created with
  mode 0600 and replaces an older file in a single rename. SECURITY.md says what Windows does instead, and that a
  session file outside `.doc-kit/` gets no `.gitignore`.

- **Masking reaches more of the page** (AUDIT.md S6). Before, a sensitive value stayed visible in a screenshot when
  it was in an iframe, in a shadow root, in an `alt` or `aria-label` attribute, split across several elements, or
  generated by CSS. The kit now masks every frame and every open shadow root, those attributes, a value split
  across elements (the smallest element holding it is masked whole) and the `content` of `::before`/`::after`.
  A closed shadow root, and text drawn in an image or a canvas, remain out of reach: SECURITY.md says so.

- A mask target that matches nothing stops its capture (`cli.capture.error.maskMissing`): what it should hide is
  never shown. Masking also runs again just before the shot.

Fixes from the audit of 2026-10-03 (AUDIT.md §3), each guarded by a test in `test/unit/security.test.mjs` so that it
cannot come back (RULES.md).

- **ReDoS** in the private key detector of `check secrets` and `facts`: a `BEGIN PRIVATE KEY` line followed by
  blank lines made the scan exponential (over a minute for 24 lines). The expression is linear again, and every
  scanner of untrusted text now runs under a time budget on adversarial input, in a worker that names any check
  that hangs.
- **Redirects to forbidden routes**: a navigation of the application is fetched without following redirects and its
  chain checked before the browser follows it; a forbidden route is no longer requested through a server redirect.
  `capture.forbidden` also matches the percent-decoded, doubled-slash and trailing-slash forms of a path.
- **git option injection**: a reference from `sync.json` (`app.commit`) or `sync --since` is checked
  (`isSafeRef`) and passed after `--end-of-options`; `--since -x` is a usage error (exit code 2).
- **Untrusted repositories**: git runs with hardened options and is refused, with a warning
  (`cli.git.unsafeConfig`), in a repository whose configuration names a program; binaries are resolved on the
  `PATH` only, never in the folder read.
- **`export`** leaves out every `.doc-kit/` folder, the session file wherever `<PREFIX>_SESSION` puts it, any JSON
  browser session, keys, certificates and tool credentials.
- **`doc-kit dev`** refuses a request whose `Host` is not the server itself (DNS rebinding).
- `facts --tools` passes `--redact` to gitleaks.
- Site: a zone bubble opened with Enter no longer closes when focusing the zone scrolled the page; the bubble now
  follows its target on scroll and closes only when the target leaves the window.
- The kit's CI runs in `.github/workflows/ci.yml` (tests on three systems, security rules, `npm audit`); the CI
  examples pin actions by commit and install without scripts.

Fixes for the frictions found by a pilot run on a real application with a separate front end and no screenshots, and
the first lot of the spaces (one source, one site per audience).

### Added

- **`capture.sessionRefresh`** (ARCHITECTURE.md §6.3a): the only declared exception to the read-only lock, for a
  short-lived session that renews itself through a `POST`. `{ method?: "POST", path, json?, reason }`, `reason` at
  least 20 characters (the application owner's written decision that the endpoint writes nothing else); default
  `null`. Before each session-based `capture` run, and only then, `refreshSession` (`engine/capture/session.mjs`)
  sends this one request outside any page and writes the response's cookies back to the session file; every
  request a page itself makes still stays `GET`/`HEAD`/`OPTIONS`. A failure is a warning
  (`cli.capture.sessionRefreshFailed`), not fatal: the session check that follows decides. Success prints
  `cli.capture.sessionRefreshed` before the captures start.
- **Spaces** (ARCHITECTURE.md §6.1a): `content/toc.json` may declare `spaces` (`"business"`, `"takeover"`, or objects
  `{ id, title, shortTitle, subtitle, icon, for }`); every section then names its `space`, a page or a journey may name
  another one. `business` and `takeover` have default texts in English and French and a default icon. The build
  checks the declaration (`space.missing`, `space.unknown`, `space.undeclared`, `space.duplicate`, `space.title`: errors
  that stop even a draft build; `space.empty`: a warning).
- **Space selector in the site**: "Everything" and one button per space in the top bar (`aria-pressed`; at the head of
  the side menu below 1080 px); `#/@<id>` opens the home page of a space; the current space is remembered
  (`<theme key>.space`) and follows the page shown. With a space current, the top and side menus, previous / next,
  the home page doors and journeys, the search suggestions and the full print show that space only; the search lists
  its results first, then "In {space} (n)" for the others. The home page shows one door per space in "everything"
  mode, a "You are reading" strip otherwise; a page shows a space badge, and its breadcrumb starts with the space.
- **One file per space**: `build` also writes, for each space, an export from which the other spaces are physically
  removed (pages, sections, search entries, journey steps counted as "+ n steps in another part of the
  documentation", images; statistics recounted); a link to another space becomes its text followed by "(see the
  {space} documentation)" (warning `space.excludedLinks`). New configuration key `spaces: { export, output }`
  (`output` must contain `{space}`, key `spaceOutput`); default: the output with `-<space>` before its extension.
- **`--space <id>`** for `build` (that export alone; `--output` then names it), `view` and `open`; an unknown id
  (with the closest one) or no space declared is a usage error (exit code 2). `build --json` adds
  `sites: [{ space, output, stats, excludedLinks }]`. `dev` serves each export at `/space/<id>` too, and
  `export --with-dist` copies the exports wherever they are written.
- **`counterpart`** on a page (`"<page id>[~anchor]"`, with or without spaces): one line under the page badges,
  "Same topic, for {space}: {title} →" or "Related: {title} →"; checked like an internal link (`link.counterpart`,
  `link.anchor`), also by `check links`; removed from an export that does not hold its target.
- **Audit by space**: with a `takeover` space, the takeover pages are the pages of that space; with spaces, `audit.md`
  shows a table "Level by space" and `audit.json` carries `spaces: [{ id, title, pages, level, indicators, criteria }]`
  (page indicators measured on the pages of the space, `written2`, `takeover4` and `proofs4` n/a where they do not
  apply).
- Legacy French keys `espaces`, `espace` and `pendant` are read as `spaces`, `space` and `counterpart`.
- New i18n fragment `i18n/<language>/spaces.json`.

- **Help of a command**: `doc-kit <command> --help` and `doc-kit help <command>` print the usage and every option of
  that command, in the language of the messages (`cli.help.*`, fragment `i18n/<language>/help.json`).
- **No-screenshot mode**: `capture.mode: "app" | "none"` (default `"app"`) and `doc-kit init --capture none` (also asked
  in interactive mode). With `"none"`: no example capture plan and no capture script in the skeleton, starter pages
  and `doc-kit new` describe "The screen" with a table `| Element | What it shows |`, the home page has no
  "interactive screens" callout, `capture` and `connect` explain the mode and stop with exit code 2 (`connect --forget`
  still runs), `doctor` expects neither a session nor a plans folder, the guided mode never offers `connect` or
  `capture`, the skill's briefs tell the writers to write tables, and `audit` counts `annotated` as `n/a`, so level 2
  is reachable.
- **Capture variants in templates**: `<!-- doc-kit:capture=app -->`, `<!-- doc-kit:capture=none -->` and
  `<!-- doc-kit:end -->` markers; `init` and `new` keep the variant of the project (`captureVariant` in
  `engine/build/page-templates.mjs`). The `screen` and `editor` templates hold a "The screen" without screenshot.
- **`app.dir`**: the application root, written by `init`; given to the agents as `{{appDir}}` by the skill's
  `brief.mjs`, checked by `doctor`.
- **`init` recap**, printed before anything is written, also with `--yes`: folder, product name and where it was found,
  slug, language, URL, version and its file, capture mode, sign-in, coverage, masked `.env` files, application folder,
  and where to rename the product afterwards.
- `doctor` warns "version never incremented?" (⚠, no longer ✔) when the documented version is `0.0.0` or `1.0.0` while
  a `version.txt`, `VERSION` or `CHANGELOG.md` of the application gives another one; it checks `app.dir`.
- `brief.mjs --list` prints the available languages and the templates of each.
- **Capture target**: `capture.target: "local" | "demo" | "production"` (default `"local"`), where the screenshots are
  taken. With `"production"`: read-only always, even without a session (`readOnly: false`, or `<PREFIX>_READONLY=0`,
  is refused with exit code 2); `doc-kit capture` prints "PRODUCTION — read-only · N screenshots · <url>" and asks for a
  confirmation whose default is No, or needs the new `--yes` option without a terminal (exit code 2 otherwise);
  `doc-kit demo` refuses to run (exit code 2); `doc-kit connect` says it is production first; `doctor` shows the target
  and warns "no forbidden route declared" while `capture.forbidden` is empty; the guided mode shows the production
  banner before `connect` and `capture`; the skill's `brief.mjs` gives `captureMode=production` (or `demo`).
- **`init` asks where the screenshots are taken**: "1. local or demo application, 2. production, read-only, 3. no
  screenshots" (replaces the capture-mode question), and `--target local|demo|production`. Production asks its own URL
  (never the local one detected), prints the safety reminders (server-side writes on render are not blocked: list
  them in `capture.forbidden`; the session file is a secret; real data is the owner's decision) and writes
  `capture.readOnly: true`. The recap shows the target.
- **`init` goes on in a terminal**: "Open the browser now to sign in? (Y/n)" runs `npm install` when needed, then
  `connect`; "Take a first test screenshot with --preview? (Y/n)" runs `capture --preview --yes`. Never with `--yes`
  (the next commands are printed instead); the next steps leave out what was done.
- **Skill**: in the scoping phase, Claude asks whether the screenshots are taken on production (read-only) and whether
  to open the browser now (AskUserQuestion when available), then runs `doc-kit init --target …` and `doc-kit connect`.
- **`doc-kit view --full`**: the whole page in one image, from its top (the window first takes the height of the
  page, so that the menu and the sticky panels follow it): a long editor page is reviewed in one view.
- **Coverage of the plan**: an element that only the entry of a page not written yet cites gets `plannedBy` (the page);
  `runCoverage` returns `planned`. `check coverage` prints "missing: /x — planned in <page>, not written yet" and
  "N more elements are cited only by the entries of pages not written yet (P/T once they are written)"; `audit` shows
  the coverage "with the pages not written yet" next to `coverage` and names the page in the coverage action.
- **`audit` says how many pages remain to write**: "Pages: 1 written of 81 — 80 to write (72 without a file, 8 still
  in template guidance)" in the summary; `written` carries `missing` and `drafts` in `audit.json` and in the report.
- **Business space** (ARCHITECTURE.md §6.8): five page types (`feature`, `business-rules`, `roles-matrix`, `process`,
  `release-notes`), templates and examples in English and French. `:::rule{id title}` (`:::regle`) defines a
  business rule once, rendered as an `h3` so it is in the page outline, the search index and a link target;
  `[[feature …]]` (`[[fonctionnalite …]]`) and `[[rule …]]` (`[[regle …]]`) cite a feature sheet or a rule as a link
  chip; `::features{}`, `::rules{}` and `::roles{}` (`::fonctionnalites{}`, `::regles{}`) generate their tables.
  Citations and the generated tables are resolved once every page has rendered (`engine/build/business.mjs`), so a
  rule may be defined on a page further down the table of contents than the page that cites it. A page declares its
  feature id with the `feature` field of `content/toc.json` (`feature.template`, `feature.duplicate`,
  `feature.noId`, `feature.unknown`, `rule.duplicate`, `rule.attributes`, `rule.unknown`); a business page that
  cites a `file:line` proof gets the warning `business.technical`.
- **Glossary `technical`** (§6.8): an entry may carry `technical` (where the term lives in the code), shown in its
  tooltip when the project has no spaces, or the current space is `takeover` or "everything"; dropped from the
  exports other than `takeover`.
- **`doc-kit inventory --features [--write] [--force]`**: groups what the coverage adapters see into candidate
  features (by the first static segment of a route, an API route or an i18n key), each with a suggested id, its
  routes, API routes and keys, and the sheet that already cites it, if any; `--write` writes `features.json`
  (refused when it exists, exit code 1, unless `--force`, which keeps the existing ids and appends the new
  candidates).
- **Coverage adapters `openapi`** (an OpenAPI 3 or Swagger 2 document, JSON only; a `.yaml`/`.yml` file answers
  `reason: "yaml"`) **and `features`** (the entries of `features.json`).
- New i18n fragment `i18n/<language>/business.json`.
- **Takeover space** (ARCHITECTURE.md §6.9): ten page types for the team that takes an application over
  (`access-ownership`, `api-surface`, `runbook`, `data-model`, `dependencies`, `code-map`, `tests-quality`,
  `agent-instructions`, `adr`, `threat-model`), templates and examples in English and French, and `findings`
  becomes a risk register (a combined "Follow-up" column: owner, decision, status, due date).
- **`doc-kit facts [--source <name>]… [--network] [--tools] [--json]`**: reads the application's code (`app.dir`)
  and writes one file per source into `paths.facts` (`facts/<source>.json`, default folder `facts`), never into the
  application: `dependencies` (every package.json, package-lock.json v2/v3, pnpm-lock.yaml, yarn.lock v1 and
  berry, requirements*.txt, poetry.lock and pyproject.toml found under the application, searched recursively, at
  most 4 folders deep — a separate front end and API, each with its own manifest, is the usual case; each manifest
  is read on its own, so the same package named by two manifests gives two items, de-duplicated by name for
  coverage), `env` (names read by the code and by an example env file, never a value; besides the literal
  `process.env`/`os.environ` forms, also a Node destructuring read, `const { X, Y } = process.env`, and a
  pydantic settings class, `BaseSettings` v1 or v2, with its `env_prefix` and the `alias`/`validation_alias`/`env`
  overrides), `api` (Next.js App Router route handlers, `pages/api`, FastAPI with `APIRouter`/`include_router`
  prefix composition, Express), `db` (Prisma, SQLAlchemy, SQL migrations with row-level security and policies),
  `agents` (AGENTS.md and the other instruction files, their size, and any hidden Unicode character), `secrets`
  (file and rule only, never the value) and `tests` (a rough count per file, and a coverage report when one
  exists). `--network` adds, for `dependencies`, whether each direct package exists in its registry (the name
  only); `--tools` also runs `gitleaks` (scrubbed of `Secret`/`Match`), `osv-scanner`, `syft` and `knip` when they
  are on the PATH, each into `facts/tool-<name>.json`. Same code, same application: the same file, `generated`
  aside. Exit code 2 without `app.dir` (`facts.noApp`).
- **`::facts{source="…" columns="…"}`** (`::faits{… colonnes="…"}`): a table built from a facts file at build time,
  with a caption giving the generation date and the application's commit; an unknown source or column fails a
  strict build (`facts.missing`, `facts.column`).
- **Claim badges `[[verified]]`, `[[deduced]]`, `[[unknown]]`** (`[[verifie]]`, `[[deduit]]`, `[[inconnu]]`), with
  or without a `file:line` proof.
- **Coverage adapters `fastapi`** (one item per route handler, sharing the parsers of `engine/facts/api.mjs`) **and
  `facts`** (one item per fact of a source that is worth citing: `env`, `api`, `db`, the direct `dependencies`, or
  `agents`; `{ available: false, reason: "noFacts" }` when the file is missing); **`next-app-router` gains the
  `api` option** (a second family of route handlers, no change when it is left out).
- **`audit`**: two informative indicators, never part of a criterion — `facts` (`{ files, stale }`: a facts file is
  stale when its `commit` differs from the application's current HEAD) and `claims` (verified, deduced and unknown
  claims tallied on the written takeover pages, with the verified ratio); shown in `audit.md` under "Facts and
  claims" when there is something to show, and always in `audit.json`.
- `paths.facts` (default `"facts"`).
- New i18n fragment `i18n/<language>/takeover.json`.
- **Agent economy** (ARCHITECTURE.md §6.11): three Claude Code agent types (`skill/doc-kit/agents/*.md`) —
  `doc-kit-triage` (`haiku`, read-only), `doc-kit-writer` (`sonnet`, reads and writes), `doc-kit-reviewer`
  (`opus`, read-only) — installed by `skill install` into `<skills folder>/../agents/` and reported by `doctor`
  like the skill (current, missing, outdated, modified). Every brief template now starts with a front matter
  line `agent: <type>` and is split in two: a common part first (rules, safety, syntax, standard — identical
  byte for byte whatever the variables, so a wave's agents share their prompt cache) and a variable part last
  (batch, pages, paths); new briefs `triage` and `update` (English and French), built on `doc-kit context
  <page> --update` and `.doc-kit/sync-report.json`. `brief.mjs` reports the agent type to launch with, and
  `--estimate` gives input tokens (the brief and the files it cites, characters ÷ 4) and output tokens (1.4 per
  word of a new page's `maxWords`, 0.3 for an update), with the cost when `llm.prices` is set. New
  `skill/doc-kit/scripts/usage.mjs` (`log`, `report [--json]`, `scan --transcripts <folder>`, tolerant of
  anything but `message.usage`) measures what the agents actually consumed and compares it with a fresh
  estimate. The context file's header also gives the product (`product.name`) and the documented version
  (`readProjectVersion`). `writing-batch` and `update` rewritten to a **sober method**: the context file and the
  page's own template only, at most 3 extra targeted reads per page for a writer (1 for an update), the page
  written once, one `build --draft` per batch, `view` only with screenshots — an agent over this step budget
  stops and reports instead of exploring. Measured on a real application (FastAPI + Next.js, 81 pages, nine
  admin pages): −69 % cost, −49 % duration, 47 → 21 round-trips versus the previous brief, same conformance
  (details: `references/agent-orchestration.md` §8 of the skill, `docs/*/content/skill/cost-and-speed.md`).
- **`doc-kit sync [--since <ref>] [--apply [--labels]] [--mark <page…> | --all] [--sources <file[:lines]…>]
  [--date YYYY-MM-DD] [--check] [--estimate]`** (ARCHITECTURE.md §6.10): what the documentation must follow
  after a change of the application. `--mark`/`--all` record, in `sync.json` (`paths.sync`, default the project
  root), each page's dependencies — the files behind its `routes` (derived for `next-app-router`, `react-router`,
  `fastapi` and `glob` without changing the adapters, `engine/sync/routes.mjs`), the local import closure of
  those files (`engine/sync/imports.mjs`: relative paths, `tsconfig`/`jsconfig` `paths` aliases, Python relative
  and absolute imports; bounded to 3 levels and 200 files), its `file:line` proofs, its captures, its `::facts`
  tables, its `counterpart` and its declared `sources` (new optional page field) or `--sources`. The report
  (default; writes `.doc-kit/sync.md`, `.doc-kit/sync-report.json`, one `.doc-kit/sync/<page>.diff` per page)
  compares this reference with the application now, or with a git commit (`--since`, read only): proofs moved or
  broken, labels whose value changed (`sync.labels`, or the `messages` of the `i18n-registry` adapters), pages to
  review by priority (`direct`, `shared`, `probablyIntact` — a shared file changed but its diff touches nothing
  the page names), stale screenshots, new or removed coverage elements, and pages never marked. `--apply` rewrites
  a moved proof's `file:line` and, with `--labels`, a changed label — only inside `**bold**`, code spans,
  `[[menu …]]` badges and quotes — then restamps the pages left unchanged; `--check` gives CI a gate (exit code 1
  on anything but `unchanged`/`unmarked`); `--estimate` prices the pages to review (`llm.prices`). A marked page's
  footer shows "Checked against version {version} on {date}" (`ui.footer.verified`); `audit` gains the
  informative `upToDatePages` indicator; the guided mode offers `sync` before the menu when `sync.json`'s
  `app.version` differs from the documented one. New configuration keys `paths.sync`, `sync: { labels }`,
  `capture.compareThreshold` and `llm: { currency, prices }` (read by `--estimate`); new i18n fragment
  `i18n/<language>/sync.json`.
- **Skill**: `SKILL.md` reorganised around the business and takeover spaces, the `facts` → `sync` → `triage` →
  `update` maintenance cycle, and the economy of the agents (ARCHITECTURE.md §8, §6.11); new briefs
  `functional-spec` (feature sheets, business rules, roles matrix, process; `doc-kit-writer`), `code-health`
  (the takeover dossier's `api-surface`, `dependencies`, `agent-instructions`, `tests-quality` and
  `threat-model` from `doc-kit facts`; `doc-kit-reviewer`), `access-ownership` (who owns what, and the
  questions for the owner; `doc-kit-writer`) and `system-dossier` (`runbook`, `data-model`, `code-map` and
  `adr` — install/build/deploy/rollback commands checked in the repository, the data model from
  `new --prefill` and `facts/db.json`, a C4-style code map, reconstructed ADRs; `doc-kit-writer`), in English
  and French, with the same byte-identical common part guarantee as the existing briefs; `writing-batch`,
  `journey`, `troubleshooting` and `production-technical` now prepare each page with `doc-kit context <page>`
  instead of the whole inventory and end it with `sync --mark <page> --sources …`.
  `references/pitfalls.md` gains a "Vibe-coded applications" section (missing or client-only access control,
  no row-level security, secrets, slopsquatting, duplicated code, misleading tests, agent instructions as a
  hidden specification, outdated dependencies, no account owner); `references/templates.md` documents the 28
  page types; `references/method.md` details both spaces, the full takeover dossier and the update cycle. New
  computed brief placeholders `{{featuresFile}}` and `{{factsDir}}`.
- **Documentation**: five new guides, in English and French, as a new "Spaces" section (`spaces/overview`,
  `spaces/business`, `spaces/takeover`) plus `publish/sync` ("Keeping up with the application") and
  `skill/cost-and-speed`; `write/page-templates`, `method/standard`, `faq/questions`,
  `faq/troubleshooting/build` and `skill/phases` updated for the 28 page types, the two spaces and the agent
  economy; 8 new glossary terms (space, space export, feature sheet, business rule, fact, verified claim, sync
  reference, context folder). `start/first-five-minutes` now describes the real two-space skeleton (27 files,
  the sample `features/example-feature` and its technical `counterpart`); `publish/audit` documents
  `upToDatePages`, "Level by space" and the informative `facts`/`claims` section; `publish/checks` documents the
  `openapi`, `features`, `facts` and `fastapi` coverage adapters, `next-app-router`'s `api` option, and the
  build-time gates specific to spaces and the business/takeover types (`space.*`, `feature.*`, `rule.*`,
  `facts.*`, `business.technical`, `link.counterpart`); `reference/adapters` gained the missing `api`/`apiFamily`
  options of `next-app-router`.
- **Standard and skeleton**: `structure` rewritten around the two spaces (Business: Use, Features, Administer,
  Process; Takeover: Understand, Operate, Secure, Risks, Maintain), which page type belongs where, `counterpart`,
  Diátaxis ("one page, one reader"), and when a project keeps a single space; `templates` documents the 15 new
  types alongside the 13 original ones; `writing` adds the `F-xx`/`BR-xx` (`RG-xx` in French) identifiers, the
  access box, one rule as one statement plus a Given/When/Then example, "no code in the Business space", the
  `[[verified]]`/`[[deduced]]`/`[[unknown]]` claim badges and the risk register (owner, decision, status, due
  date); `maturity` documents the level by space, `facts` and `claims` as informative measures, and
  `upToDatePages` as a new level-4 criterion (met, `n/a`, without `sync.json`); `quality` lists the `feature.*`,
  `rule.*`, `business.technical`, `facts.*`, `space.*` and `link.counterpart` problems; `delivery` adds
  `sync --mark --all` and the per-space exports to the handover checklist; `config` shows fictional examples of
  `spaces`, `paths.facts`, `paths.sync`, `sync.labels`, `capture.compareThreshold` and `llm`. `doc-kit audit`:
  `upToDatePages` (ARCHITECTURE.md §6.10) is now measured as a level-4 criterion (`upToDatePages4`, `≥ 90 %` or
  `n/a` without `sync.json`), in the global level and in each space's. The `init` skeleton now declares
  `"spaces": ["business", "takeover"]`, adds a `features` part with a sample `feature` sheet (its `counterpart`
  a new `technical-sub` page under the architecture overview) and, to the Takeover space, sample
  `access-ownership`, `runbook` and `agent-instructions` pages; the findings page's guidance now describes the
  risk register; `README.md` and `WRITING-GUIDE.md` explain the two spaces and the `facts` → `sync` cycle.
- **Demo**: `examples/demo-docs` now declares both spaces (Business: `F-01`/`F-02` feature sheets, a
  `business-rules` registry, a `roles-matrix`; Takeover: `access-ownership`, `api-surface`, `findings`, a
  `counterpart` between a feature sheet and its technical page), with its own `facts/` and `sync.json` committed.
  `examples/demo-app-v2` is a second version of the demo app (a renamed label, a modified screen, an added
  route) that drives a new end-to-end test of the full update cycle (`sync` report, `--apply --labels`,
  `capture --stale --compare`, `--mark`, `--check`).
- **Reviews** (§6.13): two optional takeover page types, `security-review` and `maintainability-review`, each
  built from deterministic facts first. The `api` source now also reports `auth` (`none`/`user`/`role`/`unknown`)
  and `guards` for every route, classified against `review.guards.role`/`.user` (default patterns, overridable).
  New source `security` (eleven OWASP Top 10 heuristics: `rule`, `file`, `line`, `severity`, `owasp` — never a
  value) and `quality` (functions, complexity, duplication, TODOs per file; A-to-E ratings and tooling found,
  project-wide); `facts --tools` also runs `semgrep` when `review.semgrep` names a local rules folder (never
  `--config auto`). New command `doc-kit probe [--as <role>]… [--json]`: a safety-checked GET/HEAD-only check of
  a running LOCAL or DEMO instance (never production, no option overrides it) — security headers, cookies, CORS
  and version disclosure on `/` and one API route, then the access control of every `GET` route against its
  `auth` (`probe.unprotected`, `probe.publicData`); at most 4 requests a second, a response body never stored;
  writes `facts/probe.json`. `connect --as <role>` saves a role's session separately
  (`.doc-kit/session-<role>.json`) for `probe` to use, leaving the plain session file untouched. New
  configuration key `review: { guards: { role, user }, params, semgrep }` (`params`: path parameter → example
  value, for `probe` to fill a parameterised route). New briefs `security-review` (`doc-kit-reviewer`) and
  `maintainability-review` (`doc-kit-writer`); their findings are candidates for the risk register. New guide
  "Security and maintainability reviews" (`spaces/reviews`), the `review.*` configuration keys, and the `probe`/
  `connect --as` CLI reference, in English and French; two new Acme Orders examples.
- **Languages** (§6.12): one source, several languages in a single multilingual site (a language selector,
  `#/[<lang>/]<path>`), or `build --lang <l>` for a mono-language file; `languages` + `paths.translations` +
  `capture.languages`; `doc-kit translate status|--mark|--fix-anchors`, `context <page> --translate <lang>`,
  `capture --lang <l>`, `init --languages`; new brief `translate`.

### Changed

- A project that declares neither spaces nor counterparts keeps the same site data and the same visible text
  (equivalence levels 1 to 3): the texts and site data of the spaces are only emitted when used. The home page doors
  fill the width (`auto-fit`) instead of a fixed grid of 4 columns.
- `build()` returns `sites` (`[]` without spaces); the Markdown engine reports what each rendered document uses
  (screenshots, diagrams, legend items), so that an export recounts its statistics.
- The guided mode's `connect` question says that a browser window opens, where you sign in before pressing Enter.

- **Product name** detected by `init`: the `metadata.title` of the Next.js root layout first, then `package.json`
  without its `-frontend`, `-front`, `-web`, `-ui`, `-client` or `-app` suffix (a generic name gives way to the root
  `package.json`, then to the folder name).
- **Version source** detected by `init`: `version.txt` or `VERSION` at the application root, then the root
  `package.json`, then the front end's, then `pyproject.toml`.
- **Masking files** detected by `init`: the `.env` and `.env.local` files that exist at the application root and in the
  front-end folder (never `*.example`); `masking.env` is empty when there is none.
- The comments of the generated `doc.config.mjs` are in the language of the project (`templates/project/<language>/`).
- The French templates and briefs avoid elision traps with the product name ("du produit …", "l'application …").
- The example routes of the skeleton and of the page templates are fictional (`/example/…`, `/exemple/…`).
- **Coverage** no longer counts a page that still holds template guidance: neither its text nor its entry in the
  table of contents (titles, `routes`, journeys, suggestions).
- The guided mode shows the folder in full ("No documentation project (doc.config.mjs) for this folder: …").
- `brief.mjs` speaks the project's language; `{{appDir}}` comes from `app.dir`, else the documentation folder's
  parent or grandparent that holds `.git`, else its grandparent, with a warning when it was guessed and when the
  coverage source sits in a separate front end.
- **A written page** (`standard/maturity.md`) is a declared page whose file exists and holds no template guidance.
  `written` owns the pages not written yet (without a file, or drafts that keep their guidance) and is now required
  at 100 % for level 3; every other page indicator is measured on the written pages only: `conformant`,
  `completeness`, `annotated`, `proofs`, `tooLong` and `takeover` (a draft is named as the page to write, never as
  present). `blocking` leaves out the build errors of the pages not written yet (shown next to it, counted by
  `written`) and the elements that a page not written yet plans. `guidance` counts the template text left outside the
  page bodies: the summary placeholder of `new` on a written page, guidance in the home page or a section
  introduction. Level 1 still counts a draft as the first page of its section.
- **Coverage** counts only what the written pages cite: the entry of a page declared without its file covers nothing
  either (before: its `routes` counted, so a plan alone reached 91 %).
- The template's examples never satisfy a criterion: proofs, numbered findings and `:::screen` blocks are looked for
  outside HTML comments, in written pages only (before: the sample "(C1)" of the findings skeleton validated it).
- **Audit actions**: an unwritten page is listed once (outside Take over at level 2, the others at level 3), with
  `doc-kit new <id>` for a missing file or the guidance left in a draft; when every element must be handled, the
  sentence says it once ("Document the 4 elements…", not "4, at least 4"); `typedChoose` never asks for more pages than
  it lists.
- **Numbers of the summaries**, in the language of the messages, each noun in the plural form of its number
  (`engine/build/format.mjs`): `build` ("0,3 Mo · 81 pages · 1 schéma"; without screenshots, `capture.mode: "none"`,
  the screenshots are not counted), `check images` ("0 errors, 0 warnings", no more "error(s)"), `check secrets`,
  `check links`, `check tables` ("1 440 px"), `audit` ("1 page").
- **Skeleton without screenshots**: the table of contents (tagline, subtitle of Use, summary of Maintaining the docs)
  no longer speaks of illustrated or annotated screens; `README.md`, `WRITING-GUIDE.md`, the maintaining-docs page and
  the technical architecture page get `capture=none` variants (browser of `view`/`check tables`/`audit`, strict build
  messages, folder layout, checks, transfer, tooling limits), so a `none` project only mentions screenshots to state
  the decision and how to add them later.
- `doctor` checks one more contrast pair: `chrome-text` on `chrome-2` (the search field of the top bar).

### Fixed

- **A declared page without its file** is one problem, `page not written yet: <id> (<file>)` (a warning with
  `--draft`), never the cascade of the "required section missing" errors of its template, nor "anchor not found" for
  the links into it: 385 errors became 75 on a plan of 81 pages with 72 not written yet.
- **The Ctrl K key of the top bar** was nearly unreadable in the light theme: the generic `kbd` gave it the page
  surface (white) under the light chrome text (1.5:1); it now sits on `chrome-2` in both themes (9.9:1).

## [0.1.0] - 2026-10-01

First public release.

### Added

- **The generated site**: one self-contained HTML file that opens offline, with sections, groups, sub-pages,
  breadcrumbs and previous / next links; annotated screenshots with numbered markers, a legend and a guided tour;
  a before / after slider; full-text search (`Ctrl+K` or `/`); glossary tooltips; inline SVG diagrams; light and dark
  themes remembered per browser; printing of one page or of the whole documentation; keyboard navigation and screen
  reader announcements.
- **Extended Markdown**: `:::screen`, `:::steps`, `::capture`, `::diagram`, `::before-after`, seven callout types and
  five inline badges, each with an English and a French spelling; internal links and anchors checked by the build.
- **Page templates**: 13 page types (`screen`, `editor`, `recipe`, `technical`, `technical-sub`, `journey`,
  `journey-step`, `troubleshooting`, `troubleshooting-area`, `findings`, `architecture`, `variables`, `resources`), in
  English and in French, with their required sections checked by the build.
- **The documentation standard** (`standard/`, English and French): structure, templates, writing rules, capture
  safety, quality gates, maturity levels, handover checklist, commented configurations.
- **Command line**: `init`, `doctor`, `connect`, `demo`, `capture`, `inventory`, `dev`, `new`, `build`, `view`, `open`,
  `check`, `audit`, `optimize`, `export`, `upgrade`, `migrate`, `skill install`, and a guided mode when no command is
  given; `--json` output; messages in English and French; documented exit codes (0, 1, 2, 3).
- **Captures**: plans as JavaScript modules; targets by role, text, field, label, placeholder, CSS or block, with
  options; actions (click, hover, type, select, press, scroll, wait, wheel, eval); zones and `union`; frames; masks;
  desktop and mobile contexts; map framing; WebP encoding through Chromium, without native dependency; zone
  previews.
- **Capture safety**: read-only by default with a session (write requests aborted and counted), forbidden routes
  never opened, session checked before and during the run, automatic masking of GUIDs, local `.env` values and
  patterns.
- **Adapters**: authentication (`manual`, `none`, `nextauth`, `api-me`) and coverage (`next-app-router`,
  `react-router`, `i18n-registry`, `glob`), plus project adapters declared as `local:<path>`.
- **Checks**: coverage, links, table widths, images (orphan, missing, heavy, outdated) and secrets.
- **Audit**: about fifteen indicators, four maturity levels, and the prioritised actions to reach the next one, as
  Markdown and JSON reports.
- **Live writing**: `doc-kit dev` rebuilds and reloads the site on every change, with build errors shown over the page.
- **Delivery and maintenance**: `export` writes a self-contained copy with the engine vendored; `upgrade` shows the
  changes and applies the migrations of the kit; `migrate` rewrites legacy French-keyed projects, which are also
  read as they are.
- **Theme**: colour tokens for both themes, WCAG contrast check, sanitised logo and favicon, extra icons, coloured
  status badges, and overrides of any text of the site.
- **Claude Code skill**: the method in phases, brief templates for parallel agents, scripts, installed with
  `doc-kit skill install` and checked by `doctor`.
- **Examples**: a fictional demo application (Acme Orders) and its documentation project, used by the tests.
- **Documentation** of the kit, in English and in French, built with the kit itself, with an example page of each
  type; CI examples for GitHub Actions and Azure Pipelines.
- Two runtime dependencies only (`marked`, `playwright`); Node.js 20 or later on Windows, macOS and Linux.
