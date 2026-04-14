(function () {
  /* ===== constants ===== */
  var BASE_DOT_COUNT = 100;
  var DOT_DIAMETER = 10;
  var DOT_R = 5;
  var WANDER_MAX_STEER = 0.011;
  var WANDER_NOISE_TIME_SCALE = 0.0032;
  var WANDER_SPEED_MIN = 0.01;
  var WANDER_SPEED_MAX = 0.15;
  var SEEK_DURATION_MS = 900;
  var CURSOR_INFLUENCE_RADIUS = 110;
  var CURSOR_MAX_PUSH = 16;
  var CURSOR_NUDGE_EASE = 0.18;

  /* icon grid constants (matches icons canvas) */
  var CELL_SIZE = 15;
  var GRID_REF_C = 49;
  var GRID_REF_R = 27;

  /* halftone constants */
  var HALFTONE_SPACING = 4;
  var HALFTONE_MAX_DOT = 4;

  /* ===== module state ===== */
  var meshP5 = null;
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

  /* background image */
  var meshBgP5Image = null;
  var meshBgObjectUrl = null;
  var meshBgOverlayOpacity = 0.2;

  /* halftone images */
  var halftoneDefaultImg = null;
  var halftoneUserImg = null;
  var halftoneUserObjectUrl = null;

  /* icon shape data keyed by mesh button id */
  var iconShapes = {};

  /* ===== background / color utilities ===== */

  function drawMeshBgTintOverlay(p) {
    if (meshBgOverlayOpacity <= 0) return;
    var a = p.constrain(meshBgOverlayOpacity, 0, 1) * 255;
    p.push();
    p.noStroke();
    p.fill(state.bgR, state.bgG, state.bgB, a);
    p.rect(0, 0, p.width, p.height);
    p.pop();
  }

  function revokeMeshBgObjectUrl() {
    if (meshBgObjectUrl) {
      URL.revokeObjectURL(meshBgObjectUrl);
      meshBgObjectUrl = null;
    }
  }

  function drawMeshBackground(p) {
    p.background(state.bgR, state.bgG, state.bgB);
    if (!meshBgP5Image || !meshBgP5Image.width) return;
    var cw = p.width;
    var ch = p.height;
    var iw = meshBgP5Image.width;
    var ih = meshBgP5Image.height;
    if (iw <= 0 || ih <= 0) return;
    var scale = p.max(cw / iw, ch / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    var dx = (cw - dw) * 0.5;
    var dy = (ch - dh) * 0.5;
    p.image(meshBgP5Image, dx, dy, dw, dh);
  }

  function loadMeshBackgroundFromFile(file) {
    if (!file) return;
    var isImageType = file.type && file.type.startsWith("image/");
    var looksImage =
      isImageType || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || "");
    if (!looksImage) return;
    ensureInstance();
    if (!meshP5) return;
    revokeMeshBgObjectUrl();
    meshBgObjectUrl = URL.createObjectURL(file);
    meshP5.loadImage(
      meshBgObjectUrl,
      function (img) {
        meshBgP5Image = img;
      },
      function () {
        revokeMeshBgObjectUrl();
        meshBgP5Image = null;
      },
    );
  }

  function clearMeshBackgroundImage() {
    meshBgP5Image = null;
    revokeMeshBgObjectUrl();
    var input = document.getElementById("mesh-bg-image-upload");
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

  /* ===== window API ===== */

  window.setMeshDotColorHex = function (hex) {
    var rgb = parseHexRgb(hex);
    if (!rgb) return;
    state.dotR = rgb.r;
    state.dotG = rgb.g;
    state.dotB = rgb.b;
  };

  window.setMeshCanvasBackgroundHex = function (hex) {
    var rgb = parseHexRgb(hex);
    if (!rgb) return;
    state.bgR = rgb.r;
    state.bgG = rgb.g;
    state.bgB = rgb.b;
    if (isVisible) applyBodyBg(rgb.css);
  };

  /* ===== sketch ===== */

  function meshSketch(p) {
    var dots = [];
    var activePreset = "free";

    /* chart overlay layout objects */
    var heatGrid = null;
    var heatTextT0 = 0;
    var HEAT_TEXT_FADE_MS = 500;
    var barLayout = null;
    var barTextT0 = 0;
    var simpleBarLayout = null;
    var simpleBarTextT0 = 0;
    var dotPlotLayout = null;
    var dotPlotTextT0 = 0;
    var scatterLayout = null;
    var scatterTextT0 = 0;
    var beeswarmLayout = null;
    var beeswarmTextT0 = 0;
    var timelineLayout = null;
    var timelineTextT0 = 0;

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function makeDot(x, y, alpha, diam) {
      return {
        x: x,
        y: y,
        angle: p.random(p.TWO_PI),
        noiseKey: p.random(2000),
        wanderSpeed: p.random(WANDER_SPEED_MIN, WANDER_SPEED_MAX),
        nudgeX: 0,
        nudgeY: 0,
        mode: "wander",
        seekSX: 0,
        seekSY: 0,
        seekEX: 0,
        seekEY: 0,
        seekT0: 0,
        seekDur: SEEK_DURATION_MS,
        seekAfter: "wander",
        alpha: alpha,
        alphaFrom: alpha,
        alphaTo: alpha,
        alphaT0: 0,
        alphaDur: 0,
        diam: diam,
        diamFrom: diam,
        diamTo: diam,
        diamT0: 0,
        diamDur: 0,
      };
    }

    function initDots() {
      dots = [];
      for (var i = 0; i < BASE_DOT_COUNT; i++) {
        dots.push(
          makeDot(
            p.random(DOT_R, p.max(DOT_R, p.width - DOT_R)),
            p.random(DOT_R, p.max(DOT_R, p.height - DOT_R)),
            255,
            DOT_DIAMETER,
          ),
        );
      }
    }

    function ensureDotCount(n) {
      while (dots.length < n) {
        dots.push(
          makeDot(
            p.random(DOT_R, p.max(DOT_R, p.width - DOT_R)),
            p.random(DOT_R, p.max(DOT_R, p.height - DOT_R)),
            0,
            0,
          ),
        );
      }
    }

    function clearAllLayouts() {
      heatGrid = null;
      barLayout = null;
      simpleBarLayout = null;
      dotPlotLayout = null;
      scatterLayout = null;
      beeswarmLayout = null;
      timelineLayout = null;
    }

    /* ========== FREE FOR ALL ========== */

    function freeForAll() {
      activePreset = "free";
      clearAllLayouts();
      var now = p.millis();
      var base = Math.min(dots.length, BASE_DOT_COUNT);

      /* compute center-outward delay for a smooth wave */
      var cx = p.width / 2;
      var cy = p.height / 2;
      var farthest = 1;
      for (var fi = 0; fi < dots.length; fi++) {
        var fdx = dots[fi].x - cx;
        var fdy = dots[fi].y - cy;
        var fd = Math.sqrt(fdx * fdx + fdy * fdy);
        if (fd > farthest) farthest = fd;
      }

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        var ddx = d.x - cx;
        var ddy = d.y - cy;
        var delay = (Math.sqrt(ddx * ddx + ddy * ddy) / farthest) * 600;

        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekEX = p.random(DOT_R, p.max(DOT_R, p.width - DOT_R));
        d.seekEY = p.random(DOT_R, p.max(DOT_R, p.height - DOT_R));
        d.seekT0 = now + delay;
        d.seekDur = SEEK_DURATION_MS;
        if (i < base) {
          d.seekAfter = "wander";
          d.alphaFrom = d.alpha;
          d.alphaTo = 255;
          d.alphaT0 = now + delay;
          d.alphaDur = SEEK_DURATION_MS;
          d.diamFrom = d.diam;
          d.diamTo = DOT_DIAMETER;
          d.diamT0 = now + delay;
          d.diamDur = SEEK_DURATION_MS;
        } else {
          d.seekAfter = "dead";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now + delay;
          d.alphaDur = SEEK_DURATION_MS;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now + delay;
          d.diamDur = SEEK_DURATION_MS;
        }
      }
    }

    /* ========== ICON PRESETS ========== */

    function iconPreset(shapeData) {
      activePreset = "icon";
      clearAllLayouts();
      if (!shapeData) return;

      var cells = [];
      if (shapeData.cells && shapeData.cells.length > 0) {
        for (var ci = 0; ci < shapeData.cells.length; ci++) {
          var c = shapeData.cells[ci];
          cells.push({
            c: Math.round(Number(c.c)),
            r: Math.round(Number(c.r)),
          });
        }
      } else if (shapeData.norm && shapeData.norm.length > 0) {
        var gc =
          shapeData.grid && Number(shapeData.grid.cols) > 0
            ? Number(shapeData.grid.cols)
            : 98;
        var gr =
          shapeData.grid && Number(shapeData.grid.rows) > 0
            ? Number(shapeData.grid.rows)
            : 56;
        for (var ni = 0; ni < shapeData.norm.length; ni++) {
          var n = shapeData.norm[ni];
          var u = Number(n.u);
          var v = Number(n.v);
          if (Number.isFinite(u) && Number.isFinite(v)) {
            cells.push({ c: Math.floor(u * gc), r: Math.floor(v * gr) });
          }
        }
      }
      if (!cells.length) return;

      var now = p.millis();
      var presetDiam = DOT_DIAMETER;
      var used = cells.length;
      ensureDotCount(used);

      var ox = p.width / 2 - (GRID_REF_C + 0.5) * CELL_SIZE;
      var oy = p.height / 2 - (GRID_REF_R + 0.5) * CELL_SIZE;

      var positions = [];
      for (var pi = 0; pi < cells.length; pi++) {
        positions.push({
          x: ox + (cells[pi].c + 0.5) * CELL_SIZE,
          y: oy + (cells[pi].r + 0.5) * CELL_SIZE,
          alpha: 255,
          diam: presetDiam,
        });
      }

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (i >= used) {
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = d.x;
          d.seekEY = d.y;
          d.seekT0 = now;
          d.seekDur = 1;
          d.seekAfter = "dead";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now;
          d.alphaDur = 500;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now;
          d.diamDur = 500;
          continue;
        }
        var pos = positions[i];
        var delay = i * 10;
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekEX = pos.x;
        d.seekEY = pos.y;
        d.seekT0 = now + delay;
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "parked";
        d.diamFrom = d.diam;
        d.diamTo = pos.diam;
        d.diamT0 = now + delay;
        d.diamDur = SEEK_DURATION_MS;
        d.alphaFrom = d.alpha;
        d.alphaTo = pos.alpha;
        d.alphaT0 = now + delay;
        d.alphaDur = SEEK_DURATION_MS;
      }
    }

    /* ========== HALFTONE ========== */

    function halftoneGo() {
      activePreset = "halftone";
      clearAllLayouts();

      var imgEl = halftoneUserImg;
      var p5Img = halftoneDefaultImg;
      var sw, sh, drawFn;

      if (imgEl && imgEl.naturalWidth > 0) {
        sw = imgEl.naturalWidth;
        sh = imgEl.naturalHeight;
        drawFn = function (ctx, w, h) {
          ctx.drawImage(imgEl, 0, 0, w, h);
        };
      } else if (p5Img && p5Img.width > 0) {
        sw = p5Img.width;
        sh = p5Img.height;
        drawFn = function (ctx, w, h) {
          ctx.drawImage(p5Img.canvas, 0, 0, w, h);
        };
      } else {
        return;
      }

      var now = p.millis();

      var sc = p.min(p.width / sw, p.height / sh) * 0.6;
      var iw = sw * sc;
      var ih = sh * sc;
      var rx = (p.width - iw) / 2;
      var ry = (p.height - ih) / 2;

      var samplerCanvas = document.createElement("canvas");
      samplerCanvas.width = sw;
      samplerCanvas.height = sh;
      var samplerCtx = samplerCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      drawFn(samplerCtx, sw, sh);
      var px = samplerCtx.getImageData(0, 0, sw, sh).data;

      var spacing = HALFTONE_SPACING;
      var maxDot = HALFTONE_MAX_DOT;

      var positions = [];
      var half = spacing / 2;
      for (var gy = ry + half; gy < ry + ih; gy += spacing) {
        for (var gx = rx + half; gx < rx + iw; gx += spacing) {
          var ix = Math.max(0, Math.min(sw - 1, Math.floor((gx - rx) / sc)));
          var iy = Math.max(0, Math.min(sh - 1, Math.floor((gy - ry) / sc)));
          var idx = 4 * (iy * sw + ix);
          var lum =
            (0.299 * px[idx] + 0.587 * px[idx + 1] + 0.114 * px[idx + 2]) / 255;
          var dotDiam = (1 - lum) * maxDot;
          positions.push({
            x: gx,
            y: gy,
            alpha: 255,
            diam: Math.max(0, dotDiam),
          });
        }
      }

      var used = positions.length;
      ensureDotCount(used);

      var cx = p.width / 2;
      var cy = p.height / 2;
      var farthest = 1;
      for (var fi = 0; fi < used; fi++) {
        var ddx = positions[fi].x - cx;
        var ddy = positions[fi].y - cy;
        var dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd > farthest) farthest = dd;
      }

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (i >= used) {
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = d.x;
          d.seekEY = d.y;
          d.seekT0 = now;
          d.seekDur = 1;
          d.seekAfter = "dead";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now;
          d.alphaDur = 500;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now;
          d.diamDur = 500;
          continue;
        }
        var pos = positions[i];
        var pdx = pos.x - cx;
        var pdy = pos.y - cy;
        var delay = (Math.sqrt(pdx * pdx + pdy * pdy) / farthest) * 500;
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekEX = pos.x;
        d.seekEY = pos.y;
        d.seekT0 = now + delay;
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "parked";
        d.diamFrom = d.diam;
        d.diamTo = pos.diam;
        d.diamT0 = now + delay;
        d.diamDur = SEEK_DURATION_MS;
        d.alphaFrom = d.alpha;
        d.alphaTo = pos.alpha;
        d.alphaT0 = now + delay;
        d.alphaDur = SEEK_DURATION_MS;
      }
    }

    /* ========== DATAVIS: STACKED BAR ========== */

    function barGraph() {
      activePreset = "bargraph";
      clearAllLayouts();
      if (!dots.length) return;
      var now = p.millis();
      var presetDiam = 10;
      var sp = presetDiam + 3;
      var dimAlpha = 100;
      var yMin = 20;
      var yMax = 180;
      var yRange = yMax - yMin;
      var maxRows = 32;
      var kwhPerRow = yRange / maxRows;

      var barsData = [
        { label: "Code\nMinimum", total: 155, base: 72 },
        { label: "Heartwood\nProject", total: 93, base: 55 },
        { label: "Heartwood\nw/ Solar", total: 87, base: 28 },
      ];
      var bars = [];
      for (var bd = 0; bd < barsData.length; bd++) {
        bars.push({
          label: barsData[bd].label,
          totalRows: Math.round((barsData[bd].total - yMin) / kwhPerRow),
          baseRows: Math.round((barsData[bd].base - yMin) / kwhPerRow),
        });
      }
      var barWidth = 5;
      var barGap = sp * 2.5;

      var singleBarW = (barWidth - 1) * sp;
      var totalW = bars.length * singleBarW + (bars.length - 1) * barGap;
      var totalH = (maxRows - 1) * sp;
      var baseX = (p.width - totalW) / 2;
      var baseY = (p.height + totalH) / 2;

      var positions = [];
      for (var bi = 0; bi < bars.length; bi++) {
        var bx = baseX + bi * (singleBarW + barGap);
        var bar = bars[bi];
        for (var row = 0; row < bar.totalRows; row++) {
          for (var col = 0; col < barWidth; col++) {
            var isBase = row < bar.baseRows;
            positions.push({
              x: bx + col * sp,
              y: baseY - row * sp,
              alpha: isBase ? dimAlpha : 255,
              barIdx: bi,
            });
          }
        }
      }

      var used = positions.length;
      ensureDotCount(used);

      var barCenters = [];
      for (var bi2 = 0; bi2 < bars.length; bi2++) {
        barCenters.push(baseX + bi2 * (singleBarW + barGap) + singleBarW / 2);
      }

      barLayout = {
        ox: baseX,
        oy: baseY - totalH,
        cols: bars.length,
        rows: maxRows,
        spacing: sp,
        presetDiam: presetDiam,
        gridW: totalW,
        gridH: totalH,
        colLabels: bars.map(function (b) {
          return b.label;
        }),
        barCenters: barCenters,
        dimAlpha: dimAlpha,
        baseY: baseY,
        yMin: yMin,
        yMax: yMax,
        legendLabels: ["TEUI", "Utility Cost"],
      };
      barTextT0 = now + used * 5 + SEEK_DURATION_MS;

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (i >= used) {
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = d.x;
          d.seekEY = d.y;
          d.seekT0 = now;
          d.seekDur = 1;
          d.seekAfter = "dead";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now;
          d.alphaDur = 500;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now;
          d.diamDur = 500;
          continue;
        }
        var pos = positions[i];
        var delay = i * 5;
        d.diamFrom = d.diam;
        d.diamTo = presetDiam;
        d.diamT0 = now + delay;
        d.diamDur = SEEK_DURATION_MS;
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekEX = pos.x;
        d.seekEY = pos.y;
        d.seekT0 = now + delay;
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "parked";
        d.alphaFrom = d.alpha;
        d.alphaTo = pos.alpha;
        d.alphaT0 = now + delay;
        d.alphaDur = SEEK_DURATION_MS;
      }
    }

    /* ========== DATAVIS: SIMPLE BAR ========== */

    function simpleBar() {
      activePreset = "simplebar";
      clearAllLayouts();
      if (!dots.length) return;
      var now = p.millis();
      var presetDiam = 20;
      var cols = 10;
      var rows = 10;
      var used = cols * rows;
      var spacing = presetDiam + 6;
      var gridW = (cols - 1) * spacing;
      var gridH = (rows - 1) * spacing;
      var ox = (p.width - gridW) / 2;
      var oy = (p.height - gridH) / 2;
      var dimAlpha = 51;

      var colLabels = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
      ];

      simpleBarLayout = {
        ox: ox,
        oy: oy,
        cols: cols,
        rows: rows,
        spacing: spacing,
        presetDiam: presetDiam,
        gridW: gridW,
        gridH: gridH,
        colLabels: colLabels,
        dimAlpha: dimAlpha,
      };
      simpleBarTextT0 = now + (used - 1) * 8 + SEEK_DURATION_MS;

      var barHeights = [];
      for (var c = 0; c < cols; c++) {
        barHeights.push(Math.floor(p.random(1, rows + 1)));
      }

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (i >= used) {
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = d.x;
          d.seekEY = d.y;
          d.seekT0 = now;
          d.seekDur = 1;
          d.seekAfter = "dead";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now;
          d.alphaDur = 500;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now;
          d.diamDur = 500;
          continue;
        }
        var col = i % cols;
        var row = Math.floor(i / cols);
        d.diamFrom = d.diam;
        d.diamTo = presetDiam;
        d.diamT0 = now + i * 8;
        d.diamDur = SEEK_DURATION_MS;
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekEX = ox + col * spacing;
        d.seekEY = oy + row * spacing;
        d.seekT0 = now + i * 8;
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "parked";
        var filledFromBottom = barHeights[col];
        var rowFromBottom = rows - 1 - row;
        var targetAlpha = rowFromBottom < filledFromBottom ? 255 : dimAlpha;
        d.alphaFrom = d.alpha;
        d.alphaTo = targetAlpha;
        d.alphaT0 = now + i * 8;
        d.alphaDur = SEEK_DURATION_MS;
      }
    }

    /* ========== DATAVIS: HEATMAP ========== */

    function heatmap() {
      activePreset = "heatmap";
      clearAllLayouts();
      var target = 240;
      ensureDotCount(target);
      var count = dots.length;
      if (!count) return;
      var now = p.millis();

      var rows = 7;
      var cols = Math.ceil(target / rows);
      var presetDiam = 14;
      var spacing = presetDiam + 3;
      var gridW = (cols - 1) * spacing;
      var gridH = (rows - 1) * spacing;
      var ox = (p.width - gridW) / 2;
      var oy = (p.height - gridH) / 2;

      heatGrid = {
        ox: ox,
        oy: oy,
        cols: cols,
        rows: rows,
        spacing: spacing,
        presetDiam: presetDiam,
        gridW: gridW,
        gridH: gridH,
      };
      heatTextT0 = now + (cols - 1) * 40 + SEEK_DURATION_MS;

      var levels = [38, 90, 150, 210, 255];
      var weights = [0.3, 0.25, 0.2, 0.15, 0.1];

      function pickLevel() {
        var r = Math.random();
        var cum = 0;
        for (var l = 0; l < weights.length; l++) {
          cum += weights[l];
          if (r < cum) return levels[l];
        }
        return levels[levels.length - 1];
      }

      for (var i = 0; i < count; i++) {
        var d = dots[i];
        if (i < target) {
          var col = Math.floor(i / rows);
          var row = i % rows;
          var delay = col * 40;
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = ox + col * spacing;
          d.seekEY = oy + row * spacing;
          d.seekT0 = now + delay;
          d.seekDur = SEEK_DURATION_MS;
          d.seekAfter = "parked";
          d.diamFrom = d.diam;
          d.diamTo = presetDiam;
          d.diamT0 = now + delay;
          d.diamDur = SEEK_DURATION_MS;
          var targetAlpha = pickLevel();
          d.alphaFrom = d.alpha;
          d.alphaTo = targetAlpha;
          d.alphaT0 = now + delay;
          d.alphaDur = SEEK_DURATION_MS;
        } else {
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = d.x;
          d.seekEY = d.y;
          d.seekT0 = now;
          d.seekDur = 1;
          d.seekAfter = "parked";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now;
          d.alphaDur = 500;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now;
          d.diamDur = 500;
        }
      }
    }

    /* ========== DATAVIS: DOT PLOT ========== */

    function dotPlot() {
      activePreset = "dotplot";
      clearAllLayouts();
      if (!dots.length) return;
      var now = p.millis();

      var categories = [
        { label: "Heating", before: 68, after: 22 },
        { label: "Cooling", before: 42, after: 18 },
        { label: "Lighting", before: 35, after: 12 },
        { label: "Hot Water", before: 28, after: 15 },
        { label: "Ventilation", before: 22, after: 8 },
        { label: "Plug Loads", before: 18, after: 14 },
        { label: "Envelope Loss", before: 45, after: 10 },
      ];

      var presetDiam = 8;
      var connectorDiam = 5;
      var connectorSpacing = connectorDiam + 3;
      var rowHeight = 28;
      var xMin = 0;
      var xMax = 80;

      var chartH = (categories.length - 1) * rowHeight;
      var chartW = 320;
      var ox = (p.width - chartW) / 2 + 60;
      var oy = (p.height - chartH) / 2;

      var positions = [];
      for (var ci = 0; ci < categories.length; ci++) {
        var cat = categories[ci];
        var cy = oy + ci * rowHeight;
        var ax = ox + ((cat.after - xMin) / (xMax - xMin)) * chartW;
        var bx = ox + ((cat.before - xMin) / (xMax - xMin)) * chartW;
        positions.push({ x: ax, y: cy, alpha: 255, diam: presetDiam });
        var gap = bx - ax;
        var nFill = Math.max(0, Math.floor(gap / connectorSpacing) - 1);
        for (var fi = 1; fi <= nFill; fi++) {
          positions.push({
            x: ax + fi * connectorSpacing,
            y: cy,
            alpha: 60,
            diam: connectorDiam,
          });
        }
        positions.push({ x: bx, y: cy, alpha: 100, diam: presetDiam });
      }

      var used = positions.length;
      ensureDotCount(used);

      dotPlotLayout = {
        ox: ox,
        oy: oy,
        chartW: chartW,
        chartH: chartH,
        rowHeight: rowHeight,
        presetDiam: presetDiam,
        categories: categories,
        xMin: xMin,
        xMax: xMax,
        legendLabels: ["Code Minimum", "Heartwood"],
      };
      dotPlotTextT0 = now + used * 12 + SEEK_DURATION_MS;

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (i >= used) {
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = d.x;
          d.seekEY = d.y;
          d.seekT0 = now;
          d.seekDur = 1;
          d.seekAfter = "dead";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now;
          d.alphaDur = 500;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now;
          d.diamDur = 500;
          continue;
        }
        var pos = positions[i];
        var delay = i * 12;
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekEX = pos.x;
        d.seekEY = pos.y;
        d.seekT0 = now + delay;
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "parked";
        d.diamFrom = d.diam;
        d.diamTo = pos.diam;
        d.diamT0 = now + delay;
        d.diamDur = SEEK_DURATION_MS;
        d.alphaFrom = d.alpha;
        d.alphaTo = pos.alpha;
        d.alphaT0 = now + delay;
        d.alphaDur = SEEK_DURATION_MS;
      }
    }

    /* ========== DATAVIS: SCATTER PLOT ========== */

    function scatterPlot() {
      activePreset = "scatter";
      clearAllLayouts();
      if (!dots.length) return;
      var now = p.millis();

      var xMin = 15000;
      var xMax = 42000;
      var yMin = 0;
      var yMax = 1;
      var marginL = 72;
      var marginR = 40;
      var marginT = 48;
      var marginB = 88;
      var maxChartW = 540;
      var maxChartH = 360;
      var availW = p.width - marginL - marginR;
      var availH = p.height - marginT - marginB;
      var chartW = p.max(240, p.min(maxChartW, availW));
      var chartH = p.max(200, p.min(maxChartH, availH));
      var ox = (p.width - chartW) / 2;
      var oy = (p.height - chartH) / 2;

      var n = BASE_DOT_COUNT;
      var pairs = [];
      for (var pi = 0; pi < n; pi++) {
        var inc = p.random(15500, 39500);
        var t = (inc - xMin) / (xMax - xMin);
        var baseY = 0.14 + t * 0.72;
        var noise =
          typeof p.randomGaussian === "function"
            ? p.randomGaussian(0, 0.11)
            : (p.random() - 0.5) * 0.26;
        var health = p.constrain(baseY + noise, 0.03, 0.99);
        pairs.push({ x: inc, y: health });
      }

      function dataToPx(dx, dy) {
        return {
          px: ox + ((dx - xMin) / (xMax - xMin)) * chartW,
          py: oy + (1 - (dy - yMin) / (yMax - yMin)) * chartH,
        };
      }

      var positions = [];
      var presetDiam = 9;
      for (var si = 0; si < n; si++) {
        var pt = dataToPx(pairs[si].x, pairs[si].y);
        positions.push({ x: pt.px, y: pt.py, alpha: 255, diam: presetDiam });
      }

      var used = positions.length;

      var xTicks = [15000, 20000, 25000, 30000, 35000, 40000];
      var yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];

      scatterLayout = {
        ox: ox,
        oy: oy,
        chartW: chartW,
        chartH: chartH,
        xMin: xMin,
        xMax: xMax,
        yMin: yMin,
        yMax: yMax,
        xTicks: xTicks,
        yTicks: yTicks,
        xLabel: "Income",
        yLabel: "Metro Health Index",
      };
      scatterTextT0 = now + used * 6 + SEEK_DURATION_MS;

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (i >= used) {
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = d.x;
          d.seekEY = d.y;
          d.seekT0 = now;
          d.seekDur = 1;
          d.seekAfter = "dead";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now;
          d.alphaDur = 500;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now;
          d.diamDur = 500;
          continue;
        }
        var pos = positions[i];
        var delay = i * 6;
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekEX = pos.x;
        d.seekEY = pos.y;
        d.seekT0 = now + delay;
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "parked";
        d.diamFrom = d.diam;
        d.diamTo = pos.diam;
        d.diamT0 = now + delay;
        d.diamDur = SEEK_DURATION_MS;
        d.alphaFrom = d.alpha;
        d.alphaTo = pos.alpha;
        d.alphaT0 = now + delay;
        d.alphaDur = SEEK_DURATION_MS;
      }
    }

    /* ========== DATAVIS: BEESWARM ========== */

    function beeswarmChart() {
      activePreset = "beeswarm";
      clearAllLayouts();
      if (!dots.length) return;
      var now = p.millis();

      var yMin = -3;
      var yMax = 3;
      var yRange = yMax - yMin;
      var marginL = 72;
      var marginR = 40;
      var marginT = 48;
      var marginB = 88;
      var maxChartW = 520;
      var maxChartH = 340;
      var availW = p.width - marginL - marginR;
      var availH = p.height - marginT - marginB;
      var chartW = p.max(240, p.min(maxChartW, availW));
      var chartH = p.max(200, p.min(maxChartH, availH));
      var ox = (p.width - chartW) / 2;
      var oy = (p.height - chartH) / 2;

      function yDataToPy(yv) {
        return oy + (1 - (yv - yMin) / yRange) * chartH;
      }

      var groupDefs = [
        { count: 56, mean: -0.22, sd: 0.92 },
        { count: 56, mean: 0.38, sd: 0.82 },
        { count: 56, mean: 0.06, sd: 1.02 },
      ];
      var groupLabels = ["G1", "G2", "G3"];
      var presetDiam = 8;
      var minDistSq = (presetDiam + 1.6) * (presetDiam + 1.6);
      var step = presetDiam * 0.58;
      var maxHorz = p.max(step * 10, chartW / 5.2 - presetDiam * 0.35);

      var colCenters = [];
      var gi;
      for (gi = 0; gi < 3; gi++) {
        colCenters.push(ox + chartW * ((gi + 0.5) / 3));
      }

      var positions = [];
      for (gi = 0; gi < 3; gi++) {
        var cx = colCenters[gi];
        var gdef = groupDefs[gi];
        var bucket = [];
        var ii;
        for (ii = 0; ii < gdef.count; ii++) {
          var yv =
            typeof p.randomGaussian === "function"
              ? gdef.mean + p.randomGaussian(0, gdef.sd)
              : gdef.mean + (p.random() - 0.5) * 2.4 * gdef.sd;
          yv = p.constrain(yv, yMin, yMax);
          bucket.push({ yv: yv });
        }
        bucket.sort(function (a, b) {
          return b.yv - a.yv;
        });

        var placed = [];
        for (ii = 0; ii < bucket.length; ii++) {
          var py = yDataToPy(bucket[ii].yv);
          var placedDot = false;
          var tries = [0];
          var ring;
          for (ring = 1; ring <= 48; ring++) {
            tries.push(ring * step);
            tries.push(-ring * step);
          }
          var ti;
          for (ti = 0; ti < tries.length; ti++) {
            var rawX = cx + tries[ti];
            var tx = p.constrain(rawX, cx - maxHorz, cx + maxHorz);
            var clash = false;
            var pj;
            for (pj = 0; pj < placed.length; pj++) {
              var dx = tx - placed[pj].x;
              var dy = py - placed[pj].y;
              if (dx * dx + dy * dy < minDistSq) {
                clash = true;
                break;
              }
            }
            if (!clash) {
              placed.push({ x: tx, y: py });
              positions.push({
                x: tx,
                y: py,
                alpha: 255,
                diam: presetDiam,
              });
              placedDot = true;
              break;
            }
          }
          if (!placedDot) {
            placed.push({ x: cx, y: py });
            positions.push({
              x: cx,
              y: py,
              alpha: 255,
              diam: presetDiam,
            });
          }
        }
      }

      var used = positions.length;
      ensureDotCount(used);
      var yTicks = [-3, -2, -1, 0, 1, 2, 3];

      beeswarmLayout = {
        ox: ox,
        oy: oy,
        chartW: chartW,
        chartH: chartH,
        yMin: yMin,
        yMax: yMax,
        yTicks: yTicks,
        colCenters: colCenters,
        groupLabels: groupLabels,
      };
      beeswarmTextT0 = now + used * 5 + SEEK_DURATION_MS;

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (i >= used) {
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = d.x;
          d.seekEY = d.y;
          d.seekT0 = now;
          d.seekDur = 1;
          d.seekAfter = "dead";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now;
          d.alphaDur = 500;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now;
          d.diamDur = 500;
          continue;
        }
        var pos = positions[i];
        var delay = i * 5;
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekEX = pos.x;
        d.seekEY = pos.y;
        d.seekT0 = now + delay;
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "parked";
        d.diamFrom = d.diam;
        d.diamTo = pos.diam;
        d.diamT0 = now + delay;
        d.diamDur = SEEK_DURATION_MS;
        d.alphaFrom = d.alpha;
        d.alphaTo = pos.alpha;
        d.alphaT0 = now + delay;
        d.alphaDur = SEEK_DURATION_MS;
      }
    }

    /* ========== DATAVIS: TIMELINE ========== */

    function timelineChart() {
      activePreset = "timeline";
      clearAllLayouts();
      if (!dots.length) return;
      var now = p.millis();

      var milestones = [
        { t: 0, label: "Site" },
        { t: 0.2, label: "Design" },
        { t: 0.45, label: "Permitting" },
        { t: 0.7, label: "Construction" },
        { t: 1, label: "Occupancy" },
      ];

      var lineW = p.min(560, p.width - 96);
      var xStart = (p.width - lineW) * 0.5;
      var xEnd = xStart + lineW;
      var cy = p.height * 0.5;
      var smallDiam = 5;
      var bigDiam = 13;
      var dimAlpha = 78;
      var sp = smallDiam + 3;
      var rb = bigDiam * 0.5;
      var rs = smallDiam * 0.5;
      var gapBigSmall = 3.5;

      var mx = [];
      var mi;
      for (mi = 0; mi < milestones.length; mi++) {
        mx.push(xStart + milestones[mi].t * lineW);
      }

      var edgeFromBig = rb + gapBigSmall + rs;

      function fillSegment(left, right) {
        if (right - left < rs) return;
        var count = Math.max(1, Math.round((right - left) / sp) + 1);
        for (var k = 0; k < count; k++) {
          var xp =
            count === 1
              ? (left + right) * 0.5
              : left + (right - left) * (k / (count - 1));
          positions.push({
            x: xp,
            y: cy,
            alpha: dimAlpha,
            diam: smallDiam,
          });
        }
      }

      var positions = [];

      fillSegment(xStart + rs + 2, mx[0] - edgeFromBig);

      for (mi = 0; mi < milestones.length - 1; mi++) {
        fillSegment(mx[mi] + edgeFromBig, mx[mi + 1] - edgeFromBig);
      }

      fillSegment(mx[milestones.length - 1] + edgeFromBig, xEnd - rs - 2);

      for (mi = 0; mi < milestones.length; mi++) {
        positions.push({
          x: mx[mi],
          y: cy,
          alpha: 255,
          diam: bigDiam,
        });
      }

      positions.sort(function (a, b) {
        if (a.x !== b.x) return a.x - b.x;
        return a.diam - b.diam;
      });

      var used = positions.length;
      ensureDotCount(used);

      var labelY = cy + rb + 12;
      var milestoneDraw = [];
      for (mi = 0; mi < milestones.length; mi++) {
        milestoneDraw.push({
          x: mx[mi],
          y: labelY,
          label: milestones[mi].label,
        });
      }

      timelineLayout = { milestones: milestoneDraw };
      timelineTextT0 = now + used * 8 + SEEK_DURATION_MS;

      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (i >= used) {
          d.mode = "seek";
          d.seekSX = d.x;
          d.seekSY = d.y;
          d.seekEX = d.x;
          d.seekEY = d.y;
          d.seekT0 = now;
          d.seekDur = 1;
          d.seekAfter = "dead";
          d.alphaFrom = d.alpha;
          d.alphaTo = 0;
          d.alphaT0 = now;
          d.alphaDur = 500;
          d.diamFrom = d.diam;
          d.diamTo = 0;
          d.diamT0 = now;
          d.diamDur = 500;
          continue;
        }
        var pos = positions[i];
        var delay = i * 8;
        d.mode = "seek";
        d.seekSX = d.x;
        d.seekSY = d.y;
        d.seekEX = pos.x;
        d.seekEY = pos.y;
        d.seekT0 = now + delay;
        d.seekDur = SEEK_DURATION_MS;
        d.seekAfter = "parked";
        d.diamFrom = d.diam;
        d.diamTo = pos.diam;
        d.diamT0 = now + delay;
        d.diamDur = SEEK_DURATION_MS;
        d.alphaFrom = d.alpha;
        d.alphaTo = pos.alpha;
        d.alphaT0 = now + delay;
        d.alphaDur = SEEK_DURATION_MS;
      }
    }

    /* ========== WINDOW EXPORTS ========== */

    window.meshFreeForAll = freeForAll;
    window.meshIconPreset = iconPreset;
    window.meshHalftoneGo = halftoneGo;
    window.meshBarGraph = barGraph;
    window.meshSimpleBar = simpleBar;
    window.meshHeatmap = heatmap;
    window.meshDotPlot = dotPlot;
    window.meshScatterPlot = scatterPlot;
    window.meshBeeswarm = beeswarmChart;
    window.meshTimeline = timelineChart;

    /* ========== P5 LIFECYCLE ========== */

    p.preload = function () {
      halftoneDefaultImg = p.loadImage("assets/images/h-image.jpg");
    };

    p.setup = function () {
      var c = p.createCanvas(p.windowWidth, p.windowHeight);
      c.parent(container);
      c.id("mesh-p5");
      p.pixelDensity(Math.min(p.displayDensity(), 3));
      p.noStroke();
      initDots();
    };

    p.draw = function () {
      drawMeshBackground(p);
      drawMeshBgTintOverlay(p);

      var now = p.millis();
      var t = p.frameCount * WANDER_NOISE_TIME_SCALE;

      /* --- update positions --- */
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (d.mode === "wander") {
          var steer =
            p.map(p.noise(d.noiseKey, t), 0, 1, -1, 1) * WANDER_MAX_STEER;
          d.angle += steer;
          var ws = d.wanderSpeed;
          var vx = p.cos(d.angle) * ws;
          var vy = p.sin(d.angle) * ws;
          d.x += vx;
          d.y += vy;
          if (d.x < DOT_R) {
            d.x = DOT_R;
            vx *= -1;
          } else if (d.x > p.width - DOT_R) {
            d.x = p.width - DOT_R;
            vx *= -1;
          }
          if (d.y < DOT_R) {
            d.y = DOT_R;
            vy *= -1;
          } else if (d.y > p.height - DOT_R) {
            d.y = p.height - DOT_R;
            vy *= -1;
          }
          d.angle = p.atan2(vy, vx);
        } else if (d.mode === "seek") {
          var elapsed = now - d.seekT0;
          if (elapsed >= d.seekDur) {
            d.x = d.seekEX;
            d.y = d.seekEY;
            d.mode = d.seekAfter || "wander";
          } else if (elapsed > 0) {
            var u = easeInOutCubic(elapsed / d.seekDur);
            d.x = d.seekSX + (d.seekEX - d.seekSX) * u;
            d.y = d.seekSY + (d.seekEY - d.seekSY) * u;
          }
        }
      }

      /* --- cursor repulsion --- */
      var cmx = p.mouseX;
      var cmy = p.mouseY;
      var rad = CURSOR_INFLUENCE_RADIUS;
      var ease = CURSOR_NUDGE_EASE;
      for (var j = 0; j < dots.length; j++) {
        var d = dots[j];
        var nvx = d.x - cmx;
        var nvy = d.y - cmy;
        var distSq = nvx * nvx + nvy * nvy;
        var tx = 0;
        var ty = 0;
        if (distSq < rad * rad && distSq > 1e-6) {
          var dist = p.sqrt(distSq);
          var str = CURSOR_MAX_PUSH * (1 - dist / rad) * (1 - dist / rad);
          tx = (nvx / dist) * str;
          ty = (nvy / dist) * str;
        }
        d.nudgeX += (tx - d.nudgeX) * ease;
        d.nudgeY += (ty - d.nudgeY) * ease;
      }

      /* --- alpha / diam interpolation + draw --- */
      for (var k = 0; k < dots.length; k++) {
        var d = dots[k];
        if (d.alphaDur > 0) {
          var ae = now - d.alphaT0;
          if (ae >= d.alphaDur) {
            d.alpha = d.alphaTo;
            d.alphaDur = 0;
          } else if (ae > 0) {
            d.alpha =
              d.alphaFrom +
              (d.alphaTo - d.alphaFrom) * easeInOutCubic(ae / d.alphaDur);
          }
        }
        if (d.diamDur > 0) {
          var de = now - d.diamT0;
          if (de >= d.diamDur) {
            d.diam = d.diamTo;
            d.diamDur = 0;
          } else if (de > 0) {
            d.diam =
              d.diamFrom +
              (d.diamTo - d.diamFrom) * easeInOutCubic(de / d.diamDur);
          }
        }
        if (d.diam > 0.3) {
          p.fill(state.dotR, state.dotG, state.dotB, d.alpha);
          p.circle(d.x + d.nudgeX, d.y + d.nudgeY, d.diam);
        }
      }

      /* ========== CHART OVERLAYS ========== */

      /* --- heatmap labels --- */
      if (activePreset === "heatmap" && heatGrid) {
        var fadeElapsed = now - heatTextT0;
        if (fadeElapsed > 0) {
          var fadeT =
            fadeElapsed >= HEAT_TEXT_FADE_MS
              ? 1
              : easeInOutCubic(fadeElapsed / HEAT_TEXT_FADE_MS);
          var g = heatGrid;
          var heatLabelPad = 8;
          var labelAlpha = 255 * fadeT;
          var labelSize = 11;
          p.textFont("sans-serif");
          p.textSize(labelSize);
          p.noStroke();

          var dayLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
          p.textAlign(p.RIGHT, p.CENTER);
          p.fill(state.dotR, state.dotG, state.dotB, labelAlpha);
          for (var di = 0; di < g.rows; di++) {
            if (dayLabels[di]) {
              p.text(
                dayLabels[di],
                g.ox - g.presetDiam - heatLabelPad,
                g.oy + di * g.spacing,
              );
            }
          }

          var months = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];
          var colsPerMonth = g.cols / 12;
          p.textAlign(p.LEFT, p.BOTTOM);
          for (var mi = 0; mi < 12; mi++) {
            var mc = Math.round(mi * colsPerMonth);
            if (mc < g.cols) {
              p.text(
                months[mi],
                g.ox + mc * g.spacing - 2,
                g.oy - g.presetDiam - heatLabelPad,
              );
            }
          }

          var legendY = g.oy + g.gridH + g.presetDiam * 2.5 + heatLabelPad;
          var legendRight = g.ox + g.gridW + g.presetDiam / 2;
          var legendDotSize = 10;
          var legendGap = legendDotSize + 3;
          var legendLevels = [38, 90, 150, 210, 255];
          var hx = legendRight;
          p.textAlign(p.RIGHT, p.CENTER);
          p.fill(state.dotR, state.dotG, state.dotB, labelAlpha);
          p.text("More", hx, legendY);
          hx -= p.textWidth("More") + 10;
          hx -= legendDotSize / 2;
          for (var hli = legendLevels.length - 1; hli >= 0; hli--) {
            p.fill(
              state.dotR,
              state.dotG,
              state.dotB,
              legendLevels[hli] * fadeT,
            );
            p.circle(hx, legendY, legendDotSize);
            hx -= legendGap;
          }
          hx -= legendDotSize / 2 + 10;
          p.fill(state.dotR, state.dotG, state.dotB, labelAlpha);
          p.text("Less", hx, legendY);
        }
      }

      /* --- stacked bar labels --- */
      if (activePreset === "bargraph" && barLayout) {
        var barFadeElapsed = now - barTextT0;
        if (barFadeElapsed > 0) {
          var barFadeT =
            barFadeElapsed >= HEAT_TEXT_FADE_MS
              ? 1
              : easeInOutCubic(barFadeElapsed / HEAT_TEXT_FADE_MS);
          var b = barLayout;
          var barLabelPad = 22;
          var barLabelAlpha = 255 * barFadeT;
          var barLabelSize = 10;
          var legDot = 10;
          var legTextGap = 8;
          var legRowStep = legDot + 5;
          var legendAbovePad = 32;
          p.textFont("sans-serif");
          p.textSize(barLabelSize);
          p.noStroke();

          var legLeft = b.ox - b.presetDiam / 2;
          var dotCx = legLeft + legDot / 2;
          var textX = legLeft + legDot + legTextGap;
          var legRow1Y = b.oy - legendAbovePad - legRowStep;
          var legRow2Y = b.oy - legendAbovePad;

          p.textAlign(p.LEFT, p.CENTER);
          p.fill(state.dotR, state.dotG, state.dotB, 255 * barFadeT);
          p.circle(dotCx, legRow1Y, legDot);
          p.fill(state.dotR, state.dotG, state.dotB, barLabelAlpha);
          p.text(b.legendLabels[0], textX, legRow1Y);

          p.fill(state.dotR, state.dotG, state.dotB, b.dimAlpha * barFadeT);
          p.circle(dotCx, legRow2Y, legDot);
          p.fill(state.dotR, state.dotG, state.dotB, barLabelAlpha);
          p.text(b.legendLabels[1], textX, legRow2Y);

          var axisLeft = b.ox - b.presetDiam / 2;
          var axisRight = b.ox + b.gridW + b.presetDiam / 2;
          var yAxisPad = 14;
          var yTicks = [20, 40, 60, 80, 100, 120, 140, 160, 180];
          var pxPerUnit = b.gridH / (b.yMax - b.yMin);
          p.textAlign(p.RIGHT, p.CENTER);
          p.textSize(barLabelSize);
          for (var yt = 0; yt < yTicks.length; yt++) {
            var yy = b.baseY - (yTicks[yt] - b.yMin) * pxPerUnit;
            p.stroke(state.dotR, state.dotG, state.dotB, 40 * barFadeT);
            p.strokeWeight(1);
            p.line(axisLeft, yy, axisRight, yy);
            p.noStroke();
            p.fill(state.dotR, state.dotG, state.dotB, barLabelAlpha);
            p.text(String(yTicks[yt]), axisLeft - yAxisPad, yy);
          }

          p.push();
          p.translate(axisLeft - yAxisPad - 36, b.baseY - b.gridH / 2);
          p.rotate(-p.HALF_PI);
          p.textAlign(p.CENTER, p.CENTER);
          p.fill(state.dotR, state.dotG, state.dotB, barLabelAlpha);
          p.textSize(barLabelSize);
          p.text("kWh/m\u00B2 year", 0, 0);
          p.pop();

          p.fill(state.dotR, state.dotG, state.dotB, barLabelAlpha);
          p.noStroke();
          p.textAlign(p.CENTER, p.TOP);
          p.textSize(barLabelSize);
          for (var bc = 0; bc < b.cols; bc++) {
            var lines = b.colLabels[bc].split("\n");
            for (var ln = 0; ln < lines.length; ln++) {
              p.text(
                lines[ln],
                b.barCenters[bc],
                b.baseY + barLabelPad + ln * (barLabelSize + 4),
              );
            }
          }
        }
      }

      /* --- simple bar labels --- */
      if (activePreset === "simplebar" && simpleBarLayout) {
        var sbFadeEl = now - simpleBarTextT0;
        if (sbFadeEl > 0) {
          var sbFadeT =
            sbFadeEl >= HEAT_TEXT_FADE_MS
              ? 1
              : easeInOutCubic(sbFadeEl / HEAT_TEXT_FADE_MS);
          var sb = simpleBarLayout;
          var sbAlpha = 255 * sbFadeT;
          p.textFont("sans-serif");
          p.textSize(11);
          p.noStroke();

          var sbLegDot = 12;
          var sbLegTextGap = 10;
          var sbLegRowStep = sbLegDot + 6;
          var sbLegPad = 28;
          var sbLegLeft = sb.ox - sb.presetDiam / 2;
          var sbDotCx = sbLegLeft + sbLegDot / 2;
          var sbTextX = sbLegLeft + sbLegDot + sbLegTextGap;
          var sbLeg1Y = sb.oy - sb.presetDiam / 2 - sbLegPad - sbLegRowStep;
          var sbLeg2Y = sb.oy - sb.presetDiam / 2 - sbLegPad;

          p.textAlign(p.LEFT, p.CENTER);
          p.fill(state.dotR, state.dotG, state.dotB, 255 * sbFadeT);
          p.circle(sbDotCx, sbLeg1Y, sbLegDot);
          p.fill(state.dotR, state.dotG, state.dotB, sbAlpha);
          p.text("Active", sbTextX, sbLeg1Y);

          p.fill(state.dotR, state.dotG, state.dotB, sb.dimAlpha * sbFadeT);
          p.circle(sbDotCx, sbLeg2Y, sbLegDot);
          p.fill(state.dotR, state.dotG, state.dotB, sbAlpha);
          p.text("Inactive", sbTextX, sbLeg2Y);

          p.fill(state.dotR, state.dotG, state.dotB, sbAlpha);
          p.textAlign(p.CENTER, p.TOP);
          for (var sbc = 0; sbc < sb.cols; sbc++) {
            p.text(
              sb.colLabels[sbc],
              sb.ox + sbc * sb.spacing,
              sb.oy + sb.gridH + 22,
            );
          }
        }
      }

      /* --- dot plot labels --- */
      if (activePreset === "dotplot" && dotPlotLayout) {
        var dpFadeEl = now - dotPlotTextT0;
        if (dpFadeEl > 0) {
          var dpFadeT =
            dpFadeEl >= HEAT_TEXT_FADE_MS
              ? 1
              : easeInOutCubic(dpFadeEl / HEAT_TEXT_FADE_MS);
          var dp = dotPlotLayout;
          var dpAlpha = 255 * dpFadeT;
          var dpLabelSize = 11;
          p.textFont("sans-serif");
          p.textSize(dpLabelSize);
          p.noStroke();

          p.textAlign(p.RIGHT, p.CENTER);
          p.fill(state.dotR, state.dotG, state.dotB, dpAlpha);
          for (var dri = 0; dri < dp.categories.length; dri++) {
            p.text(
              dp.categories[dri].label,
              dp.ox - dp.presetDiam - 10,
              dp.oy + dri * dp.rowHeight,
            );
          }

          p.noStroke();

          var xTicks = [0, 20, 40, 60, 80];
          p.textAlign(p.CENTER, p.TOP);
          p.textSize(dpLabelSize);
          p.fill(state.dotR, state.dotG, state.dotB, dpAlpha);
          var tickY = dp.oy + dp.chartH + 16;
          for (var xti = 0; xti < xTicks.length; xti++) {
            var dtx =
              dp.ox +
              ((xTicks[xti] - dp.xMin) / (dp.xMax - dp.xMin)) * dp.chartW;
            p.text(String(xTicks[xti]), dtx, tickY);
          }

          p.textAlign(p.CENTER, p.TOP);
          p.textSize(dpLabelSize);
          p.text("kWh/m\u00B2 year", dp.ox + dp.chartW / 2, tickY + 18);

          var dpLegDot = 10;
          var dpLegGap = 8;
          var dpLegRowStep = dpLegDot + 5;
          var dpLegLeft = dp.ox;
          var dpLegY1 = dp.oy - 30 - dpLegRowStep;
          var dpLegY2 = dp.oy - 30;

          p.fill(state.dotR, state.dotG, state.dotB, 100 * dpFadeT);
          p.circle(dpLegLeft + dpLegDot / 2, dpLegY1, dpLegDot);
          p.fill(state.dotR, state.dotG, state.dotB, dpAlpha);
          p.textAlign(p.LEFT, p.CENTER);
          p.text(dp.legendLabels[0], dpLegLeft + dpLegDot + dpLegGap, dpLegY1);

          p.fill(state.dotR, state.dotG, state.dotB, 255 * dpFadeT);
          p.circle(dpLegLeft + dpLegDot / 2, dpLegY2, dpLegDot);
          p.fill(state.dotR, state.dotG, state.dotB, dpAlpha);
          p.text(dp.legendLabels[1], dpLegLeft + dpLegDot + dpLegGap, dpLegY2);
        }
      }

      /* --- scatter labels --- */
      if (activePreset === "scatter" && scatterLayout) {
        var scFadeEl = now - scatterTextT0;
        if (scFadeEl > 0) {
          var scFadeT =
            scFadeEl >= HEAT_TEXT_FADE_MS
              ? 1
              : easeInOutCubic(scFadeEl / HEAT_TEXT_FADE_MS);
          var sc = scatterLayout;
          var scAlpha = 255 * scFadeT;
          var scLineAlpha = Math.round(scAlpha * 0.68);
          var scLabel = 11;
          p.textFont("sans-serif");
          p.textSize(scLabel);
          p.noStroke();

          p.stroke(state.dotR, state.dotG, state.dotB, scLineAlpha);
          p.strokeWeight(1);
          var axY = sc.oy + sc.chartH;
          p.line(sc.ox, axY, sc.ox + sc.chartW, axY);
          p.line(sc.ox, sc.oy, sc.ox, axY);
          p.noStroke();

          p.fill(state.dotR, state.dotG, state.dotB, scAlpha);
          p.textAlign(p.CENTER, p.TOP);
          for (var sxi = 0; sxi < sc.xTicks.length; sxi++) {
            var xv = sc.xTicks[sxi];
            var sx = sc.ox + ((xv - sc.xMin) / (sc.xMax - sc.xMin)) * sc.chartW;
            var xLabelStr =
              xv >= 1000 ? Math.round(xv / 1000) + "K" : String(xv);
            p.text(xLabelStr, sx, sc.oy + sc.chartH + 14);
          }

          p.text(sc.xLabel, sc.ox + sc.chartW / 2, sc.oy + sc.chartH + 44);

          p.textAlign(p.RIGHT, p.CENTER);
          for (var syj = 0; syj < sc.yTicks.length; syj++) {
            var yv2 = sc.yTicks[syj];
            var hy2 =
              sc.oy + (1 - (yv2 - sc.yMin) / (sc.yMax - sc.yMin)) * sc.chartH;
            var yStr;
            if (yv2 === 0) yStr = "0";
            else if (yv2 === 1) yStr = "1";
            else {
              var ys = yv2.toFixed(1);
              yStr = ys.charAt(0) === "0" ? ys.slice(1) : ys;
            }
            p.text(yStr, sc.ox - 14, hy2);
          }

          p.push();
          p.translate(sc.ox - 48, sc.oy + sc.chartH / 2);
          p.rotate(-p.HALF_PI);
          p.textAlign(p.CENTER, p.CENTER);
          p.text(sc.yLabel, 0, 0);
          p.pop();
        }
      }

      /* --- beeswarm labels --- */
      if (activePreset === "beeswarm" && beeswarmLayout) {
        var bwFadeEl = now - beeswarmTextT0;
        if (bwFadeEl > 0) {
          var bwFadeT =
            bwFadeEl >= HEAT_TEXT_FADE_MS
              ? 1
              : easeInOutCubic(bwFadeEl / HEAT_TEXT_FADE_MS);
          var bw = beeswarmLayout;
          var bwAlpha = 255 * bwFadeT;
          var bwLineAlpha = Math.round(bwAlpha * 0.68);
          var bwLabel = 11;
          p.textFont("sans-serif");
          p.textSize(bwLabel);
          p.noStroke();

          p.stroke(state.dotR, state.dotG, state.dotB, bwLineAlpha);
          p.strokeWeight(1);
          var bwAxY = bw.oy + bw.chartH;
          p.line(bw.ox, bwAxY, bw.ox + bw.chartW, bwAxY);
          p.line(bw.ox, bw.oy, bw.ox, bwAxY);
          p.noStroke();

          p.fill(state.dotR, state.dotG, state.dotB, bwAlpha);
          p.textAlign(p.CENTER, p.TOP);
          for (var bxi = 0; bxi < bw.colCenters.length; bxi++) {
            p.text(
              bw.groupLabels[bxi],
              bw.colCenters[bxi],
              bw.oy + bw.chartH + 14,
            );
          }

          p.textAlign(p.RIGHT, p.CENTER);
          for (var byi = 0; byi < bw.yTicks.length; byi++) {
            var ytv = bw.yTicks[byi];
            var hy =
              bw.oy + (1 - (ytv - bw.yMin) / (bw.yMax - bw.yMin)) * bw.chartH;
            p.text(String(ytv), bw.ox - 14, hy);
          }
        }
      }

      /* --- timeline labels --- */
      if (activePreset === "timeline" && timelineLayout) {
        var tlFadeEl = now - timelineTextT0;
        if (tlFadeEl > 0) {
          var tlFadeT =
            tlFadeEl >= HEAT_TEXT_FADE_MS
              ? 1
              : easeInOutCubic(tlFadeEl / HEAT_TEXT_FADE_MS);
          var tl = timelineLayout;
          var tlAlpha = 255 * tlFadeT;
          var tlLabelSize = 11;
          p.textFont("sans-serif");
          p.textSize(tlLabelSize);
          p.noStroke();
          p.fill(state.dotR, state.dotG, state.dotB, tlAlpha);
          p.textAlign(p.CENTER, p.TOP);
          for (var tli = 0; tli < tl.milestones.length; tli++) {
            var tm = tl.milestones[tli];
            var tlines = tm.label.split("\n");
            for (var tln = 0; tln < tlines.length; tln++) {
              p.text(tlines[tln], tm.x, tm.y + tln * (tlLabelSize + 3));
            }
          }
        }
      }

      /* --- trim dead dots --- */
      if (dots.length > BASE_DOT_COUNT) {
        var canTrim = true;
        for (var r = BASE_DOT_COUNT; r < dots.length; r++) {
          var dd = dots[r];
          if (dd.mode !== "dead" || dd.alphaDur > 0 || dd.diamDur > 0) {
            canTrim = false;
            break;
          }
        }
        if (canTrim) dots.length = BASE_DOT_COUNT;
      }
    };

    p.keyPressed = function () {
      if (!isVisible) return;
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (p.key === "1") {
        var s = iconShapes["btn-mesh-location"];
        if (s) iconPreset(s);
      } else if (p.key === "2") {
        var s = iconShapes["btn-mesh-house"];
        if (s) iconPreset(s);
      } else if (p.key === "3") {
        barGraph();
      } else if (p.key === "4") {
        heatmap();
      } else if (p.key === "5") {
        halftoneGo();
      } else if (p.key === "0") {
        freeForAll();
      }
    };

    p.windowResized = function () {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.x = p.constrain(d.x, DOT_R, p.width - DOT_R);
        d.y = p.constrain(d.y, DOT_R, p.height - DOT_R);
      }
    };
  }

  /* ===== instance management ===== */

  function ensureInstance() {
    if (meshP5 || typeof p5 === "undefined" || !container) return;
    meshP5 = new p5(meshSketch, container);
  }

  /* ===== init ===== */

  function init() {
    container = document.getElementById("canvas-mesh");
    if (!container) return;
    container.style.display = "none";

    /* load icon presets from JSON */
    var meshBtnMap = {
      "btn-mesh-location": "btn-preset-location",
      "btn-mesh-clock": "btn-preset-clock",
      "btn-mesh-house": "btn-preset-color-house",
      "btn-mesh-transit": "btn-preset-transit",
      "btn-mesh-bus": "btn-preset-bus",
      "btn-mesh-mail": "btn-preset-mail",
    };

    fetch("data/presets.json")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.presets) return;
        for (var i = 0; i < data.presets.length; i++) {
          var preset = data.presets[i];
          for (var meshId in meshBtnMap) {
            if (meshBtnMap[meshId] === preset.buttonId) {
              iconShapes[meshId] = preset.shape;
            }
          }
        }
      })
      .catch(function () {});

    /* wire icon preset buttons */
    Object.keys(meshBtnMap).forEach(function (meshId) {
      var btn = document.getElementById(meshId);
      if (btn) {
        btn.addEventListener("click", function () {
          var shape = iconShapes[meshId];
          if (shape && window.meshIconPreset) window.meshIconPreset(shape);
        });
      }
    });

    /* wire halftone */
    var htBtn = document.getElementById("btn-mesh-halftone");
    if (htBtn) {
      htBtn.addEventListener("click", function () {
        if (window.meshHalftoneGo) window.meshHalftoneGo();
      });
    }

    var htFile = document.getElementById("mesh-halftone-upload");
    if (htFile) {
      htFile.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var isImage =
          (file.type && file.type.startsWith("image/")) ||
          /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || "");
        if (!isImage) return;
        if (halftoneUserObjectUrl) URL.revokeObjectURL(halftoneUserObjectUrl);
        halftoneUserObjectUrl = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          halftoneUserImg = img;
        };
        img.src = halftoneUserObjectUrl;
      });
    }

    /* wire halftone density */
    var densityRoot = document.getElementById("mesh-halftone-density");
    if (densityRoot) {
      densityRoot
        .querySelectorAll(".halftone-density-preset")
        .forEach(function (btn) {
          btn.addEventListener("click", function () {
            var s = Number(btn.getAttribute("data-spacing"));
            var m = Number(btn.getAttribute("data-max-dot"));
            if (s > 0) HALFTONE_SPACING = s;
            if (m > 0) HALFTONE_MAX_DOT = m;
            densityRoot
              .querySelectorAll(".halftone-density-preset")
              .forEach(function (b) {
                b.classList.remove("is-selected");
              });
            btn.classList.add("is-selected");
          });
        });
    }

    /* wire datavis buttons */
    var dvBtns = {
      "btn-mesh-bargraph": "meshBarGraph",
      "btn-mesh-simplebar": "meshSimpleBar",
      "btn-mesh-heatmap": "meshHeatmap",
      "btn-mesh-dotplot": "meshDotPlot",
      "btn-mesh-scatter": "meshScatterPlot",
      "btn-mesh-beeswarm": "meshBeeswarm",
      "btn-mesh-timeline": "meshTimeline",
    };
    Object.keys(dvBtns).forEach(function (btnId) {
      var btn = document.getElementById(btnId);
      var fnName = dvBtns[btnId];
      if (btn) {
        btn.addEventListener("click", function () {
          if (window[fnName]) window[fnName]();
        });
      }
    });

    /* wire free for all */
    var ffaBtn = document.getElementById("btn-mesh-ffa");
    if (ffaBtn) {
      ffaBtn.addEventListener("click", function () {
        if (window.meshFreeForAll) window.meshFreeForAll();
      });
    }

    /* background image */
    var bgFile = document.getElementById("mesh-bg-image-upload");
    if (bgFile) {
      bgFile.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) loadMeshBackgroundFromFile(file);
      });
    }
    var bgClear = document.getElementById("btn-mesh-bg-image-clear");
    if (bgClear) {
      bgClear.addEventListener("click", function () {
        clearMeshBackgroundImage();
      });
    }

    /* overlay opacity */
    var overlayRange = document.getElementById("mesh-bg-overlay-opacity");
    var overlayValue = document.getElementById("mesh-bg-overlay-value");
    if (overlayRange) {
      function syncOverlay() {
        meshBgOverlayOpacity = Number(overlayRange.value) / 100;
        if (overlayValue) overlayValue.textContent = overlayRange.value + "%";
        overlayRange.setAttribute("aria-valuenow", overlayRange.value);
      }
      overlayRange.addEventListener("input", syncOverlay);
      syncOverlay();
    }
  }

  /* ===== export ===== */

  window.MeshCanvas = {
    init: init,
    show: function () {
      if (!container) return;
      isVisible = true;
      ensureInstance();
      container.style.display = "block";
      if (meshP5) {
        meshP5.loop();
        meshP5.resizeCanvas(window.innerWidth, window.innerHeight);
      }
      applyBodyBg("rgb(" + state.bgR + "," + state.bgG + "," + state.bgB + ")");
    },
    hide: function () {
      isVisible = false;
      if (meshP5) meshP5.noLoop();
      if (container) container.style.display = "none";
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
