// Mutants of engine/facts/deps/npm.mjs: the rules by which a package-lock.json proves a name, and what makes a
// package.json's or a lock's item local.
import { DEPENDENCY_TESTS, GROWTH_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/deps/npm.mjs",
  tests: DEPENDENCY_TESTS,
  // No mutant: canonicalLocation's `key.startsWith("/")` — an absolute or UNC key never resolves back to itself (path.relative),
  // on any platform; the check stays as a guard should that one change.
  mutants: [
    {
      name: "an entry written without resolved no longer disproves its name (the proof depends on key order again)",
      find: "      else p.bad = true;\n",
      replace: '      else if (typeof info.resolved === "string") p.bad = true;\n',
    },
    {
      name: "a copy bundled inside another package's tarball disproves its name",
      find: '      if ((info.inBundle === true || info.bundled === true) && typeof info.resolved !== "string") return;\n',
      replace: "",
    },
    {
      name: "markLocal by a scan (quadratic)",
      find: "  const item = byName.get(name);",
      replace: "  const item = [...byName.values()].find((i) => i.name === name);",
      tests: [...DEPENDENCY_TESTS, ...GROWTH_TESTS],
    },
    {
      name: "yarn's resolved at any indentation",
      find: '  yarnResolved: /^ {2}resolved:?[ \\t]+"?([^"\\s]+)/,',
      replace: '  yarnResolved: /^\\s+resolved:?\\s+"?([^"\\s]+)/,',
    },
    {
      name: "the tarball's file name not checked",
      find: "rest.startsWith(`${n}/-/${base}-`)",
      replace: "rest.startsWith(`${n}/-/`)",
    },
    {
      name: "yarn.lock: any deeper indentation",
      find: "  yarnDeeper: /^ {4}\\S/,",
      replace: "  yarnDeeper: /^ {4}/,",
    },
    {
      name: "yarn.lock: a lone CR no line break",
      find: "  yarnLineBreak: /\\r\\n|\\r|\\n/,",
      replace: "  yarnLineBreak: /\\r?\\n/,",
    },
    {
      name: "package-lock v1: a private resolved trusted",
      find: '  (typeof info?.resolved === "string" && !NPM_PATTERNS.publicTarball.test(info.resolved)) ||\n  LOCAL_SPEC',
      replace: "  LOCAL_SPEC",
    },
    {
      name: "yarn: a tab before a value",
      find: "(?:version|integrity|uid) (?:",
      replace: "(?:version|integrity|uid)[ \\t]+(?:",
    },
    {
      name: "yarn: a tab before resolved's value",
      find: '|resolved "[^"\\s\\\\]+"|',
      replace: '|resolved[ \\t]+"[^"\\s\\\\]+"|',
    },
    {
      name: "yarn: blanks after a field",
      find: "(?:dependencies|optionalDependencies):)$/,",
      replace: "(?:dependencies|optionalDependencies):)[ \\t]*$/,",
    },
    {
      name: "package-lock v1: an entry that is no object read",
      find: '    if (!info || typeof info !== "object") continue; // no package (`null`, a string): left out\n',
      replace: "",
    },
    {
      name: "yarn: a bare @ or digit in a header",
      find: '    /^(?:"[^"\\\\,]+"|(?!true|false)[A-Za-z][^\\s"\\\\,:[\\]]*)(?:',
      replace: '    /^(?:"[^"\\\\,]+"|[^\\s"\\\\,:#][^\\s"\\\\,:]*)(?:',
    },
    {
      name: "yarn: true/false unquoted in a header",
      find: '    /^(?:"[^"\\\\,]+"|(?!true|false)[A-Za-z]',
      replace: '    /^(?:"[^"\\\\,]+"|[A-Za-z]',
    },
    {
      name: "package-lock: an empty folder trusted",
      find: 'every((part) => part !== "" && part !== "." && part !== "..")',
      replace: 'every((part) => part !== "." && part !== "..")',
    },
    {
      name: "package-lock: a '.' folder trusted",
      find: 'every((part) => part !== "" && part !== "." && part !== "..")',
      replace: 'every((part) => part !== "" && part !== "..")',
    },
    {
      name: "package-lock: a '..' folder trusted",
      find: 'every((part) => part !== "" && part !== "." && part !== "..")',
      replace: 'every((part) => part !== "" && part !== ".")',
    },
    {
      name: "package-lock in UTF-16 read",
      find: "  const lock = readJson(abs, manifest, unreadable, true);",
      replace: "  const lock = readJson(abs, manifest, unreadable);",
    },
    {
      name: "a v1 name as a path trusted",
      find: "    if (!npmNameShape(name)) odd = true;\n",
      replace: "",
    },
    {
      name: "a v1 name of more than a scope and a name",
      find: '(parts.length === 1 || (parts.length === 2 && parts[0][0] === "@"))',
      replace: "true",
    },
    {
      name: "a location not resolved back to its key",
      find: '  if (path.relative(dir, target).split(path.sep).join("/") !== key) return false;\n',
      replace: "",
    },
    {
      name: "trailing dots and spaces kept",
      find: '      while (end > 0 && (part[end - 1] === "." || part[end - 1] === " ")) end--;\n',
      replace: "",
    },
    {
      name: "v2/v3: one folder twice trusted",
      find: '    if (key !== "" && folders.has(folder)) odd = true;\n',
      replace: "",
    },
    {
      name: "v2/v3: an outside copy as early as the root's",
      find: "    .sort((a, b) => a.depth - b.depth || a.root - b.root)",
      replace: "    .sort((a, b) => a.depth - b.depth)",
    },
    {
      name: "Unicode forms told apart",
      find: '    .normalize("NFKC")\n',
      replace: "",
    },
    {
      name: "a packages that is no object read",
      find: '  if (lock.packages) {\n    unreadable.push({ file: manifest, reason: "json" });\n    return [];\n  }\n',
      replace: "",
    },
    {
      name: "a spec with a slash and a colon read as no folder",
      find: '  return spec.includes("/") || spec.includes("\\\\");',
      replace: "  return false;",
    },
    {
      name: "a home folder, an absolute path or a drive placed",
      find: '  if (raw[0] === "~" || raw[0] === "/" || (raw.length > 1 && raw[1] === ":")) return null;\n',
      replace: "",
    },
    {
      name: "a link back by the folder's present name not placed in it",
      find: "  return home ? names.slice(2 * up) : names;",
      replace: "  return names;",
    },
    {
      name: "v1: a folder reached twice trusted",
      find: "        if (occupied.has(place)) odd = true;\n",
      replace: "",
    },
    {
      name: "v2/v3: an 8.3 short name trusted",
      find: " || NPM_PATTERNS.shortName.test(key)) return false;",
      replace: ") return false;",
    },
    {
      name: "v1: an 8.3 short name trusted",
      find: "    !NPM_PATTERNS.shortName.test(name) &&\n",
      replace: "",
    },
    {
      name: "a scoped name's %2f not read",
      find: 'return [name, name.replace("/", "%2f"), name.replace("/", "%2F")].some(',
      replace: "return [name].some(",
    },
    {
      name: "optionalDependencies not read",
      find: "    [false, pkg.optionalDependencies],\n",
      replace: "",
    },
    {
      name: "package-lock v1: a nested duplicate trusted",
      find: "if (local) markLocal(state.byName, name);",
      replace: "void local;",
    },
    {
      name: "package-lock v1: nested entries not walked",
      find: "      if (!info.dependencies) continue;\n",
      replace: "      continue;\n",
    },
    {
      name: "package-lock: another tarball trusted",
      find: "      else p.bad = true;\n",
      replace: "      else if (info.resolved === undefined) p.bad = true;\n",
    },
    {
      name: "package-lock: an entry that is no object read",
      find: 'if (key === "" || !info || typeof info !== "object") continue;',
      replace: 'if (key === "") continue;',
    },
    {
      name: "package-lock: an odd location trusted",
      find: '    if (key !== "" && !canonicalLocation(key, dir)) odd = true;\n',
      replace: "",
    },
    {
      name: "package-lock: an odd location's proof kept",
      find: "  if (!odd) verdicts.apply(out);",
      replace: "  verdicts.apply(out);",
    },
    {
      name: "package-lock: a backslash trusted",
      find: 'key.includes("\\\\") || key.includes(":") ||',
      replace: 'key.includes(":") ||',
      only: "posix",
      why: "on Windows path.resolve reads a backslash as a separator: the path back already differs from the key",
    },
    {
      name: "no location outside the folder (usefulness)",
      find: '  while (names[up] === "..") up++;\n',
      replace: "",
    },
    {
      name: "a location coming back into the folder trusted",
      find: '  return !(inside && key.split("/").includes(".."));',
      replace: "  return true;",
      only: "posix",
      why: "on Windows the path back is compared without case: a key that comes back already differs from it",
    },
    {
      name: "the folder's name compared in its case",
      find: 'folderKey(name) === folderKey(names[up + i] ?? "")',
      replace: 'name === (names[up + i] ?? "")',
    },
    {
      name: "a v1 odd name's proof kept",
      find: "  if (!odd) state.proofs.apply(state.out);",
      replace: "  state.proofs.apply(state.out);",
    },
    {
      name: "v1: a link's dependencies kept below it",
      find: "else places.add(names.reduce(step, 0));",
      replace: "else void names;",
    },
    {
      name: "v1: locations compared in their case",
      find: "const key = `${id}\\0${folderKey(name)}`;",
      replace: "const key = `${id}\\0${name}`;",
    },
    {
      name: "package-lock: entries in npm's order",
      find: "    .sort((a, b) => a.depth - b.depth || a.root - b.root)\n",
      replace: "",
    },
    {
      name: "file: in its own case only",
      find: 'if (lower.startsWith("file:")) return true;',
      replace: 'if (spec.startsWith("file:")) return true;',
    },
    {
      name: "a bare '.' no folder",
      find: 'spec[0] === "." || ',
      replace: "",
    },
    {
      name: "an archive taken for a folder",
      find: '  if (lower.endsWith(".tgz") || lower.endsWith(".tar.gz") || lower.endsWith(".tar")) return false;\n',
      replace: "",
    },
    {
      name: "only the version names a link",
      find: "[info.version, info.from, info.resolved].filter(mayBeLink)",
      replace: "[info.version].filter(mayBeLink)",
    },
    {
      name: "folders compared in their case",
      find: '    .normalize("NFKC")\n    .toLowerCase();',
      replace: '    .normalize("NFKC");',
    },
    {
      name: "v1 walked depth first",
      find: "      queue.push({ deps: info.dependencies, bases: odd ? [] : [...places] });",
      replace: "      queue.splice(q + 1, 0, { deps: info.dependencies, bases: odd ? [] : [...places] });",
    },
    {
      name: "a slash names no folder",
      find: 'return spec.includes("/") || spec.includes("\\\\");',
      replace: 'return spec.includes("\\\\");',
    },
    {
      name: "a backslash names no folder",
      find: 'return spec.includes("/") || spec.includes("\\\\");',
      replace: 'return spec.includes("/");',
    },
    {
      name: "places past the bound followed",
      find: "      if (places.size > MAX_PLACES) odd = true;\n",
      replace: "",
    },
    {
      name: "a package-lock alias public",
      find: ' ||\n  (typeof info.name === "string" && info.name !== name);',
      replace: ";",
    },
    {
      name: "package-lock: no resolved still a proof",
      find: "      if (tarballOf(name, info.resolved)) p.good = true;",
      replace: '      if (typeof info.resolved !== "string" || tarballOf(name, info.resolved)) p.good = true;',
    },
    {
      name: "package-lock: never a proof",
      find: "      if (tarballOf(name, info.resolved)) p.good = true;",
      replace: "      if (false) p.good = true;",
    },
    {
      name: "any public tarball a proof",
      find: '  return [name, name.replace("/", "%2f"), name.replace("/", "%2F")].some((n) => rest.startsWith(`${n}/-/${base}-`));',
      replace: "  return true;",
    },
    {
      name: "a nested duplicate from elsewhere trusted",
      find: "      if (local) markLocal(byName, m[1]);",
      replace: "      void local;",
    },
    {
      name: "a v1 alias not local",
      find: " ||\n  npmAlias(info?.version);",
      replace: ";",
    },
  ],
};
