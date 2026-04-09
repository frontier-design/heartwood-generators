(function () {
  function setSelectedIn(container, selector, btn) {
    container.querySelectorAll(selector).forEach(function (b) {
      b.classList.remove("is-selected");
    });
    btn.classList.add("is-selected");
  }

  function wireGroup(rootId, selector, setterName) {
    var root = document.getElementById(rootId);
    if (!root) return;
    root.querySelectorAll(selector).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var hex = btn.getAttribute("data-hex");
        if (hex && typeof window[setterName] === "function") {
          window[setterName](hex);
          setSelectedIn(root, selector, btn);
        }
      });
    });
    var current = root.querySelector(selector + ".is-selected");
    if (current) {
      var hex = current.getAttribute("data-hex");
      if (hex && typeof window[setterName] === "function") {
        window[setterName](hex);
      }
    }
  }

  function init() {
    wireGroup("color-presets", ".color-preset", "setDotColorHex");
    wireGroup("bg-color-presets", ".bg-color-preset", "setCanvasBackgroundHex");
    wireGroup(
      "halftone-color-presets",
      ".color-preset",
      "setHalftoneDotColorHex",
    );
    wireGroup(
      "halftone-bg-color-presets",
      ".bg-color-preset",
      "setHalftoneCanvasBackgroundHex",
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
