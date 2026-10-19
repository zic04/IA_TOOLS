// Infra adapter of the Azure Resource Manager templates (ARCHITECTURE.md §5, §6.9): a JSON file whose `$schema` names
// a deployment template (deploymentTemplate.json, and its subscription, management group and tenant forms) — its
// resources, the nested ones to three levels (a child's type completed by its parent's) and the symbolic-name form of
// languageVersion 2.0, with their type, apiVersion and name as written (an expression such as [parameters('name')] is
// kept as such: never a parameter's value); a linked template (Microsoft.Resources/deployments with a templateLink:
// kind module, its URI without its query, the names of its parameters; an inline template's resources are read); the
// names of its parameters (never a defaultValue) and outputs. A security rule under a resource's properties whose
// sourceAddressPrefix(es) is open ("*", "Internet", "0.0.0.0/0") — inbound and allowed — makes it openToAll. Comments
// (ARM accepts // and /* */) are blanked before the text is parsed; a parameters file (deploymentParameters, values)
// does not match the marker and is never read.
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";
import { environmentOfPath, openToAll, withoutQuery } from "../../engine/facts/infra-common.mjs";
import { at, entries, items as itemsOf, text } from "../../engine/core/yaml.mjs";
import { jsonTree, withoutJsonComments } from "../../engine/core/json-tree.mjs";

/** The files read: JSON whose text names a deployment template's schema. */
const FILES = /\.json$/i;
const MARKER = /[Dd]eploymentTemplate\.json/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const ARM_PATTERNS = Object.freeze({ FILES, MARKER });

/** The levels of nested resources read, the nodes of a resource's properties walked, the parameters named. */
const MAX_DEPTH = 3;
const MAX_NODES = 200_000;
const MAX_INPUTS = 64;
const DEPLOYMENTS = "microsoft.resources/deployments";

/**
 * @typedef {{ kind: string, provider?: string, type: string, name: string, file?: string, line?: number,
 *   env?: string, source?: string, version?: string, variables?: string[], openToAll?: boolean }} Item
 * @typedef {{ type: "map", line: number, entries: Array<{ key: string, line: number, value: any }> } |
 *   { type: "seq", line: number, items: any[] } | { type: "scalar", line: number, value: string }} JsonNode
 */

/** Whether a security rule (the mapping that holds its ranges) lets in: neither outbound nor a denial. */
function allows(rule) {
  return (
    text(at(rule, "direction"))?.toLowerCase() !== "outbound" && text(at(rule, "access"))?.toLowerCase() !== "deny"
  );
}

/**
 * Whether the security rules under a resource's properties let anyone in: true when a rule's sourceAddressPrefix(es)
 * holds an open range and the rule is inbound and allows, false when rules hold ranges but none does so, undefined
 * when there is none or when one of them is an expression (`[parameters('src')]`: the kit cannot tell, so never says
 * closed). Each node visited once (nested resources and templates are read on their own), MAX_NODES at most.
 */
function openness(properties) {
  let seen = false;
  let open = false;
  let unknown = false;
  const stack = properties ? [properties] : [];
  for (let budget = MAX_NODES; stack.length && budget > 0; budget--) {
    const n = stack.pop();
    if (n.type === "map") {
      // A list of ranges may be one expression ("[parameters('ranges')]"): a range too, unknown.
      const list = at(n, "sourceAddressPrefixes");
      const ranges = [at(n, "sourceAddressPrefix"), ...(list && list.type !== "seq" ? [list] : itemsOf(list))].filter(
        Boolean,
      );
      seen ||= ranges.length > 0;
      open ||= ranges.some((r) => opens(text(r))) && allows(n);
      unknown ||= ranges.some((r) => text(r) === null || isExpression(text(r))) && allows(n);
    }
    for (const child of childrenOf(n)) if (child) stack.push(child);
  }
  return seen && (open || !unknown) ? open : undefined;
}

/** Whether a value of a template is an expression (`[parameters('x')]`; "[[" escapes a literal bracket). */
const isExpression = (s) => s.startsWith("[") && !s.startsWith("[[");

/** Whether the text before a quoted string of an expression makes it a name: `parameters('…')`, `variables('…')`. */
const naming = (before) => {
  const b = before.trimEnd().toLowerCase();
  return b.endsWith("parameters(") || b.endsWith("variables(");
};

/**
 * Whether a range lets anyone in: an open literal, or an expression holding one among its quoted strings
 * (`[if(parameters('public'), '*', '10.0.0.0/8')]`: it may be open, so the kit says so) — never the name of a
 * parameter or a variable (`[parameters('Internet')]` is unknown).
 * @param {string|null} s
 */
function opens(s) {
  if (s === null) return false;
  if (openToAll(s)) return true;
  if (!isExpression(s)) return false;
  const parts = s.split("'");
  return parts.some((part, i) => i % 2 === 1 && !naming(parts[i - 1]) && openToAll(part));
}

/** The nodes under a node, but nested resources and templates (read on their own). */
function childrenOf(n) {
  if (n.type === "seq") return n.items;
  return n.type === "map"
    ? n.entries.filter((e) => e.key !== "resources" && e.key !== "template").map((e) => e.value)
    : [];
}

/** The item of one resource (its type already completed): a linked deployment is a module. */
function resourceItem(r, type, symbol) {
  const link = type.toLowerCase() === DEPLOYMENTS ? at(r, "properties", "templateLink") : undefined;
  const item = /** @type {Item} */ ({
    kind: link ? "module" : "resource",
    provider: "azure",
    type,
    name: text(at(r, "name")) ?? symbol,
    version: text(at(r, "apiVersion")) ?? undefined,
  });
  if (link) {
    const source = text(at(link, "uri")) ?? text(at(link, "relativePath"));
    if (source) item.source = withoutQuery(source);
    item.variables = entries(at(r, "properties", "parameters"))
      .map((e) => e.key)
      .slice(0, MAX_INPUTS);
  }
  const open = openness(at(r, "properties"));
  if (open !== undefined) item.openToAll = open;
  return item;
}

/**
 * The resources of a list (or of a mapping of symbolic names), and of their nested lists to MAX_DEPTH levels, each
 * handed to `push` with its line.
 */
function resources(node, parent, depth, push) {
  if (depth > MAX_DEPTH) return;
  const list =
    node?.type === "map"
      ? entries(node).map((e) => ({ r: e.value, symbol: e.key }))
      : itemsOf(node).map((r) => ({ r, symbol: undefined }));
  for (const { r, symbol } of list) {
    const own = r?.type === "map" ? text(at(r, "type")) : null;
    if (!own) continue;
    const type = parent && !own.includes("/") ? `${parent}/${own}` : own;
    if (!push(resourceItem(r, type, symbol), r.line)) return;
    resources(at(r, "resources"), type, depth + 1, push);
    if (type.toLowerCase() === DEPLOYMENTS)
      resources(at(r, "properties", "template", "resources"), null, depth + 1, push);
  }
}

/**
 * The items of one ARM template (already a tree, its `$schema` checked), pushed into `items` (MAX_ITEMS at most).
 * @param {JsonNode} doc
 * @param {string} file
 * @param {Item[]} [items]
 * @returns {Item[]}
 */
export function armTemplate(doc, file, items = []) {
  const env = environmentOfPath(file);
  const push = (fields, line) => {
    if (items.length >= MAX_ITEMS) return false;
    items.push({ ...fields, file, line, ...(env ? { env } : {}) });
    return true;
  };
  for (const e of entries(at(doc, "parameters"))) push({ kind: "variable", type: "parameter", name: e.key }, e.line);
  resources(at(doc, "resources"), null, 1, push);
  for (const e of entries(at(doc, "outputs"))) push({ kind: "output", type: "output", name: e.key }, e.line);
  return items;
}

export default {
  name: "arm",
  files: FILES,
  marker: MARKER,
  infra({ sources }) {
    const items = [];
    for (const [file, raw] of sources) {
      if (items.length >= MAX_ITEMS) break;
      const doc = jsonTree(withoutJsonComments(raw));
      const schema = text(at(doc, "$schema"));
      if (doc?.type === "map" && schema && MARKER.test(schema)) armTemplate(doc, file, items);
    }
    return items;
  },
};
