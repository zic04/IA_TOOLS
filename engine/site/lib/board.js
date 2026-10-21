/* The Product board (ARCHITECTURE.md §6.8b): the backlog of the feature sheets (D.board), drawn where a page or the
   home of a space leaves its place (<div class="tableau-produit" data-board>). A story map — the epics in columns,
   their features, then one row of stories per version — or a list (epic › feature › story), with filters: who,
   epic, version, depth and text. A card is a link to its sheet, a story to its heading; the view chosen is
   remembered. A module of the site (engine/site/app.js, spliced in at its "@lib" line): it sees EXT.api only and
   adds to EXT. No text of its own: every word comes from ui.board.* (t). */
/* global EXT */
const { t, esc, icon, memo, $$ } = EXT.api;
const BOARD_KEY = "__THEME_KEY__.board";
const VIEWS = ["map", "list"];
const LEVELS = ["full", "partial", "none"];
const CRITERIA = ["sheet", "stories", "criteria", "rules", "rubrics"];

/** The board of the site's data: its features, stories and epics, indexed. */
function indexOf(B) {
  const features = new Map(B.features.map((f) => [f.id, f]));
  const stories = new Map(B.stories.map((s) => [s.id, s]));
  const epics = B.epics.map((e, i) => ({ ...e, key: e.id || `g${i}` }));
  return { B, features, stories, epics, epicOf: new Map(epics.flatMap((e) => e.features.map((id) => [id, e]))) };
}

const level = (score) => (score >= 100 ? "full" : score > 0 ? "partial" : "none");
const mean = (scores) => (scores.length ? Math.round(scores.reduce((n, s) => n + s, 0) / scores.length) : 0);
const versionLabel = (v) => (v === null ? t("ui.board.noVersion") : t("ui.board.version", { version: v }));

/** The features the filters keep, in the order of their epics. */
function shown(ix, f) {
  const q = f.q.trim().toLowerCase();
  return ix.epics
    .flatMap((e) => e.features.map((id) => ix.features.get(id)))
    .filter((x) => {
      if (!x) return false;
      const own = x.stories.map((id) => ix.stories.get(id)).filter(Boolean);
      if (f.epic && ix.epicOf.get(x.id)?.key !== f.epic) return false;
      if (f.who && !x.roles.includes(f.who)) return false;
      if (f.depth && level(x.depth.score) !== f.depth) return false;
      if (
        f.version &&
        x.since !== (f.version === "-" ? null : f.version) &&
        !own.some((s) => (s.since ?? "-") === f.version)
      )
        return false;
      if (!q) return true;
      const text = [x.id, x.title, x.summary, ...own.map((s) => `${s.id} ${s.title}`)].join(" ").toLowerCase();
      return text.includes(q);
    });
}

/** A depth gauge: its bar, its score, and its criteria for assistive technology. */
function gauge(depth, cls = "tb-jauge") {
  const details = depth.criteria
    .map(
      (v, i) =>
        `${t(`ui.board.criterion.${CRITERIA[i]}`)} ${v === null ? t("ui.board.na") : `${Math.round(v * 100)} %`}`,
    )
    .join(", ");
  return `<span class="${cls} tb-${level(depth.score)}" role="img" aria-label="${esc(t("ui.board.depthLabel", { score: depth.score, details }))}"><span class="tb-barre" aria-hidden="true"><i style="width:${depth.score}%"></i></span><b>${depth.score} %</b></span>`;
}

/** A ticket: a link to its item when the project gave the tool's address (built by the kit, https only: checked
 *  again here), else its text. */
const ticket = (k) =>
  !k
    ? ""
    : String(k.url).startsWith("https://")
      ? `<a class="tb-ticket" href="${esc(k.url)}" target="_blank" rel="noopener noreferrer">${esc(k.text)}</a>`
      : `<span class="tb-ticket">${esc(k.text)}</span>`;

/** The kinds of behaviour of a feature, each with its icon. */
const kinds = (ix, list) =>
  list.length
    ? `<span class="tb-genres">${list.map((k) => `<span class="tb-genre">${icon(ix.B.kinds[k]?.icon || "mecanisme")}${esc(ix.B.kinds[k]?.title || k)}</span>`).join("")}</span>`
    : "";

/** "2 stories · 3 criteria · 1 rule". */
const counts = (x) =>
  [
    t("ui.board.count.stories", { n: x.stories.length }),
    t("ui.board.count.criteria", { n: x.criteria }),
    t("ui.board.count.rules", { n: x.rules }),
  ].join(" · ");

/** One feature as a card of the map: its title a link to its sheet, stretched over the card (style.css); its ticket
 *  a link of its own, above it — never a link in a link. */
function card(ix, x) {
  return `<div class="tb-carte">
    <span class="tb-carte-tete"><span class="tb-id">${esc(x.id)}</span><span class="tb-puce">${esc(versionLabel(x.since))}</span></span>
    <a class="tb-carte-titre" href="#/${esc(x.page)}" data-card>${esc(x.title)}</a>
    ${x.roles.length ? `<span class="tb-roles">${icon("personne")}<span>${esc(x.roles.join(", "))}</span></span>` : ""}
    ${kinds(ix, x.kinds)}
    <span class="tb-compte">${esc(counts(x))}</span>
    <span class="tb-carte-pied">${gauge(x.depth)}${ticket(x.ticket)}</span>
  </div>`;
}

/** One story: a link to its heading in its feature's sheet. */
const storyItem = (s) =>
  `<a class="tb-recit" href="#/${esc(s.page)}~${esc(s.anchor)}" title="${esc(s.title)}"><span class="tb-point ${s.criteria ? "tb-ok" : "tb-manque"}" aria-hidden="true"></span><span class="tb-id">${esc(s.id)}</span><span class="tb-recit-titre">${esc(s.title)}</span><span class="tb-criteres">${s.criteria ? esc(t("ui.board.count.criteria", { n: s.criteria })) : `<span class="sr-only">${esc(t("ui.board.noCriteria"))}</span>`}</span></a>`;

/** The epics of the features shown, each with the mean depth of all its features. */
function epicsShown(ix, list) {
  const keys = new Set(list.map((x) => ix.epicOf.get(x.id)?.key));
  return ix.epics.filter((e) => keys.has(e.key));
}
const epicScore = (ix, e) => mean(e.features.map((id) => ix.features.get(id)?.depth.score ?? 0));

/** The story map: the epics, their features, then a row of stories per version. */
function map(ix, list) {
  const epics = epicsShown(ix, list);
  const ordered = epics.flatMap((e) => list.filter((x) => ix.epicOf.get(x.id)?.key === e.key));
  const head = epics
    .map((e) => {
      const n = list.filter((x) => ix.epicOf.get(x.id)?.key === e.key).length;
      const score = epicScore(ix, e);
      return `<div class="tb-epic" style="grid-column: span ${n}">${e.id ? `<span class="tb-id">${esc(e.id)}</span>` : ""}<h3>${esc(e.title)}</h3>${e.summary ? `<p>${esc(e.summary)}</p>` : ""}<span class="tb-progres"><span class="tb-barre tb-${level(score)}" aria-hidden="true"><i style="width:${score}%"></i></span><span>${score} %</span><span>${esc(t("ui.board.count.features", { n: e.features.length }))}</span>${ticket(e.ticket)}</span></div>`;
    })
    .join("");
  const lanes = ix.B.versions
    .map((v) => {
      const cells = ordered
        .map((x) => {
          const own = x.stories.map((id) => ix.stories.get(id)).filter((s) => s && s.since === v);
          const none =
            v === null && !x.stories.length ? `<span class="tb-vide">${esc(t("ui.board.noStories"))}</span>` : "";
          return `<div class="tb-couloir"><span class="sr-only">${esc(versionLabel(v))}</span>${own.map(storyItem).join("")}${none}</div>`;
        })
        .join("");
      return `<div class="tb-etiquette tb-etiquette-couloir"><span class="tb-puce tb-puce-version">${esc(versionLabel(v))}</span></div>${cells}`;
    })
    .join("");
  const columns = `minmax(9rem, 10rem) repeat(${ordered.length}, minmax(15rem, 17rem))`;
  return `<div class="tb-defile" role="region" tabindex="0" aria-label="${esc(t("ui.board.view.map"))}"><div class="tb-carte-histoires" style="grid-template-columns: ${columns}">
    <div class="tb-etiquette tb-etiquette-tete">${esc(t("ui.board.lane.epics"))}</div>${head}
    <div class="tb-etiquette tb-etiquette-tete">${esc(t("ui.board.lane.features"))}</div>${ordered.map((x) => `<div class="tb-cellule">${card(ix, x)}</div>`).join("")}
    ${lanes}
  </div></div>`;
}

/** A row of the list under its parents (an epic's key, a feature's id): hidden when one of them is folded. */
const row = (cls, parents, folded, title, cells) =>
  `<tr class="${cls}"${parents.length ? ` data-parent="${esc(parents.join(" "))}"` : ""}${parents.some((k) => folded.has(k)) ? " hidden" : ""}><th scope="row">${title}</th>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
/** The button that folds what a row holds, and says whether it is open. */
const toggle = (key, label, folded, hidden = false) =>
  `<button class="tb-plier" type="button" aria-expanded="${!folded.has(key)}" data-toggle="${esc(key)}" aria-label="${esc(t(folded.has(key) ? "ui.board.expand" : "ui.board.collapse", { title: label }))}"${hidden ? " hidden" : ""}>${icon("chevron")}</button>`;

/** The list: Epic › Feature › Story, each level folding the next (folded: the keys of the rows folded). */
function list(ix, features, folded) {
  const head = ["element", "who", "stories", "rules", "behaviours", "version", "depth", "ticket"]
    .map((k) => `<th scope="col">${esc(t(`ui.board.col.${k}`))}</th>`)
    .join("");
  const rows = epicsShown(ix, features)
    .map((e) => {
      const own = features.filter((x) => ix.epicOf.get(x.id)?.key === e.key);
      const score = epicScore(ix, e);
      const epicRow = row(
        "tb-niveau-epic",
        [],
        folded,
        `${toggle(e.key, e.title, folded)}${e.id ? `<span class="tb-id">${esc(e.id)}</span>` : ""}<span>${esc(e.title)}</span>`,
        [
          esc(t("ui.board.count.features", { n: e.features.length })),
          "",
          "",
          "",
          "",
          `<span class="tb-jauge tb-${level(score)}"><span class="tb-barre" aria-hidden="true"><i style="width:${score}%"></i></span><b>${score} %</b></span>`,
          ticket(e.ticket),
        ],
      );
      const featureRows = own.map((x) => {
        const stories = x.stories.map((id) => ix.stories.get(id)).filter(Boolean);
        const title = `${toggle(x.id, x.title, folded, !stories.length)}<a href="#/${esc(x.page)}"><span class="tb-id">${esc(x.id)}</span><span>${esc(x.title)}</span></a>`;
        const featureRow = row("tb-niveau-fonction", [e.key], folded, title, [
          esc(x.roles.join(", ")),
          `${stories.length} · ${x.criteria}`,
          String(x.rules),
          kinds(ix, x.kinds),
          esc(x.since ?? "—"),
          gauge(x.depth),
          ticket(x.ticket),
        ]);
        const storyRows = stories.map((s) =>
          row(
            "tb-niveau-recit",
            [e.key, x.id],
            folded,
            `<a href="#/${esc(s.page)}~${esc(s.anchor)}"><span class="tb-id">${esc(s.id)}</span><span>${esc(s.title)}</span></a>`,
            [
              esc(s.role ?? ""),
              esc(t("ui.board.count.criteria", { n: s.criteria })),
              "",
              "",
              esc(s.since ?? "—"),
              "",
              ticket(s.ticket),
            ],
          ),
        );
        return featureRow + storyRows.join("");
      });
      return epicRow + featureRows.join("");
    })
    .join("");
  return `<div class="tableau tb-liste"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** A select of the toolbar: "all", then its options. */
function select(name, label, options, value) {
  const opts = options
    .map(([v, text]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(text)}</option>`)
    .join("");
  return `<label class="tb-filtre"><span>${esc(label)}</span><select data-filter="${name}"><option value="">${esc(t("ui.board.filter.all"))}</option>${opts}</select></label>`;
}

/** The toolbar: the view, the filters, the number of features shown (filled by draw). Drawn once: a filter keeps
 *  its focus and its caret as the board below it changes. */
function toolbar(ix, f) {
  const roles = [...new Set(ix.B.features.flatMap((x) => x.roles))].sort();
  const views = VIEWS.map(
    (v) =>
      `<button type="button" data-view="${v}" aria-pressed="${f.view === v}">${icon(v === "map" ? "carte" : "liste")}${esc(t(`ui.board.view.${v}`))}</button>`,
  ).join("");
  return `<div class="tb-outils">
    <div class="tb-vues" role="group" aria-label="${esc(t("ui.board.views"))}">${views}</div>
    ${select(
      "who",
      t("ui.board.filter.who"),
      roles.map((r) => [r, r]),
      f.who,
    )}
    ${select(
      "epic",
      t("ui.board.filter.epic"),
      ix.epics.map((e) => [e.key, e.id ? `${e.id} · ${e.title}` : e.title]),
      f.epic,
    )}
    ${select(
      "version",
      t("ui.board.filter.version"),
      ix.B.versions.map((v) => [v ?? "-", versionLabel(v)]),
      f.version,
    )}
    ${select(
      "depth",
      t("ui.board.filter.depth"),
      LEVELS.map((l) => [l, t(`ui.board.depth.${l}`)]),
      f.depth,
    )}
    <label class="tb-filtre tb-texte"><span class="sr-only">${esc(t("ui.board.filter.text"))}</span><input type="search" data-filter="q" value="${esc(f.q)}" placeholder="${esc(t("ui.board.filter.text"))}"></label>
    <span class="tb-resultat" role="status"></span>
  </div>`;
}

/** The summary: the share specified, and the numbers of features, stories and criteria. */
function summary(ix) {
  const score = mean(ix.B.features.map((x) => x.depth.score));
  const criteria = ix.B.features.reduce((n, x) => n + x.criteria, 0);
  return `<div class="tb-resume"><span class="tb-anneau" style="--p:${score}" role="img" aria-label="${esc(t("ui.board.specified", { score }))}"><b>${score} %</b></span><dl>
    <div><dt>${esc(t("ui.board.summary.features"))}</dt><dd>${ix.B.features.length}</dd></div>
    <div><dt>${esc(t("ui.board.summary.stories"))}</dt><dd>${ix.B.stories.length}</dd></div>
    <div><dt>${esc(t("ui.board.summary.criteria"))}</dt><dd>${criteria}</dd></div>
    <div><dt>${esc(t("ui.board.summary.epics"))}</dt><dd>${ix.epics.filter((e) => e.id).length}</dd></div>
  </dl></div>`;
}

/** Draws one board into its place, and keeps it drawn as the filters change. */
function mount(el) {
  const B = EXT.api.data().board;
  if (!B || el.dataset.drawn) return;
  el.dataset.drawn = "1";
  const ix = indexOf(B);
  const remembered = memo.read(BOARD_KEY);
  const f = {
    // The view remembered, when it is one (the storage is the reader's, not the kit's).
    view: VIEWS.includes(remembered) ? remembered : matchMedia("(min-width: 720px)").matches ? "map" : "list",
    who: "",
    epic: "",
    version: "",
    depth: "",
    q: "",
  };
  // The rows folded in the list, by key (an epic's, a feature's): kept as the filters and the view change.
  const folded = new Set();
  el.innerHTML = `<div class="tb-tete"><h2>${esc(t("ui.board.title"))}</h2>${summary(ix)}</div>${toolbar(ix, f)}<div class="tb-corps"></div>`;
  const body = el.querySelector(".tb-corps");
  const status = el.querySelector(".tb-resultat");
  // Only the board below the toolbar is drawn again; the count and the view's buttons change in place.
  const draw = () => {
    const features = shown(ix, f);
    const print = Boolean(el.dataset.print);
    body.innerHTML = !features.length
      ? `<p class="tb-aucun">${esc(t("ui.board.empty"))}</p>`
      : f.view === "map" && !print
        ? map(ix, features)
        : list(ix, features, print ? new Set() : folded);
    status.textContent = t("ui.board.results", { n: features.length });
    for (const b of $$("[data-view]", el)) b.setAttribute("aria-pressed", String(b.dataset.view === f.view));
  };
  el.addEventListener("click", (e) => {
    const view = e.target.closest("[data-view]");
    if (view) {
      f.view = view.dataset.view;
      memo.write(BOARD_KEY, f.view);
      draw();
      return;
    }
    const button = e.target.closest("[data-toggle]");
    if (!button) return;
    const key = button.dataset.toggle;
    if (!folded.delete(key)) folded.add(key);
    draw();
    $$("[data-toggle]", body)
      .find((b) => b.dataset.toggle === key)
      ?.focus();
  });
  el.addEventListener("change", (e) => {
    const name = e.target.dataset.filter;
    if (!name || name === "q") return;
    f[name] = e.target.value;
    draw();
  });
  el.addEventListener("input", (e) => {
    if (e.target.dataset.filter !== "q") return;
    f.q = e.target.value;
    draw();
  });
  // The arrow keys go from a card of the map to the next one.
  el.addEventListener("keydown", (e) => {
    if (!e.target.matches("[data-card]") || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    const cards = $$("[data-card]", el);
    const next = cards[cards.indexOf(e.target) + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) {
      next.focus();
      e.preventDefault();
    }
  });
  el.redraw = draw;
  draw();
}

EXT.hydrators.push((root) => $$("[data-board]", root).forEach(mount));
// Printed, a board is its list, every level open.
window.addEventListener("beforeprint", () =>
  $$("[data-board]").forEach((el) => {
    el.dataset.print = "1";
    el.redraw?.();
  }),
);
window.addEventListener("afterprint", () =>
  $$("[data-board]").forEach((el) => {
    delete el.dataset.print;
    el.redraw?.();
  }),
);
