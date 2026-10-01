/* Live-reload client of `doc-kit dev` (injected by engine/dev/server.mjs, never part of a build).
   window.__DOC_KIT_DEV__ = { id, events, texts: { title, hint, close } }
   - event "build" { id, errors[{ what, help }], warnings }: a newer successful build reloads the page (same
     route, same scroll position); errors show in an overlay, which disappears once they are fixed.
   Texts come from the server, already translated: nothing is hard-coded here. */
(function () {
  "use strict";
  var cfg = window.__DOC_KIT_DEV__ || {};
  var KEY = "doc-kit-dev-scroll";
  var texts = cfg.texts || {};

  // Scroll position kept across a reload of the same route.
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    sessionStorage.removeItem(KEY);
    if (saved && saved.hash === location.hash)
      requestAnimationFrame(function () {
        window.scrollTo(0, saved.y);
      });
  } catch (e) {
    /* storage unavailable: no consequence */
  }

  var overlay = null;
  var dismissed = "";
  function hide() {
    if (overlay) overlay.remove();
    overlay = null;
  }
  function show(errors) {
    var signature = JSON.stringify(errors);
    if (signature === dismissed) return;
    hide();
    overlay = document.createElement("div");
    overlay.id = "doc-kit-dev-overlay";
    overlay.setAttribute("role", "alert");
    overlay.style.cssText =
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;max-height:60vh;overflow:auto;" +
      "padding:16px 18px;border-radius:12px;border:2px solid var(--danger, #b42318);" +
      "background:var(--surface, #ffffff);color:var(--text, #1f2937);" +
      "box-shadow:0 12px 40px rgba(0,0,0,.35);font:14px/1.5 system-ui,sans-serif";
    var head = document.createElement("div");
    head.style.cssText = "display:flex;gap:12px;align-items:center;margin-bottom:8px";
    var title = document.createElement("strong");
    title.style.cssText = "flex:1;color:var(--danger, #b42318)";
    title.textContent = "✖ " + texts.title;
    var close = document.createElement("button");
    close.type = "button";
    close.textContent = texts.close;
    close.style.cssText = "font:inherit;padding:2px 10px;border-radius:6px;border:1px solid currentColor;background:none;color:inherit;cursor:pointer";
    close.addEventListener("click", function () {
      dismissed = signature;
      hide();
    });
    head.appendChild(title);
    head.appendChild(close);
    overlay.appendChild(head);
    var list = document.createElement("ul");
    list.style.cssText = "margin:0 0 8px;padding-left:20px";
    errors.forEach(function (e) {
      var li = document.createElement("li");
      var what = document.createElement("div");
      what.style.cssText = "font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap";
      what.textContent = e.what;
      li.appendChild(what);
      if (e.help) {
        var help = document.createElement("div");
        help.style.cssText = "opacity:.8";
        help.textContent = "→ " + e.help;
        li.appendChild(help);
      }
      list.appendChild(li);
    });
    overlay.appendChild(list);
    var hint = document.createElement("div");
    hint.style.cssText = "opacity:.7;font-size:13px";
    hint.textContent = texts.hint;
    overlay.appendChild(hint);
    document.body.appendChild(overlay);
  }

  function onBuild(state) {
    if (state.id && state.id !== cfg.id) {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ hash: location.hash, y: window.scrollY }));
      } catch (e) {
        /* storage unavailable: the page reloads at the top */
      }
      location.reload();
      return;
    }
    if (state.errors && state.errors.length) show(state.errors);
    else {
      dismissed = "";
      hide();
    }
  }

  if (!window.EventSource) return;
  var source = new EventSource(cfg.events);
  source.addEventListener("build", function (e) {
    try {
      onBuild(JSON.parse(e.data));
    } catch (err) {
      /* malformed event: ignored */
    }
  });
  window.__DOC_KIT_DEV_SOURCE__ = source;
})();
