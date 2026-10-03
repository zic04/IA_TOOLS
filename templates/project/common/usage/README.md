# usage/

Production statistics of this documentation, one file per version of the application: `<version>.jsonl`, one line
per measured block (setup, facts and each source, captures and each of their parts, generation, translation,
update, build, checks), with its time and, for the AI agents, its tokens and model.

The kit appends to these files on every run; nothing is ever rewritten. Commit them with the documentation:
`doc-kit stats` reads them (`--by step|version|model|phase`, `--csv`), and so does the "Cost of the documentation"
page. Delete this folder to stop recording; `DOC_KIT_STATS=0` turns recording off for one run.
