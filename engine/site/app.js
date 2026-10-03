/* Documentation site — browser engine (inlined at build time, no dependency).
   Data   : <script id="donnees"> (pages, outline, search index, glossary, i18n texts). The data keeps its
            historical key names (titre, pages, ordre…), shared with the build.
   Images : <script type="text/plain" id="img-ID"> (WebP data URI), read on demand.
   Texts  : none hard-coded; everything goes through t() (ui.* and home.* keys embedded by the build). */
(function () {
  "use strict";

  let D = JSON.parse(document.getElementById("donnees").textContent);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  // Icon names used by this file → keys of the embedded icon set.
  const ICON_KEYS = {
    sun: "soleil",
    moon: "lune",
    screen: "ecran",
    lock: "droits",
    book: "livre",
    sliders: "studios",
    map: "carte",
    search: "recherche",
    left: "gauche",
  };
  const icon = (name, cls = "ico") =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${D.icones[ICON_KEYS[name] || name] || ""}</svg>`;
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();

  // ─── Texts (i18n) ─────────────────────────────────────────────────────────
  // t(key, vars): plain text; variables {name}; plural { one, other… } chosen from vars.n.
  // th(key, vars): HTML; the text is escaped, the variables (already HTML) are inserted as they are.
  let TEXTS = D.i18n || {};
  let rules = new Intl.PluralRules(document.documentElement.lang || undefined);
  function form(key, vars) {
    const v = TEXTS[key];
    if (v === undefined) return key;
    if (v && typeof v === "object") return v[rules.select(Number((vars && vars.n) || 0))] ?? v.other;
    return v;
  }
  const fill = (template, vars) =>
    String(template).replace(/\{(\w+)\}/g, (m, k) =>
      vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m,
    );
  const t = (key, vars) => fill(form(key, vars), vars);
  const th = (key, vars) => fill(esc(form(key, vars)), vars);

  const main = $("#contenu-principal");
  const shell = $("#coque");
  const sidebar = $("#lateral");
  const toc = $("#toc");
  const bubble = $("#bulle");
  // Sub-pages (level 2): attached to the last level-1 page above them in their group. Recomputed by
  // computeHierarchy() whenever the language changes (D.sections then points to the new language's data).
  let sectionsById = {};
  let parentOf = {};
  let childrenOf = {};
  function computeHierarchy() {
    sectionsById = Object.fromEntries(D.sections.map((s) => [s.id, s]));
    parentOf = {};
    childrenOf = {};
    for (const s of D.sections)
      for (const g of s.groupes) {
        let parent = null;
        for (const pid of g.pages) {
          if (D.pages[pid].niveau === 2 && parent) {
            parentOf[pid] = parent;
            (childrenOf[parent] = childrenOf[parent] || []).push(pid);
          } else parent = pid;
        }
      }
  }
  computeHierarchy();
  let currentPage = null;

  // ─── Local storage (reading preferences only, never required) ─────────────
  const memo = {
    read(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    write(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        /* private browsing: no consequence */
      }
    },
  };

  // ─── Spaces (one source, one site per audience) ───────────────────────────
  // The spaces apply when the build declares them (D.spaces). The current space, an id or null for "everything",
  // comes from the URL #/@<id>, else from the page or the section shown, else from the value remembered under
  // __THEME_KEY__.space. The filter only changes what is shown: D.sections, D.ordre, D.parcours and D.suggestions
  // hold the part of the current space (the full lists stay in FULL), so that the menus, previous / next, the
  // home page and the full print follow it. An export (D.meta.space) holds one space, always current.
  let SPACES = D.spaces || null;
  let spacesById = Object.fromEntries((SPACES || []).map((s) => [s.id, s]));
  const SPACE_KEY = "__THEME_KEY__.space";
  const exported = SPACES && D.meta.space ? D.meta.space : null;
  let FULL = {
    sections: D.sections,
    ordre: D.ordre,
    parcours: D.parcours || [],
    suggestions: D.suggestions || [],
    byId: { ...sectionsById },
  };
  const knownSpace = (id) => (id && spacesById[id] ? id : null);
  let currentSpace = exported || knownSpace(memo.read(SPACE_KEY));
  const inCurrentSpace = (pid) => !currentSpace || (!!D.pages[pid] && D.pages[pid].space === currentSpace);

  function applySpace() {
    // A section shown for some of its pages keeps its title; its "featured" mark, subtitle and highlights describe
    // its own space.
    const reduce = (s) => ({
      ...s,
      ...(s.space === currentSpace ? {} : { vedette: false, sous_titre: "", points: [] }),
      groupes: s.groupes.map((g) => ({ ...g, pages: g.pages.filter(inCurrentSpace) })).filter((g) => g.pages.length),
    });
    D.sections = currentSpace ? FULL.sections.map(reduce).filter((s) => s.groupes.length) : FULL.sections;
    D.ordre = FULL.ordre.filter(inCurrentSpace);
    D.parcours = currentSpace ? FULL.parcours.filter((j) => j.space === currentSpace) : FULL.parcours;
    D.suggestions = FULL.suggestions.filter(inCurrentSpace);
    Object.assign(sectionsById, FULL.byId, Object.fromEntries(D.sections.map((s) => [s.id, s])));
    renderSpaces();
  }
  /** The current space of a route (#/@<id>, a page, a section), remembered; unchanged for the home page. */
  function chooseSpace(path) {
    if (!SPACES) return;
    let next = currentSpace;
    if (path.charAt(0) === "@") next = knownSpace(path.slice(1));
    else if (D.pages[path]) next = knownSpace(D.pages[path].space);
    else if (FULL.byId[path]) next = knownSpace(FULL.byId[path].space);
    if (path && !exported) memo.write(SPACE_KEY, next || "");
    currentSpace = exported || next;
    applySpace();
  }
  /** Where a section leads: its overview, or its first page of the current space when it belongs to another one. */
  const sectionLink = (s) =>
    currentSpace && s.space !== currentSpace && s.groupes.length ? s.groupes[0].pages[0] : s.id;
  const spaceIcon = (s) => (s.icon ? icon(s.icon) : "");

  // Selector: "everything", then one button per space (tooltip: its readers); the current one is pressed. In the
  // top bar, and at the head of the side menu below 1080 px. An export shows its space as a label instead.
  const spacesBar = $("#espaces");
  const spaceButtons = () =>
    `<button type="button" class="espace-choix" data-espace="" title="${esc(t("ui.spaces.allFor"))}" aria-pressed="${!currentSpace}">${esc(t("ui.spaces.all"))}</button>` +
    (SPACES || [])
      .map(
        (s) =>
          `<button type="button" class="espace-choix" data-espace="${esc(s.id)}" title="${esc(s.for)}" aria-pressed="${s.id === currentSpace}">${esc(s.shortTitle)}</button>`,
      )
      .join("");
  const sidebarSpaces = () =>
    SPACES && !exported
      ? `<div class="espaces lat-espaces" role="group" aria-label="${esc(t("ui.spaces.label"))}">${spaceButtons()}</div>`
      : "";
  function renderSpaces() {
    if (!spacesBar) return;
    if (!exported) {
      spacesBar.innerHTML = spaceButtons();
      return;
    }
    const s = spacesById[exported];
    spacesBar.removeAttribute("role");
    spacesBar.removeAttribute("aria-label");
    spacesBar.innerHTML = `<span class="espace-unique" title="${esc(s.title)}">${spaceIcon(s)}${esc(s.shortTitle)}</span>`;
  }
  if (spacesBar && !SPACES) spacesBar.remove();
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-espace]");
    if (b) location.hash = "#/@" + b.dataset.espace;
  });

  /** In "everything" mode, the title of a space above its sections (again whenever the space changes). */
  const spaceHeader = (s, i) =>
    SPACES && !currentSpace && spacesById[s.space] && (i === 0 || D.sections[i - 1].space !== s.space)
      ? `<div class="lat-espace">${spaceIcon(spacesById[s.space])}<span>${esc(spacesById[s.space].title)}</span></div>`
      : "";
  const spaceBadge = (p) => {
    const s = SPACES && spacesById[p.space];
    return s ? `<span class="puce espace" title="${esc(s.title)}">${spaceIcon(s)}${esc(s.shortTitle)}</span>` : "";
  };
  const spaceCrumb = (id) => {
    const s = SPACES && spacesById[id];
    return s ? `<a href="#/@${esc(s.id)}">${esc(s.shortTitle)}</a><span class="sep">›</span>` : "";
  };
  /** "Same topic, for {space}: {title} →" (another space), else "Related: {title} →". */
  function counterpartLine(p) {
    const c = p.counterpart;
    const target = c && D.pages[c.id];
    if (!target) return "";
    const other = SPACES && target.space !== p.space ? spacesById[target.space] : null;
    const text = other
      ? t("ui.counterpart", { space: other.shortTitle, title: target.titre })
      : t("ui.counterpart.plain", { title: target.titre });
    return `<p class="pendant"><a href="#/${c.id}${c.anchor ? "~" + c.anchor : ""}">${icon("lien")}<span>${esc(text)}</span></a></p>`;
  }
  /** Home page, "everything" mode: one door per space. */
  const spaceDoors = () =>
    SPACES.map(
      (s) => `<a class="porte porte-espace" href="#/@${esc(s.id)}">
          <span class="icone">${spaceIcon(s)}</span>
          <h2>${esc(s.title)}</h2>
          ${s.for ? `<p class="porte-pour">${esc(t("home.spaces.for", { for: s.for }))}</p>` : ""}
          <p>${esc(s.subtitle)}</p>
          <span class="aller">${esc(t("home.doorPages", { n: s.pages }))}</span>
        </a>`,
    ).join("");
  /** Home page with a space current (not in an export): "You are reading: {title} · Show everything". */
  function spaceStrip() {
    if (!currentSpace || exported) return "";
    const s = spacesById[currentSpace];
    return `<div class="espace-bandeau">${spaceIcon(s)}<span>${th("home.spaces.current", { title: `<strong>${esc(s.title)}</strong>` })}</span><a href="#/@">${esc(t("home.spaces.showAll"))}</a></div>`;
  }

  // ─── Languages (one source, one site, several languages) ─────────────────
  // The languages apply when the build declares them (D.meta.languages). The current language comes from, in
  // this order: the URL prefix #/<lang>/…, else the value remembered under __THEME_KEY__.lang, else the first
  // of navigator.languages that matches a declared language, else the source. Switching parses and caches the
  // other language's data (#donnees-<lang>, parsed once), rebuilds every derived structure (sections index,
  // sub-pages, spaces, search index, glossary terms, image cache) from it, and re-applies the template texts
  // (data-t / data-t-<attribute> of template.html). The current space (ids, not texts) is kept.
  const LANGUAGES = D.meta.languages || null;
  const SOURCE_LANG = LANGUAGES ? D.meta.language : null;
  const LANG_KEY = "__THEME_KEY__.lang";
  const DATA = { [SOURCE_LANG]: D };
  let currentLang = SOURCE_LANG;
  /** Parses and caches the data of another language (#donnees-<lang>), once. */
  function dataOf(lang) {
    if (!(lang in DATA)) {
      const el = document.getElementById("donnees-" + lang);
      DATA[lang] = el ? JSON.parse(el.textContent) : null;
    }
    return DATA[lang];
  }
  /** Language to use when the URL carries no prefix: the value remembered, else a matching browser language,
   * else the source. `navigator.languages` entries are matched on their base (before "-"). */
  function initialLanguage(prefix) {
    if (prefix) return prefix;
    const stored = memo.read(LANG_KEY);
    if (stored && LANGUAGES.includes(stored)) return stored;
    const nav = (navigator.languages || []).map((l) => String(l).split("-")[0].toLowerCase());
    return nav.find((base) => LANGUAGES.includes(base)) || SOURCE_LANG;
  }
  /** Switches the active language: rebuilds every structure derived from D, re-applies the template texts,
   * keeps the current page reset (forces a re-render even when its id is unchanged) and the current space. */
  function switchLanguage(lang) {
    const next = dataOf(lang);
    if (!next || lang === currentLang) return;
    D = next;
    TEXTS = D.i18n || {};
    rules = new Intl.PluralRules(lang);
    computeHierarchy();
    SPACES = D.spaces || null;
    spacesById = Object.fromEntries((SPACES || []).map((s) => [s.id, s]));
    FULL = {
      sections: D.sections,
      ordre: D.ordre,
      parcours: D.parcours || [],
      suggestions: D.suggestions || [],
      byId: { ...sectionsById },
    };
    INDEX = buildIndex();
    TERMS = buildTerms();
    imageCache.clear();
    currentPage = null;
    currentLang = lang;
    document.documentElement.lang = lang;
    memo.write(LANG_KEY, lang);
    applyTemplateTexts();
    updateThemeButton();
    renderLanguages();
  }
  /** Re-applies the texts of template.html (data-t: textContent; data-t-aria-label / data-t-title /
   * data-t-placeholder: the matching attribute) from the embedded template.* keys of the current language.
   * A mono-language build never embeds template.*: nothing to do. */
  function applyTemplateTexts() {
    if (!("template.menu" in TEXTS)) return;
    $$("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
    $$("[data-t-aria-label]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.tAriaLabel)));
    $$("[data-t-title]").forEach((el) => el.setAttribute("title", t(el.dataset.tTitle)));
    $$("[data-t-placeholder]").forEach((el) => el.setAttribute("placeholder", t(el.dataset.tPlaceholder)));
  }
  /** The anchor at the same position (index) in the target page's outline, when both outlines have the same
   * number of headings; otherwise the anchor cannot be carried over. */
  function mapAnchor(fromToc, toToc, anchor) {
    if (!fromToc || !toToc || fromToc.length !== toToc.length) return null;
    const i = fromToc.findIndex((h) => h.id === anchor);
    return i >= 0 ? toToc[i].id : null;
  }
  /** Where the language selector leads: the page, section, space home or home page currently shown, in the
   * target language, its anchor carried over by position when possible. */
  function languageLink(lang) {
    let anchor = "";
    if (routed.anchor && D.pages[routed.path]) {
      const target = dataOf(lang);
      const targetToc = target && target.pages[routed.path] ? target.pages[routed.path].toc : null;
      const mapped = mapAnchor(D.pages[routed.path].toc, targetToc, routed.anchor);
      if (mapped) anchor = "~" + mapped;
    }
    return "#/" + lang + "/" + routed.path + anchor;
  }
  const languageButtons = () =>
    LANGUAGES.map(
      (id) =>
        `<button type="button" class="espace-choix" data-langue="${id}" lang="${id}" aria-pressed="${id === currentLang}">${esc(TEXTS["ui.language." + id] || id)}</button>`,
    ).join("");
  const sidebarLanguages = () =>
    LANGUAGES
      ? `<div class="espaces lat-espaces lat-langues" role="group" aria-label="${esc(t("ui.language.label"))}">${languageButtons()}</div>`
      : "";
  const langBar = $("#langues");
  function renderLanguages() {
    if (!langBar) return;
    langBar.innerHTML = languageButtons();
    langBar.setAttribute("aria-label", t("ui.language.label"));
  }
  if (langBar && !LANGUAGES) langBar.remove();
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-langue]");
    if (b) location.hash = languageLink(b.dataset.langue);
  });
  /** "Not translated yet — shown in {language}.": a page, a section introduction or the home page rendered
   * from the source because the current language has none (a draft build only: a strict build never lets a
   * missing translation reach the site). {language} is named IN THE INTERFACE LANGUAGE shown (ui.language.name.*,
   * e.g. "anglais" on a French interface, "French" on an English one), never the autonym (reserved for the
   * language selector): ui.language.name.<fallback> first, then the autonym, then the raw code. */
  const translationBanner = (fallback) =>
    fallback
      ? `<div class="bandeau-traduction" role="note">${icon("note")}<span>${esc(t("ui.translation.missing", { language: TEXTS["ui.language.name." + fallback] || TEXTS["ui.language." + fallback] || fallback }))}</span></div>`
      : "";

  // ─── Embedded images ──────────────────────────────────────────────────────
  const imageCache = new Map();
  function imageSrc(id) {
    const key = LANGUAGES ? currentLang + ":" + id : id;
    if (!imageCache.has(key)) {
      let el =
        LANGUAGES && currentLang !== SOURCE_LANG ? document.getElementById("img-" + id + "@" + currentLang) : null;
      if (!el) el = document.getElementById("img-" + id);
      imageCache.set(key, el ? el.textContent.trim() : "");
    }
    return imageCache.get(key);
  }
  function hydrateImages(root) {
    $$("img[data-img]", root).forEach((img) => {
      if (!img.getAttribute("src")) img.src = imageSrc(img.dataset.img);
    });
  }

  // ─── Theme ────────────────────────────────────────────────────────────────
  const themeButton = $("#bouton-theme");
  function updateThemeButton() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeButton.innerHTML = icon(dark ? "sun" : "moon");
    themeButton.title = dark ? t("ui.theme.light") : t("ui.theme.dark");
  }
  themeButton.addEventListener("click", () => {
    const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    memo.write("__THEME_KEY__", theme);
    updateThemeButton();
  });
  updateThemeButton();

  // ─── Top and side navigation ──────────────────────────────────────────────
  function renderTopnav(sectionId) {
    $("#topnav").innerHTML = D.sections
      .map(
        (s) =>
          `<a href="#/${sectionLink(s)}" class="${s.id === sectionId ? "actif" : ""} ${s.vedette ? "vedette" : ""}">${esc(s.titre_court || s.titre)}</a>`,
      )
      .join("");
  }

  const openSections = new Set();
  function renderSidebar(sectionId, pageId) {
    if (sectionId) openSections.add(sectionId);
    sidebar.innerHTML =
      sidebarLanguages() +
      sidebarSpaces() +
      D.sections
        .map((s, i) => {
          const open = openSections.has(s.id);
          const groups = s.groupes
            .map(
              (g) =>
                (g.titre ? `<div class="lat-groupe">${esc(g.titre)}</div>` : "") +
                g.pages
                  .map((pid) => {
                    const p = D.pages[pid];
                    // A sub-page is shown only when its parent page or one of its siblings is displayed.
                    const branch = pageId && (parentOf[pageId] || pageId);
                    if (parentOf[pid] && parentOf[pid] !== branch) return "";
                    const children = childrenOf[pid];
                    const classes = [
                      "lat-lien",
                      parentOf[pid] ? "niveau-2" : "",
                      pid === pageId ? "actif" : "",
                      children ? "a-enfants" : "",
                      children && branch === pid ? "deplie" : "",
                      parentOf[pageId] === pid ? "parent-actif" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const count = children
                      ? `<span class="lat-nb" title="${esc(t("ui.subPages", { n: children.length }))}">${children.length}</span>`
                      : "";
                    return `<a class="${classes}" href="#/${pid}"><span>${esc(p.titre_menu || p.titre)}</span>${count}</a>`;
                  })
                  .join(""),
            )
            .join("");
          // The overview of a section belongs to its own space: not offered from another one.
          const overview = !currentSpace || s.space === currentSpace;
          return `${spaceHeader(s, i)}<div class="lat-section ${open ? "ouverte" : ""}" data-section="${s.id}">
          <button type="button" aria-expanded="${open}"><span class="pastille-section">${icon(s.icone)}</span>${esc(s.titre)}${icon("chevron", "ico chevron")}</button>
          <div class="lat-corps">${overview ? `<a class="lat-lien ${!pageId && sectionId === s.id ? "actif" : ""}" href="#/${s.id}">${esc(t("ui.sidebar.overview"))}</a>` : ""}${groups}</div>
        </div>`;
        })
        .join("");
    const active = $(".lat-lien.actif", sidebar);
    if (active) active.scrollIntoView({ block: "nearest" });
  }
  sidebar.addEventListener("click", (e) => {
    const b = e.target.closest(".lat-section > button");
    if (!b) return;
    const sec = b.parentElement;
    const id = sec.dataset.section;
    sec.classList.toggle("ouverte");
    if (sec.classList.contains("ouverte")) openSections.add(id);
    else openSections.delete(id);
    b.setAttribute("aria-expanded", sec.classList.contains("ouverte"));
  });
  $("#menu-mobile").addEventListener("click", () => document.body.classList.toggle("menu-ouvert"));

  // ─── Pages ────────────────────────────────────────────────────────────────
  function pageBadges(p) {
    const badges = [];
    if (SPACES && spacesById[p.space]) badges.push(spaceBadge(p));
    (p.routes || []).forEach((r) => badges.push(`<span class="puce route">${icon("screen")}${esc(r)}</span>`));
    (p.droits || []).forEach((d) => badges.push(`<span class="puce droit">${icon("lock")}${esc(d)}</span>`));
    if (p.captures)
      badges.push(
        `<span class="puce menu">${icon("screen")}${esc(t("ui.page.annotatedScreens", { n: p.captures }))}</span>`,
      );
    return badges.length ? `<div class="page-meta">${badges.join("")}</div>` : `<div class="page-meta"></div>`;
  }

  function footerNav(id) {
    const i = D.ordre.indexOf(id);
    const previous = i > 0 ? D.pages[D.ordre[i - 1]] : null;
    const next = i >= 0 && i < D.ordre.length - 1 ? D.pages[D.ordre[i + 1]] : null;
    return `<nav class="pied-nav" aria-label="${esc(t("ui.footer.neighbours"))}">
      ${previous ? `<a href="#/${previous.id}"><small>${esc(t("ui.footer.previous"))}</small><span>${esc(previous.titre)}</span></a>` : ""}
      ${next ? `<a class="suivant" href="#/${next.id}"><small>${esc(t("ui.footer.next"))}</small><span>${esc(next.titre)}</span></a>` : ""}
    </nav>`;
  }

  // "Screenshots taken on <date>, version <x>": dates and versions of the screenshots of the page
  // (meta.screenshots, from the zone files); nothing when they are unknown.
  const longDate = (d) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return d;
    try {
      return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)));
    } catch (e) {
      return d;
    }
  };
  const versionOrder = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  function screenshotsNote(p) {
    const parts = [];
    // Following the application (ARCHITECTURE.md §6.10): only present when sync.json marked this page.
    if (p.verified)
      parts.push(t("ui.footer.verified", { version: p.verified.version, date: longDate(p.verified.date) }));
    const info = D.meta.screenshots;
    if (info) {
      const ids = new Set(Array.from(String(p.html).matchAll(/data-img="([^"]+)"/g), (m) => m[1]));
      const known = Array.from(ids, (id) => info[id]).filter(Boolean);
      const dates = Array.from(new Set(known.map((x) => x.captured).filter(Boolean))).sort();
      const versions = Array.from(new Set(known.map((x) => x.version).filter(Boolean))).sort(versionOrder);
      if (dates.length === 1) parts.push(t("ui.footer.screenshots.on", { date: longDate(dates[0]) }));
      else if (dates.length > 1)
        parts.push(
          t("ui.footer.screenshots.between", { from: longDate(dates[0]), to: longDate(dates[dates.length - 1]) }),
        );
      if (versions.length)
        parts.push(
          t(dates.length ? "ui.footer.screenshots.version" : "ui.footer.screenshots.versionOnly", {
            n: versions.length,
            version: versions.join(", "),
          }),
        );
    }
    if (!parts.length) return "";
    return `<div class="pied-captures">${esc(parts.join(", "))}</div>`;
  }

  const siteFooter = () =>
    `<div class="pied-site">${esc(
      t("ui.footer.site", {
        product: D.meta.produit,
        version: D.meta.version,
        date: D.meta.date,
        pages: D.meta.stats.pages,
        captures: D.meta.stats.captures,
      }),
    )}${D.meta.feedback ? ` · <a href="${esc(D.meta.feedback.url)}" rel="noopener" target="_blank">${esc(D.meta.feedback.label)}</a>` : ""}</div>`;

  function showPage(id, anchor) {
    const p = D.pages[id];
    const sec = sectionsById[p.section];
    if (currentPage === id) {
      scrollToAnchor(anchor);
      return;
    }
    currentPage = id;
    shell.className = "coque" + (p.toc && p.toc.length > 1 ? "" : " sans-toc");
    renderTopnav(p.section);
    renderSidebar(p.section, id);
    main.innerHTML = `<article class="article">
      <nav class="ariane" aria-label="${esc(t("ui.breadcrumb.label"))}"><a href="#/">${esc(t("ui.breadcrumb.home"))}</a><span class="sep">›</span>${spaceCrumb(p.space)}<a href="#/${sectionLink(sec)}">${esc(sec.titre)}</a>${p.groupe ? `<span class="sep">›</span><span>${esc(p.groupe)}</span>` : ""}${parentOf[id] ? `<span class="sep">›</span><a href="#/${parentOf[id]}">${esc(D.pages[parentOf[id]].titre_menu || D.pages[parentOf[id]].titre)}</a>` : ""}</nav>
      <h1 class="page-titre">${esc(p.titre)}</h1>
      ${p.resume ? `<p class="page-resume">${esc(p.resume)}</p>` : ""}
      ${pageBadges(p)}
      ${counterpartLine(p)}
      ${p.fallback ? translationBanner(p.fallback) : ""}
      <div class="contenu">${p.html}</div>
      ${footerNav(id)}
      ${screenshotsNote(p)}${siteFooter()}
    </article>`;
    renderToc(p);
    hydrate(main, p);
    document.title = `${p.titre} — ${D.meta.titre}`;
    scrollToAnchor(anchor, true);
  }

  function showSection(sec) {
    currentPage = null;
    shell.className = "coque sans-toc";
    renderTopnav(sec.id);
    renderSidebar(sec.id, null);
    toc.innerHTML = "";
    const groups = sec.groupes
      .map(
        (g) =>
          (g.titre ? `<div class="groupe-titre">${esc(g.titre)}</div>` : "") +
          `<div class="grille-cartes">${g.pages
            .filter((pid) => !parentOf[pid])
            .map((pid) => {
              const p = D.pages[pid];
              const children = childrenOf[pid] || [];
              const screens = [pid, ...children].reduce((n, x) => n + (D.pages[x].captures || 0), 0);
              const counts = [
                children.length ? esc(t("ui.subPages", { n: children.length })) : "",
                screens ? esc(t("ui.page.annotatedScreens", { n: screens })) : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return `<a class="carte-lien" href="#/${pid}"><span class="titre">${esc(p.titre)}</span><span class="resume">${esc(p.resume || "")}</span>${counts ? `<span class="compte">${counts}</span>` : ""}</a>`;
            })
            .join("")}</div>`,
      )
      .join("");
    main.innerHTML = `<article class="article">
      <nav class="ariane"><a href="#/">${esc(t("ui.breadcrumb.home"))}</a><span class="sep">›</span>${spaceCrumb(sec.space)}<span>${esc(sec.titre)}</span></nav>
      <h1 class="page-titre">${esc(sec.titre)}</h1>
      <p class="page-resume">${esc(sec.sous_titre || "")}</p>
      ${sec.fallback ? translationBanner(sec.fallback) : ""}
      <div class="contenu">${sec.intro_html || ""}</div>
      ${groups}
      ${siteFooter()}
    </article>`;
    hydrate(main, null);
    document.title = `${sec.titre} — ${D.meta.titre}`;
    window.scrollTo(0, 0);
  }

  function showHome() {
    currentPage = null;
    shell.className = "coque accueil";
    renderTopnav(null);
    renderSidebar(null, null);
    toc.innerHTML = "";
    const s = D.meta.stats;
    // "Everything" mode: one door per space; a space current: the doors of its sections.
    const doors =
      SPACES && !currentSpace
        ? spaceDoors()
        : D.sections
            .map((sec) => {
              const n = sec.groupes.reduce((total, g) => total + g.pages.length, 0);
              return `<a class="porte ${sec.vedette ? "vedette" : ""}" href="#/${sectionLink(sec)}">
          ${sec.vedette ? `<span class="etiquette">${esc(t("home.featured"))}</span>` : ""}
          <span class="icone">${icon(sec.icone)}</span>
          <h2>${esc(sec.titre)}</h2>
          <p>${esc(sec.sous_titre || "")}</p>
          <ul>${(sec.points || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <span class="aller">${esc(t("home.doorPages", { n }))}</span>
        </a>`;
            })
            .join("");
    const journeyCount = (D.parcours || []).length;
    const journeys = (D.parcours || [])
      .map(
        (
          j,
        ) => `<div class="carte-lien"><span class="titre">${esc(j.titre)}</span><span class="resume">${esc(j.desc)}</span>
        <ol>${j.etapes.map((pid) => (D.pages[pid] ? `<li><a href="#/${pid}">${esc(D.pages[pid].titre)}</a></li>` : "")).join("")}</ol>${j.hidden ? `<span class="parcours-cache">${esc(t("ui.journey.hidden", { n: j.hidden }))}</span>` : ""}</div>`,
      )
      .join("");
    // A space current: its first featured section, else its first own section.
    const first =
      D.sections.find((x) => x.vedette) ||
      D.sections.find((x) => !currentSpace || x.space === currentSpace) ||
      D.sections[0];
    main.innerHTML = `
      <section class="heros">
        <div class="heros-interieur">
          <div class="sur-titre">${icon("book")} ${esc(t("home.eyebrow", { version: D.meta.version }))}</div>
          <h1>${th("home.title", { accent: `<span>${esc(t("home.titleAccent", { product: D.meta.produit }))}</span>` })}</h1>
          <p>${esc(D.meta.accroche)}</p>
          <div class="actions">
            <a class="bouton primaire" href="#/${sectionLink(first)}">${icon("sliders")}${esc(t("home.primaryAction", { section: first.titre_court || first.titre }))}</a>
            <a class="bouton" href="#/${sectionLink(D.sections[0])}">${icon("map")}${esc(t("home.gettingStarted"))}</a>
            <button class="bouton" type="button" data-action="recherche">${icon("search")}${esc(t("home.search"))}</button>
          </div>
          <div class="chiffres">
            <div><strong>${s.pages}</strong>${esc(t("home.stats.pages", { n: s.pages }))}</div>
            <div><strong>${s.captures}</strong>${esc(t("home.stats.captures", { n: s.captures }))}</div>
            <div><strong>${s.zones}</strong>${esc(t("home.stats.zones", { n: s.zones }))}</div>
            <div><strong>${s.schemas}</strong>${esc(t("home.stats.diagrams", { n: s.schemas }))}</div>
          </div>
          ${spaceStrip()}
        </div>
      </section>
      <div class="accueil-corps">
        <div class="portes">${doors}</div>
        ${D.meta.homeFallback ? translationBanner(D.meta.homeFallback) : ""}
        <div class="contenu">${D.accueil_html || ""}</div>
        ${journeys ? `<h2 class="accueil-section-titre">${esc(t("home.journeysTitle"))}</h2><p class="accueil-section-sous">${esc(t("home.journeysIntro", { n: journeyCount, count: TEXTS["home.number." + journeyCount] || journeyCount }))}</p><div class="parcours ${journeyCount === 4 ? "deux-colonnes" : ""}">${journeys}</div>` : ""}
        ${siteFooter()}
      </div>`;
    hydrate(main, null);
    document.title = D.meta.titre;
    window.scrollTo(0, 0);
  }

  function showNotFound(path) {
    currentPage = null;
    shell.className = "coque sans-toc";
    renderTopnav(null);
    renderSidebar(null, null);
    toc.innerHTML = "";
    main.innerHTML = `<article class="article"><h1 class="page-titre">${esc(t("ui.notFound.title"))}</h1>
      <p class="page-resume">${esc(t("ui.notFound.text", { path }))}</p>
      <p><button class="bouton primaire" type="button" data-action="recherche">${icon("search")}${esc(t("ui.notFound.search"))}</button> <a class="bouton" href="#/">${esc(t("ui.notFound.back"))}</a></p></article>`;
  }

  // ─── Page table of contents + scroll tracking ─────────────────────────────
  function renderToc(p) {
    if (!p.toc || p.toc.length < 2) {
      toc.innerHTML = "";
      return;
    }
    toc.innerHTML =
      `<div class="toc-titre">${esc(t("ui.toc.title"))}</div>` +
      p.toc
        .map((h) => `<a class="h${h.niveau}" href="#/${p.id}~${h.id}" data-cible="${h.id}">${esc(h.titre)}</a>`)
        .join("");
  }
  let tocFrame = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (tocFrame) return;
      tocFrame = requestAnimationFrame(() => {
        tocFrame = 0;
        const links = $$("a[data-cible]", toc);
        if (!links.length) return;
        let active = links[0];
        for (const a of links) {
          const h = document.getElementById(a.dataset.cible);
          if (h && h.getBoundingClientRect().top < 140) active = a;
        }
        links.forEach((a) => a.classList.toggle("actif", a === active));
      });
    },
    { passive: true },
  );

  function scrollToAnchor(anchor, otherwiseTop) {
    if (anchor) {
      const el = document.getElementById(anchor);
      if (el) {
        el.scrollIntoView({ behavior: otherwiseTop ? "auto" : "smooth", block: "start" });
        return;
      }
    }
    if (otherwiseTop) window.scrollTo(0, 0);
  }

  // ─── Hydration of rendered content ────────────────────────────────────────
  function hydrate(root, page) {
    hydrateImages(root);
    $$(".comparer-scene", root).forEach(enableComparer);
    if (page) markGlossary($(".contenu", root));
    enableZones(root);
    document.body.classList.remove("menu-ouvert");
  }

  // Screen zones reachable by keyboard: Tab focuses a zone (highlighted with its legend item), Enter or Space
  // opens its bubble; in the viewer, Enter or Space goes to that step of the tour. Their accessible name is
  // "Zone n: <legend>".
  const plain = (html) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent.replace(/\s+/g, " ").trim();
  };
  function enableZones(root) {
    $$(".ecran-cadre > .zone", root).forEach((zone) => {
      const n = zone.dataset.n;
      zone.tabIndex = 0;
      zone.setAttribute("role", "button");
      zone.setAttribute("aria-label", t("ui.zone.label", { n, text: plain(legendText(zone.closest(".ecran"), n)) }));
    });
  }
  function activateZone(zone) {
    const n = zone.dataset.n;
    if (viewer.contains(zone)) {
      const i = viewerState.steps.indexOf(n);
      if (i >= 0) goToStep(i);
      return;
    }
    const fig = zone.closest(".ecran");
    highlight(fig, n, true);
    showBubble(`<span class="bulle-n">${n}</span>${legendText(fig, n)}`, zone);
  }

  // Glossary: the first occurrence of each term in the page gets a tooltip. Rebuilt by switchLanguage().
  function buildTerms() {
    return (D.glossaire || []).map((g) => ({
      ...g,
      re: new RegExp(`(^|[^\\p{L}\\p{N}_])(${g.motif})(?=$|[^\\p{L}\\p{N}_])`, "iu"),
    }));
  }
  let TERMS = buildTerms();
  function markGlossary(root) {
    if (!root || !TERMS.length) return;
    const remaining = new Set(TERMS);
    const excluded =
      "a, code, pre, h1, h2, h3, h4, kbd, .puce, .gl, .ecran-barre, .pastille, figcaption, .tableau th, svg";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(excluded))
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!remaining.size) break;
      for (const term of remaining) {
        const m = term.re.exec(node.nodeValue);
        if (!m) continue;
        const start = m.index + m[1].length;
        const word = node.splitText(start);
        word.splitText(m[2].length);
        const span = document.createElement("span");
        span.className = "gl";
        span.tabIndex = 0;
        span.dataset.terme = term.terme;
        span.dataset.def = term.def;
        if (term.tech) span.dataset.tech = term.tech;
        word.parentNode.replaceChild(span, word);
        span.appendChild(word);
        remaining.delete(term);
        break;
      }
    }
  }

  // Glossary bubble content: the term and its definition, then its technical correspondence (§6.8) when the term
  // has one and the reader can see it: no spaces declared, or the current space is takeover / everything (an
  // export other than takeover never embeds `tech` at all, engine/build/spaces.mjs).
  function glossaryBubble(gl) {
    const showTech = gl.dataset.tech && (!SPACES || currentSpace === null || currentSpace === "takeover");
    const tech = showTech
      ? `<div class="bulle-tech">${esc(t("ui.glossary.technical"))} ${esc(gl.dataset.tech)}</div>`
      : "";
    return `<strong>${esc(gl.dataset.terme)}</strong> — ${esc(gl.dataset.def)}${tech}`;
  }

  // ─── Tooltips (screen zones + glossary) ───────────────────────────────────
  let bubbleTarget = null;
  function showBubble(html, target) {
    bubble.innerHTML = html;
    bubble.classList.add("visible");
    bubbleTarget = target;
    placeBubble(target);
  }
  function placeBubble(target) {
    const r = target.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    let top = r.bottom + 10;
    if (top + b.height > window.innerHeight - 8) top = Math.max(8, r.top - b.height - 10);
    let left = Math.min(Math.max(8, r.left), window.innerWidth - b.width - 8);
    bubble.style.top = top + "px";
    bubble.style.left = left + "px";
  }
  function hideBubble() {
    bubble.classList.remove("visible");
    bubbleTarget = null;
  }
  // A scroll (the page following the keyboard focus, a wheel) moves the bubble with its target; it closes only
  // when the target leaves the window. Hiding it on every scroll closed the bubble a zone had just opened with
  // Enter whenever focusing that zone had scrolled the page.
  function followBubble() {
    if (!bubbleTarget || !bubble.classList.contains("visible")) return;
    const r = bubbleTarget.getBoundingClientRect();
    if (!bubbleTarget.isConnected || r.bottom < 0 || r.top > window.innerHeight) hideBubble();
    else placeBubble(bubbleTarget);
  }

  function legendText(fig, n) {
    const li = fig && fig.querySelector(`ol.legende > li[data-n="${n}"] > div`);
    return li ? li.innerHTML : "";
  }
  function highlight(fig, n, on) {
    if (!fig) return;
    $$(`.zone[data-n="${n}"], ol.legende > li[data-n="${n}"]`, fig).forEach((el) => el.classList.toggle("allume", on));
  }

  document.addEventListener("mouseover", (e) => {
    const zone = e.target.closest(".zone");
    if (zone) {
      const fig = zone.closest(".ecran") || viewerState.fig;
      highlight(zone.closest(".ecran"), zone.dataset.n, true);
      if (!(viewerState.open && viewerState.tour)) {
        showBubble(`<span class="bulle-n">${zone.dataset.n}</span>${legendText(fig, zone.dataset.n)}`, zone);
      }
      return;
    }
    const li = e.target.closest("ol.legende > li");
    if (li) {
      highlight(li.closest(".ecran"), li.dataset.n, true);
      return;
    }
    const gl = e.target.closest(".gl");
    if (gl) showBubble(glossaryBubble(gl), gl);
  });
  document.addEventListener("mouseout", (e) => {
    const zone = e.target.closest(".zone");
    if (zone) {
      highlight(zone.closest(".ecran"), zone.dataset.n, false);
      hideBubble();
      return;
    }
    const li = e.target.closest("ol.legende > li");
    if (li) highlight(li.closest(".ecran"), li.dataset.n, false);
    if (e.target.closest(".gl")) hideBubble();
  });
  document.addEventListener("focusin", (e) => {
    const gl = e.target.closest && e.target.closest(".gl");
    if (gl) showBubble(glossaryBubble(gl), gl);
    const zone = e.target.closest && e.target.closest(".ecran .zone");
    if (zone) highlight(zone.closest(".ecran"), zone.dataset.n, true);
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.closest && e.target.closest(".gl")) hideBubble();
    const zone = e.target.closest && e.target.closest(".ecran .zone");
    if (zone) {
      highlight(zone.closest(".ecran"), zone.dataset.n, false);
      hideBubble();
    }
  });
  window.addEventListener("scroll", followBubble, { passive: true });

  // ─── Viewer: enlarge + guided tour ────────────────────────────────────────
  const viewer = $("#visionneuse");
  const scene = $("#vis-scene");
  const viewerState = { open: false, tour: false, fig: null, steps: [], i: 0, back: null };

  // Dialogs (viewer, search): Tab stays inside while open; closing gives the focus back to where it was.
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function trapTab(e, container) {
    const items = $$(FOCUSABLE, container).filter((el) => el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = container.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
      e.preventDefault();
      first.focus();
    }
  }
  function giveFocusBack(el) {
    if (el && el.isConnected && typeof el.focus === "function") el.focus({ preventScroll: true });
  }

  function openViewer(fig, tour) {
    const img = $("img[data-img]", fig);
    if (!viewerState.open) viewerState.back = document.activeElement;
    viewerState.fig = fig;
    viewerState.steps = $$("ol.legende > li", fig).map((li) => li.dataset.n);
    viewerState.open = true;
    $("#vis-titre").textContent = fig.dataset.titre || "";
    $("#vis-visite").style.display = viewerState.steps.length ? "" : "none";
    const zones = $$(".ecran-cadre > .zone", fig)
      .map((z) => z.outerHTML)
      .join("");
    // The CSS size of the capture (its zone file), not the image's own pixels: a capture taken at capture.scale 2
    // stays sharp at the same size on a high-density screen.
    const size = img.getAttribute("width")
      ? ` width="${esc(img.getAttribute("width"))}" height="${esc(img.getAttribute("height") || "")}"`
      : "";
    scene.innerHTML = `<div class="vis-image"><img alt="${esc(fig.dataset.titre || "")}" src="${imageSrc(img.dataset.img)}"${size}>${zones}<div class="projecteur" hidden></div><div class="vis-carte" hidden></div></div>`;
    viewer.classList.add("ouverte");
    document.body.style.overflow = "hidden";
    hideBubble();
    if (tour && viewerState.steps.length) {
      const image = $("img", scene);
      const start = () => goToStep(0);
      if (image.complete) requestAnimationFrame(start);
      else image.addEventListener("load", start, { once: true });
    } else {
      viewerState.tour = false;
      viewer.classList.remove("en-visite");
    }
    $("#vis-fermer").focus();
  }
  function closeViewer() {
    viewer.classList.remove("ouverte", "en-visite");
    viewerState.open = false;
    viewerState.tour = false;
    scene.innerHTML = "";
    document.body.style.overflow = "";
    hideBubble();
    giveFocusBack(viewerState.back);
    viewerState.back = null;
  }
  function goToStep(i) {
    const n = viewerState.steps.length;
    if (!n) return;
    viewerState.tour = true;
    viewer.classList.add("en-visite");
    viewerState.i = Math.max(0, Math.min(n - 1, i));
    const num = viewerState.steps[viewerState.i];
    const frame = $(".vis-image", scene);
    const zone = $(`.zone[data-n="${num}"]`, frame);
    const spot = $(".projecteur", frame);
    const card = $(".vis-carte", frame);
    $$(".zone", frame).forEach((z) => z.classList.toggle("allume", z === zone));
    spot.hidden = false;
    spot.style.left = `calc(${zone.style.left} - 6px)`;
    spot.style.top = `calc(${zone.style.top} - 6px)`;
    spot.style.width = `calc(${zone.style.width} + 12px)`;
    spot.style.height = `calc(${zone.style.height} + 12px)`;
    const last = viewerState.i === n - 1;
    card.hidden = false;
    card.innerHTML = `<div class="entete"><span class="n">${num}</span>${esc(t("ui.tour.step", { i: viewerState.i + 1, n }))}</div>
      <div>${legendText(viewerState.fig, num)}</div>
      <div class="actions">
        ${viewerState.i > 0 ? `<button class="bouton" data-vis="prec">${icon("left")}${esc(t("ui.tour.previous"))}</button>` : ""}
        <button class="bouton primaire" data-vis="${last ? "fin" : "suiv"}">${esc(last ? t("ui.tour.finish") : t("ui.tour.next"))}${last ? "" : icon("chevron")}</button>
      </div>`;
    // Brings the zone to the centre of the viewer (enlarged, scrollable image), then places the card.
    card.style.visibility = "hidden";
    requestAnimationFrame(() => {
      zone.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      setTimeout(() => {
        placeCard(frame, zone, card);
        card.style.visibility = "";
      }, 380);
    });
  }
  function placeCard(frame, zone, card) {
    const c = frame.getBoundingClientRect();
    const z = zone.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const margin = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const candidates = [
      [z.right + 18, z.top],
      [z.left - 18 - w, z.top],
      [z.left, z.bottom + 18],
      [z.left, z.top - 18 - h],
    ];
    let pos = candidates.find(([x, y]) => x >= margin && y >= margin && x + w <= vw - margin && y + h <= vh - margin);
    if (!pos)
      pos = [
        Math.min(Math.max(margin, z.left), vw - w - margin),
        Math.min(Math.max(margin, z.bottom + 18), vh - h - margin),
      ];
    card.style.left = pos[0] - c.left + "px";
    card.style.top = pos[1] - c.top + "px";
  }
  viewer.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vis]");
    if (b) {
      const a = b.dataset.vis;
      if (a === "suiv") goToStep(viewerState.i + 1);
      else if (a === "prec") goToStep(viewerState.i - 1);
      else closeViewer();
      return;
    }
    const zone = e.target.closest(".zone");
    if (zone) {
      const i = viewerState.steps.indexOf(zone.dataset.n);
      if (i >= 0) goToStep(i);
      return;
    }
    if (e.target === scene) closeViewer();
  });
  $("#vis-fermer").addEventListener("click", closeViewer);
  $("#vis-visite").addEventListener("click", () => goToStep(0));
  window.addEventListener("resize", () => {
    if (viewerState.open && viewerState.tour) goToStep(viewerState.i);
  });

  // ─── Before / after ───────────────────────────────────────────────────────
  function enableComparer(stage) {
    const update = (x) => {
      const r = stage.getBoundingClientRect();
      const p = Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100));
      stage.style.setProperty("--pos", p + "%");
    };
    let dragging = false;
    stage.addEventListener("pointerdown", (e) => {
      dragging = true;
      stage.setPointerCapture(e.pointerId);
      update(e.clientX);
    });
    stage.addEventListener("pointermove", (e) => dragging && update(e.clientX));
    stage.addEventListener("pointerup", () => (dragging = false));
    stage.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const current = parseFloat(stage.style.getPropertyValue("--pos")) || 50;
      stage.style.setProperty("--pos", Math.max(0, Math.min(100, current + (e.key === "ArrowLeft" ? -5 : 5))) + "%");
      e.preventDefault();
    });
  }

  // ─── Global clicks ────────────────────────────────────────────────────────
  document.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]");
    const zone = e.target.closest(".ecran .zone");
    if (zone) {
      const li = zone.closest(".ecran").querySelector(`ol.legende > li[data-n="${zone.dataset.n}"]`);
      if (li) {
        li.scrollIntoView({ behavior: "smooth", block: "center" });
        li.classList.add("allume");
        setTimeout(() => li.classList.remove("allume"), 1400);
      }
      return;
    }
    if (!action) return;
    const a = action.dataset.action;
    if (a === "zoom") openViewer(action.closest(".ecran"), false);
    else if (a === "visite") openViewer(action.closest(".ecran"), true);
    else if (a === "recherche") openSearch();
  });

  // ─── Search ───────────────────────────────────────────────────────────────
  const searchBackdrop = $("#recherche");
  const field = $("#recherche-champ");
  const resultList = $("#recherche-resultats");
  // Rebuilt by switchLanguage() from the translated pages and search entries.
  function buildIndex() {
    return D.recherche.map((e) => {
      const p = D.pages[e.p];
      return { ...e, nt: norm(e.t), np: norm(p ? p.titre : ""), nx: norm(e.x) };
    });
  }
  let INDEX = buildIndex();
  let results = [];
  let selection = 0;

  function mark(text, terms) {
    const n = norm(text);
    const ranges = [];
    terms.forEach((term) => {
      let i = n.indexOf(term);
      while (i >= 0 && term) {
        ranges.push([i, i + term.length]);
        i = n.indexOf(term, i + term.length);
      }
    });
    if (!ranges.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
      if (merged.length && r[0] <= merged[merged.length - 1][1])
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
      else merged.push(r);
    }
    let out = "";
    let pos = 0;
    for (const [a, b] of merged) {
      out += esc(text.slice(pos, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>";
      pos = b;
    }
    return out + esc(text.slice(pos));
  }

  function search(q) {
    const terms = norm(q)
      .split(/\s+/)
      .filter((x) => x.length > 1);
    if (!terms.length) return [];
    const found = [];
    for (const e of INDEX) {
      const all = e.nt + " " + e.np + " " + e.nx;
      if (!terms.every((x) => all.includes(x))) continue;
      let score = 0;
      for (const term of terms) {
        if (e.nt.includes(term)) score += 8;
        if (e.np.includes(term)) score += 3;
        let k = 0;
        let i = e.nx.indexOf(term);
        while (i >= 0 && k < 4) {
          k++;
          i = e.nx.indexOf(term, i + 1);
        }
        score += k;
      }
      if (!e.a) score += 2;
      found.push({ e, score, terms });
    }
    return bySpace(found.sort((a, b) => b.score - a.score)).slice(0, 24);
  }
  // A space current: its results first, then those of each other space (declaration order), under a heading
  // "In {space} ({n})"; the limit applies to the whole list. "Everything": the order of the scores.
  const spaceOfResult = (x) => (D.pages[x.e.p] ? D.pages[x.e.p].space : null);
  function bySpace(found) {
    if (!SPACES || !currentSpace) return found;
    const rank = (x) => {
      const s = spaceOfResult(x);
      const k = SPACES.findIndex((sp) => sp.id === s);
      return s === currentSpace ? -1 : k < 0 ? SPACES.length : k;
    };
    return found
      .map((x, i) => [x, i])
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
      .map((a) => a[0]);
  }
  function resultHeading(r, i) {
    if (!SPACES || !currentSpace) return "";
    const s = spaceOfResult(r[i]);
    if (s === currentSpace || !spacesById[s] || (i > 0 && spaceOfResult(r[i - 1]) === s)) return "";
    const n = r.filter((x) => spaceOfResult(x) === s).length;
    return `<div class="recherche-groupe">${esc(t("ui.search.inSpace", { space: spacesById[s].shortTitle, n }))}</div>`;
  }
  /** "Everything" mode: the path of a result starts with its space. */
  const spacePath = (p) =>
    SPACES && !currentSpace && spacesById[p.space] ? `${esc(spacesById[p.space].shortTitle)} › ` : "";

  // Screen readers hear the number of results (role="status", aria-live="polite").
  const searchStatus = $("#recherche-statut");
  const announce = (text) => {
    if (searchStatus && searchStatus.textContent !== text) searchStatus.textContent = text;
  };
  function renderResults() {
    const q = field.value.trim();
    if (!q) {
      announce("");
      const suggestions = (D.suggestions || []).filter((pid) => D.pages[pid]);
      resultList.innerHTML =
        `<div class="recherche-vide" style="text-align:left;padding:10px 12px 4px">${esc(t("ui.search.suggestions"))}</div>` +
        suggestions
          .map(
            (pid, i) =>
              `<a class="resultat ${i === selection ? "actif" : ""}" href="#/${pid}"><div class="chemin">${esc(sectionsById[D.pages[pid].section].titre)}</div><div class="titre">${esc(D.pages[pid].titre)}</div></a>`,
          )
          .join("");
      results = suggestions.map((pid) => ({ link: "#/" + pid }));
      return;
    }
    const r = search(q);
    announce(r.length ? t("ui.search.count", { n: r.length }) : t("ui.search.noResult", { query: q }));
    results = r.map((x) => ({ link: "#/" + x.e.p + (x.e.a ? "~" + x.e.a : "") }));
    if (!r.length) {
      resultList.innerHTML = `<div class="recherche-vide">${esc(t("ui.search.noResult", { query: q }))}</div>`;
      return;
    }
    resultList.innerHTML = r
      .map(({ e, terms }, i) => {
        const p = D.pages[e.p];
        const pos = Math.max(
          0,
          terms.reduce((m, term) => {
            const k = e.nx.indexOf(term);
            return k >= 0 && (m < 0 || k < m) ? k : m;
          }, -1),
        );
        const start = Math.max(0, pos - 50);
        const excerpt = (start > 0 ? "…" : "") + e.x.slice(start, start + 170) + (e.x.length > start + 170 ? "…" : "");
        return `${resultHeading(r, i)}<a class="resultat ${i === selection ? "actif" : ""}" href="${results[i].link}">
          <div class="chemin">${spacePath(p)}${esc(sectionsById[p.section].titre)} › ${esc(p.titre)}</div>
          <div class="titre">${mark(e.t, terms)}</div>
          <div class="extrait">${mark(excerpt, terms)}</div></a>`;
      })
      .join("");
  }
  let searchBack = null;
  function openSearch() {
    if (!searchBackdrop.classList.contains("ouverte")) searchBack = document.activeElement;
    searchBackdrop.classList.add("ouverte");
    selection = 0;
    renderResults();
    field.focus();
    field.select();
  }
  function closeSearch() {
    if (!searchBackdrop.classList.contains("ouverte")) return;
    searchBackdrop.classList.remove("ouverte");
    giveFocusBack(searchBack);
    searchBack = null;
  }
  $("#ouvrir-recherche").addEventListener("click", openSearch);
  field.addEventListener("input", () => {
    selection = 0;
    renderResults();
  });
  field.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      selection = (selection + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      $$(".resultat", resultList).forEach((a, i) => a.classList.toggle("actif", i === selection));
      const a = $$(".resultat", resultList)[selection];
      if (a) a.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const r = results[selection];
      if (r) {
        location.hash = r.link;
        closeSearch();
      }
    }
  });
  resultList.addEventListener("click", (e) => {
    if (e.target.closest(".resultat")) closeSearch();
  });
  searchBackdrop.addEventListener("click", (e) => {
    if (e.target === searchBackdrop) closeSearch();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      if (searchBackdrop.classList.contains("ouverte")) trapTab(e, searchBackdrop);
      else if (viewerState.open) trapTab(e, viewer);
      return;
    }
    const zone = (e.key === "Enter" || e.key === " ") && e.target.closest && e.target.closest(".zone[tabindex]");
    if (zone) {
      e.preventDefault();
      activateZone(zone);
      return;
    }
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === "/" && !inField && !viewerState.open) {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === "Escape") {
      if (searchBackdrop.classList.contains("ouverte")) closeSearch();
      else if (viewerState.open) closeViewer();
      else if (bubble.classList.contains("visible")) hideBubble();
      else document.body.classList.remove("menu-ouvert");
      return;
    }
    if (viewerState.open && viewerState.tour) {
      if (e.key === "ArrowRight") goToStep(viewerState.i + 1);
      if (e.key === "ArrowLeft") goToStep(viewerState.i - 1);
    }
  });

  // ─── Printing (current page or the whole documentation) ───────────────────
  $("#bouton-imprimer").addEventListener("click", () => {
    const everything = currentPage ? window.confirm(t("ui.print.confirm")) : true;
    if (!everything) {
      window.print();
      return;
    }
    const target = $("#impression");
    const outline = D.sections
      .map(
        (s) =>
          `<h3>${esc(s.titre)}</h3><ol>${s.groupes
            .flatMap((g) => g.pages)
            .map((pid) => `<li>${esc(D.pages[pid].titre)}</li>`)
            .join("")}</ol>`,
      )
      .join("");
    target.innerHTML =
      `<section class="page-imprimee article"><h1 class="page-titre">${esc(D.meta.titre)}</h1><p class="page-resume">${esc(D.meta.accroche)}</p><p>${esc(t("ui.print.version", { product: D.meta.produit, version: D.meta.version, date: D.meta.date }))}</p><div class="contenu">${outline}</div></section>` +
      D.ordre
        .map((pid) => {
          const p = D.pages[pid];
          return `<section class="page-imprimee article"><div class="ariane">${esc(sectionsById[p.section].titre)}${p.groupe ? " › " + esc(p.groupe) : ""}${parentOf[p.id] ? " › " + esc(D.pages[parentOf[p.id]].titre_menu || D.pages[parentOf[p.id]].titre) : ""}</div><h1 class="page-titre">${esc(p.titre)}</h1>${p.resume ? `<p class="page-resume">${esc(p.resume)}</p>` : ""}<div class="contenu">${p.html}</div></section>`;
        })
        .join("");
    hydrateImages(target);
    document.body.classList.add("impression-complete");
    const images = $$("img", target);
    // Eager: a `loading="lazy"` image far enough down this one long page (every page concatenated) may never be
    // considered "near the viewport" by the browser, so it would never load and decode() would never resolve —
    // print() would then never run. Printing needs everything immediately, not deferred.
    for (const i of images) i.loading = "eager";
    Promise.all(images.map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()))).then(() => {
      window.print();
    });
  });
  window.addEventListener("afterprint", () => {
    if (document.body.classList.contains("impression-complete")) {
      document.body.classList.remove("impression-complete");
      $("#impression").innerHTML = "";
    }
  });

  // ─── Router (#/section, #/page/id, #/page/id~anchor) ──────────────────────
  // With spaces, also #/@<id>: the home page of a space (#/@: everything).
  // With languages, #/[<lang>/]<path>[~anchor]: the first segment is a language when it is one of LANGUAGES
  // (hence languages.idClash at the build); without it, the URL means the current language. After routing,
  // a URL without a prefix is rewritten with history.replaceState (no hashchange, no history entry) so that
  // the address bar always carries the language; the language is switched BEFORE chooseSpace and any render.
  let routed = { path: "", anchor: "" };
  function route() {
    closeSearch();
    if (viewerState.open) closeViewer();
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [rest, anchor] = h.split("~");
    const segments = rest.split("/");
    let prefix = null;
    if (LANGUAGES && LANGUAGES.includes(segments[0])) prefix = segments.shift();
    const path = segments.join("/");
    if (LANGUAGES) {
      const target = initialLanguage(prefix);
      if (target !== currentLang) switchLanguage(target);
      renderLanguages();
      if (!prefix) history.replaceState(null, "", "#/" + currentLang + "/" + path + (anchor ? "~" + anchor : ""));
    }
    routed = { path, anchor: anchor || "" };
    chooseSpace(path);
    if (!path || path.charAt(0) === "@") showHome();
    else if (D.pages[path]) showPage(path, anchor);
    else if (sectionsById[path]) showSection(sectionsById[path]);
    else showNotFound(path);
    main.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", route);
  route();
})();
