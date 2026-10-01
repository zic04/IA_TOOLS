> [!NOTE] About this example
> This page is the example of the `editor` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## What it is for

**Settings** holds the personal preferences of the person who is signed in: the **Name** shown in the header and written in the audit log, the **Language** of the interface and the **Theme**. It also displays two values of the workspace, read-only. Each person edits only their own settings.

With no setting at all, Acme Orders still works. The name is the `name` claim sent by the identity provider at the first sign-in (`lib/auth/index.ts:88`). The language is the browser's preferred language when it is English or French, and English otherwise (`lib/i18n/locale.ts:14-22`). The theme is **System**: it follows the light or dark mode of the device.

> [!NOTE] Where to find this setting
> [[menu Settings]] ([[route /settings]]), the **Settings** link of the top bar. Related pages: [Sign-in](#/examples/technical-sub~the-sign-in-flow), where the default name comes from, and [Environment variables](#/examples/variables), where the workspace values come from.

## How it works

The three preferences are saved together, by one server action, and do not apply at the same moment: the name and the language are read by the server, the theme by a script in the browser.

::diagram{id="ex-settings-flow" title="What happens when you click Save. Top row, left to right: the form, the server action, the validation, one transaction, the cookies. An invalid field stops at Refused; a valid save renders the layout again, which shows the new name, language and theme."}

> [!HOW] When and how the setting applies
> 1. Opening the page, the server reads `user_preferences` and the user's name (`app/(app)/settings/page.tsx:15-22`).
> 2. **Save** calls the server action `saveProfile` with the three **Profile** fields only (`app/(app)/settings/actions.ts:12`).
> 3. `profileSchema` checks them (`lib/validation/profile.ts:4-11`). An invalid field returns its message, shown under the field; nothing is written.
> 4. One transaction writes `users.display_name`, `user_preferences.locale` and `user_preferences.theme`, then the audit entry `profile.update` (`actions.ts:24-37`).
> 5. The action sets two cookies, `acme_locale` and `acme_theme`, so that the next render does not need the database (`actions.ts:39-40`).
> 6. `revalidatePath("/", "layout")` renders the layout again: the header shows the new name and the labels switch language without a reload (`actions.ts:42`).

| Setting | Stored in | Read by | Takes effect |
|---|---|---|---|
| **Name** | `users.display_name` | The server, at each render; the e-mail templates, when they are sent | At once; e-mails sent afterwards |
| **Language** | `user_preferences.locale`, cookie `acme_locale` | The server (`lib/i18n/locale.ts:14`) | At once, for the interface only |
| **Theme** | `user_preferences.theme`, cookie `acme_theme` | A script in the browser, before the first paint (`app/ThemeScript.tsx:8-15`) | At once; **System** is read only when a page loads |

## The screen

:::screen{capture="settings-profile" title="Settings"}
1. **Profile**. **Name** (text, 1 to 80 characters), **Language** (**English**, **Français**) and **Theme** (**Light**, **Dark**, **System**). The fields show your saved preferences; nothing changes until you click **Save**.
2. **Workspace**. Read-only. **Workspace ID** is the identifier of your organisation's workspace, which support asks for; it is a GUID, so the capture shows dots (see [masking](#/capture/masking)). **Integration** is the address that partner systems call, here `https://orders.example.org/api/v1`. **Save** never sends these two values.
3. **Save**. Sends the three **Profile** fields. On success, "Saved." appears next to the button; on error, the message appears under the field concerned. The button stays enabled even when nothing has changed.
:::

## What it changes

The captures of this site show a single state of **Settings**, so this section has no before and after slider: the effect is described from the code.

| Setting | Where the user sees the change | When |
|---|---|---|
| **Name** | Top right of the header; new audit entries; approval e-mails sent to others | Right after **Save** |
| **Language** | Menus, labels, messages, dates and amounts of the interface | Right after **Save**; e-mails stay in English ([N1](#/examples/findings~findings-with-no-effect)) |
| **Theme** | Colours of every page | At once; **System** follows a change of the device at the next page load ([M3](#/examples/findings~minor-findings)) |

Existing objects keep what they recorded. An audit entry stores the name of its author at the time (`lib/audit.ts:31`), and a decided approval step keeps the name of its approver.

## Settings reference

### Profile

| Setting | Control | Values · default | Effect |
|---|---|---|---|
| **Name** | Text field | 1 to 80 characters · the `name` claim at the first sign-in | Header, audit log, approval e-mails |
| **Language** | List | **English**, **Français** · the browser's language, else English | Labels, dates and amounts of the interface; not the e-mails |
| **Theme** | List | **Light**, **Dark**, **System** · **System** | Colours of the interface, applied before the first paint |

### Workspace

| Setting | Control | Values · default | Effect |
|---|---|---|---|
| **Workspace ID** | Read-only text | The workspace's GUID · set at installation | None; quoted to support |
| **Integration** | Read-only text | The `PUBLIC_API_URL` variable · row hidden when empty (`page.tsx:27`) | None; the address to give to partner systems |

## Step by step: switch to French and the dark theme

:::steps
1. Click **Settings** in the top bar ([[route /settings]]).
2. In **Language**, choose **Français**.
3. In **Theme**, choose **Dark**.
4. Click **Save**: "Saved." appears, then the page switches to French and to dark colours.
5. Open [[menu Orders › All orders]]: the labels are in French on this page too.
6. Check with an administrator, if needed: [[menu Administration › Audit log]] shows a `profile.update` entry listing `locale` and `theme`.
:::

## Pitfalls and limits

> [!WARNING] The language does not reach the e-mails
> Every e-mail of Acme Orders is sent in English, whatever the recipient chose in **Language** (`lib/mail/send.ts:22`). Tell French-speaking approvers before they look for a French e-mail ([N1](#/examples/findings~findings-with-no-effect)).

> [!WARNING] A new name does not rewrite the past
> The audit log and the decided approval steps keep the name of the time. Searching the audit log by the new name misses the older entries: search by person instead.

> [!WARNING] System follows the device only when a page loads
> Switching the device to dark mode during a visit changes nothing until the next page load ([M3](#/examples/findings~minor-findings)).

> [!NOTE] Observed gaps (v2.4.0)
> - A name made only of spaces is accepted: the length is checked before trimming, and the header then shows no name ([M2](#/examples/findings~minor-findings), `lib/validation/profile.ts:6`).
> - **Save** writes a `profile.update` entry even when nothing changed (`app/(app)/settings/actions.ts:37`).
> - Opening **Settings** writes on the server: the page sends a presence signal, `POST /api/presence`, for the **Who is online** view of the administrators (`app/(app)/settings/PresencePing.tsx:9`). A read-only capture blocks it (see [capturing safely](#/capture/safety)).

## Required permissions

> [!PERMISSIONS] Who can do what on this screen
> - **View and edit** your own settings: [[perm settings:write]], held by the four roles that ship with the product (`lib/permissions.ts:22-40`). Nobody, not even an administrator, can edit someone else's settings from this screen.
> - **Workspace** values: read-only for everyone; they change only through the deployment variables.
> - Every **Save** writes `profile.update` with the names of the changed fields, never their values, readable in [[menu Administration › Audit log]] with [[perm audit:read]].
