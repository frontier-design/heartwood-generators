(function () {
  var GRID_SPACING = 7;
  var MAX_DOT = 6;
  var WANDER_DOT = 3;
  var WANDER_SPEED = 0.12;
  var WANDER_STEER = 0.02;
  var SEEK_DURATION_MS = 1000;
  var SEEK_WAVE_MS = 500;
  var CURSOR_INFLUENCE_RADIUS = 120;
  var CURSOR_MAX_PUSH = 25;
  var CURSOR_NUDGE_EASE = 0.18;

  var halftoneP5 = null;
  var container = null;
  var isVisible = false;

  var state = {
    dotR: 221,
    dotG: 79,
    dotB: 55,
    bgR: 227,
    bgG: 225,
    bgB: 215,
  };

  function parseHexRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
      String(hex).trim(),
    );
    if (!m) return null;
    return {
      r: parseInt(m[1], 16),
      g: parseInt(m[2], 16),
      b: parseInt(m[3], 16),
      css: "#" + m[1] + m[2] + m[3],
    };
  }

  function applyBodyBg(css) {
    if (typeof document === "undefined" || !css) return;
    document.documentElement.style.backgroundColor = css;
    if (document.body) document.body.style.backgroundColor = css;
  }

  function setHalftoneDotColorHex(hex) {
    var rgb = parseHexRgb(hex);
    if (!rgb) return;
    state.dotR = rgb.r;
    state.dotG = rgb.g;
    state.dotB = rgb.b;
  }

  function setHalftoneCanvasBackgroundHex(hex) {
    var rgb = parseHexRgb(hex);
    if (!rgb) return;
    state.bgR = rgb.r;
    state.bgG = rgb.g;
    state.bgB = rgb.b;
    if (isVisible) applyBodyBg(rgb.css);
  }

  window.setHalftoneDotColorHex = setHalftoneDotColorHex;
  window.setHalftoneCanvasBackgroundHex = setHalftoneCanvasBackgroundHex;

  function syncHalftoneWanderDot() {
    WANDER_DOT = Math.max(2, Math.min(5, Math.round(MAX_DOT * 0.55)));
  }

  function setHalftoneDensity(spacing, maxDot) {
    var s = Number(spacing);
    var m = Number(maxDot);
    if (!Number.isFinite(s) || !Number.isFinite(m)) return;
    GRID_SPACING = Math.max(3, Math.min(16, Math.round(s)));
    MAX_DOT = Math.max(2, Math.min(14, Math.round(m)));
    if (MAX_DOT > GRID_SPACING) MAX_DOT = GRID_SPACING;
    syncHalftoneWanderDot();
    if (typeof window._halftoneRebuildDots === "function") {
      window._halftoneRebuildDots();
    }
  }

  function halftoneSketch(p) {
    var heroImg = null;
    var showImage = false;
    var dots = [];

    function imageRect() {
      if (!heroImg) return null;
      var sc = p.min(p.width / heroImg.width, p.height / heroImg.height) * 0.6;
      var iw = heroImg.width * sc;
      var ih = heroImg.height * sc;
      return {
        x: (p.width - iw) / 2,
        y: (p.height - ih) / 2,
        w: iw,
        h: ih,
        sc: sc,
      };
    }

    function buildDots() {
      if (!heroImg || heroImg.width === 0) return;
      heroImg.loadPixels();
      var px = heroImg.pixels;
      var imgW = heroImg.width;
      var r = imageRect();
      if (!r) return;

      dots = [];
      var half = GRID_SPACING / 2;
      for (var gy = r.y + half; gy < r.y + r.h; gy += GRID_SPACING) {
        for (var gx = r.x + half; gx < r.x + r.w; gx += GRID_SPACING) {
          var ix = p.constrain(
            p.floor((gx - r.x) / r.sc),
            0,
            heroImg.width - 1,
          );
          var iy = p.constrain(
            p.floor((gy - r.y) / r.sc),
            0,
            heroImg.height - 1,
          );
          var idx = 4 * (iy * imgW + ix);
          var lum =
            (0.299 * px[idx] + 0.587 * px[idx + 1] + 0.114 * px[idx + 2]) / 255;

          dots.push({
            x: p.random(p.width),
            y: p.random(p.height),
            diam: WANDER_DOT,
            gridX: gx,
            gridY: gy,
            gridDiam: (1 - lum) * MAX_DOT,
            angle: p.random(p.TWO_PI),
            speed: p.random(WANDER_SPEED * 0.5, WANDER_SPEED),
            mode: "wander",
            seekSX: 0,
            seekSY: 0,
            seekSD: 0,
            seekEX: 0,
            seekEY: 0,
            seekED: 0,
            seekT0: 0,
            seekDur: 0,
            seekAfter: "wander",
            nudgeX: 0,
            nudgeY: 0,
          });
        }
      }
    }

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function goToHalftone() {
      var now = p.millis();
      var cx = p.width / 2;
      var cy = p.height / 2;
      var farthest = 1;
      for (var i = 0; i < dots.length; i++) {
        var dd = p.dist(dots[i].gridX, dots[i].gridY, cx, cy);
        if (dd > farthest) farthest = dd;
      }
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        var delay =
          (p.dist(d.gridX, d.gridY, cx, cy) / farthest) * SEEK_WAVE_MS;
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekSD = d.diam;
        d.seekEX = d.gridX;
        d.seekEY = d.gridY;
        d.seekED = d.gridDiam;
        d.seekT0 = now + delay;
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "halftone";
      }
    }

    function freeForAll() {
      var now = p.millis();
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekSD = d.diam;
        d.seekEX = p.random(p.width);
        d.seekEY = p.random(p.height);
        d.seekED = WANDER_DOT;
        d.seekT0 = now + p.random(0, 300);
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "wander";
        d.angle = p.random(p.TWO_PI);
      }
    }

    window.halftoneGo = goToHalftone;
    window.halftoneFreeForAll = freeForAll;
    window._halftoneRebuildDots = buildDots;
    window.halftoneSetImage = function (imgElement) {
      var w = imgElement.naturalWidth;
      var h = imgElement.naturalHeight;
      var img = p.createImage(w, h);
      img.drawingContext.drawImage(imgElement, 0, 0, w, h);
      img.modified = true;
      heroImg = img;
      buildDots();
    };

    p.preload = function () {
      heroImg = p.loadImage("assets/images/h-image.jpg");
    };

    p.setup = function () {
      var c = p.createCanvas(p.windowWidth, p.windowHeight);
      c.parent(container);
      c.id("halftone-p5");
      p.pixelDensity(Math.min(p.displayDensity(), 3));
      p.noStroke();
      buildDots();
    };

    p.draw = function () {
      p.background(state.bgR, state.bgG, state.bgB);

      if (heroImg && showImage) {
        var r = imageRect();
        p.imageMode(p.CORNER);
        p.image(heroImg, r.x, r.y, r.w, r.h);
      }

      var now = p.millis();
      var mx = p.mouseX;
      var my = p.mouseY;
      var radSq = CURSOR_INFLUENCE_RADIUS * CURSOR_INFLUENCE_RADIUS;

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];

        if (d.mode === "wander") {
          d.angle += (Math.random() - 0.5) * 2 * WANDER_STEER;
          d.x += Math.cos(d.angle) * d.speed;
          d.y += Math.sin(d.angle) * d.speed;
          if (d.x < 0) {
            d.x = 0;
            d.angle = Math.PI - d.angle;
          } else if (d.x > p.width) {
            d.x = p.width;
            d.angle = Math.PI - d.angle;
          }
          if (d.y < 0) {
            d.y = 0;
            d.angle = -d.angle;
          } else if (d.y > p.height) {
            d.y = p.height;
            d.angle = -d.angle;
          }
        } else if (d.mode === "seek") {
          var elapsed = now - d.seekT0;
          if (elapsed >= d.seekDur) {
            d.x = d.seekEX;
            d.y = d.seekEY;
            d.diam = d.seekED;
            d.mode = d.seekAfter;
          } else if (elapsed > 0) {
            var t = easeInOutCubic(elapsed / d.seekDur);
            d.x = d.seekSX + (d.seekEX - d.seekSX) * t;
            d.y = d.seekSY + (d.seekEY - d.seekSY) * t;
            d.diam = d.seekSD + (d.seekED - d.seekSD) * t;
          }
        }

        var nvx = d.x - mx;
        var nvy = d.y - my;
        var dSq = nvx * nvx + nvy * nvy;
        var tx = 0;
        var ty = 0;
        if (dSq < radSq && dSq > 1e-6) {
          var dist = Math.sqrt(dSq);
          var str =
            CURSOR_MAX_PUSH * Math.pow(1 - dist / CURSOR_INFLUENCE_RADIUS, 2);
          tx = (nvx / dist) * str;
          ty = (nvy / dist) * str;
        }
        d.nudgeX += (tx - d.nudgeX) * CURSOR_NUDGE_EASE;
        d.nudgeY += (ty - d.nudgeY) * CURSOR_NUDGE_EASE;
      }

      p.fill(state.dotR, state.dotG, state.dotB);
      for (var k = 0; k < dots.length; k++) {
        var d = dots[k];
        if (d.diam > 0.3) {
          p.circle(d.x + d.nudgeX, d.y + d.nudgeY, d.diam);
        }
      }
    };

    p.windowResized = function () {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      buildDots();
    };

    p.keyPressed = function () {
      if (p.key === "h" || p.key === "H") {
        showImage = !showImage;
      }
    };
  }

  function ensureInstance() {
    if (halftoneP5 || typeof p5 === "undefined" || !container) return;
    halftoneP5 = new p5(halftoneSketch, container);
  }

  function init() {
    container = document.getElementById("canvas-halftone");
    if (!container) return;
    container.style.display = "none";

    var goBtn = document.getElementById("btn-halftone-go");
    var ffaBtn = document.getElementById("btn-halftone-ffa");
    if (goBtn)
      goBtn.addEventListener("click", function () {
        if (window.halftoneGo) window.halftoneGo();
      });
    if (ffaBtn)
      ffaBtn.addEventListener("click", function () {
        if (window.halftoneFreeForAll) window.halftoneFreeForAll();
      });

    var fileInput = document.getElementById("halftone-image-upload");
    if (fileInput) {
      fileInput.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          var img = new Image();
          img.onload = function () {
            ensureInstance();
            if (window.halftoneSetImage) window.halftoneSetImage(img);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    var densityRoot = document.getElementById("halftone-density-presets");
    if (densityRoot) {
      densityRoot
        .querySelectorAll(".halftone-density-preset")
        .forEach(function (btn) {
          btn.addEventListener("click", function () {
            setHalftoneDensity(
              btn.getAttribute("data-spacing"),
              btn.getAttribute("data-max-dot"),
            );
            densityRoot
              .querySelectorAll(".halftone-density-preset")
              .forEach(function (b) {
                b.classList.remove("is-selected");
              });
            btn.classList.add("is-selected");
          });
        });
      var selBtn = densityRoot.querySelector(
        ".halftone-density-preset.is-selected",
      );
      if (selBtn) {
        setHalftoneDensity(
          selBtn.getAttribute("data-spacing"),
          selBtn.getAttribute("data-max-dot"),
        );
      }
    }
  }

  window.HalftoneCanvas = {
    init: init,
    show: function () {
      if (!container) return;
      isVisible = true;
      ensureInstance();
      container.style.display = "block";
      if (halftoneP5) {
        halftoneP5.loop();
        halftoneP5.resizeCanvas(window.innerWidth, window.innerHeight);
      }
      applyBodyBg("rgb(" + state.bgR + "," + state.bgG + "," + state.bgB + ")");
    },
    hide: function () {
      isVisible = false;
      if (halftoneP5) halftoneP5.noLoop();
      if (container) container.style.display = "none";
    },
    getContext: function () {
      return halftoneP5 ? halftoneP5.drawingContext : null;
    },
    getCanvas: function () {
      return halftoneP5 ? halftoneP5.canvas : null;
    },
    getBackgroundCss: function () {
      return "rgb(" + state.bgR + "," + state.bgG + "," + state.bgB + ")";
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
