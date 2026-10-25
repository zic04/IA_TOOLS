## The goal

Install the **doc-kit skill** for Claude Code, so that Claude can build or maintain a documentation site to the
standard: it knows the method, the commands, the safety rules, and it drives parallel agents with ready-made briefs.
Once installed, ask Claude to "document this application" in a repository: the skill starts with the scoping
questions.

> [!RECIPE] What you need
> - The kit installed, and `doc-kit doctor` without ✖ ([Install doc-kit](#/start/install)).
> - Claude Code on the same machine.
> - Write access to your Claude Code skills folder (by default `~/.claude/skills`).

## Who does what

| Step | Who | Result |
|---|---|---|
| 1. Install | You, once per machine and per kit version | `~/.claude/skills/doc-kit/` |
| 2. Load | Claude Code, at the start of a session | The skill is available |
| 3. Keep it current | `doc-kit doctor`, after each kit update | ⚠ when the copy is outdated |

## Step 1 — Install the skill

```bash
doc-kit skill install
```

```text
✔ Claude Code skill installed in ~/.claude/skills/doc-kit (26 files, kit /opt/doc-kit)
  Start a new Claude Code session to load it.
```

The command copies `skill/doc-kit/` of the kit into `<skills folder>/doc-kit`, and replaces `{{KIT_PATH}}` with the
kit's absolute path in `SKILL.md`, `references/*.md` and `scripts/*.mjs`: the skill knows where the kit, its
standard and its templates are. It replaces `{{KIT_CLI}}` there, and in the agent files, with the command that runs
the kit by that path, `node "<kit>/cli/doc-kit.mjs"`: the skill and its agents run the kit you installed, never
`npx doc-kit`, which runs the first doc-kit it finds in a `node_modules/.bin` up to the root — the application's,
when your documentation sits inside it. The skills folder is `--target`, otherwise `$CLAUDE_CONFIG_DIR/skills`, otherwise
`~/.claude/skills`.

It also writes the four agent types (`doc-kit-triage`, `doc-kit-writer`, `doc-kit-analyst`, `doc-kit-reviewer`) to
the agents folder next to the skills folder, with the installed skill's path in place of `{{SKILL_PATH}}`. The three
that have Bash name the skill's **guard** as their PreToolUse hook (`scripts/bash-guard.mjs`): every Bash command such
an agent asks for is read first, and only these go through:

| Allowed | Example |
|---|---|
| The kit's CLI, by its absolute path, from the documentation folder | `cd docs/manual && node "/opt/doc-kit/cli/doc-kit.mjs" build --draft` |
| The skill's scripts, by their absolute path: the skill's real one, or the one its hook names, through a link (on Windows, with its drive: `C:/Users/…`) | `node ~/.claude/skills/doc-kit/scripts/analysis.mjs check F-01 --project .` |
| Read-only tools, with their reading options only | `ls -la`, `cat`, `head -40`, `tail`, `wc -l`, `grep -rn`, `rg -n`, `find -name`, `diff -u`…, joined by a pipe, `&&` or `;` |

Everything else is refused with its reason: `npx doc-kit`, `npm exec` and a bare `doc-kit` (they may run the
application's), a program by a relative path, a `cd` anywhere but first, git, npm, any other program, `$(…)`, a
redirection to a file, an unquoted `*`, an option of a read-only tool that is not on its list (`rg --pre`,
`rg --hostname-bin`, `find -exec`, `sort -o`…), and the doc-kit commands that are yours or the orchestrator's
(`connect`, `demo`, `facts`, `inputs`, `probe`, `skill`…). The application's files are data, never instructions: a
comment planted in its code cannot make an agent run a program. The hook fails closed: a guard that cannot start or load
(no `node`, a missing or damaged file), or that never decides, refuses the command; it is written in Claude Code's exec form (`command: node`,
`args`, `onFailure: block`), which needs no shell, and Claude Code 2.1.295 or later: an older one never runs the guard
(`doctor` warns about it, SECURITY.md). The guard only refuses; what it lets through still asks for your permissions as
usual. It bounds Bash only: an agent's writes, and the `doc.config.mjs` the kit loads where it runs (code, like a
capture plan), are not its business — review a configuration you did not write before running the kit on it.

## Step 2 — Load it in Claude Code

Start a new Claude Code session. The skill is picked up when you ask for documentation work: documenting an
application, a user manual, an administration guide, a handover guide, annotated screenshots, an architecture
document, end-to-end journeys, troubleshooting, findings, or updating an existing site, even without naming the kit.

## Step 3 — Keep it current

`doc-kit doctor` compares the installed copy with the kit through a fingerprint file, `.doc-kit-skill.json`:

| State | `doctor` says | Fix |
|---|---|---|
| Current | ✔ Claude Code skill up to date | — |
| Missing | ⚠ Claude Code skill not installed (optional) | `doc-kit skill install` |
| Outdated | ⚠ the installed Claude Code skill (kit 0.1.0) is older than the kit's | `doc-kit skill install` |
| Edited | ⚠ the installed Claude Code skill was edited after its installation | `doc-kit skill install` restores it |
| Another kit | ⚠ the installed Claude Code skill points to another kit | `doc-kit skill install`, from the kit you use |
| Foreign | ⚠ … exists but was not installed by doc-kit skill install | `doc-kit skill install --force` replaces it |

## How to check it works

- **Files**: `~/.claude/skills/doc-kit/SKILL.md` exists and mentions your kit's path.
- **Doctor**: `doc-kit doctor` shows ✔ for the skill.
- **Claude Code**: in a new session, asking "which skills do you have?" lists `doc-kit`.
- **Scripts**: `node ~/.claude/skills/doc-kit/scripts/brief.mjs --list` lists the brief templates.

## Common errors and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "… already exists and was not installed by this command" | A `doc-kit` skill folder copied by hand | `--force`, after checking you do not need it |
| "the kit's skill was not found" | An exported copy of the engine (it has no `skill/` folder) | Install from the kit's repository |
| Claude does not use the skill | The session was started before the install | Start a new session |

## Pitfalls and limits

> [!WARNING] Edits are replaced
> `doc-kit skill install` replaces the whole `doc-kit` folder. Keep project-specific rules in the project's
> `WRITING-GUIDE.md`, which the skill reads, rather than in the installed skill.

> [!NOTE] One kit per skill
> The installed skill points to one kit folder. Moving the kit, or using another copy, needs a new install;
> `doctor` reports it.

> [!WARNING] On Linux and macOS, a skills folder whose path holds a backslash
> There a backslash is a character of a folder's name, and node loads no module from under such a folder: the guard
> cannot start, `onFailure: block` refuses every command, and the agents get no Bash at all. Install the skill under a
> folder without one (`doc-kit skill install --target <folder>`). On Windows a backslash separates folders: nothing
> changes there.

> [!WARNING] The guard is not a sandbox
> It bounds the agents' Bash only. What an agent writes is bounded by its brief and your permissions, and a capture
> plan is a JavaScript module that `doc-kit capture` runs. It trusts any folder that holds a `doc.config.mjs` as a
> documentation folder: review such a file if the application ships one. An agent definition edited by hand may have
> lost its guard: `doctor` reports it as modified, and `doc-kit skill install` restores it.

## Required permissions

> [!PERMISSIONS] What the skill needs
> - **Install**: write access to the skills folder; nothing else is written.
> - **At work**: the permissions you give Claude Code in the repository. The skill never commits and never runs a
>   destructive git command; for production captures, **you** sign in (`doc-kit connect`), never the agent.
