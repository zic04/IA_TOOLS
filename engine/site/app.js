/* Documentation site — browser engine (inlined at build time, no dependency).
   Data   : <script id="donnees"> (pages, outline, search index, glossary, i18n texts). The data keeps its
            historical key names (titre, pages, ordre…), shared with the build.
   Images : <script type="text/plain" id="img-ID"> (WebP data URI), read on demand.
   Texts  : none hard-coded; everything goes through t() (ui.* and home.* keys embedded by the build). */
(function () {
  "use strict";

  const D = JSON.parse(document.getElementById("donnees").textContent);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  // Icon names used by this file → keys of the embedded icon set.
  const ICON_KEYS = { sun: "soleil", moon: "lune", screen: "ecran", lock: "droits", book: "livre", sliders: "studios", map: "carte", search: "recherche", left: "gauche" };
  const icon = (name, cls = "ico") =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${D.icones[ICON_KEYS[name] || name] || ""}</svg>`;
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // ─── Texts (i18n) ─────────────────────────────────────────────────────────
  // t(key, vars): plain text; variables {name}; plural { one, other… } chosen from vars.n.
  // th(key, vars): HTML; the text is escaped, the variables (already HTML) are inserted as they are.
  const TEXTS = D.i18n || {};
  const rules = new Intl.PluralRules(document.documentElement.lang || undefined);
  function form(key, vars) {
    const v = TEXTS[key];
    if (v === undefined) return key;
    if (v && typeof v === "object") return v[rules.select(Number((vars && vars.n) || 0))] ?? v.other;
    return v;
  }
  const fill = (template, vars) =>
    String(template).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  const t = (key, vars) => fill(form(key, vars), vars);
  const th = (key, vars) => fill(esc(form(key, vars)), vars);

  const main = $("#contenu-principal");
  const shell = $("#coque");
  const sidebar = $("#lateral");
  const toc = $("#toc");
  const bubble = $("#bulle");
  const sectionsById = Object.fromEntries(D.sections.map((s) => [s.id, s]));
  // Sub-pages (level 2): attached to the last level-1 page above them in their group.
  const parentOf = {};
  const childrenOf = {};
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

  // ─── Embedded images ──────────────────────────────────────────────────────
  const imageCache = new Map();
  function imageSrc(id) {
    if (!imageCache.has(id)) {
      const el = document.getElementById("img-" + id);
      imageCache.set(id, el ? el.textContent.trim() : "");
    }
    return imageCache.get(id);
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
          `<a href="#/${s.id}" class="${s.id === sectionId ? "actif" : ""} ${s.vedette ? "vedette" : ""}">${esc(s.titre_court || s.titre)}</a>`
      )
      .join("");
  }

  const openSections = new Set();
  function renderSidebar(sectionId, pageId) {
    if (sectionId) openSections.add(sectionId);
    sidebar.innerHTML = D.sections
      .map((s) => {
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
                  ].filter(Boolean).join(" ");
                  const count = children ? `<span class="lat-nb" title="${esc(t("ui.subPages", { n: children.length }))}">${children.length}</span>` : "";
                  return `<a class="${classes}" href="#/${pid}"><span>${esc(p.titre_menu || p.titre)}</span>${count}</a>`;
                })
                .join("")
          )
          .join("");
        return `<div class="lat-section ${open ? "ouverte" : ""}" data-section="${s.id}">
          <button type="button" aria-expanded="${open}"><span class="pastille-section">${icon(s.icone)}</span>${esc(s.titre)}${icon("chevron", "ico chevron")}</button>
          <div class="lat-corps"><a class="lat-lien ${!pageId && sectionId === s.id ? "actif" : ""}" href="#/${s.id}">${esc(t("ui.sidebar.overview"))}</a>${groups}</div>
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
    (p.routes || []).forEach((r) => badges.push(`<span class="puce route">${icon("screen")}${esc(r)}</span>`));
    (p.droits || []).forEach((d) => badges.push(`<span class="puce droit">${icon("lock")}${esc(d)}</span>`));
    if (p.captures) badges.push(`<span class="puce menu">${icon("screen")}${esc(t("ui.page.annotatedScreens", { n: p.captures }))}</span>`);
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
      return new Intl.DateTimeFormat(document.documentElement.lang || undefined, { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)));
    } catch (e) {
      return d;
    }
  };
  const versionOrder = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  function screenshotsNote(p) {
    const info = D.meta.screenshots;
    if (!info) return "";
    const ids = new Set(Array.from(String(p.html).matchAll(/data-img="([^"]+)"/g), (m) => m[1]));
    const known = Array.from(ids, (id) => info[id]).filter(Boolean);
    const dates = Array.from(new Set(known.map((x) => x.captured).filter(Boolean))).sort();
    const versions = Array.from(new Set(known.map((x) => x.version).filter(Boolean))).sort(versionOrder);
    if (!dates.length && !versions.length) return "";
    const parts = [];
    if (dates.length === 1) parts.push(t("ui.footer.screenshots.on", { date: longDate(dates[0]) }));
    else if (dates.length > 1) parts.push(t("ui.footer.screenshots.between", { from: longDate(dates[0]), to: longDate(dates[dates.length - 1]) }));
    if (versions.length)
      parts.push(t(dates.length ? "ui.footer.screenshots.version" : "ui.footer.screenshots.versionOnly", { n: versions.length, version: versions.join(", ") }));
    return `<div class="pied-captures">${esc(parts.join(", "))}</div>`;
  }

  const siteFooter = () =>
    `<div class="pied-site">${esc(
      t("ui.footer.site", { product: D.meta.produit, version: D.meta.version, date: D.meta.date, pages: D.meta.stats.pages, captures: D.meta.stats.captures })
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
      <nav class="ariane" aria-label="${esc(t("ui.breadcrumb.label"))}"><a href="#/">${esc(t("ui.breadcrumb.home"))}</a><span class="sep">›</span><a href="#/${sec.id}">${esc(sec.titre)}</a>${p.groupe ? `<span class="sep">›</span><span>${esc(p.groupe)}</span>` : ""}${parentOf[id] ? `<span class="sep">›</span><a href="#/${parentOf[id]}">${esc(D.pages[parentOf[id]].titre_menu || D.pages[parentOf[id]].titre)}</a>` : ""}</nav>
      <h1 class="page-titre">${esc(p.titre)}</h1>
      ${p.resume ? `<p class="page-resume">${esc(p.resume)}</p>` : ""}
      ${pageBadges(p)}
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
              ].filter(Boolean).join(" · ");
              return `<a class="carte-lien" href="#/${pid}"><span class="titre">${esc(p.titre)}</span><span class="resume">${esc(p.resume || "")}</span>${counts ? `<span class="compte">${counts}</span>` : ""}</a>`;
            })
            .join("")}</div>`
      )
      .join("");
    main.innerHTML = `<article class="article">
      <nav class="ariane"><a href="#/">${esc(t("ui.breadcrumb.home"))}</a><span class="sep">›</span><span>${esc(sec.titre)}</span></nav>
      <h1 class="page-titre">${esc(sec.titre)}</h1>
      <p class="page-resume">${esc(sec.sous_titre || "")}</p>
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
    const doors = D.sections
      .map((sec) => {
        const n = sec.groupes.reduce((total, g) => total + g.pages.length, 0);
        return `<a class="porte ${sec.vedette ? "vedette" : ""}" href="#/${sec.id}">
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
        (j) => `<div class="carte-lien"><span class="titre">${esc(j.titre)}</span><span class="resume">${esc(j.desc)}</span>
        <ol>${j.etapes.map((pid) => (D.pages[pid] ? `<li><a href="#/${pid}">${esc(D.pages[pid].titre)}</a></li>` : "")).join("")}</ol></div>`
      )
      .join("");
    const first = D.sections.find((x) => x.vedette) || D.sections[0];
    main.innerHTML = `
      <section class="heros">
        <div class="heros-interieur">
          <div class="sur-titre">${icon("book")} ${esc(t("home.eyebrow", { version: D.meta.version }))}</div>
          <h1>${th("home.title", { accent: `<span>${esc(t("home.titleAccent", { product: D.meta.produit }))}</span>` })}</h1>
          <p>${esc(D.meta.accroche)}</p>
          <div class="actions">
            <a class="bouton primaire" href="#/${first.id}">${icon("sliders")}${esc(t("home.primaryAction", { section: first.titre_court || first.titre }))}</a>
            <a class="bouton" href="#/${D.sections[0].id}">${icon("map")}${esc(t("home.gettingStarted"))}</a>
            <button class="bouton" type="button" data-action="recherche">${icon("search")}${esc(t("home.search"))}</button>
          </div>
          <div class="chiffres">
            <div><strong>${s.pages}</strong>${esc(t("home.stats.pages", { n: s.pages }))}</div>
            <div><strong>${s.captures}</strong>${esc(t("home.stats.captures", { n: s.captures }))}</div>
            <div><strong>${s.zones}</strong>${esc(t("home.stats.zones", { n: s.zones }))}</div>
            <div><strong>${s.schemas}</strong>${esc(t("home.stats.diagrams", { n: s.schemas }))}</div>
          </div>
        </div>
      </section>
      <div class="accueil-corps">
        <div class="portes">${doors}</div>
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
      p.toc.map((h) => `<a class="h${h.niveau}" href="#/${p.id}~${h.id}" data-cible="${h.id}">${esc(h.titre)}</a>`).join("");
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
    { passive: true }
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

  // Glossary: the first occurrence of each term in the page gets a tooltip.
  const TERMS = (D.glossaire || []).map((g) => ({
    ...g,
    re: new RegExp(`(^|[^\\p{L}\\p{N}_])(${g.motif})(?=$|[^\\p{L}\\p{N}_])`, "iu"),
  }));
  function markGlossary(root) {
    if (!root || !TERMS.length) return;
    const remaining = new Set(TERMS);
    const excluded = "a, code, pre, h1, h2, h3, h4, kbd, .puce, .gl, .ecran-barre, .pastille, figcaption, .tableau th, svg";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(excluded)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
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
        word.parentNode.replaceChild(span, word);
        span.appendChild(word);
        remaining.delete(term);
        break;
      }
    }
  }

  // ─── Tooltips (screen zones + glossary) ───────────────────────────────────
  function showBubble(html, target) {
    bubble.innerHTML = html;
    bubble.classList.add("visible");
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
    if (gl) showBubble(`<strong>${esc(gl.dataset.terme)}</strong> — ${esc(gl.dataset.def)}`, gl);
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
    if (gl) showBubble(`<strong>${esc(gl.dataset.terme)}</strong> — ${esc(gl.dataset.def)}`, gl);
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
  window.addEventListener("scroll", hideBubble, { passive: true });

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
    scene.innerHTML = `<div class="vis-image"><img alt="${esc(fig.dataset.titre || "")}" src="${imageSrc(img.dataset.img)}">${zones}<div class="projecteur" hidden></div><div class="vis-carte" hidden></div></div>`;
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
    if (!pos) pos = [Math.min(Math.max(margin, z.left), vw - w - margin), Math.min(Math.max(margin, z.bottom + 18), vh - h - margin)];
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
  const INDEX = D.recherche.map((e) => {
    const p = D.pages[e.p];
    return { ...e, nt: norm(e.t), np: norm(p ? p.titre : ""), nx: norm(e.x) };
  });
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
      if (merged.length && r[0] <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
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
    const terms = norm(q).split(/\s+/).filter((x) => x.length > 1);
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
    return found.sort((a, b) => b.score - a.score).slice(0, 24);
  }

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
              `<a class="resultat ${i === selection ? "actif" : ""}" href="#/${pid}"><div class="chemin">${esc(sectionsById[D.pages[pid].section].titre)}</div><div class="titre">${esc(D.pages[pid].titre)}</div></a>`
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
        const pos = Math.max(0, terms.reduce((m, term) => {
          const k = e.nx.indexOf(term);
          return k >= 0 && (m < 0 || k < m) ? k : m;
        }, -1));
        const start = Math.max(0, pos - 50);
        const excerpt = (start > 0 ? "…" : "") + e.x.slice(start, start + 170) + (e.x.length > start + 170 ? "…" : "");
        return `<a class="resultat ${i === selection ? "actif" : ""}" href="${results[i].link}">
          <div class="chemin">${esc(sectionsById[p.section].titre)} › ${esc(p.titre)}</div>
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
          `<h3>${esc(s.titre)}</h3><ol>${s.groupes.flatMap((g) => g.pages).map((pid) => `<li>${esc(D.pages[pid].titre)}</li>`).join("")}</ol>`
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
  function route() {
    closeSearch();
    if (viewerState.open) closeViewer();
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [path, anchor] = h.split("~");
    if (!path) showHome();
    else if (D.pages[path]) showPage(path, anchor);
    else if (sectionsById[path]) showSection(sectionsById[path]);
    else showNotFound(path);
    main.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", route);
  route();
})();
