// Migration 0.1.0 — baseline of the project format (ARCHITECTURE.md §2 and §6). Nothing to change: projects
// created with the first version of the kit are already in this format. It serves as the model of a migration:
//   - read and write through `files` only (relative paths, forward slashes): `upgrade` shows the diff first and
//     writes only with --apply;
//   - be idempotent (running it twice changes nothing the second time);
//   - never touch content written by people beyond what the format change requires.
export const version = "0.1.0";

export async function migrate({ files }) {
  // Example of what a real migration does:
  //   if (files.exists("content/sommaire.json") && !files.exists("content/toc.json")) {
  //     files.write("content/toc.json", files.read("content/sommaire.json"));
  //     files.remove("content/sommaire.json");
  //   }
  void files;
}
