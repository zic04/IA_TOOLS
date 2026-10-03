## What changes

<!-- What and why, in a few lines. -->

## Checklist (RULES.md)

- [ ] `npm test` passes locally (the CI also runs end-to-end tests, the security rules and `npm audit`)
- [ ] Each fix or feature has its test; a security fix has the test that would have caught it
- [ ] No shell, `exec`, `eval` or `new Function`; git only through `engine/util/safe-git.mjs` (S1–S3)
- [ ] Nothing from the application folder is executed; any new external tool is described in SECURITY.md (S4)
- [ ] Any new regular expression that scans untrusted text is in `test/tools/redos-worker.mjs` (S5)
- [ ] Captures stay read-only; any new way to open a URL goes through the guard (S6)
- [ ] No secret is stored, printed or exported (S7)
- [ ] Every new message exists in `i18n/en` and `i18n/fr` (M2)
- [ ] CHANGELOG `[Unreleased]` updated; SECURITY.md still matches the code (M9, S11)
- [ ] Any rule this change breaks is named here, with the reason
