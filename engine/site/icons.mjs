// Site icons: 24×24 stroked paths ("lucide" style). Shared by the build (callouts rendered at build time) and
// by the site (app.js receives them in the embedded data). A project can add or replace icons with theme.icons.
// The keys are the historical names stored in the site data (and used by existing tables of contents);
// ALIASES gives each one an English name, resolved at build time.
export const ICONS = {
  carte: '<path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3Z"/><path d="M9 3v15M15 6v15"/>',
  studios: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  admin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  reprendre: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  recherche: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  soleil:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lune: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  imprimer:
    '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  gauche: '<path d="m15 18-6-6 6-6"/>',
  lecture: '<path d="M7 4.5v15l12-7.5-12-7.5Z"/>',
  agrandir: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  fermer: '<path d="M18 6 6 18M6 6l12 12"/>',
  astuce: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2Z"/>',
  attention:
    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  droits: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  recette: '<path d="M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
  note: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  erreur: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9Z"/><path d="m15 9-6 6M9 9l6 6"/>',
  mecanisme:
    '<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  livre:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lien: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  ecran: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  horloge: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};

/** English name → stored key. */
export const ALIASES = {
  map: "carte",
  sliders: "studios",
  shield: "admin",
  code: "reprendre",
  search: "recherche",
  sun: "soleil",
  moon: "lune",
  print: "imprimer",
  left: "gauche",
  play: "lecture",
  expand: "agrandir",
  close: "fermer",
  tip: "astuce",
  warning: "attention",
  permissions: "droits",
  lock: "droits",
  recipe: "recette",
  info: "note",
  caution: "erreur",
  how: "mecanisme",
  gear: "mecanisme",
  book: "livre",
  arrow: "fleche",
  link: "lien",
  screen: "ecran",
  clock: "horloge",
};

/** Stored key of an icon name (English alias or stored key). */
export const iconKey = (name, set = ICONS) => (name in set ? name : ALIASES[name] in set ? ALIASES[name] : name);

/** Renders an icon (fallback: "note"). */
export function icon(name, cls = "ico", set = ICONS) {
  const path = set[iconKey(name, set)] ?? set.note;
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

/** Icon set of a project: the kit icons, completed or replaced by theme.icons. */
export function createIcons(extra = {}) {
  const set = { ...ICONS, ...extra };
  return { ICONS: set, icon: (name, cls = "ico") => icon(name, cls, set), key: (name) => iconKey(name, set) };
}
