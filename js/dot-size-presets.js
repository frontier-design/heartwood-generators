(function () {
  const ROOT_ID = "dot-size-presets";
  const SEL = ".dot-size-preset";

  function setSelectedIn(root, btn) {
    root.querySelectorAll(SEL).forEach(function (b) {
      b.classList.remove("is-selected");
    });
    btn.classList.add("is-selected");
  }

  function init() {
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }

    root.querySelectorAll(SEL).forEach(function (btn) {
      btn.addEventListener("click", function () {
        const raw = btn.getAttribute("data-diameter");
        const px = raw != null ? Number(raw) : NaN;
        if (!Number.isFinite(px)) {
          return;
        }
        if (typeof window.setDotDiameterPixels === "function") {
          window.setDotDiameterPixels(px);
        }
        setSelectedIn(root, btn);
      });
    });

    const current = root.querySelector(SEL + ".is-selected");
    if (current && typeof window.setDotDiameterPixels === "function") {
      const raw = current.getAttribute("data-diameter");
      const px = raw != null ? Number(raw) : NaN;
      if (Number.isFinite(px)) {
        window.setDotDiameterPixels(px);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
