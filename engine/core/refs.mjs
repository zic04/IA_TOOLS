// Ticket references (ARCHITECTURE.md §6.8b): how an epic, a feature or a user story names its item in a backlog
// tool, written as the tools write it — Azure Boards `ADO#1234` (or `AB#1234`, the form Azure Boards and GitHub link
// on), Jira `PROJ-123`, GitHub `owner/repo#42`, GitLab `group/subgroup/project#7` — and the link the site gives it
// from the project's templates (config.backlog.refs: an https:// address with `{id}`, and `{repo}` for GitHub and
// GitLab). A reference the kit cannot read is shown as written, without a link. Pure.

/** The forms of a reference: each anchored, bounded, linear (test/tools/redos-worker.mjs). */
const AZURE = /^(?:ADO|AB)#(\d{1,9})$/;
const JIRA = /^([A-Z][A-Z0-9_]{1,19})-(\d{1,9})$/;
const REPO = /^([A-Za-z0-9_.-]{1,100}(?:\/[A-Za-z0-9_.-]{1,100}){1,7})#(\d{1,9})$/;

/** The expressions of this module (test/tools/redos-worker.mjs, RULES.md S5). */
export const REFS_PATTERNS = Object.freeze({ AZURE, JIRA, REPO });

/**
 * @typedef {{ tool: "azure"|"jira"|"repo", id: string, text: string, repo?: string }} TicketRef
 *   id: the work item's number (Azure, GitHub, GitLab) or the issue's key (Jira, `PROJ-123`)
 */

/**
 * A reference as the kit reads it, or null when it has none of the forms above.
 * @param {unknown} text
 * @returns {TicketRef|null}
 */
export function parseRef(text) {
  if (typeof text !== "string" || text.length > 300) return null;
  const s = text.trim();
  let m = AZURE.exec(s);
  if (m) return { tool: "azure", id: m[1], text: s };
  m = JIRA.exec(s);
  if (m) return { tool: "jira", id: s, text: s };
  m = REPO.exec(s);
  if (m && !m[1].split("/").some((part) => part === "." || part === ".."))
    return { tool: "repo", id: m[2], repo: m[1], text: s };
  return null;
}

/**
 * The tool of a `repo#n` reference: GitHub or GitLab, whichever the project has a template for; with both, a path of
 * two parts is GitHub's `owner/repo`, a longer one GitLab's `group/subgroup/project`.
 */
function repoTool(ref, refs) {
  const deep = (ref.repo ?? "").split("/").length > 2;
  if (refs.github && refs.gitlab) return deep ? "gitlab" : "github";
  return refs.github ? "github" : refs.gitlab ? "gitlab" : null;
}

/**
 * The link of a reference, from the project's templates, or null: no template for its tool, or a template that is no
 * https:// address. The parts it puts in the template are digits, a Jira key or a repository path: URL-encoded.
 * @param {TicketRef|null} ref
 * @param {Record<string, string>|undefined} refs   config.backlog.refs
 * @returns {string|null}
 */
export function refUrl(ref, refs) {
  if (!ref || !refs) return null;
  const tool = ref.tool === "repo" ? repoTool(ref, refs) : ref.tool;
  const template = tool ? refs[tool] : undefined;
  if (typeof template !== "string" || !template.startsWith("https://") || !template.includes("{id}")) return null;
  const repo = (ref.repo ?? "").split("/").map(encodeURIComponent).join("/");
  return template.replaceAll("{id}", encodeURIComponent(ref.id)).replaceAll("{repo}", repo);
}
