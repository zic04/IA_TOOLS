## In short

The kit reads an application statically: it never runs its code. What it can read depends on the stack.

1. **Stacks.** A stack adapter knows a framework: its API routes and their guards, its screens, its behaviour hints.
   The kit's own readers also read every JavaScript, TypeScript, Python, HTML and SQL file.
2. **Dependencies.** The manifests and lock files of each ecosystem, read offline.
3. **Low-code.** A platform is detected and named. The kit does not read it: its agents read the export.
4. **What is not read is told.** `doc-kit facts --source stack` measures each language of the code, and whether the
   kit reads it here. `doc-kit inputs status` shows the part read. The context of a page tells the agent which code
   to read itself.

## In this part

### Stacks

A stack adapter reads the routes of the API, their guards, the screens or behaviour hints of a framework (`doc-kit facts`: sources `api`, `screens`, `behaviours`). It counts as reading a language once the application uses its stack: one of the dependencies or files of the third column.

| Stack | Languages | Detected by | What the kit reads |
|---|---|---|---|
| Next.js | JavaScript, TypeScript | `npm:next` | API routes, guards, screens |
| Express, Fastify, Hono, Koa | JavaScript, TypeScript | `npm:express`, `npm:fastify`, `npm:hono`, `npm:koa-router`, `npm:@koa/router` | API routes, guards |
| FastAPI | Python | `pip:fastapi` | API routes, guards |

### Dependencies

Every manifest and lock file below is read on its own, four folders deep at most (source `dependencies`). With `--network`, only the public names of npm and PyPI are ever sent to their registry; the other ecosystems are read offline.

| Ecosystem | Files |
|---|---|
| npm, pnpm, Yarn (`npm`) | `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` |
| pip, Poetry (`pip`) | `requirements*.txt`, `poetry.lock`, `pyproject.toml` |
| Maven, Gradle (`maven`) | `pom.xml`, `build.gradle`, `build.gradle.kts`, `gradle.lockfile`, `libs.versions.toml` |
| NuGet (`nuget`) | `*.csproj`, `*.fsproj`, `*.vbproj`, `packages.lock.json`, `packages.config`, `Directory.Packages.props` |
| Composer (`composer`) | `composer.json`, `composer.lock` |
| Go modules (`go`) | `go.mod` |
| Bundler (`rubygems`) | `Gemfile`, `Gemfile.lock` |
| Cargo (`cargo`) | `Cargo.toml`, `Cargo.lock` |

### Low-code platforms

Detected, never read: `doc-kit inputs status` and the facts say so, and the agents read the export themselves (an unpacked Power Apps app, an OutSystems module, a Salesforce project…).

| Platform | Detected by |
|---|---|
| Power Apps | `**/*.msapp`, `**/CanvasManifest.json`, `**/*.pa.yaml`, `**/*.fx.yaml` |
| Power Platform (solution) | `**/Solution.xml`, `**/solution.xml`, `**/customizations.xml` |
| OutSystems | `**/*.oml`, `**/*.oap`, `**/*.osp` |
| Mendix | `**/*.mpr`, `**/*.mpk` |
| Salesforce (Apex, Lightning) | `sfdx-project.json`, `**/sfdx-project.json`, `**/*.trigger` |

### Languages

Each language of the code, and what reads it. A language read by nobody here is measured (its files and lines, source `stack`) and told to the agents, who read that code themselves.

| Language | Extensions | Read by |
|---|---|---|
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs`, `.vue`, `.svelte` | the kit's own readers, Next.js, Express, Fastify, Hono, Koa |
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts` | the kit's own readers, Next.js, Express, Fastify, Hono, Koa |
| Python | `.py` | the kit's own readers, FastAPI |
| HTML | `.html`, `.htm` | the kit's own readers |
| SQL | `.sql` | the kit's own readers |
| Java | `.java` | not read: the agents read it |
| Kotlin | `.kt`, `.kts` | not read: the agents read it |
| Groovy | `.groovy` | not read: the agents read it |
| Scala | `.scala` | not read: the agents read it |
| C# | `.cs`, `.cshtml`, `.razor` | not read: the agents read it |
| F# | `.fs` | not read: the agents read it |
| Visual Basic | `.vb` | not read: the agents read it |
| PHP | `.php` | not read: the agents read it |
| Go | `.go` | not read: the agents read it |
| Ruby | `.rb`, `.erb` | not read: the agents read it |
| Rust | `.rs` | not read: the agents read it |
| Swift | `.swift` | not read: the agents read it |
| Dart | `.dart` | not read: the agents read it |
| Elixir | `.ex`, `.exs` | not read: the agents read it |
| C | `.c`, `.h` | not read: the agents read it |
| C++ | `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh` | not read: the agents read it |
| Objective-C | `.m`, `.mm` | not read: the agents read it |
| Apex | `.cls`, `.trigger` | not read: the agents read it |
| Lua | `.lua` | not read: the agents read it |
| Perl | `.pl`, `.pm` | not read: the agents read it |
| COBOL | `.cbl`, `.cob`, `.cpy` | not read: the agents read it |

## Pitfalls and observed gaps

- **A stack counts once it is detected.** Spring is counted as reading Java only where Spring is a dependency (or a
  file names it). Java read by nobody stays "not read", even when the kit has adapters for other Java frameworks.
- **Static reading has limits.** A route built at run time, a decorator generated by a macro, or a route table read
  from a database is not seen. The facts are hints to check in the code, never a measure.
- **A project adds its own stack.** `stacks.adapters: ["local:adapters/x.mjs"]` in `doc.config.mjs`
  ([Adapters](#/reference/adapters)). `stacks.disabled` turns one of the kit's off.

## Further reading

- [Adapters](#/reference/adapters): the stack, coverage and authentication adapters, and how to write one.
- [The takeover dossier](#/spaces/takeover): what the facts give the Develop space.
