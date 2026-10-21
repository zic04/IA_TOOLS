/* The topic line (ARCHITECTURE.md §6.1a): a page of a topic group — a feature sheet, its screen, its technical page,
   its runbook — names the other pages of the group, each by the space it is written for: "This topic for: Use ·
   Product · Develop", the page being read marked as such. Without spaces: "Related: <title> · <title>". The build
   gives each page the other members of its group (pages[].topic), whoever declared the counterpart. A module of the
   site (engine/site/app.js, spliced in at its "@lib" line by the build, ARCHITECTURE.md §6.1a): it sees EXT.api
   only and adds to EXT. */
/* global EXT */
const { t, esc, icon } = EXT.api;

/** A member's address: its page, and the heading a counterpart named. */
const topicHref = (m) => `#/${m.id}${m.anchor ? "~" + m.anchor : ""}`;

/**
 * The members of a page's group in the order of the spaces, then of the site — the same line on every member, only
 * the page read marked; each named by its space, and by its title too when its space holds another member.
 */
function topicItems(p, D) {
  const rank = new Map(D.spaces.map((s, i) => [s.id, i]));
  const place = new Map(D.order.map((id, i) => [id, i]));
  const all = [{ id: p.id, self: true }, ...p.topic]
    .filter((x) => D.pages[x.id])
    .map((x) => ({ ...x, space: D.pages[x.id].space }));
  all.sort(
    (a, b) =>
      (rank.get(a.space) ?? rank.size) - (rank.get(b.space) ?? rank.size) ||
      (place.get(a.id) ?? place.size) - (place.get(b.id) ?? place.size),
  );
  const shared = (space) => all.filter((x) => x.space === space).length > 1;
  return all.map((x) => {
    const name = D.spaces.find((s) => s.id === x.space)?.shortTitle ?? x.space;
    return { ...x, label: shared(x.space) ? `${name} · ${D.pages[x.id].title}` : name };
  });
}

/** Fills the place app.js leaves under the badges of a page of a group: its title, then one chip per member. */
function drawTopic(slot, p) {
  const D = EXT.api.data();
  const members = p.topic.filter((m) => D.pages[m.id]);
  if (!members.length) return;
  const title = t(D.spaces ? "ui.topic" : "ui.topic.plain");
  const items = D.spaces ? topicItems(p, D) : members.map((m) => ({ ...m, label: D.pages[m.id].title }));
  const chips = items.map((x) =>
    x.self
      ? `<strong aria-current="page">${esc(x.label)}</strong>`
      : `<a href="${esc(topicHref(x))}">${esc(x.label)}</a>`,
  );
  slot.setAttribute("aria-label", title);
  slot.innerHTML = `<span class="pendant-titre">${icon("lien")}<span>${esc(title)}</span></span>${chips.join("")}`;
  slot.hidden = false;
}

EXT.hydrators.push((root, page) => {
  const slot = page?.topic && root.querySelector("[data-topic]");
  if (slot) drawTopic(slot, page);
});
