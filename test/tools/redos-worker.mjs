// Worker of the ReDoS test (test/unit/security.test.mjs): runs every expression that scans untrusted text on
// adversarial inputs and posts { start: name } before each check, then { name, ms, input } after it. A check that
// never ends (catastrophic backtracking) is caught by the test, which terminates this worker after a timeout and
// names the last check started.
import { parentPort } from "node:worker_threads";
import { GENERIC } from "../../engine/check/secrets.mjs";
import { RULES } from "../../engine/facts/security.mjs";
import { nextRouteHandlers, expressRoutes, fastapiRoutes, nextHandlerGuards } from "../../engine/facts/api.mjs";
import { pydanticEnvNames } from "../../engine/facts/env.mjs";
import { DB_PATTERNS } from "../../engine/facts/db.mjs";
import { parseNumstat } from "../../engine/facts/history.mjs";
import { RECORD_PATTERNS, codegenToEntry } from "../../engine/capture/record.mjs";
import { closingBrace, braceDepths } from "../../engine/util/js-scan.mjs";

// Prefixes that start a match of the detectors, followed by long runs of characters that make a badly written
// expression explore an exponential (or high-polynomial) number of paths.
const PREFIXES = [
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
];
const N = 3000;
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
  ["js-scan closingBrace", (s) => closingBrace(s, 0)],
  ["js-scan braceDepths", (s) => braceDepths(s)],
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
