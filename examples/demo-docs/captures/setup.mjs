// Demo data preparation (capture.setup, run by `doc-kit demo`): resets the orders and the profile of the demo
// app to their initial state. Idempotent: run it as often as needed, before each capture campaign.
export default async function setup({ url }) {
  if (!url) throw new Error("app.url is not set in doc.config.mjs");
  const r = await fetch(`${url}/api/demo/reset`, { method: "POST" });
  if (!r.ok) throw new Error(`demo reset refused: HTTP ${r.status}`);
  console.log(`demo data reset on ${url}`);
}
