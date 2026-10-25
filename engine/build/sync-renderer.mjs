// The kit's renderer as `sync` reads a page with it (ARCHITECTURE.md §6.10): the page's Markdown rendered by the
// build's own engine (engine/build/markdown.mjs: Marked and the kit's extensions, the project's statuses and
// behaviour cards), so that what a page cites, and what `--apply --labels` may rewrite, is what the site shows. The
// CLI gives it to the engine of sync (engine/sync/labels.mjs, labelReader), which comes before the build (RULES.md
// M14). Nothing is read from the disk while a page renders: every screenshot exists (its title and legend show), a
// diagram shows its title, a facts table nothing, and nothing is reported.
import { createMarkdownEngine } from "./markdown.mjs";
import { projectBehaviours } from "./behaviours.mjs";

/** A screenshot of any id: no zones, no size, its title the directive's (else its id, as the site's alternative
 * text). */
const ANY_CAPTURE = new Proxy(
  {},
  { get: (_, id) => ({ file: String(id), title: "", width: 0, height: 0, zones: [] }) },
);

/**
 * @param {{ root: string, config: any }} p   the documentation project and its configuration
 * @returns {(markdown: string) => string}   a page's Markdown → its HTML
 */
export function createSyncRenderer({ root, config }) {
  const engine = createMarkdownEngine({
    captures: ANY_CAPTURE,
    exists: () => true,
    read: () => "",
    report: () => {},
    t: () => "",
    icon: () => "",
    statuses: config.statuses || {},
    behaviours: projectBehaviours(root, config),
  });
  return (markdown) => engine.render(markdown, "sync").html;
}
