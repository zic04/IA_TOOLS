// Acme Orders (fictional demo app): fills the pages from the API.
const $ = (id) => document.getElementById(id);
const api = (path, options = {}) =>
  fetch(path, { credentials: "same-origin", ...options }).then((r) => {
    if (r.status === 401) location.href = "/login?next=" + encodeURIComponent(location.pathname);
    if (!r.ok) throw new Error(String(r.status));
    return r.status === 204 ? null : r.json();
  });
const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

api("/api/me").then((me) => ($("user").textContent = me.name));

// Link prefetching, as web frameworks do: the links marked data-prefetch are requested in the background once the
// page is shown. The server answers such a GET by rendering the page, so prefetching the approval chain creates it.
const prefetch = () =>
  document.querySelectorAll("a[data-prefetch]").forEach((a) => fetch(a.href, { credentials: "same-origin", headers: { "x-prefetch": "1" } }).catch(() => {}));

const pages = {
  async orders() {
    const orders = await api("/api/orders");
    const render = () => {
      const status = $("status").value;
      const customer = $("customer").value.trim().toLowerCase();
      const date = $("date").value;
      const shown = orders.filter((o) => (!status || o.status === status) && (!customer || o.customer.toLowerCase().includes(customer)) && (!date || o.date === date));
      $("rows").innerHTML = shown
        .map((o) => `<tr><td><a href="/orders/${o.id}">#${o.id}</a></td><td>${esc(o.customer)}</td><td><span class="status ${o.status}">${o.status}</span></td><td>${money(o.amount)}</td></tr>`)
        .join("");
      $("k-count").textContent = shown.length;
      $("k-open").textContent = shown.filter((o) => o.status === "Open").length;
      $("k-total").textContent = money(shown.reduce((s, o) => s + o.amount, 0));
    };
    for (const id of ["status", "customer", "date"]) $(id).addEventListener("input", render);
    render();
  },
  async order() {
    const id = location.pathname.split("/")[2];
    const o = await api(`/api/orders/${id}`);
    $("title").textContent = `Order #${o.id}`;
    $("details").innerHTML = `<dt>Customer</dt><dd>${esc(o.customer)}</dd><dt>Status</dt><dd><span class="status ${o.status}">${o.status}</span></dd><dt>Date</dt><dd>${o.date}</dd><dt>Lines</dt><dd>${o.lines}</dd><dt>Amount</dt><dd>${money(o.amount)}</dd>`;
    $("approval").href = `/orders/${o.id}/approval`;
    prefetch();
  },
  async settings() {
    // Presence heartbeat: a write request sent when the page opens (blocked by a read-only capture).
    fetch("/api/presence", { method: "POST", credentials: "same-origin" }).catch(() => {});
    const p = await api("/api/profile");
    $("name").value = p.name;
    $("language").value = p.language;
    $("theme").value = p.theme;
    $("workspace").textContent = p.workspace;
    $("integration").textContent = p.integration;
    $("save").addEventListener("click", async () => {
      await api("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: $("name").value, language: $("language").value, theme: $("theme").value }) });
      $("saved").hidden = false;
    });
  },
};
pages[document.body.dataset.page]?.();
