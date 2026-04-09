/**
 * Halftone view: p5.js instance mode.
 * Dots wander freely, then seek into a halftone grid on GO!
 * GIF frames decoded via ImageDecoder API for reliable animation.
 */
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
  var halftoneBgP5Image = null;
  var halftoneBgObjectUrl = null;
  var halftoneBgOverlayOpacity = 0.2;

  function drawHalftoneBgTintOverlay(p) {
    if (halftoneBgOverlayOpacity <= 0) return;
    var a = p.constrain(halftoneBgOverlayOpacity, 0, 1) * 255;
    p.push();
    p.noStroke();
    p.fill(state.bgR, state.bgG, state.bgB, a);
    p.rect(0, 0, p.width, p.height);
    p.pop();
  }

  function revokeHalftoneBgObjectUrl() {
    if (halftoneBgObjectUrl) {
      URL.revokeObjectURL(halftoneBgObjectUrl);
      halftoneBgObjectUrl = null;
    }
  }

  function drawHalftoneCanvasBackground(p) {
    p.background(state.bgR, state.bgG, state.bgB);
    if (!halftoneBgP5Image || !halftoneBgP5Image.width) return;
    var cw = p.width;
    var ch = p.height;
    var iw = halftoneBgP5Image.width;
    var ih = halftoneBgP5Image.height;
    if (iw <= 0 || ih <= 0) return;
    var scale = p.max(cw / iw, ch / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    var dx = (cw - dw) * 0.5;
    var dy = (ch - dh) * 0.5;
    p.image(halftoneBgP5Image, dx, dy, dw, dh);
  }

  function loadHalftoneBackgroundFromFile(file) {
    if (!file || !halftoneP5) return;
    var isImageType = file.type && file.type.startsWith("image/");
    var looksImage =
      isImageType ||
      /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || "");
    if (!looksImage) return;
    revokeHalftoneBgObjectUrl();
    halftoneBgObjectUrl = URL.createObjectURL(file);
    halftoneP5.loadImage(
      halftoneBgObjectUrl,
      function (img) {
        halftoneBgP5Image = img;
      },
      function () {
        revokeHalftoneBgObjectUrl();
        halftoneBgP5Image = null;
      },
    );
  }

  function clearHalftoneBackgroundImage() {
    halftoneBgP5Image = null;
    revokeHalftoneBgObjectUrl();
    var input = document.getElementById("halftone-bg-image-upload");
    if (input) input.value = "";
  }

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

  function decodeGifFrames(file, callback) {
    if (typeof ImageDecoder === "undefined") {
      callback(null);
      return;
    }
    var decoder;
    try {
      decoder = new ImageDecoder({ type: "image/gif", data: file.stream() });
    } catch (e) {
      callback(null);
      return;
    }
    decoder.completed
      .then(function () {
        var track = decoder.tracks.selectedTrack;
        var count = track.frameCount;
        if (count < 2) {
          decoder.close();
          callback(null);
          return;
        }
        var frames = new Array(count);
        var done = 0;
        for (var i = 0; i < count; i++) {
          (function (idx) {
            decoder
              .decode({ frameIndex: idx })
              .then(function (result) {
                var vf = result.image;
                var c = document.createElement("canvas");
                c.width = vf.displayWidth;
                c.height = vf.displayHeight;
                var ctx = c.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(vf, 0, 0);
                frames[idx] = {
                  canvas: c,
                  ctx: ctx,
                  duration: vf.duration ? vf.duration / 1000 : 100,
                };
                vf.close();
                done++;
                if (done === count) {
                  decoder.close();
                  callback(frames);
                }
              })
              .catch(function () {
                done++;
                if (done === count) {
                  decoder.close();
                  var valid = frames.filter(Boolean);
                  callback(valid.length > 1 ? frames : null);
                }
              });
          })(i);
        }
      })
      .catch(function () {
        callback(null);
      });
  }

  function halftoneSketch(p) {
    var heroP5Img = null;
    var heroElement = null;
    var heroIsGif = false;
    var sampler = null;
    var showImage = false;
    var dots = [];

    var gifFrames = null;
    var gifTotalDuration = 0;
    var gifStartTime = 0;

    function sourceWidth() {
      if (gifFrames) return gifFrames[0].canvas.width;
      if (heroElement) return heroElement.naturalWidth;
      if (heroP5Img) return heroP5Img.width;
      return 0;
    }

    function sourceHeight() {
      if (gifFrames) return gifFrames[0].canvas.height;
      if (heroElement) return heroElement.naturalHeight;
      if (heroP5Img) return heroP5Img.height;
      return 0;
    }

    function makeSampler(w, h) {
      var c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      sampler = {
        canvas: c,
        ctx: c.getContext("2d", { willReadFrequently: true }),
        w: w,
        h: h,
      };
    }

    function drawSourceToSampler() {
      if (!sampler) return;
      if (heroElement) {
        sampler.ctx.drawImage(heroElement, 0, 0, sampler.w, sampler.h);
      } else if (heroP5Img) {
        sampler.ctx.drawImage(heroP5Img.canvas, 0, 0, sampler.w, sampler.h);
      }
    }

    function samplerPixels() {
      if (!sampler) return null;
      return sampler.ctx.getImageData(0, 0, sampler.w, sampler.h).data;
    }

    function currentGifFrame() {
      if (!gifFrames || gifFrames.length < 2) return null;
      var elapsed = (performance.now() - gifStartTime) % gifTotalDuration;
      var acc = 0;
      for (var i = 0; i < gifFrames.length; i++) {
        if (!gifFrames[i]) continue;
        acc += gifFrames[i].duration || 100;
        if (elapsed < acc) return gifFrames[i];
      }
      return gifFrames[gifFrames.length - 1];
    }

    function imageRect() {
      var sw = sourceWidth();
      var sh = sourceHeight();
      if (!sw || !sh) return null;
      var sc = p.min(p.width / sw, p.height / sh) * 0.6;
      var iw = sw * sc;
      var ih = sh * sc;
      return {
        x: (p.width - iw) / 2,
        y: (p.height - ih) / 2,
        w: iw,
        h: ih,
        sc: sc,
      };
    }

    function buildDots() {
      var sw = sourceWidth();
      var sh = sourceHeight();
      if (!sw || !sh) return;
      makeSampler(sw, sh);

      if (gifFrames) {
        var f = gifFrames[0];
        sampler.ctx.drawImage(f.canvas, 0, 0, sampler.w, sampler.h);
      } else {
        drawSourceToSampler();
      }

      var px = samplerPixels();
      if (!px) return;
      var r = imageRect();
      if (!r) return;

      dots = [];
      var half = GRID_SPACING / 2;
      for (var gy = r.y + half; gy < r.y + r.h; gy += GRID_SPACING) {
        for (var gx = r.x + half; gx < r.x + r.w; gx += GRID_SPACING) {
          var ix = Math.max(0, Math.min(sw - 1, Math.floor((gx - r.x) / r.sc)));
          var iy = Math.max(0, Math.min(sh - 1, Math.floor((gy - r.y) / r.sc)));
          var idx = 4 * (iy * sw + ix);
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

    function updateDotsFromPixels(px) {
      var r = imageRect();
      if (!r) return;
      var sw = sampler.w;
      for (var u = 0; u < dots.length; u++) {
        var d = dots[u];
        var ix = Math.max(
          0,
          Math.min(sw - 1, Math.floor((d.gridX - r.x) / r.sc)),
        );
        var iy = Math.max(
          0,
          Math.min(sampler.h - 1, Math.floor((d.gridY - r.y) / r.sc)),
        );
        var idx = 4 * (iy * sw + ix);
        var lum =
          (0.299 * px[idx] + 0.587 * px[idx + 1] + 0.114 * px[idx + 2]) / 255;
        d.gridDiam = (1 - lum) * MAX_DOT;
        if (d.mode === "halftone") d.diam = d.gridDiam;
      }
    }

    function syncAnimatedFrame() {
      if (!sampler || !dots.length) return;

      if (gifFrames) {
        var frame = currentGifFrame();
        if (frame) {
          sampler.ctx.drawImage(frame.canvas, 0, 0, sampler.w, sampler.h);
        }
      } else if (heroElement) {
        drawSourceToSampler();
      } else {
        return;
      }

      var px = samplerPixels();
      if (!px) return;
      updateDotsFromPixels(px);
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

    function removeOldHeroElement() {
      if (heroElement && heroElement.parentNode) {
        heroElement.parentNode.removeChild(heroElement);
      }
      heroElement = null;
      heroIsGif = false;
      gifFrames = null;
      gifTotalDuration = 0;
    }

    window.halftoneGo = goToHalftone;
    window.halftoneFreeForAll = freeForAll;
    window._halftoneRebuildDots = buildDots;
    window.halftoneSetImage = function (imgElement, isGif, file) {
      removeOldHeroElement();
      heroP5Img = null;
      heroElement = imgElement;
      heroIsGif = !!isGif;

      if (isGif) {
        imgElement.style.cssText =
          "position:fixed;top:0;left:-9999px;pointer-events:none;";
        document.body.appendChild(imgElement);

        if (file) {
          decodeGifFrames(file, function (frames) {
            if (frames) {
              gifFrames = frames;
              gifTotalDuration = 0;
              for (var i = 0; i < frames.length; i++) {
                gifTotalDuration += (frames[i] && frames[i].duration) || 100;
              }
              gifStartTime = performance.now();
              buildDots();
            }
          });
        }
      }

      buildDots();
    };

    p.preload = function () {
      heroP5Img = p.loadImage("assets/images/h-image.jpg");
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
      drawHalftoneCanvasBackground(p);
      drawHalftoneBgTintOverlay(p);

      if (heroIsGif) {
        syncAnimatedFrame();
      }

      if (showImage) {
        var r = imageRect();
        if (r) {
          if (gifFrames) {
            var frame = currentGifFrame();
            if (frame) {
              p.drawingContext.drawImage(frame.canvas, r.x, r.y, r.w, r.h);
            }
          } else if (heroElement) {
            p.drawingContext.drawImage(heroElement, r.x, r.y, r.w, r.h);
          } else if (heroP5Img) {
            p.imageMode(p.CORNER);
            p.image(heroP5Img, r.x, r.y, r.w, r.h);
          }
        }
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
          var endDiam =
            heroIsGif && d.seekAfter === "halftone" ? d.gridDiam : d.seekED;
          if (elapsed >= d.seekDur) {
            d.x = d.seekEX;
            d.y = d.seekEY;
            d.diam = endDiam;
            d.mode = d.seekAfter;
          } else if (elapsed > 0) {
            var t = easeInOutCubic(elapsed / d.seekDur);
            d.x = d.seekSX + (d.seekEX - d.seekSX) * t;
            d.y = d.seekSY + (d.seekEY - d.seekSY) * t;
            d.diam = d.seekSD + (endDiam - d.seekSD) * t;
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
    var halftoneUploadObjectUrl = null;
    if (fileInput) {
      fileInput.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var isImageType = file.type && file.type.startsWith("image/");
        var isGifFile =
          file.type === "image/gif" || /\.gif$/i.test(file.name || "");
        var looksImage =
          isImageType ||
          isGifFile ||
          /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || "");
        if (!looksImage) return;
        if (halftoneUploadObjectUrl) {
          URL.revokeObjectURL(halftoneUploadObjectUrl);
          halftoneUploadObjectUrl = null;
        }
        halftoneUploadObjectUrl = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          ensureInstance();
          if (window.halftoneSetImage) {
            window.halftoneSetImage(img, isGifFile, file);
          }
        };
        img.onerror = function () {
          if (halftoneUploadObjectUrl) {
            URL.revokeObjectURL(halftoneUploadObjectUrl);
            halftoneUploadObjectUrl = null;
          }
        };
        img.src = halftoneUploadObjectUrl;
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

    var halftoneBgFile = document.getElementById("halftone-bg-image-upload");
    if (halftoneBgFile) {
      halftoneBgFile.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        ensureInstance();
        loadHalftoneBackgroundFromFile(file);
      });
    }
    var halftoneBgClear = document.getElementById("btn-halftone-bg-image-clear");
    if (halftoneBgClear) {
      halftoneBgClear.addEventListener("click", function () {
        clearHalftoneBackgroundImage();
      });
    }

    var htOverlayRange = document.getElementById("halftone-bg-overlay-opacity");
    var htOverlayValue = document.getElementById("halftone-bg-overlay-value");
    if (htOverlayRange) {
      function syncHalftoneOverlay() {
        halftoneBgOverlayOpacity = Number(htOverlayRange.value) / 100;
        if (htOverlayValue) htOverlayValue.textContent = htOverlayRange.value + "%";
        htOverlayRange.setAttribute("aria-valuenow", htOverlayRange.value);
      }
      htOverlayRange.addEventListener("input", syncHalftoneOverlay);
      syncHalftoneOverlay();
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
