// Worker of the ReDoS test (test/unit/security.test.mjs): runs every expression that scans untrusted text on
// adversarial inputs and posts { start: name } before each check, then { name, ms, input } after it. A check that
// never ends (catastrophic backtracking) is caught by the test, which terminates this worker after a timeout and
// names the last check started.
import { parentPort } from "node:worker_threads";
import { GENERIC, HTML_ATTRIBUTE } from "../../engine/check/secrets.mjs";
import { INLINE_SCRIPT } from "../../engine/build/csp.mjs";
import { NETWORK_PATTERNS, LOCAL_SPEC } from "../../engine/facts/network.mjs";
import { DEPENDENCY_PATTERNS } from "../../engine/facts/dependencies.mjs";
import { RULES } from "../../engine/facts/security.mjs";
import { ENV_PATTERNS } from "../../engine/build/c4.mjs";
import { nextRouteHandlers, expressRoutes, fastapiRoutes, nextHandlerGuards } from "../../engine/facts/api.mjs";
import { pydanticEnvNames } from "../../engine/facts/env.mjs";
import { DB_PATTERNS } from "../../engine/facts/db.mjs";
import { parseNumstat } from "../../engine/facts/history.mjs";
import { RECORD_PATTERNS, codegenToEntry } from "../../engine/capture/record.mjs";
import { closingBrace, braceDepths } from "../../engine/util/js-scan.mjs";
import { walkXml, decodeEntities, inertMarkup } from "../../engine/inputs/xml.mjs";
import { diagramToMarkdown } from "../../engine/inputs/diagrams.mjs";
import { pdfIndex } from "../../engine/inputs/pdf.mjs";
import { htmlToText } from "../../engine/inputs/ingest.mjs";
import { isSafeRepoUrl, nameOf, hasCredentials } from "../../engine/inputs/model.mjs";
import { parseGitConfig } from "../../engine/util/safe-git.mjs";
import { KitError } from "../../engine/project/errors.mjs";

// Prefixes that start a match of the detectors, followed by long runs of characters that make a badly written
// expression explore an exponential (or high-polynomial) number of paths.
const PREFIXES = [
  "@acme:registry=",
  "registry=",
  '"@acme:registry" ',
  "npmRegistryServer: ",
  "npmScopes:\n  ",
  "[install.scopes]\n",
  "[[tool.poetry.source]]\nurl = ",
  'corp = { source = "',
  "corp = { version = ",
  "name @ ",
  "--index-url ",
  "a/",
  "<script>",
  "<script ",
  '<a href="',
  "<a x=",
  "",
  "{ `${",
  "{ /*",
  "await page.goto('",
  "await page.getByRole('button', { name: '",
  "await page.locator('",
  "model A {\n",
  "CREATE TABLE t (",
  'ForeignKey("',
  "REFERENCES ",
  "@@x\t",
  "-----BEGIN PRIVATE KEY-----\n",
  "-----BEGIN RSA PRIVATE KEY-----\nProc-Type: x\n",
  "eyJ",
  "eyJabcdefgh.eyJ",
  "Password=",
  "https://u:",
  "?sig=",
  "secret = ",
  "api_key: ",
  "verify=",
  "app.get(",
  "@app.get(",
  'router.post("/x", ',
  "res.redirect(",
  "SELECT * FROM t WHERE a = ",
  "export async function GET(",
  "class S(BaseSettings):\n",
  "dangerouslySetInnerHTML",
  "Access-Control-Allow-Origin",
  // The readers of the documents of the sources (engine/inputs/): XML, diagrams, PDF.
  "<r ",
  "<r a='",
  '<r a="',
  "<r>&",
  "<r>&#x",
  "<r><!--",
  "<r><![CDATA[",
  "<!DOCTYPE r [",
  '<!DOCTYPE r [<!ENTITY a "',
  '<mxfile><diagram name="a">',
  '<mxGraphModel><root><mxCell id="1" vertex="1" value="<',
  "@startuml\n",
  "@startuml\nA -",
  "@startuml\nA -[",
  '@startuml\ncomponent "',
  "@startuml\n[A] as ",
  "graph TD\nA",
  "graph TD\nA[",
  'graph TD\nA["',
  "graph TD\nA -- ",
  "flowchart LR\nA --> B & ",
  "C4Context\nRel(",
  'C4Context\nPerson(a, "',
  "<< /Type /Pages /Count ",
  "<< /Title (",
  "stream\n",
];
const UNITS = [
  " ",
  "\t",
  "\n",
  "   \n",
  " \t\n",
  "a",
  "A1",
  "a:",
  "a-",
  "=",
  "-",
  "/",
  "'",
  '"',
  "(",
  "{",
  "a.",
  "%",
  "+",
  "_",
  "\\",
  "<",
  ">",
  "&",
  "[",
  "]",
  "|",
  ":",
  "<<",
];
const N = 3000;

/** A check of a scanner that may refuse its input (KitError): the refusal is caught, any other error is not. */
const refusing = (fn) => (s) => {
  try {
    fn(s);
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
  }
};
const INPUTS = PREFIXES.flatMap((p) => UNITS.map((u) => p + u.repeat(Math.ceil(N / u.length)) + "!"));

export const CHECKS = [
  ...GENERIC.map((d) => [
    `secret detector ${d.kind}`,
    (s) => {
      d.re.lastIndex = 0;
      for (const m of s.matchAll(d.re)) d.accept?.(m);
    },
  ]),
  ...RULES.map((r) => [`OWASP heuristic ${r.rule}`, (s) => r.find(s)]),
  ["api nextRouteHandlers", (s) => nextRouteHandlers(s)],
  ["api nextHandlerGuards", (s) => nextHandlerGuards(s)],
  ["api expressRoutes", (s) => expressRoutes(s, "x.js")],
  ["api fastapiRoutes", (s) => fastapiRoutes(new Map([["x.py", s]]))],
  ["env pydanticEnvNames", (s) => pydanticEnvNames(s)],
  ...ENV_PATTERNS.map((re, i) => [`c4 environment variable ${i}`, (s) => re.test(s)]),
  ...Object.entries(DB_PATTERNS).map(([name, re]) => [
    `db ${name}`,
    (s) => {
      if (re.global) for (const m of s.matchAll(re)) void m;
      else re.exec(s);
    },
  ]),
  ["history parseNumstat", (s) => parseNumstat(s)],
  ...Object.entries(RECORD_PATTERNS).map(([name, re]) => [`record ${name}`, (s) => re.exec(s)]),
  ["record codegenToEntry", (s) => codegenToEntry(s, { appUrl: "http://a.test", id: "x" })],
  ["check secrets HTML_ATTRIBUTE", (s) => [...s.matchAll(HTML_ATTRIBUTE)].length],
  ["csp INLINE_SCRIPT", (s) => [...s.matchAll(INLINE_SCRIPT)].length],
  ...Object.entries(NETWORK_PATTERNS).map(([name, re]) => [
    `network ${name}`,
    (s) => (re.global ? [...s.matchAll(re)].length : re.test(s)),
  ]),
  ["network LOCAL_SPEC", (s) => LOCAL_SPEC.test(s)],
  ...Object.entries(DEPENDENCY_PATTERNS).map(([name, re]) => [`dependencies ${name}`, (s) => re.exec(s)]),
  ["js-scan closingBrace", (s) => closingBrace(s, 0)],
  ["js-scan braceDepths", (s) => braceDepths(s)],
  // The readers of documents scan without regular expressions; they are checked as scanners, a refusal
  // ("inputs.refused") being a normal outcome on these inputs.
  ["inputs walkXml", refusing((s) => walkXml(s, { open() {}, close() {}, text() {} }))],
  ["inputs walkXml (inside a root)", refusing((s) => walkXml(`<r>${s}</r>`, {}))],
  ["inputs decodeEntities", (s) => decodeEntities(s)],
  ["inputs inertMarkup", (s) => inertMarkup(s)],
  ["inputs diagram drawio", refusing((s) => diagramToMarkdown(s, "drawio"))],
  ["inputs diagram puml", (s) => diagramToMarkdown(s, "puml")],
  ["inputs diagram mermaid", (s) => diagramToMarkdown(s, "mermaid")],
  ["inputs diagram mermaid flowchart", (s) => diagramToMarkdown(`graph TD\n${s}`, "mermaid")],
  ["inputs diagram mermaid C4", (s) => diagramToMarkdown(`C4Context\n${s}`, "mermaid")],
  ["inputs pdfIndex", (s) => pdfIndex(Buffer.from(`%PDF-1.7\n${s}`, "latin1"))],
  // An HTML document of the sources, and the addresses and names of inputs.json.
  ["inputs htmlToText", (s) => htmlToText(s)],
  ["inputs htmlToText (in a page)", (s) => htmlToText(`<html><body><h1>${s}</h1><p>${s}</p><script>${s}`)],
  ["inputs isSafeRepoUrl", (s) => isSafeRepoUrl(`https://github.com/${s}`) || isSafeRepoUrl(`git@h:${s}`)],
  ["inputs nameOf", (s) => nameOf(s)],
  ["inputs hasCredentials", (s) => hasCredentials(`https://h/x?${s}`) || hasCredentials(s)],
  ["safe-git parseGitConfig", (s) => parseGitConfig(`[core] ${s}\n[a "${s}"]\n${s}`)],
];

for (const [name, fn] of CHECKS) {
  parentPort.postMessage({ start: name });
  let worst = { ms: 0, input: "" };
  for (const input of INPUTS) {
    const t = performance.now();
    fn(input);
    const ms = performance.now() - t;
    if (ms > worst.ms) worst = { ms, input: input.slice(0, 60) };
  }
  parentPort.postMessage({ name, ...worst });
}
parentPort.postMessage({ done: true });
