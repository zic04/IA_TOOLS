/* A module of the site (engine/site/app.js, spliced in at its "@lib" line by the build, ARCHITECTURE.md §6.1a):
   it sees EXT.api only and adds to EXT. The before/after comparer (::before-after{}): the handle follows the pointer
   and the arrow keys. */
/* global EXT */
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

EXT.hydrators.push((root) => EXT.api.$$(".comparer-scene", root).forEach(enableComparer));
