(function () {
  const PRESETS_URL = "data/presets.json";

  function wire(buttonId, shape) {
    const el = document.getElementById(buttonId);
    if (!el) {
      return;
    }
    el.addEventListener("click", function () {
      if (typeof window.loadShapePreset === "function") {
        window.loadShapePreset(shape);
      }
      if (typeof window.animateDotsToPresets === "function") {
        window.animateDotsToPresets();
      }
    });
  }

  function applyPresetsList(list) {
    if (!list || !Array.isArray(list)) {
      return;
    }
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item && item.buttonId && item.shape) {
        wire(item.buttonId, item.shape);
      }
    }
  }

  function wireFreeForAll() {
    const btn = document.getElementById("btn-free-for-all");
    if (!btn) {
      return;
    }
    btn.addEventListener("click", function () {
      if (typeof window.freeForAllDots === "function") {
        window.freeForAllDots();
      }
    });
  }

  function init() {
    wireFreeForAll();
    fetch(PRESETS_URL)
      .then(function (res) {
        if (!res.ok) {
          throw new Error(res.status + " " + res.statusText);
        }
        return res.json();
      })
      .then(function (data) {
        applyPresetsList(data.presets);
      })
      .catch(function (err) {
        console.error("preset-ui: could not load", PRESETS_URL, err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
