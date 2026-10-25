// `doc-kit sync` played as people use it (ARCHITECTURE.md §6.10), not one function at a time: the reference built on
// examples/demo-app, the application changed to examples/demo-app-v2, a report, `--apply`, one page marked, a report
// again, a label renamed, another page marked, the messages file deleted. At each step, the exact list of signals: a
// signal pending on a page stays until that page is marked — never cleared by marking another one, nor by `--apply`'s
// restamp. No real git: the `exec` and `commit` seams of the context answer for it (RULES.md M4), commit by commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCli } from "../../cli/doc-kit.mjs";
import { KIT_ROOT, DEMO, demoCopy, tempDir } from "../tools/helpers.mjs";

const V1 = path.join(KIT_ROOT, "examples", "demo-app");
const V2 = path.join(KIT_ROOT, "examples", "demo-app-v2");

/** The demo's two captures as plain objects (its own plan imports doc-kit/targets, which resolves only in the kit);
 * with v2, the docs team adds the new Notifications field to the settings and rewords a caption of the orders list. */
function writePlan(root, v2) {
  const captures = [
    {
      id: "orders-list",
      title: "Acme Orders › Orders",
      route: "/orders",
      zones: [{ text: "Today", caption: v2 ? "Today's orders" : "Order summary" }],
    },
    {
      id: "settings-profile",
      title: "Acme Orders › Settings",
      route: "/settings",
      zones: [
        { text: "Profile", caption: "Profile" },
        ...(v2 ? [{ field: "Notifications", caption: "Notifications" }] : []),
      ],
    },
  ];
  const dir = path.join(root, "captures", "plans");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "use.mjs"), `export const CAPTURES = ${JSON.stringify(captures, null, 2)};\n`);
}

/** The git of the application, as the `exec` seam: HEAD is `state.head`; what changed since c1 is v2's routes. */
const SINCE_C1 =
  '@@ -18 +18 @@\n-const PAGES = [[/^\\/orders$/, "orders.html"]];\n+const PAGES = [[/^\\/invoices$/, "invoices.html"]];\n';
function gitOf(state) {
  return (bin, args) => {
    if (bin !== "git") return null;
    if (args[0] === "rev-parse")
      return { status: 0, stdout: args[1] === "--is-inside-work-tree" ? "true\n" : `${state.head}\n` };
    if (args[0] === "diff" && args[1] === "--name-status") return { status: 0, stdout: "" };
    // ["diff", "--relative", "--end-of-options", ref, "--", …paths]: nothing changed since c2.
    if (args[0] === "diff") return { status: 0, stdout: args[3] === "c1" ? SINCE_C1 : "" };
    return { status: 1, stdout: "" };
  };
}

/** Every category of a report, one line per signal. */
const signals = (r) => ({
  proofsMoved: r.proofs.moved.map((m) => `${m.page} ${m.ref} → ${m.newRef}`),
  proofsBroken: r.proofs.broken.map((b) => `${b.page} ${b.ref} ${b.reason}`),
  labels: r.labels.map((l) => `${l.key}: ${l.old} → ${l.new} (${l.pages.join(", ")})`),
  review: r.review.map((x) => `${x.page} ${x.priority}`),
  captures: r.captures.map((c) => `${c.id} ${c.reasons.join("+")} (${c.pages.join(", ")})`),
  new: r.new.map((n) => `${n.family} ${n.id}`),
  removed: r.removed.map((n) => `${n.family} ${n.id} (${n.pages.join(", ")})`),
  edited: r.edited ?? [],
  unchanged: [...r.unchanged].sort(),
  unmarked: r.unmarked,
  translations: (r.translations || []).map((t) => `${t.lang} ${t.file} ${t.state}`),
});

const ALL = [
  "features/approve-order",
  "features/roles",
  "features/rules",
  "features/track-orders",
  "maintain/architecture",
  "risks/findings",
  "secure/access-ownership",
  "secure/api-surface",
  "use/orders",
  "use/orders/detail",
  "use/settings",
];
const NOTHING = {
  proofsMoved: [],
  proofsBroken: [],
  labels: [],
  review: [],
  captures: [],
  new: [],
  removed: [],
  edited: [],
  unmarked: [],
  translations: [],
};
const LABEL_PAGES = "(features/approve-order, features/rules, features/roles)";
/** What version 2 leaves to follow, once use/settings is checked. */
const AFTER_SETTINGS = {
  ...NOTHING,
  proofsBroken: ["risks/findings order.html:22 textNotFound"],
  labels: [`orders.approvalLink: Approval chain → Approvals ${LABEL_PAGES}`],
  review: [
    "features/approve-order direct",
    "risks/findings direct",
    "secure/access-ownership probablyIntact",
    "secure/api-surface shared",
  ],
  captures: ["orders-list plan (use/orders)"],
  new: ["glob/Routes invoices.html"],
  edited: ["use/orders/detail"],
  unchanged: ["features/track-orders", "maintain/architecture", "use/orders", "use/settings"],
  translations: ["fr use/orders/detail.md stale"],
};

test("demo-app → demo-app-v2: compare, apply, mark one page, compare, rename a label, mark another — no signal is lost", async () => {
  const dir = tempDir("doc-kit-sync-scenario-");
  const root = path.join(dir, "docs");
  const appDir = path.join(dir, "app");
  const state = { head: "c1" };
  const io = () => ({ env: {}, exec: gitOf(state), commit: () => state.head });
  const cli = async (...args) => {
    let out = "";
    let err = "";
    const code = await runCli([...args, "--project", root], {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      ...io(),
    });
    return { code, out, err };
  };
  const report = async () => {
    const r = await cli("sync", "--json");
    assert.equal(r.code, 0, r.err);
    return JSON.parse(r.out);
  };
  const diffs = () => {
    const folder = path.join(root, ".doc-kit", "sync");
    return fs.existsSync(folder)
      ? Object.fromEntries(fs.readdirSync(folder).map((f) => [f, fs.readFileSync(path.join(folder, f), "utf8")]))
      : {};
  };
  const syncJson = () => JSON.parse(fs.readFileSync(path.join(root, "sync.json"), "utf8"));
  try {
    demoCopy(root);
    fs.cpSync(V1, appDir, { recursive: true });
    fs.rmSync(path.join(root, "sync.json")); // the demo's own reference: step 1 builds it
    fs.rmSync(path.join(root, "captures", "plans"), { recursive: true });
    writePlan(root, false);
    const raw = structuredClone((await import(pathToFileURL(path.join(DEMO, "doc.config.mjs")).href)).default);
    const config = {
      ...raw,
      app: { dir: "../app" },
      capture: { plans: "captures/plans" },
      sync: { labels: ["../app/public/messages/en.json"] },
      // The screens of the application as an inventory (a new one is `new`), beside the demo's features.
      coverage: [
        ...raw.coverage,
        {
          adapter: "glob",
          base: "../app/public",
          pattern: "*.html",
          match: "/{name}",
          family: "Routes",
          exclude: ["login", "approval"],
        },
      ],
    };
    fs.writeFileSync(path.join(root, "doc.config.mjs"), `export default ${JSON.stringify(config, null, 2)};\n`);

    // ─── 1. The reference, on version 1 ───────────────────────────────────────────────────────────────────────
    let r = await cli("sync", "--mark", "--all", "--date", "2026-10-02");
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /11 pages marked as checked/);
    assert.deepEqual(signals(await report()), { ...NOTHING, unchanged: ALL });

    // ─── 2. The application becomes version 2; a writer also touches a page by hand ───────────────────────────
    fs.cpSync(V2, appDir, { recursive: true });
    writePlan(root, true);
    state.head = "c2";
    const detail = path.join(root, "content", "use", "orders", "detail.md");
    fs.writeFileSync(detail, fs.readFileSync(detail, "utf8").replace("are not real", "are made up"));

    // ─── 3. Compare ────────────────────────────────────────────────────────────────────────────────────────────
    const v2 = {
      ...AFTER_SETTINGS,
      review: [...AFTER_SETTINGS.review, "use/settings direct"],
      captures: [...AFTER_SETTINGS.captures, "settings-profile plan (use/settings)"],
      unchanged: ["features/track-orders", "maintain/architecture", "use/orders"],
    };
    assert.deepEqual(signals(await report()), v2);
    const reviewDiffs = (pages) => Object.fromEntries(pages.map((p) => [`${p.replaceAll("/", "__")}.diff`, SINCE_C1]));
    const reviewed = ["features/approve-order", "risks/findings", "secure/access-ownership", "secure/api-surface"];
    assert.deepEqual(diffs(), reviewDiffs([...reviewed, "use/settings"]));

    // ─── 4. Apply: the unchanged pages are restamped, and nothing pending is cleared ──────────────────────────
    // Against a commit (--since), nothing is compared with sync.json: --apply there is refused, never a restamp.
    const marking = fs.readFileSync(path.join(root, "sync.json"), "utf8");
    r = await cli("sync", "--since", "c1", "--apply");
    assert.equal(r.code, 2, r.out);
    assert.equal(fs.readFileSync(path.join(root, "sync.json"), "utf8"), marking);
    r = await cli("sync", "--apply");
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(signals(await report()), v2);
    const pending = JSON.parse(fs.readFileSync(path.join(root, ".doc-kit", "sync-report.json"), "utf8"));
    assert.deepEqual(
      pending.captures.map((c) => c.id),
      ["orders-list", "settings-profile"],
      "what capture --stale selects",
    );

    // ─── 5. Mark one page: use/settings, its new field checked ───────────────────────────────────────────────
    r = await cli("sync", "--mark", "use/settings", "--date", "2026-10-03");
    assert.equal(r.code, 0, r.err);

    // ─── 6. Compare again: only use/settings' own signals are gone; each page's diff is from its own commit ───
    assert.deepEqual(signals(await report()), AFTER_SETTINGS);
    assert.deepEqual(diffs(), reviewDiffs(reviewed));

    // ─── 7. The application renames the label again, to a longer text that holds the old one ─────────────────
    state.head = "c3";
    const messages = path.join(appDir, "public", "messages", "en.json");
    const LONGER = "Approval chain history";
    fs.writeFileSync(messages, JSON.stringify({ orders: { approvalLink: LONGER } }, null, 2) + "\n");
    const renamed = {
      ...AFTER_SETTINGS,
      labels: [`orders.approvalLink: Approval chain → ${LONGER} ${LABEL_PAGES}`],
    };
    assert.deepEqual(signals(await report()), renamed);

    // ─── 8. Mark another page, one that cites none of it ─────────────────────────────────────────────────────
    r = await cli("sync", "--mark", "features/track-orders", "--date", "2026-10-04");
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(signals(await report()), renamed);
    assert.deepEqual(diffs(), reviewDiffs(reviewed));
    r = await cli("sync", "--check");
    assert.equal(r.code, 1, "the documentation is still behind the application");

    const ref = syncJson();
    assert.deepEqual(
      ["features/approve-order", "use/orders", "use/settings", "features/track-orders"].map((p) => ref.pages[p].commit),
      ["c1", "c2", "c2", "c3"],
      "each page keeps the commit it was checked at",
    );
    assert.equal(ref.labels["../app/public/messages/en.json"]["orders.approvalLink"], "Approval chain");
    assert.ok(!ref.inventory["glob/Routes"].includes("invoices.html"), "never documented, never acknowledged");

    // ─── 9. Apply the labels, twice: each page says the new label once, and the signal is gone ───────────────
    // features/rules writes it twice, once across a line end (`**Approval\nchain**`): the page shows the label there
    // too, and both are rewritten — the page checked by the renderer, as it shows them.
    const quoting = ["features/approve-order", "features/rules", "features/roles"];
    const said = () =>
      quoting.map((p) => {
        const text = fs.readFileSync(path.join(root, "content", ...p.split("/")) + ".md", "utf8");
        return [text.split(LONGER).length - 1, text.includes(`${LONGER} history`)];
      });
    for (const run of [1, 2]) {
      r = await cli("sync", "--apply", "--labels");
      assert.equal(r.code, 0, r.err);
      assert.deepEqual(
        said(),
        [
          [7, false],
          [2, false],
          [2, false],
        ],
        `run ${run}`,
      );
    }
    // The pages it rewrote have their translation to follow; the two left with nothing else pending are restamped.
    const translated = [
      ...AFTER_SETTINGS.translations,
      ...["approve-order", "rules", "roles"].map((p) => `fr features/${p}.md stale`),
    ];
    assert.deepEqual(signals(await report()), {
      ...AFTER_SETTINGS,
      labels: [],
      unchanged: [...AFTER_SETTINGS.unchanged, "features/roles", "features/rules"].sort(),
      translations: translated,
    });
    assert.equal(syncJson().labels["../app/public/messages/en.json"]["orders.approvalLink"], LONGER);

    // ─── 10. The application drops its messages file: the label its pages quote is gone ───────────────────────
    state.head = "c4";
    fs.rmSync(messages);
    const AFTER_LABELS = { ...AFTER_SETTINGS, translations: translated };
    const gone = { ...AFTER_LABELS, labels: [`orders.approvalLink: ${LONGER} → null ${LABEL_PAGES}`] };
    assert.deepEqual(signals(await report()), gone);

    // ─── 11. Mark a page that does not quote it: the pages that do keep their signal ─────────────────────────
    r = await cli("sync", "--mark", "maintain/architecture", "--date", "2026-10-05");
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(signals(await report()), gone);
    assert.equal(syncJson().labels["../app/public/messages/en.json"]["orders.approvalLink"], LONGER);

    // ─── 12. Mark the pages that quote it: acknowledged, and nothing left to follow in that file ──────────────
    r = await cli("sync", "--mark", ...quoting, "--date", "2026-10-05");
    assert.equal(r.code, 0, r.err);
    const checked = {
      ...AFTER_LABELS,
      labels: [],
      review: AFTER_SETTINGS.review.filter((x) => x !== "features/approve-order direct"),
      unchanged: [...AFTER_SETTINGS.unchanged, ...quoting].sort(),
    };
    assert.deepEqual(signals(await report()), checked);
    assert.deepEqual(syncJson().labels, {});

    // ─── 13. A page that cites another path, which only starts like the new screen: still new ─────────────────
    const orders = path.join(root, "content", "use", "orders.md");
    fs.appendFileSync(orders, "\nThe list is exported from `/invoices-export` and `/invoices.csv`.\n");
    r = await cli("sync", "--mark", "use/orders", "--date", "2026-10-06");
    assert.equal(r.code, 0, r.err);
    const exported = await report();
    assert.deepEqual(signals(exported).new, ["glob/Routes invoices.html"], "/invoices is documented nowhere");

    // ─── 14. The table of contents, broken in the middle of an edit: --mark --all marks nothing ───────────────
    const toc = path.join(root, "content", "toc.json");
    const good = fs.readFileSync(toc, "utf8");
    const reference = fs.readFileSync(path.join(root, "sync.json"), "utf8");
    fs.writeFileSync(toc, good.replace("{", "{,"));
    r = await cli("sync", "--mark", "--all", "--date", "2026-10-07");
    assert.equal(r.code, 1, r.out);
    assert.equal(fs.readFileSync(path.join(root, "sync.json"), "utf8"), reference, "nothing acknowledged");
    fs.writeFileSync(toc, good);
    assert.deepEqual(signals(await report()), signals(exported));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
