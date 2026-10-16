// Globs of the kit (ARCHITECTURE.md §5): the patterns of a coverage adapter, of `sources`, and of what tells that an
// application uses a stack (standard/adapters.json). Paths are relative, with forward slashes.

/** Regular expression of a glob: ** (any folders), * (any characters but /), ?, {a,b}. */
export function globRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end < 0) re += "\\{";
      else {
        re +=
          "(?:" +
          glob
            .slice(i + 1, end)
            .split(",")
            .map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
            .join("|") +
          ")";
        i = end;
      }
    } else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$");
}
