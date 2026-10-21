// Infra adapter of AWS CloudFormation and SAM (ARCHITECTURE.md §5, §6.9): a YAML or JSON template — one that names
// AWSTemplateFormatVersion, or whose `Resources` mapping holds a `Type: AWS::…` — read by the kit's YAML reader
// (engine/core/yaml.mjs: no alias expanded, a tag kept beside its value) or a positional JSON reader: each resource
// (kind resource, provider aws, type, name = its logical id), a nested stack (AWS::CloudFormation::Stack, SAM's
// AWS::Serverless::Application: kind module, its TemplateURL or Location without its query, the names of its
// Parameters), the names of a function's environment variables (never their values), a rule's or a SAM event's
// cron(…) schedule; the names of the Parameters (never a Default, nor AllowedValues) and Outputs. A security group
// whose ingress CidrIp/CidrIpv6 is open (0.0.0.0/0, ::/0) is openToAll (egress never). A value under a tag (!Ref,
// !Sub, !GetAtt…) or an intrinsic function is never kept. Files of a CDK assembly (cdk.out/, generated) are not read.
import { MAX_ITEMS } from "../../engine/facts/stack-common.mjs";
import { environmentOfPath, openToAll, withoutQuery } from "../../engine/facts/infra-common.mjs";
import { readYaml, at, entries } from "../../engine/core/yaml.mjs";
import { jsonTree } from "../../engine/core/json-tree.mjs";

/** The files read (YAML, JSON, .template), their text naming CloudFormation (a CDK assembly, cdk.out/, is never given). */
const FILES = /\.(?:ya?ml|json|template)$/i;
const MARKER = /AWSTemplateFormatVersion|AWS::[A-Za-z0-9]{2,64}::/;
/** An EventBridge schedule, `cron(0 3 * * ? *)`: the cron expression inside it. */
const CRON_EXPRESSION = /^cron\(([^()]{1,64})\)$/;

/** The expressions of this adapter (test/tools/redos-worker.mjs, RULES.md S5). */
export const CLOUDFORMATION_PATTERNS = Object.freeze({ FILES, MARKER, CRON_EXPRESSION });

/** The nodes of a resource's properties walked, the names kept per list. */
const MAX_NODES = 200_000;
const MAX_NAMES = 64;
/** The nested stacks, and the property that names the template each deploys. */
const NESTED = Object.freeze({
  "AWS::CloudFormation::Stack": "TemplateURL",
  "AWS::Serverless::Application": "Location",
});
/** The functions, whose Environment.Variables are named. */
const FUNCTIONS = new Set(["AWS::Lambda::Function", "AWS::Serverless::Function"]);
/** The scheduled resources, whose ScheduleExpression is read. */
const SCHEDULED = new Set(["AWS::Events::Rule", "AWS::Scheduler::Schedule"]);
/** The address ranges of an ingress rule. */
const RANGES = new Set(["CidrIp", "CidrIpv6"]);

/**
 * @typedef {{ kind: string, provider?: string, type: string, name: string, file?: string, line?: number,
 *   env?: string, source?: string, schedule?: string, variables?: string[], openToAll?: boolean }} Item
 */

/** A scalar's text when it is plain: no tag (!Ref, !Sub…), no alias — a value under a tag is never read. */
const plain = (n) => (n?.type === "scalar" && (!n.tag || n.tag === "!!str") && !n.alias ? n.value : null);

/** The keys of a mapping node, MAX_NAMES at most. */
const keysOf = (n) =>
  entries(n)
    .slice(0, MAX_NAMES)
    .map((e) => e.key);

/** The documents of a template's text: a JSON one (it opens with "{"), else its YAML documents. */
function documents(raw) {
  const s = raw.charCodeAt(0) === 0xfeff ? ` ${raw.slice(1)}` : raw;
  const json = s.trimStart().startsWith("{") ? jsonTree(s) : null;
  return json ? [json] : readYaml(s);
}

/** Whether a document is a template: AWSTemplateFormatVersion, or a resource whose Type is AWS's. */
const isTemplate = (doc) =>
  doc?.type === "map" &&
  (at(doc, "AWSTemplateFormatVersion") !== undefined ||
    entries(at(doc, "Resources")).some((e) => plain(at(e.value, "Type"))?.startsWith("AWS::")));

/** The cron expression of a schedule written `cron(…)`, or undefined (a `rate(…)` is no cron expression). */
function cronOf(v) {
  if (typeof v !== "string" || v.length > 200) return undefined;
  return CRON_EXPRESSION.exec(v.trim())?.[1].trim();
}

/** The schedule of a rule, a schedule or a SAM function (its first Schedule event), or undefined. */
function scheduleOf(props, type) {
  if (SCHEDULED.has(type)) return cronOf(plain(at(props, "ScheduleExpression")));
  if (type !== "AWS::Serverless::Function") return undefined;
  for (const e of entries(at(props, "Events"))) {
    const kind = plain(at(e.value, "Type"));
    const cron =
      kind === "Schedule" || kind === "ScheduleV2"
        ? cronOf(plain(at(e.value, "Properties", kind === "Schedule" ? "Schedule" : "ScheduleExpression")))
        : undefined;
    if (cron) return cron;
  }
  return undefined;
}

/**
 * Whether the ingress ranges under a resource's properties let anyone in: true when a CidrIp or CidrIpv6 is open,
 * false when ranges are given but none is, "unknown" when one of them is no literal (a !Ref, an intrinsic: the kit
 * cannot tell, so never says closed), undefined when there is none. Egress rules are left out; each node is visited
 * once, MAX_NODES at most.
 * @returns {boolean|"unknown"|undefined}
 */
function openness(properties) {
  let seen = false;
  let open = false;
  let unknown = false;
  const stack = properties ? [properties] : [];
  for (let budget = MAX_NODES; stack.length && budget > 0; budget--) {
    const n = stack.pop();
    const ranges = n.type === "map" ? n.entries.filter((e) => RANGES.has(e.key)) : [];
    seen ||= ranges.length > 0;
    open ||= ranges.some((e) => opens(e.value));
    unknown ||= ranges.some((e) => plain(e.value) === null);
    for (const child of childrenOf(n)) if (child) stack.push(child);
  }
  return !seen ? undefined : open ? true : unknown ? "unknown" : false;
}

/**
 * Whether a range lets anyone in: an open literal, or one among the literals of a condition (`!If [IsPublic,
 * 0.0.0.0/0, 10.0.0.0/8]`, Fn::If): it may be open, so the kit says so. 64 nodes at most.
 */
function opens(range) {
  const stack = [range];
  for (let budget = 64; stack.length && budget > 0; budget--) {
    const n = stack.pop();
    if (openToAll(plain(n))) return true;
    if (n?.type === "seq") stack.push(...n.items.slice(0, 64));
    else if (n?.type === "map") stack.push(...n.entries.slice(0, 64).map((e) => e.value));
  }
  return false;
}

/** The nodes under a node, but its ranges and its egress rules. */
function childrenOf(n) {
  if (n.type === "seq") return n.items;
  return n.type === "map"
    ? n.entries.filter((e) => !RANGES.has(e.key) && e.key !== "SecurityGroupEgress").map((e) => e.value)
    : [];
}

/** The item of one resource entry (`LogicalId: { Type, Properties }`), or null without a plain Type. */
function resourceItem(e) {
  const type = plain(at(e.value, "Type"));
  if (!type) return null;
  const props = at(e.value, "Properties");
  const item = /** @type {Item} */ ({ kind: "resource", provider: "aws", type, name: e.key });
  if (NESTED[type]) {
    const source = plain(at(props, NESTED[type]));
    item.kind = "module";
    if (source) item.source = withoutQuery(source);
    item.variables = keysOf(at(props, "Parameters"));
  }
  if (FUNCTIONS.has(type)) item.variables = keysOf(at(props, "Environment", "Variables"));
  const schedule = scheduleOf(props, type);
  if (schedule) item.schedule = schedule;
  // An egress rule never lets anyone in, whatever its ranges.
  const open = openness(props);
  if (open !== undefined)
    item.openToAll = type === "AWS::EC2::SecurityGroupEgress" ? false : open === "unknown" ? undefined : open;
  return item;
}

/**
 * The items of one template's document (already checked: isTemplate), pushed into `items` (MAX_ITEMS at most).
 * @param {any} doc
 * @param {string} file
 * @param {Item[]} [items]
 * @returns {Item[]}
 */
export function cloudformationTemplate(doc, file, items = []) {
  const env = environmentOfPath(file);
  const push = (fields, line) => {
    if (fields && items.length < MAX_ITEMS) items.push({ ...fields, file, line, ...(env ? { env } : {}) });
  };
  for (const e of entries(at(doc, "Parameters"))) push({ kind: "variable", type: "parameter", name: e.key }, e.line);
  for (const e of entries(at(doc, "Resources"))) push(resourceItem(e), e.line);
  for (const e of entries(at(doc, "Outputs"))) push({ kind: "output", type: "output", name: e.key }, e.line);
  return items;
}

export default {
  name: "cloudformation",
  files: FILES,
  marker: MARKER,
  infra({ sources }) {
    const items = [];
    for (const [file, text] of sources) {
      for (const doc of documents(text)) {
        if (items.length >= MAX_ITEMS) return items;
        if (isTemplate(doc)) cloudformationTemplate(doc, file, items);
      }
    }
    return items;
  },
};
