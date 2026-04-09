(function () {
  function init() {
    var tabs = document.querySelectorAll(".canvas-tab");
    var presetBar = document.getElementById("preset-bar");
    var halftoneBar = document.getElementById("halftone-bar");

    function syncPageBackground(css) {
      if (!css) return;
      document.documentElement.style.backgroundColor = css;
      if (document.body) document.body.style.backgroundColor = css;
    }

    function switchTo(view) {
      tabs.forEach(function (tab) {
        var active = tab.dataset.canvas === view;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });

      if (view === "icons") {
        if (window.HalftoneCanvas) window.HalftoneCanvas.hide();
        if (halftoneBar) halftoneBar.style.display = "none";
        if (presetBar) presetBar.style.display = "block";
        if (window.IconsCanvas) window.IconsCanvas.show();
        if (window.IconsCanvas)
          syncPageBackground(window.IconsCanvas.getBackgroundCss());
      } else {
        if (window.IconsCanvas) window.IconsCanvas.hide();
        if (presetBar) presetBar.style.display = "none";
        if (halftoneBar) halftoneBar.style.display = "block";
        if (window.HalftoneCanvas) window.HalftoneCanvas.show();
        if (window.HalftoneCanvas)
          syncPageBackground(window.HalftoneCanvas.getBackgroundCss());
      }
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        switchTo(tab.dataset.canvas);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
