// The documented version of a project (`config.version`): read from a file with a pattern, or the fallback.

/**
 * Documented version: version.file + version.pattern (first group), otherwise version.fallback. The file is read with
 * `tools`, the project's (projectVersion of engine/core/project-tools.mjs, the one caller): one in the application
 * (`../app/package.json`) only where it is reached through its folders, never a link or a junction (SECURITY.md) —
 * behind one, the fallback.
 * @param {{ file?: string|null, pattern?: string, fallback?: string }} version
 * @param {{ exists: (p: string) => boolean, read: (p: string) => string }} tools   relative to the project
 */
export function readProjectVersion({ file, pattern, fallback }, tools) {
  if (file && tools.exists(file)) {
    const m = new RegExp(pattern).exec(tools.read(file));
    if (m && m[1]) return m[1];
  }
  return fallback;
}
