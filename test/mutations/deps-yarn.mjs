// Mutants of engine/facts/deps/yarn.mjs: the rules by which a yarn.lock proves a name.
import { DEPENDENCY_TESTS, GROWTH_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/deps/yarn.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "two names installed into one folder (corp-lib and corp-lib.) are proven",
      find: "else if (proven && folders.get(folderKey(name)) === 1) item.public = true;",
      replace: "else if (proven) item.public = true;",
    },
    {
      name: "a string left open on its line leaves the lock proving",
      find: "    if (!quotesClosed(l)) plain = false;\n",
      replace: "",
    },
    {
      name: "a backslash in a yarn.lock leaves it proving",
      find: '    if (c === "\\\\") return false;\n',
      replace: "",
    },
    {
      name: "a Yarn 1 alias without a version (corp-ui@npm:xcorp-ui) is not local",
      find: 'range.startsWith("npm:")',
      replace: "npmAlias(range)",
    },
    {
      name: "a berry lock without its metadata is read as Yarn 1's (npm: taken for an alias)",
      find: "      if (NPM_PATTERNS.yarnResolution.test(l)) berry = true;\n",
      replace: "",
    },
    {
      name: "yarn.lock: conflict markers trusted",
      find: '["<<<<<<<", "=======", ">>>>>>>"].some((marker) => text.includes(marker));',
      replace: "false;",
    },
    {
      name: "yarn.lock: a field in any form",
      find: "      if (!NPM_PATTERNS.yarnPlainField.test(l)) return false;\n",
      replace: "",
    },
    {
      name: "yarn.lock: a deeper line anywhere",
      find: "    } else if (!inDeps || !NPM_PATTERNS.yarnDeeper.test(l)) return false;",
      replace: "    } else if (!NPM_PATTERNS.yarnDeeper.test(l)) return false;",
    },
    {
      name: "a blank or comment line inside a block trusted",
      find: "      if (gap || !blocks.length) plain = false;",
      replace: "      if (!blocks.length) plain = false;",
    },
    {
      name: "a blank line ends a block",
      find: '    if (!trimmed || trimmed.startsWith("#")) {\n      gap = true;\n      continue;\n    }\n',
      replace:
        '    if (!trimmed) {\n      blocks.push(["#"]);\n      continue;\n    }\n    if (trimmed.startsWith("#")) {\n      gap = true;\n      continue;\n    }\n',
    },
    {
      name: "any header trusted",
      find: "  if (!NPM_PATTERNS.yarnHeader.test(lines[0])) return false;\n",
      replace: "",
    },
    {
      name: "a block without its version, or with two",
      find: "  return resolved === 1 && version === 1;",
      replace: "  return resolved === 1;",
    },
    {
      name: "resolved twice trusted",
      find: "  return resolved === 1 && version === 1;",
      replace: "  return resolved >= 1 && version === 1;",
    },
    {
      name: "an itemless block not judged",
      find: "      let state = names.get(name);",
      replace: "      if (itemless) continue;\n      let state = names.get(name);",
    },
    {
      name: "the first block's proof enough",
      find: "      state.proven &&= proven;",
      replace: "      if (!state.item) state.proven = proven;",
    },
    {
      name: "the first block's place enough",
      find: "      state.local ||= own;",
      replace: "      if (!state.item) state.local = own;",
    },
    {
      name: "yarn: quoted berry metadata trusted",
      find: " || l.startsWith('\"__metadata')",
      replace: "",
    },
    {
      name: "yarn.lock in UTF-16 read",
      find: "function fromYarnLock(abs, manifest, unreadable) {\n  const text = readText(abs, manifest, unreadable, true);",
      replace:
        "function fromYarnLock(abs, manifest, unreadable) {\n  const text = readText(abs, manifest, unreadable);",
    },
    {
      name: "yarn.lock: any block's form trusted",
      find: "lockPlain && yarnPlain(lines) ? tarballPath(resolved[0]) : null",
      replace: "lockPlain ? tarballPath(resolved[0]) : null",
    },
    {
      name: "yarn.lock: only the first resolved judged",
      find: "resolved.some((r) => !NPM_PATTERNS.publicTarball.test(r)) ||",
      replace: "resolved.slice(0, 1).some((r) => !NPM_PATTERNS.publicTarball.test(r)) ||",
    },
    {
      name: "a lone CR trusted",
      find: "!NPM_PATTERNS.yarnLoneCr.test(text) && ",
      replace: "",
    },
    {
      name: "berry's metadata trusted",
      find: 'if (l.startsWith("__metadata") || l.startsWith(\'"__metadata\')) berry = true;',
      replace: "",
    },
    {
      name: "yarn: the word anywhere ends every proof",
      find: 'if (l.startsWith("__metadata") || l.startsWith(\'"__metadata\')) berry = true;',
      replace: 'if (l.includes("__metadata")) berry = true;',
    },
    {
      name: "the tarball read for each name (quadratic)",
      find: "proven: !own && tarball !== null && namesTarball(name, tarball)",
      replace: "proven: !own && tarball !== null && namesTarball(name, tarballPath(resolved[0]))",
      tests: [...DEPENDENCY_TESTS, ...GROWTH_TESTS],
    },
    {
      name: "berry's resolution a proof",
      find: "plain: plain && !berry",
      replace: "plain",
    },
    {
      name: "yarn v1: never a proof",
      find: "lockPlain && yarnPlain(lines) ? tarballPath(resolved[0]) : null",
      replace: "null",
    },
    {
      name: "a yarn alias specifier not local",
      find: 'const own = local || (berry ? npmAlias(range) : range.startsWith("npm:"));',
      replace: "const own = local;",
    },
  ],
};
