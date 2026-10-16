// Reading a manifest of the `dependencies` source (engine/facts/dependencies.mjs): a file that cannot be read, or a
// JSON manifest that is not valid JSON, is listed in `unreadable` ({ file, reason: "read"|"json" }) — its
// dependencies are unknown, which is not the same as none (AUDIT.md M14).
import fs from "node:fs";

/** Text of a manifest, or null when it cannot be read (then listed in `unreadable`). */
export const readText = (abs, manifest, unreadable) => {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    unreadable.push({ file: manifest, reason: "read" });
    return null;
  }
};

/** Parsed JSON manifest, or null when it cannot be read or is not valid JSON (then listed in `unreadable`). */
export const readJson = (abs, manifest, unreadable) => {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    unreadable.push({ file: manifest, reason: "json" });
    return null;
  }
};
