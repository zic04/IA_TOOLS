// ESLint (AUDIT M2, RULES.md M12): the recommended rules, which catch probable bugs, and the size rules of
// RULES.md M5 as warnings. Formatting is Prettier's job (M11), never ESLint's.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "dist/", ".doc-kit/", "templates/", "examples/", "docs/", "test/fixtures/"] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
    rules: {
      "max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ["warn", 25],
      // An unused import or variable is a finding; an unused parameter that documents a signature (a test fake,
      // a callback) or an unused `catch (e)` is not.
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      // Non-breaking spaces are intended in strings, templates and expressions (French typography).
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true, skipRegExps: true }],
    },
  },
  // Code that runs in the browser: the site itself, and the functions the capture engine and the checks pass to
  // page.evaluate (written inline in Node modules).
  {
    files: [
      "engine/site/**/*.js",
      "engine/dev/**/*.js",
      "engine/capture/**/*.mjs",
      "engine/check/**/*.mjs",
      "engine/dev/**/*.mjs",
      "cli/commands/**/*.mjs",
      "test/**/*.mjs",
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // A test's body is as long as its scenario: the size rules are for the kit's code.
  { files: ["test/**/*.mjs"], rules: { "max-lines-per-function": "off", complexity: "off" } },
];
