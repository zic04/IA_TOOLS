// engine/facts/imports.mjs (ARCHITECTURE.md §6.10 §2.2): the regex-based specifier extraction and resolution
// functions, at unit level (the closure itself, resolveImports, is also exercised end to end in sync.test.mjs
// against test/fixtures/sync-app).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "../tools/helpers.mjs";
import {
  jsSpecifiers,
  pySpecifiers,
  loadTsconfig,
  resolveJs,
  resolvePy,
  resolveImports,
} from "../../engine/facts/imports.mjs";

describe("jsSpecifiers", () => {
  test("import … from, bare import, require, dynamic import; one specifier per statement", () => {
    const text = [
      'import { a } from "./a";',
      'import b from "./b";',
      'export { c } from "./c";',
      'import "./side-effect";',
      'const d = require("./d");',
      'const e = await import("./e");',
      'import type { F } from "./f";', // TS type-only import: still a "from" clause
    ].join("\n");
    // One pass per pattern (not a single combined, line-ordered pass): every "from" clause first (a, b, c, f —
    // f has a "from" clause too, even as a type-only import), then bare imports, then require, then dynamic import.
    assert.deepEqual(jsSpecifiers(text), ["./a", "./b", "./c", "./f", "./side-effect", "./d", "./e"]);
  });

  test("a package specifier is returned too (the caller decides it is not local)", () => {
    assert.deepEqual(jsSpecifiers('import { z } from "zod";'), ["zod"]);
  });
});

describe("pySpecifiers", () => {
  test("relative (level = number of dots), absolute, plain import", () => {
    assert.deepEqual(pySpecifiers("from .deps import db"), [{ module: "deps", level: 1 }]);
    assert.deepEqual(pySpecifiers("from . import db"), [{ module: "", level: 1 }]);
    assert.deepEqual(pySpecifiers("from ..pkg.sub import x"), [{ module: "pkg.sub", level: 2 }]);
    assert.deepEqual(pySpecifiers("from fastapi import APIRouter"), [{ module: "fastapi", level: 0 }]);
    assert.deepEqual(pySpecifiers("import os.path"), [{ module: "os.path", level: 0 }]);
    assert.deepEqual(pySpecifiers("  from .a import b\nimport c\n"), [
      { module: "a", level: 1 },
      { module: "c", level: 0 },
    ]);
  });
});

describe("loadTsconfig", () => {
  test("nearest tsconfig.json up to app.dir; baseUrl resolved relative to app.dir; no paths → null", () => {
    const dir = tempDir("doc-kit-tsconfig-");
    try {
      fs.mkdirSync(path.join(dir, "apps", "web"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "apps", "web", "tsconfig.json"),
        JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }),
      );
      const cfg = loadTsconfig(dir, "apps/web/app/page.tsx");
      assert.deepEqual(cfg, { baseUrl: "apps/web", paths: { "@/*": ["./src/*"] } });
      assert.equal(loadTsconfig(dir, "elsewhere/x.ts"), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("jsconfig.json is read too; a tsconfig without `paths` is not used", () => {
    const dir = tempDir("doc-kit-jsconfig-");
    try {
      fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
      fs.mkdirSync(path.join(dir, "app"));
      fs.writeFileSync(
        path.join(dir, "app", "jsconfig.json"),
        JSON.stringify({ compilerOptions: { paths: { "~/*": ["./*"] } } }),
      );
      assert.deepEqual(loadTsconfig(dir, "app/x.js"), { baseUrl: "app", paths: { "~/*": ["./*"] } });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveJs", () => {
  const withFiles = (files) => {
    const dir = tempDir("doc-kit-resolvejs-");
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
  };

  test("relative: exact extension, candidate extensions, index.*, x.js → x.ts (ESM TS style)", () => {
    const dir = withFiles({ "a/page.tsx": "", "a/util.ts": "", "a/sub/index.ts": "", "a/legacy.ts": "" });
    try {
      assert.equal(resolveJs("./util", "a/page.tsx", dir, null), "a/util.ts");
      assert.equal(resolveJs("./sub", "a/page.tsx", dir, null), "a/sub/index.ts");
      assert.equal(resolveJs("./legacy.js", "a/page.tsx", dir, null), "a/legacy.ts");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("tsconfig paths alias: @/* → ./*, relative to baseUrl; first existing candidate wins", () => {
    const dir = withFiles({ "src/components/order-table.tsx": "" });
    try {
      const tsconfig = { baseUrl: ".", paths: { "@/*": ["./src/*"] } };
      assert.equal(
        resolveJs("@/components/order-table", "app/page.tsx", dir, tsconfig),
        "src/components/order-table.tsx",
      );
      assert.equal(resolveJs("@/nope", "app/page.tsx", dir, tsconfig), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ignored extensions (css, svg, json…) are never resolved; a bare package with no alias match is null", () => {
    const dir = withFiles({ "a/style.css": "" });
    try {
      assert.equal(resolveJs("./style.css", "a/page.tsx", dir, null), null);
      assert.equal(resolveJs("react", "a/page.tsx", dir, null), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a candidate that resolves outside app.dir is ignored", () => {
    const dir = withFiles({ "a/page.tsx": "" });
    try {
      assert.equal(resolveJs("../../outside", "a/page.tsx", dir, null), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolvePy", () => {
  const withFiles = (files) => {
    const dir = tempDir("doc-kit-resolvepy-");
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
  };

  test("relative: from .deps import db, from . import db (package __init__), from ..pkg import x", () => {
    const dir = withFiles({ "backend/api/deps.py": "", "backend/api/__init__.py": "", "backend/pkg/__init__.py": "" });
    try {
      assert.equal(resolvePy({ module: "deps", level: 1 }, "backend/api/orders.py", dir), "backend/api/deps.py");
      assert.equal(resolvePy({ module: "", level: 1 }, "backend/api/orders.py", dir), "backend/api/__init__.py");
      assert.equal(resolvePy({ module: "pkg", level: 2 }, "backend/api/orders.py", dir), "backend/pkg/__init__.py");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("absolute: from app.dir first, then from the importing file's own folder; package (no file) → null", () => {
    const dir = withFiles({ "models.py": "", "backend/api/models.py": "" });
    try {
      assert.equal(
        resolvePy({ module: "models", level: 0 }, "backend/api/orders.py", dir),
        "models.py",
        "found from app.dir first",
      );
      const dir2 = withFiles({ "backend/api/models.py": "" });
      try {
        assert.equal(
          resolvePy({ module: "models", level: 0 }, "backend/api/orders.py", dir2),
          "backend/api/models.py",
          "falls back to the importing file's own folder",
        );
      } finally {
        fs.rmSync(dir2, { recursive: true, force: true });
      }
      assert.equal(resolvePy({ module: "fastapi", level: 0 }, "backend/api/orders.py", dir), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("climbing above app.dir (too many leading dots) is ignored, never throws", () => {
    const dir = withFiles({ "a.py": "" });
    try {
      assert.equal(resolvePy({ module: "x", level: 5 }, "a.py", dir), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveImports: folders never traversed", () => {
  test("node_modules, dist, .next… are never entered, even when explicitly imported", () => {
    const dir = tempDir("doc-kit-skipdirs-");
    try {
      fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
      fs.writeFileSync(path.join(dir, "node_modules", "pkg", "index.js"), "export default 1;\n");
      fs.writeFileSync(path.join(dir, "a.mjs"), 'import "./node_modules/pkg/index.js";\n');
      const { files } = resolveImports({ appDir: dir, files: ["a.mjs"] });
      assert.ok(![...files].some((f) => f.includes("node_modules")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// SECURITY.md, confinement: an import is resolved, and then read (the import closure of `sync`, the page context,
// the `modules` facts), only when where it really is (links and junctions followed) is in the application. A junction
// needs no privilege on Windows; a folder link elsewhere.
describe("imports never resolved through a link out of the application", () => {
  /** An application with `j`, a junction to a folder outside it, and `lib`, a folder of its own. */
  function linkedApp() {
    const dir = tempDir("doc-kit-imports-link-");
    const app = path.join(dir, "app");
    const outside = path.join(dir, "outside");
    const put = (file, text) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    };
    put(path.join(outside, "util.js"), 'import "./more.js";\nexport const leaked = "of the operator";\n');
    put(path.join(outside, "more.js"), "export const more = 1;\n");
    put(path.join(outside, "util.py"), "LEAKED = 1\n");
    put(path.join(outside, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@x/*": ["./*"] } } }));
    put(path.join(outside, "page.js"), 'import "@x/more";\nimport "../lib/local.js";\n');
    put(path.join(app, "lib", "local.js"), "export const local = 1;\n");
    put(path.join(app, "lib", "helper.py"), "HELPER = 1\n");
    put(
      path.join(app, "main.js"),
      'import { leaked } from "./j/util.js";\nimport { local } from "./lib/local.js";\nimport "@/util";\n',
    );
    put(path.join(app, "main.py"), "import j.util\nimport lib.helper\n");
    put(path.join(app, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./j/*"] } } }));
    const junction = path.join(app, "j");
    const release = () => {
      // The junction first, on its own: removing the folder must never walk into what it points to.
      try {
        fs.unlinkSync(junction);
      } catch {
        if (fs.existsSync(junction)) fs.rmdirSync(junction);
      }
      fs.rmSync(dir, { recursive: true, force: true });
    };
    try {
      fs.symlinkSync(outside, junction, "junction");
    } catch (e) {
      release();
      throw e;
    }
    return { app, release };
  }

  test("a relative import, a tsconfig alias and a Python module through a junction: never; the import beside: yes", () => {
    const { app, release } = linkedApp();
    try {
      const tsconfig = loadTsconfig(app, "main.js");
      assert.equal(resolveJs("./j/util.js", "main.js", app, tsconfig), null, "a relative import");
      assert.equal(resolveJs("@/util", "main.js", app, tsconfig), null, "a tsconfig alias");
      assert.equal(resolveJs("./lib/local.js", "main.js", app, tsconfig), "lib/local.js");
      assert.equal(resolvePy({ module: "j.util", level: 0 }, "main.py", app), null, "a Python module");
      assert.equal(resolvePy({ module: "util", level: 1 }, "j/page.py", app), null, "a relative Python module");
      assert.equal(resolvePy({ module: "lib.helper", level: 0 }, "main.py", app), "lib/helper.py");
      // The closure: the file beside is followed, nothing behind the junction is resolved, read or followed.
      assert.deepEqual([...resolveImports({ appDir: app, files: ["main.js"] }).files].sort(), [
        "lib/local.js",
        "main.js",
      ]);
      assert.deepEqual([...resolveImports({ appDir: app, files: ["main.py"] }).files].sort(), [
        "lib/helper.py",
        "main.py",
      ]);
      // A starting file behind the junction (a route's file) is never read: its imports, even one that comes back
      // into the application (../lib/local.js), are not followed.
      assert.deepEqual([...resolveImports({ appDir: app, files: ["j/page.js"] }).files], ["j/page.js"]);
      // A tsconfig.json behind the junction is never read either.
      assert.equal(loadTsconfig(app, "j/page.js")?.paths["@x/*"], undefined);
    } finally {
      release();
    }
  });
});
