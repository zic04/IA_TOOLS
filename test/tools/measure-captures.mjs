// Measures the capture of the demo (examples/demo-docs plans, served demo app, headless sign-in) and prints the
// --profile of the run: where the time of each capture goes (ETUDE-CAPTURES.md §3). Not a test; run by hand:
//   node test/tools/measure-captures.mjs [--delay <ms>] [--repeat <n>] [--concurrency <n>]
//   (--delay forces a delay on every plan entry; --repeat takes each capture n times under other ids;
//   --concurrency sets capture.concurrency)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCli } from "../../cli/doc-kit.mjs";
import { connect, loadAdapter } from "../../engine/capture/session.mjs";
import { KIT_ROOT, DEMO, demoCopy, tempDir } from "./helpers.mjs";

const i = process.argv.indexOf("--delay");
const delay = i > 0 ? Number(process.argv[i + 1]) : null;
const opt = (name, fallback) => {
  const k = process.argv.indexOf(name);
  return k > 0 ? Number(process.argv[k + 1]) : fallback;
};
const repeat = opt("--repeat", 1);
const concurrency = opt("--concurrency", undefined);
const appDir = tempDir("doc-kit-measure-app-");
fs.cpSync(path.join(KIT_ROOT, "examples", "demo-app"), appDir, { recursive: true });
const { serve } = await import(pathToFileURL(path.join(appDir, "serve.mjs")).href);
const app = await serve({ port: 0 });
const dir = demoCopy();
try {
  const plans = path.join(dir, "measure-plans");
  fs.mkdirSync(plans);
  const { CAPTURES } = await import(
    pathToFileURL(path.join(KIT_ROOT, "examples", "demo-docs", "captures", "plans", "use.mjs")).href
  );
  const entries = Array.from({ length: repeat }, (_, r) =>
    CAPTURES.map((c) => ({ ...c, id: r ? `${c.id}-${r}` : c.id, delay: delay ?? undefined })),
  ).flat();
  fs.writeFileSync(path.join(plans, "use.mjs"), `export const CAPTURES = ${JSON.stringify(entries)};\n`);
  fs.rmSync(path.join(dir, "captures", "plans"), { recursive: true, force: true });
  const raw = structuredClone((await import(pathToFileURL(path.join(DEMO, "doc.config.mjs")).href)).default);
  const config = {
    ...raw,
    app: { url: app.url },
    auth: { adapter: "manual", loginPattern: "^/login" },
    capture: { plans: "measure-plans", ...(concurrency ? { concurrency } : {}) },
  };
  fs.writeFileSync(path.join(dir, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);
  const auth = await loadAdapter("auth", { adapter: "manual", loginPattern: "^/login" }, dir, "auth");
  await connect({
    url: app.url,
    auth,
    file: path.join(dir, ".doc-kit", "session.json"),
    headless: true,
    poll: 100,
    waitForUser: async (page) => {
      await page.waitForURL(/\/login/);
      await page.fill("#email", "robin@example.org");
      await page.fill("#password", "demo");
      await page.click("button[type=submit]");
      await page.waitForURL(/\/orders$/);
    },
  });
  const code = await runCli(["capture", "--project", dir, "--profile"], {
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exitCode = code;
} finally {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(appDir, { recursive: true, force: true });
}
