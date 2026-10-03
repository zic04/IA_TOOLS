// `doc-kit record`: Playwright's codegen output turned into a capture plan entry (engine/capture/record.mjs), and
// the command around it with codegen replaced by a seam (no browser).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { codegenToEntry, targetOf, routeOf, planModule } from "../../engine/capture/record.mjs";
import { normalizeEntry } from "../../engine/capture/plans.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { demoCopy } from "../tools/helpers.mjs";

const CODE = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/orders?tab=open');
  await page.getByRole('button', { name: 'New order' }).click();
  await page.getByLabel('Customer').fill('Ada\\'s shop');
  await page.getByLabel('Status').selectOption('open');
  await page.getByText('Total', { exact: true }).nth(1).click();
  await page.locator('#search').press('Enter');
  await page.keyboard.press('Escape');
  await page.getByRole('row').filter({ hasText: 'x' }).click();
  await page.goto('https://elsewhere.test/');
});
`;

describe("engine/capture/record.mjs", () => {
  test("codegenToEntry: route of the first page, one action per step, untranslated lines listed", () => {
    const { entry, skipped } = codegenToEntry(CODE, { appUrl: "http://127.0.0.1:4173", id: "orders-new" });
    assert.equal(entry.route, "/orders?tab=open");
    assert.deepEqual(entry.actions, [
      { click: { role: "button", name: "New order" } },
      { type: { label: "Customer" }, value: "Ada's shop" },
      { select: { label: "Status" }, value: "open" },
      { click: { text: "Total", exact: true, nth: 1 } },
      { click: { css: "#search" } },
      { press: "Enter" },
      { press: "Escape" },
    ]);
    assert.deepEqual(skipped, [
      "await page.getByRole('row').filter({ hasText: 'x' }).click();",
      "await page.goto('https://elsewhere.test/');",
    ]);
    assert.equal(codegenToEntry("", { appUrl: "http://a.test", id: "x", route: "/r" }).entry.route, "/r");
  });

  test("targetOf, routeOf: last(), a base path, another origin", () => {
    assert.deepEqual(targetOf("getByPlaceholder('Search').last()"), { placeholder: "Search", last: true });
    assert.equal(targetOf("getByRole('row').filter({ hasText: 'x' })"), null);
    assert.equal(routeOf("http://a.test/app/orders#x", "http://a.test/app"), "/orders#x");
    assert.equal(routeOf("http://b.test/", "http://a.test"), null);
  });

  test("planModule: a valid plan entry, notes as comments", async () => {
    const { entry, skipped } = codegenToEntry(CODE, { appUrl: "http://127.0.0.1:4173", id: "orders-new" });
    const text = planModule(entry, skipped);
    assert.match(text, /^\/\/ Recorded with doc-kit record/);
    assert.match(text, /\/\/ {3}await page\.goto\('https:\/\/elsewhere\.test\/'\);/);
    const file = path.join(demoCopy(), "p.mjs");
    fs.writeFileSync(file, text);
    const { CAPTURES } = await import(pathToFileURL(file).href);
    assert.deepEqual(normalizeEntry(CAPTURES[0]).value.actions, entry.actions);
  });
});

describe("doc-kit record", () => {
  test("writes captures/plans/<id>.mjs from the recorder; refuses an existing file, production, a forbidden route", async () => {
    const dir = demoCopy();
    try {
      const seen = [];
      const codegen = ({ url, output, storage }) => {
        seen.push({ url, storage });
        fs.writeFileSync(output, CODE);
        return 0;
      };
      let out = "";
      const io = { stdout: { write: (s) => (out += s) }, stderr: { write: () => {} }, env: {}, codegen };
      assert.equal(await runCli(["record", "/orders", "--project", dir], io), 0);
      assert.equal(seen[0].url, "http://127.0.0.1:4173/orders");
      const file = path.join(dir, "captures", "plans", "orders.mjs");
      assert.match(fs.readFileSync(file, "utf8"), /"name": "New order"/);
      assert.match(out, /orders\.mjs written: 7 step\(s\) recorded/);
      assert.match(out, /2 line\(s\) not translated/);
      assert.equal(await runCli(["record", "/orders", "--project", dir], io), 1, "the file exists");
      assert.equal(await runCli(["record", "/orders", "--force", "--id", "orders", "--project", dir], io), 0);
      assert.equal(await runCli(["record", "orders", "--project", dir], io), 2, "a route starts with /");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refused on production and on a forbidden route, before any browser opens", async () => {
    for (const capture of [{ target: "production" }, { forbidden: ["^/orders/\\d+/approval$"] }]) {
      const dir = demoCopy();
      try {
        const file = path.join(dir, "doc.config.mjs");
        fs.writeFileSync(
          file,
          fs.readFileSync(file, "utf8").replace(
            /capture:\s*\{/,
            `capture: { ${Object.entries(capture)
              .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
              .join(", ")}, `,
          ),
        );
        let opened = false;
        let err = "";
        const io = {
          stdout: { write: () => {} },
          stderr: { write: (s) => (err += s) },
          env: {},
          codegen: () => (opened = true),
        };
        assert.equal(await runCli(["record", "/orders/7/approval", "--project", dir], io), 2, err);
        assert.equal(opened, false);
        assert.match(
          err,
          capture.target ? /refused when capture\.target is "production"/ : /matches capture\.forbidden/,
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});
