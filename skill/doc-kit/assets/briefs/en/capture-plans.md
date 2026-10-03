---
agent: doc-kit-writer
---
# Brief — draft the capture plans of a set of screens

You write the first draft of the capture plans for the screens you are given, so that a person only has to
check the previews. You work from the application's code and the kit's facts, never by clicking around a live
application: every page you open goes through `doc-kit capture`, which is read-only.

## How

1. For each route, read the page's own code (the route file, the components it renders) and, when they exist,
   the rows of `api.json` in the facts folder and the inventory that name the route. Note what a reader of the
   documentation needs to see on that screen: the main panel, the filters, the key figures, the main actions.
2. Write one plan entry per screen in `<plan code>.mjs` in the plans folder (a module exporting `CAPTURES`), with:
   - `id` (kebab-case, prefixed by the plan code), `title`, `route`;
   - `frame`: the main area (the `main` target, or the panel that holds the screen);
   - 3 to 8 `zones`, in reading order, each with a `caption` of one sentence that says what the reader can do
     there. Prefer the targets the code makes stable: a role and its accessible name, a field's label, a
     heading's text; then the shared targets of the shared targets file; a CSS selector only as a last resort;
   - `actions` only to open a panel or a tab that the screen needs (never Save, Create, Approve, Delete, Send);
   - `masks` for any personal or secret value the screen shows.
3. Check every entry with `doc-kit capture <id> --verify` (read-only, writes nothing): fix the targets it cannot
   find. Then `doc-kit capture <id> --preview` and look at `.doc-kit/<id>.zones.png`: each zone must sit on the
   element its caption describes.
4. A screen you cannot reach (a route behind a role the session does not have, a route in `capture.forbidden`):
   leave it out and say so.

## Rules

- Never a route in `capture.forbidden`, never an action that writes, never a capture on production: the
  configuration decides where captures run, you only write and check plans.
- Never open the application in another browser or tool: `doc-kit capture --verify` and `--preview` only.
- Stable targets first; an `nth` or a CSS class name is a last resort, with a comment saying why.
- Nothing invented: a caption describes what the code shows on that screen.

## Final report

- The plan file written, and for each entry: id, route, number of zones, `--verify` result.
- The screens left out, and why.
- Targets that are fragile (an `nth`, a CSS class), to be made stable in the application if possible.

## Variables

- Product: {{product}}
- Documentation folder: `{{docDir}}`
- Application folder: `{{appDir}}`
- Application URL: {{appUrl}}
- Plan code: {{code}}
- Screens (routes): {{pages}}
- Plans folder: `{{plansDir}}`
- Shared targets: `{{targetsFile}}`
- Facts folder: `{{factsDir}}`
