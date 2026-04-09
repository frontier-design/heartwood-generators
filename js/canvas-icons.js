(function () {
  var CELL_SIZE = 15;
  var GRID_REF_C = 49;
  var GRID_REF_R = 27;
  var DOT_COUNT = 50;
  var MAX_SPEED = 15;
  var SEEK_MIN_EFFECTIVE_SPEED = 5;
  var SEEK_EASE_STOPS = [
    0, 0.067, 0.1294, 0.1877, 0.2421, 0.2929, 0.3402, 0.3844, 0.4257, 0.4641,
    0.5, 0.5335, 0.5647, 0.5939, 0.6211, 0.6464, 0.6701, 0.6922, 0.7128, 0.7321,
    0.75, 0.7667, 0.7824, 0.7969, 0.8105, 0.8232, 0.8351, 0.8461, 0.8564, 0.866,
    0.875, 0.8834, 0.8912, 0.8985, 0.9053, 0.9116, 0.9175, 0.9231, 0.9282,
    0.933, 0.9375, 0.9417, 0.9456, 0.9492, 0.9526, 0.9558, 0.9588, 0.9615,
    0.9641, 0.9665, 0.9688, 0.9708, 0.9728, 0.9746, 0.9763, 0.9779, 0.9794,
    0.9808, 0.9821, 0.9833, 0.9844, 0.9854, 0.9864, 0.9873, 0.9882, 0.989,
    0.9897, 0.9904, 0.991, 0.9916, 0.9922, 0.9927, 0.9932, 0.9937, 0.9941,
    0.9945, 0.9948, 0.9952, 0.9955, 0.9958, 0.9961, 0.9964, 0.9966, 0.9968,
    0.997, 0.9972, 0.9974, 0.9976, 0.9978, 0.9979, 0.998, 0.9982, 0.9983,
    0.9984, 0.9985, 0.9986, 0.9987, 0.9988, 0.9989, 0.999, 1,
  ];
  var WANDER_MAX_STEER = 0.011;
  var WANDER_NOISE_TIME_SCALE = 0.0032;
  var WANDER_SPEED_MIN = 0.01;
  var WANDER_SPEED_MAX = 0.15;
  var CURSOR_INFLUENCE_RADIUS = 110;
  var CURSOR_MAX_PUSH = 16;
  var CURSOR_NUDGE_EASE = 0.18;
  var MIDDLE_CELL_GRAY = 235;

  var iconsP5 = null;
  var container = null;

  var dotDiameter = 10;
  var dotRadius = 5;
  var dots = [];
  var showGrid = false;
  var presetStops = [];
  var dotColorR = 221,
    dotColorG = 79,
    dotColorB = 55;
  var canvasBgR = 227,
    canvasBgG = 225,
    canvasBgB = 215;

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

  window.setDotDiameterPixels = function (px) {
    var p = iconsP5;
    if (!p) return;
    var d = p.constrain(p.round(Number(px)), 6, 48);
    dotDiameter = d;
    dotRadius = d / 2;
    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];
      dot.x = p.constrain(dot.x, dotRadius, p.width - dotRadius);
      dot.y = p.constrain(dot.y, dotRadius, p.height - dotRadius);
    }
  };

  window.setDotColorHex = function (hex) {
    var rgb = parseHexRgb(hex);
    if (!rgb) return;
    dotColorR = rgb.r;
    dotColorG = rgb.g;
    dotColorB = rgb.b;
  };

  window.setCanvasBackgroundHex = function (hex) {
    var rgb = parseHexRgb(hex);
    if (!rgb) return;
    canvasBgR = rgb.r;
    canvasBgG = rgb.g;
    canvasBgB = rgb.b;
  };

  window.getIconsCanvasBackgroundCss = function () {
    return "rgb(" + canvasBgR + "," + canvasBgG + "," + canvasBgB + ")";
  };

  window.loadShapePreset = function (jsonStringOrObject) {
    var obj =
      typeof jsonStringOrObject === "string"
        ? JSON.parse(jsonStringOrObject)
        : jsonStringOrObject;
    var next = [];
    if (obj.cells && obj.cells.length > 0) {
      for (var i = 0; i < obj.cells.length; i++) {
        var c = obj.cells[i];
        next.push({ c: Math.round(Number(c.c)), r: Math.round(Number(c.r)) });
      }
    } else if (obj.norm && obj.norm.length > 0) {
      var gc =
        obj.grid && Number(obj.grid.cols) > 0 ? Number(obj.grid.cols) : 98;
      var gr =
        obj.grid && Number(obj.grid.rows) > 0 ? Number(obj.grid.rows) : 56;
      for (var j = 0; j < obj.norm.length; j++) {
        var n = obj.norm[j];
        var u = Number(n.u),
          v = Number(n.v);
        if (Number.isFinite(u) && Number.isFinite(v)) {
          next.push({ c: Math.floor(u * gc), r: Math.floor(v * gr) });
        }
      }
    }
    presetStops = next;
  };
  window.applyPresetData = window.loadShapePreset;

  window.animateDotsToPresets = function () {
    var p = iconsP5;
    if (!p || presetStops.length === 0) return;
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      var stop = presetStops[i % presetStops.length];
      d.cellC = stop.c;
      d.cellR = stop.r;
      var center = cellCenter(p, stop.c, stop.r);
      d.targetX = center.x;
      d.targetY = center.y;
      d.seekStartX = d.x;
      d.seekStartY = d.y;
      var leg = p.dist(d.x, d.y, center.x, center.y);
      d.seekDurationMs = seekDuration(p, leg, d.speed);
      d.seekStartedAt = p.millis();
      d.seekAfterMode = "inCell";
      d.mode = "seek";
    }
  };

  window.freeForAllDots = function () {
    var p = iconsP5;
    if (!p || p.width <= 0) return;
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      var tx = p.random(dotRadius, p.max(dotRadius, p.width - dotRadius));
      var ty = p.random(dotRadius, p.max(dotRadius, p.height - dotRadius));
      d.targetX = tx;
      d.targetY = ty;
      d.seekStartX = d.x;
      d.seekStartY = d.y;
      var leg = p.dist(d.x, d.y, tx, ty);
      d.seekDurationMs = seekDuration(p, leg, d.speed);
      d.seekStartedAt = p.millis();
      d.seekAfterMode = "wander";
      d.mode = "seek";
    }
  };

  function seekDuration(p, leg, dotSpeed) {
    if (leg < 0.5) return 1;
    var v = p.max(dotSpeed, SEEK_MIN_EFFECTIVE_SPEED);
    return p.constrain((leg / v) * (1000 / 60), 280, 9000);
  }

  function easeSeekProgress(p, t) {
    var s = SEEK_EASE_STOPS,
      n = s.length;
    if (n < 2) return p.constrain(t, 0, 1);
    if (t <= 0) return s[0];
    if (t >= 1) return s[n - 1];
    var x = t * (n - 1);
    var i = p.floor(x);
    var f = x - i;
    return p.lerp(s[i], s[i + 1], f);
  }

  function gridOrigin(p) {
    return {
      x: p.width / 2 - (GRID_REF_C + 0.5) * CELL_SIZE,
      y: p.height / 2 - (GRID_REF_R + 0.5) * CELL_SIZE,
    };
  }

  function cellCenter(p, c, r) {
    var o = gridOrigin(p);
    return { x: o.x + (c + 0.5) * CELL_SIZE, y: o.y + (r + 0.5) * CELL_SIZE };
  }

  function mouseToCell(p) {
    var o = gridOrigin(p);
    return {
      c: p.floor((p.mouseX - o.x) / CELL_SIZE),
      r: p.floor((p.mouseY - o.y) / CELL_SIZE),
    };
  }

  function visibleCellRange(p) {
    var o = gridOrigin(p);
    return {
      firstC: p.max(0, p.floor(-o.x / CELL_SIZE)),
      lastC: p.floor((p.width - o.x) / CELL_SIZE),
      firstR: p.max(0, p.floor(-o.y / CELL_SIZE)),
      lastR: p.floor((p.height - o.y) / CELL_SIZE),
    };
  }

  function fmtSvg(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(2);
  }

  function showPresetToast(message) {
    var el = document.getElementById("preset-toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(showPresetToast._t);
    showPresetToast._t = setTimeout(function () {
      el.classList.remove("visible");
    }, 2200);
  }

  function exportShapePreset() {
    var obj = {
      version: 2,
      cells: presetStops.map(function (s) {
        return { c: s.c, r: s.r };
      }),
    };
    var text = JSON.stringify(obj);
    var dump = document.getElementById("preset-dump");
    if (dump) {
      dump.value = text;
      dump.style.display = "block";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          showPresetToast("Copied shape JSON to clipboard.");
        },
        function () {
          showPresetToast("JSON shown below — copy manually if needed.");
        },
      );
    } else {
      showPresetToast("JSON shown below — copy manually.");
    }
  }

  function exportPresetSvg() {
    var p = iconsP5;
    if (!p || p.width <= 0 || p.height <= 0) return;
    var f = fmtSvg;
    var parts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
        f(p.width) +
        " " +
        f(p.height) +
        '" width="' +
        f(p.width) +
        '" height="' +
        f(p.height) +
        '">',
      "<title>Dots</title>",
      '<g id="dots" fill="#000000">',
    ];
    for (var j = 0; j < dots.length; j++) {
      var d = dots[j];
      parts.push(
        '<circle cx="' +
          f(d.x) +
          '" cy="' +
          f(d.y) +
          '" r="' +
          f(dotRadius) +
          '"/>',
      );
    }
    parts.push("</g>", "</svg>");
    var svg = parts.join("");
    var blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "dots.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showPresetToast("Downloaded dots.svg");
  }

  function iconsSketch(p) {
    p.setup = function () {
      var c = p.createCanvas(p.windowWidth, p.windowHeight);
      c.parent(container);
      c.id("canvas-icons");
      dots = [];
      for (var i = 0; i < DOT_COUNT; i++) {
        dots.push({
          x: p.random(dotRadius, p.max(dotRadius, p.width - dotRadius)),
          y: p.random(dotRadius, p.max(dotRadius, p.height - dotRadius)),
          angle: p.random(p.TWO_PI),
          speed: p.random(1, MAX_SPEED),
          noiseKey: p.random(2000),
          mode: "wander",
          targetX: 0,
          targetY: 0,
          cellC: 0,
          cellR: 0,
          nudgeX: 0,
          nudgeY: 0,
          wanderSpeed: p.random(WANDER_SPEED_MIN, WANDER_SPEED_MAX),
        });
      }
    };

    p.draw = function () {
      p.background(canvasBgR, canvasBgG, canvasBgB);

      if (showGrid) {
        var o = gridOrigin(p);
        p.noStroke();
        p.fill(MIDDLE_CELL_GRAY);
        p.square(
          o.x + GRID_REF_C * CELL_SIZE,
          o.y + GRID_REF_R * CELL_SIZE,
          CELL_SIZE,
        );

        var vis = visibleCellRange(p);
        p.stroke(200);
        p.strokeWeight(1);
        p.noFill();
        for (var rr = vis.firstR; rr <= vis.lastR; rr++) {
          for (var cc = vis.firstC; cc <= vis.lastC; cc++) {
            p.square(o.x + cc * CELL_SIZE, o.y + rr * CELL_SIZE, CELL_SIZE);
          }
        }

        if (presetStops.length > 0) {
          p.noStroke();
          p.fill(80, 160, 255, 55);
          for (var h = 0; h < presetStops.length; h++) {
            var st = presetStops[h];
            p.square(o.x + st.c * CELL_SIZE, o.y + st.r * CELL_SIZE, CELL_SIZE);
          }
        }
      }

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (d.mode === "seek") {
          var elapsed = p.millis() - d.seekStartedAt;
          var t =
            d.seekDurationMs <= 0 ? 1 : p.min(1, elapsed / d.seekDurationMs);
          if (t >= 1) {
            d.x = d.targetX;
            d.y = d.targetY;
            var nextMode = d.seekAfterMode === "wander" ? "wander" : "inCell";
            d.mode = nextMode;
            d.seekAfterMode = undefined;
            if (nextMode === "wander") {
              d.angle = p.random(p.TWO_PI);
              d.wanderSpeed = p.random(WANDER_SPEED_MIN, WANDER_SPEED_MAX);
            } else {
              d.angle = p.atan2(
                d.targetY - d.seekStartY,
                d.targetX - d.seekStartX,
              );
            }
          } else {
            var ep = easeSeekProgress(p, t);
            d.x = p.lerp(d.seekStartX, d.targetX, ep);
            d.y = p.lerp(d.seekStartY, d.targetY, ep);
            d.angle = p.atan2(d.targetY - d.y, d.targetX - d.x);
          }
        } else if (d.mode === "wander") {
          var tt = p.frameCount * WANDER_NOISE_TIME_SCALE;
          var steer =
            p.map(p.noise(d.noiseKey, tt), 0, 1, -1, 1) * WANDER_MAX_STEER;
          d.angle += steer;
          var ws = d.wanderSpeed;
          var vx = p.cos(d.angle) * ws;
          var vy = p.sin(d.angle) * ws;
          d.x += vx;
          d.y += vy;
          if (d.x < dotRadius) {
            d.x = dotRadius;
            vx *= -1;
          } else if (d.x > p.width - dotRadius) {
            d.x = p.width - dotRadius;
            vx *= -1;
          }
          if (d.y < dotRadius) {
            d.y = dotRadius;
            vy *= -1;
          } else if (d.y > p.height - dotRadius) {
            d.y = p.height - dotRadius;
            vy *= -1;
          }
          d.angle = p.atan2(vy, vx);
        }
      }

      var mx = p.mouseX,
        my = p.mouseY;
      var rad = CURSOR_INFLUENCE_RADIUS,
        maxPush = CURSOR_MAX_PUSH,
        ease = CURSOR_NUDGE_EASE;
      for (var j = 0; j < dots.length; j++) {
        var d = dots[j];
        var nvx = d.x - mx,
          nvy = d.y - my;
        var distSq = nvx * nvx + nvy * nvy;
        var tx = 0,
          ty = 0;
        if (distSq < rad * rad && distSq > 1e-6) {
          var dist = p.sqrt(distSq);
          var str = maxPush * (1 - dist / rad) * (1 - dist / rad);
          tx = (nvx / dist) * str;
          ty = (nvy / dist) * str;
        }
        d.nudgeX += (tx - d.nudgeX) * ease;
        d.nudgeY += (ty - d.nudgeY) * ease;
      }

      p.noStroke();
      p.fill(dotColorR, dotColorG, dotColorB);
      for (var k = 0; k < dots.length; k++) {
        var d = dots[k];
        p.circle(d.x + d.nudgeX, d.y + d.nudgeY, dotDiameter);
      }
    };

    p.windowResized = function () {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (d.mode === "inCell") {
          var center = cellCenter(p, d.cellC, d.cellR);
          d.x = center.x;
          d.y = center.y;
        } else {
          d.x = p.constrain(d.x, dotRadius, p.width - dotRadius);
          d.y = p.constrain(d.y, dotRadius, p.height - dotRadius);
        }
      }
    };

    p.keyPressed = function () {
      if (p.key === "h" || p.key === "H") {
        showGrid = !showGrid;
        return;
      }
      if (p.key === "s" || p.key === "S") {
        exportShapePreset();
        return;
      }
      if (p.key === "t" || p.key === "T") {
        exportPresetSvg();
        return;
      }
      if (p.key === "p" || p.key === "P") {
        window.animateDotsToPresets();
      }
    };

    p.mousePressed = function () {
      if (!showGrid) return;
      var cell = mouseToCell(p);
      var idx = presetStops.findIndex(function (s) {
        return s.c === cell.c && s.r === cell.r;
      });
      if (idx >= 0) {
        presetStops.splice(idx, 1);
      } else {
        presetStops.push({ c: cell.c, r: cell.r });
      }
    };
  }

  function init() {
    container = document.getElementById("canvas-icons");
    if (!container || typeof p5 === "undefined") return;
    iconsP5 = new p5(iconsSketch, container);
  }

  window.IconsCanvas = {
    show: function () {
      if (container) container.style.display = "block";
      if (iconsP5) {
        iconsP5.loop();
        iconsP5.resizeCanvas(window.innerWidth, window.innerHeight);
      }
    },
    hide: function () {
      if (iconsP5) iconsP5.noLoop();
      if (container) container.style.display = "none";
    },
    getBackgroundCss: function () {
      return "rgb(" + canvasBgR + "," + canvasBgG + "," + canvasBgB + ")";
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
