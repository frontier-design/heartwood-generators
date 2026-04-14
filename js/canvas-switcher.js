(function () {
  function init() {
    var tabs = document.querySelectorAll(".canvas-tab");
    var presetBar = document.getElementById("preset-bar");
    var halftoneBar = document.getElementById("halftone-bar");
    var datavisBar = document.getElementById("datavis-bar");
    var meshBar = document.getElementById("mesh-bar");

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

      var allBars = [presetBar, halftoneBar, datavisBar, meshBar];
      var allCanvases = [
        "IconsCanvas",
        "HalftoneCanvas",
        "DataVisCanvas",
        "MeshCanvas",
      ];

      allCanvases.forEach(function (name) {
        if (window[name]) window[name].hide();
      });
      allBars.forEach(function (bar) {
        if (bar) bar.style.display = "none";
      });

      if (view === "icons") {
        if (presetBar) presetBar.style.display = "block";
        if (window.IconsCanvas) window.IconsCanvas.show();
        if (window.IconsCanvas)
          syncPageBackground(window.IconsCanvas.getBackgroundCss());
      } else if (view === "halftone") {
        if (halftoneBar) halftoneBar.style.display = "block";
        if (window.HalftoneCanvas) window.HalftoneCanvas.show();
        if (window.HalftoneCanvas)
          syncPageBackground(window.HalftoneCanvas.getBackgroundCss());
      } else if (view === "datavis") {
        if (datavisBar) datavisBar.style.display = "block";
        if (window.DataVisCanvas) window.DataVisCanvas.show();
        if (window.DataVisCanvas)
          syncPageBackground(window.DataVisCanvas.getBackgroundCss());
      } else if (view === "mesh") {
        if (meshBar) meshBar.style.display = "block";
        if (window.MeshCanvas) window.MeshCanvas.show();
        if (window.MeshCanvas)
          syncPageBackground(window.MeshCanvas.getBackgroundCss());
      }
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        switchTo(tab.dataset.canvas);
      });
    });

    var uiHidden = false;
    var tabsEl = document.getElementById("canvas-tabs");
    var allBars = [presetBar, halftoneBar, datavisBar, meshBar];

    document.addEventListener("keydown", function (e) {
      if (e.key === "l" || e.key === "L") {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        uiHidden = !uiHidden;
        var vis = uiHidden ? "none" : "";
        if (tabsEl) tabsEl.style.display = uiHidden ? "none" : "flex";
        allBars.forEach(function (bar) {
          if (bar) bar.style.display = uiHidden ? "none" : "";
        });
        if (!uiHidden) {
          var activeTab = document.querySelector(".canvas-tab.is-active");
          if (activeTab) switchTo(activeTab.dataset.canvas);
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
