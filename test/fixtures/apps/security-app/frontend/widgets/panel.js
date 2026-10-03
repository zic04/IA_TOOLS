// Fixture: a direct innerHTML assignment (security rule xss.innerHTML).
export function renderPanel(el, html) {
  el.innerHTML = html;
}
