// The thresholds and the required Take over pages of standard/maturity.md, shared by the audit (audit.mjs) and
// its actions (actions.mjs).

/** Thresholds of standard/maturity.md, by level. Ratios between 0 and 1. */
export const THRESHOLDS = Object.freeze({
  glossary1: 1,
  tours1: 1,
  written2: 0.9,
  annotated2: 0.8,
  coverage2: 0.8,
  typed3: 0.8,
  conformant3: 1,
  annotated3: 0.9,
  glossary3: 20,
  tours3: 3,
  takeover4: 7,
  proofs4: 0.6,
  completeness4: 0.7,
  tooLong4: 0.05,
  upToDate4: 0.9,
  upToDatePages4: 0.9,
});

/** The 7 required Take over pages (standard/maturity.md). `suggest`: suggested id, after the section id. */
export const TAKEOVER_ITEMS = Object.freeze([
  { id: "architecture", match: (p) => /\/architecture$/.test(p.id), template: "technical", suggest: { en: "architecture", fr: "architecture" } },
  { id: "dat", type: "architecture", template: "architecture", hint: /\/(dat|technical-architecture)$/, suggest: { en: "technical-architecture", fr: "dat" } },
  { id: "journey", type: "journey", sub: "journey-step", min: 3, template: "journey", hint: /\/(journey|parcours)[^/]*$/, suggest: { en: "journey-<object>", fr: "parcours-<objet>" } },
  { id: "operations", match: (p) => /operations|deployment|exploitation|deploiement/.test(p.id), template: "technical", suggest: { en: "operations", fr: "exploitation" } },
  { id: "troubleshooting", type: "troubleshooting", sub: "troubleshooting-area", min: 2, template: "troubleshooting", hint: /\/(troubleshooting|diagnostic)$/, suggest: { en: "troubleshooting", fr: "diagnostic" } },
  { id: "findings", type: "findings", numbered: true, template: "findings", hint: /\/(findings|points-attention)$/, suggest: { en: "findings", fr: "points-attention" } },
  { id: "maintaining", match: (p) => /\/(maintaining-docs|maintenir-doc)$/.test(p.id), template: "technical", suggest: { en: "maintaining-docs", fr: "maintenir-doc" } },
]);
