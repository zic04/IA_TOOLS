// Mutants of engine/facts/declarations.mjs: the rules taken out, which the dependency tests must catch (RULES.md M16).
import { DEPENDENCY_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/declarations.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "POETRY_PYPI_MIRROR_URL not read",
      find: "|PIPENV_PYPI_MIRROR|POETRY_PYPI_MIRROR_URL)$/i",
      replace: "|PIPENV_PYPI_MIRROR)$/i",
    },
    {
      name: "a project's poetry.toml not read",
      find: '  readPoetryConfig(readIf(path.join(dir, "poetry.toml")), out);\n',
      replace: "",
    },
    {
      name: "the mirror plugin's table not read",
      find: '    else if (keys[0] === "plugins" && keys[1] === "pypi_mirror") out.pipAll = true;\n',
      replace: "",
    },
    {
      name: "the mirror plugin required, not read",
      find: "=== POETRY_MIRROR)",
      replace: "=== POETRY_MIRROR && false)",
    },
    {
      name: "the plugin's name not compared as PEP 503",
      find: 'pypiName(keys[POETRY_PLUGINS.length] ?? "") === POETRY_MIRROR',
      replace: '(keys[POETRY_PLUGINS.length] ?? "") === POETRY_MIRROR',
    },
    {
      name: "a multi-line string read as written",
      find: "(value[0] === '\"' || value[0] === \"'\" ? null : value)",
      replace: "value",
    },
    {
      name: "bunfig: an unread registry trusted",
      find: "      if (url === null || (url && !isPublicNpm(url))) out.npmAll = true;",
      replace: "      if (url && !isPublicNpm(url)) out.npmAll = true;",
    },
    {
      name: "bunfig doubt ignored",
      find: "  if (values.doubt) out.npmAll = true;\n",
      replace: "",
    },
    {
      name: "any requirements option safe",
      find: "      if (!PIP_SAFE_OPTIONS.has(name)) return true;",
      replace: "      if (false) return true;",
    },
    {
      name: "an abbreviated include not followed",
      find: '(name.length >= 10 && "--requirement".startsWith(name)) ||',
      replace: 'name === "--requirement" ||',
    },
    {
      name: "pip.conf find not read",
      find: 'if (key.includes("index") || key.includes("find")) out.pipAll = true;',
      replace: 'if (key.includes("index")) out.pipAll = true;',
    },
    {
      name: "pip.conf value read as the key",
      find: 'const ends = [line.indexOf("="), line.indexOf(":")].filter((i) => i > 0);',
      replace: "const ends = [line.length];",
    },
    {
      name: "a registry key not followed trusted",
      find: "  else out.npmAll = true;\n}",
      replace: "}",
    },
    {
      name: "uv keys at their table only",
      find: "else if (keys.length > uv.length && under(keys, uv) && UV_INDEX_KEYS.includes(keys[keys.length - 1])) {",
      replace:
        "else if (keys.length === uv.length + 1 && under(keys, uv) && UV_INDEX_KEYS.includes(keys[uv.length])) {",
    },
    {
      name: "a list of variables read as one URL",
      find: "if (value.split(/\\s+/).some((url) => url && !isPublicPip(url))) out.pipAll = true;",
      replace: "if (!isPublicPip(value)) out.pipAll = true;",
    },
    {
      name: "an unreadable include trusted",
      find: "if (included === null || requirementsIndex(",
      replace: "if (included !== null && requirementsIndex(",
    },
    {
      name: "the first option word only",
      find: '    const words = line.replaceAll("\\t", " ").split(" ").filter(Boolean);',
      replace: '    const words = line.replaceAll("\\t", " ").split(" ").filter(Boolean).slice(0, 1);',
    },
    {
      name: "an include outside the root read",
      find: "readBeside(file, { within: root })",
      replace: "readBeside(file)",
    },
    {
      name: "17 includes",
      find: "const MAX_INCLUDES = 16;",
      replace: "const MAX_INCLUDES = 17;",
    },
    {
      name: ".npmrc comment kept in a value",
      find: '    else if (v[i] === ";" || v[i] === "#") break;',
      replace: "",
    },
    {
      name: "a key that loads a file trusted",
      find: '  if (k.includes("config") || k.includes("$")) {',
      replace: "  if (false) {",
    },
    {
      name: ".yarnrc word not decoded",
      find: "    return String(JSON.parse(s));",
      replace: "    return s.slice(1, -1);",
    },
    {
      name: ".yarnrc.yml top line not followed trusted",
      find: "      if (server === undefined || !isPublicNpm(server)) out.npmAll = true;",
      replace: "      if (server !== undefined && !isPublicNpm(server)) out.npmAll = true;",
    },
    {
      name: ".yarnrc.yml scope form not followed trusted",
      find: '    if (key) (out.npmScopes.add("@" + key[2].toLowerCase()), found++);\n    else out.npmAll = true;',
      replace: '    if (key) (out.npmScopes.add("@" + key[2].toLowerCase()), found++);',
    },
    {
      name: "declarations read UTF-8 only",
      find: "decodeText(fs.readFileSync(file))",
      replace: 'fs.readFileSync(file, "utf8")',
    },
    {
      name: "a host's credentials taken as a registry",
      find: '  if (k.startsWith("//")) return;\n',
      replace: "",
    },
    {
      name: "${…} trusted",
      find: '    if (line.includes("${")) return true;\n',
      replace: "",
    },
    {
      name: "quotes and escapes in options trusted",
      find: '    if ([\'"\', "\'", "\\\\"].some((c) => options.includes(c))) return true;\n',
      replace: "",
    },
    {
      name: "ini 5's '…' not read as JSON",
      find: '    const inner = v[0] === "\'" ? v.slice(1, -1) : v;',
      replace: '    if (v[0] === "\'") return v.slice(1, -1);\n    const inner = v;',
    },
    {
      name: "an escaped yarnrc.yml key trusted",
      find: '    if (colon >= 0 && trimmed.slice(0, colon).includes("\\\\")) {',
      replace: "    if (false) {",
    },
    {
      name: "an indented root trusted",
      find: "      if (names) out.npmAll = true;\n",
      replace: "",
    },
    {
      name: "the server's value a prefix",
      find: "  yarnServer: /^npmRegistryServer:[ \\t]*([\"']?)([^\"'\\s#]+)\\1[ \\t]*(?:#.*)?$/,",
      replace: "  yarnServer: /^npmRegistryServer:[ \\t]*([\"']?)([^\"'\\s#]+)/,",
    },
    {
      name: "uv.toml's override trusted",
      find: '    else if (uvToml && uvSourceNames([{ path: ["tool", "uv", ...keys], value }]).length) out.pipAll = true;\n',
      replace: "",
    },
    {
      name: "YARN_REGISTRY not read",
      find: "|YARN_NPM_REGISTRY_SERVER|YARN_REGISTRY|",
      replace: "|YARN_NPM_REGISTRY_SERVER|",
    },
    {
      name: "$XDG_CONFIG_HOME/.bunfig.toml not read",
      find: '    files.push({ kind: "bunfig", file: path.join(env.XDG_CONFIG_HOME, ".bunfig.toml") });\n',
      replace: "",
    },
    {
      name: "an own name read raw",
      find: "export const tomlText = (value) => tomlString(value) ?? (value[0] === '\"' || value[0] === \"'\" ? null : value);",
      replace:
        "export const tomlText = (value) => (value[0] === '\"' || value[0] === \"'\" ? value.slice(1, -1) : value);",
    },
    {
      name: "the declarations: unread requirements not judged",
      find: 'if (values.doubt || (text && unreadRequirement(tomlEntries(text), uvToml ? ["tool", "uv"] : []))) out.pipAll = true;',
      replace: "if (values.doubt) out.pipAll = true;",
    },
    {
      name: "uv.toml's requirements not under uv's table",
      find: 'uvToml ? ["tool", "uv"] : []',
      replace: "[]",
    },
    {
      name: "FIND_LINKS variables not read",
      find: "UV_INDEX|(?:PIP|UV)_FIND_LINKS|",
      replace: "UV_INDEX|",
    },
    {
      name: "an attached -i not seen",
      find: "return { name: word.slice(0, 2), value: word.slice(2) };",
      replace: 'return { name: word, value: "" };',
    },
    {
      name: "includes not followed",
      find: "      if (included === null || requirementsIndex(included, path.dirname(file), root, seen)) return true;\n",
      replace: "",
    },
    {
      name: ".npmrc quoted key not decoded",
      find: "      return String(JSON.parse(inner));",
      replace: "      return v.slice(1, -1);",
    },
    {
      name: "PIPENV_PYPI_MIRROR not read",
      find: "PIPENV_PYPI_MIRROR|POETRY_PYPI_MIRROR_URL)",
      replace: "POETRY_PYPI_MIRROR_URL)",
    },
  ],
};
