(function () {
  function init() {
    var tabs = document.querySelectorAll(".canvas-tab");
    var presetBar = document.getElementById("preset-bar");
    var halftoneBar = document.getElementById("halftone-bar");
    var datavisBar = document.getElementById("datavis-bar");

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
        if (window.DataVisCanvas) window.DataVisCanvas.hide();
        if (halftoneBar) halftoneBar.style.display = "none";
        if (datavisBar) datavisBar.style.display = "none";
        if (presetBar) presetBar.style.display = "block";
        if (window.IconsCanvas) window.IconsCanvas.show();
        if (window.IconsCanvas)
          syncPageBackground(window.IconsCanvas.getBackgroundCss());
      } else if (view === "halftone") {
        if (window.IconsCanvas) window.IconsCanvas.hide();
        if (window.DataVisCanvas) window.DataVisCanvas.hide();
        if (presetBar) presetBar.style.display = "none";
        if (datavisBar) datavisBar.style.display = "none";
        if (halftoneBar) halftoneBar.style.display = "block";
        if (window.HalftoneCanvas) window.HalftoneCanvas.show();
        if (window.HalftoneCanvas)
          syncPageBackground(window.HalftoneCanvas.getBackgroundCss());
      } else if (view === "datavis") {
        if (window.IconsCanvas) window.IconsCanvas.hide();
        if (window.HalftoneCanvas) window.HalftoneCanvas.hide();
        if (presetBar) presetBar.style.display = "none";
        if (halftoneBar) halftoneBar.style.display = "none";
        if (datavisBar) datavisBar.style.display = "block";
        if (window.DataVisCanvas) window.DataVisCanvas.show();
        if (window.DataVisCanvas)
          syncPageBackground(window.DataVisCanvas.getBackgroundCss());
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
