// connect [--url <url>] [--forget] [--as <role>]
// Opens the application in a VISIBLE browser window; the person signs in (SSO and MFA work: it is a real
// browser), then presses Enter here — or the authentication adapter detects the session by itself (nextauth,
// api-me). The session (cookies + localStorage) is saved in .doc-kit/session.json (<PREFIX>_SESSION to change
// it): a secret, ignored by git. `connect --forget` deletes it. With capture.mode "none", only --forget runs
// (exit code 2 otherwise: there is nothing to capture). With capture.target "production", a production line comes
// first: the person signs in with their own account, and the session gives access to production.
// `--as <role>` (ARCHITECTURE.md §6.13) saves the session as .doc-kit/session-<role>.json instead, for `probe` to
// check the access control of that role; the plain session file (without --as) is unchanged.
import path from "node:path";
import readline from "node:readline";
import { loadAuth, connect, sessionFile, roleSessionFile, ROLE_PATTERN, forgetSession, authBrowser } from "../../engine/capture/session.mjs";
import { KitError, EXIT } from "../../engine/project/errors.mjs";

export const options = {
  url: { type: "string" },
  forget: { type: "boolean" },
  as: { type: "string", multiple: true },
};

/** The role of `--as <role>` (the last one, when given more than once), validated; null without the option. */
function roleOf(values) {
  if (!values.as?.length) return null;
  const role = values.as[values.as.length - 1];
  if (!ROLE_PATTERN.test(role)) throw new KitError(EXIT.USAGE, "option.value", { option: "as", value: role, expected: "letters, digits and dashes, starting with a letter" });
  return role;
}

/** Path shown to the person: relative to the current folder when it is inside it. */
export function shown(file) {
  const r = path.relative(process.cwd(), file);
  return !r || r.startsWith("..") || path.isAbsolute(r) ? file : r;
}

/**
 * Reader of the Enter key: wait() resolves when the person presses Enter and rejects when there is no terminal to
 * read from; close() releases the terminal.
 */
function enterKey(input = process.stdin) {
  let rl = null;
  return {
    wait: () =>
      new Promise((resolve, reject) => {
        if (input.readableEnded || input.destroyed) return reject(new Error("no terminal"));
        rl = readline.createInterface({ input });
        let done = false;
        rl.once("line", () => {
          done = true;
          rl.close();
          resolve();
        });
        rl.once("close", () => {
          if (!done) reject(new Error("no terminal"));
        });
      }),
    close() {
      rl?.close();
      input.pause?.();
    },
  };
}

export async function run({ ctx, values }) {
  const { project, config } = await ctx.loadProject();
  const role = roleOf(values);
  const file = role ? roleSessionFile(project.root, role) : sessionFile(project.root, config, ctx.env);

  if (values.forget) {
    const deleted = forgetSession(file);
    if (ctx.json) ctx.print(JSON.stringify({ deleted, file }));
    else ctx.print(ctx.t(deleted ? "cli.connect.forgotten" : "cli.connect.nothingToForget", { file: shown(file) }));
    return 0;
  }

  // A documentation declared without screenshots needs no session (--forget above still deletes an old one).
  if (config.capture.mode === "none") throw new KitError(EXIT.USAGE, "connect.modeNone", { file: "doc.config.mjs" });
  const auth = await loadAuth(project.root, config);
  if (auth.adapter.none) {
    if (ctx.json) ctx.print(JSON.stringify({ session: null }));
    else ctx.print(ctx.t("cli.connect.noAuth"));
    return 0;
  }
  const url = (values.url || config.app.url || "").replace(/\/+$/, "");
  if (!url) throw new KitError(EXIT.USAGE, "connect.noUrl");
  if (!/^https?:\/\//.test(url)) throw new KitError(EXIT.USAGE, "option.value", { option: "url", value: url, expected: "http(s)://…" });

  const browser = authBrowser(auth) === "chrome" ? "Chrome" : "Chromium";
  if (config.capture.target === "production" && !ctx.json) ctx.print(ctx.paint.warn(ctx.paint.bold(ctx.t("cli.connect.production", { url }))));
  ctx.print(ctx.t("cli.connect.open", { browser, url }));
  ctx.print(ctx.t(auth.adapter.detects ? "cli.connect.detecting" : "cli.connect.pressEnter"));
  const enter = enterKey();
  let s;
  try {
    s = await connect({
      url,
      auth,
      file,
      headless: false,
      locale: config.capture.locale,
      waitForUser: () => enter.wait(),
      ...(ctx.launch ? { launch: ctx.launch } : {}),
      onStatus: (event) => event === "notYet" && ctx.printErr(`⚠ ${ctx.t("cli.connect.notYet")}`),
    });
  } finally {
    enter.close();
  }
  if (ctx.json) {
    ctx.print(JSON.stringify({ file: s.file, who: s.who ?? null, details: s.details ?? null, expires: s.expires ?? null, role }));
    return 0;
  }
  if (s.who) ctx.print(ctx.t("cli.connect.who", { who: s.who }) + (s.details ? ` · ${s.details}` : ""));
  if (s.expires) ctx.print(ctx.t("cli.connect.expires", { expires: s.expires }));
  ctx.print(ctx.t("cli.connect.saved", { file: shown(s.file) }));
  if (role) ctx.print(ctx.t("cli.connect.asSaved", { role }));
  ctx.print(`⚠ ${ctx.t("cli.connect.secret")}`);
  ctx.print(ctx.t("cli.connect.forgetHint"));
  return 0;
}
