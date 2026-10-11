// Topographic contour lines drawn behind the page.
// Seeded value noise -> marching squares. Terrain is defined in page pixels,
// so resizing the window reveals more or less of the same landscape.
// The terrain repeats vertically every TILE px, so the parallax can scroll
// forever with a fixed-size canvas.
(function () {
  var canvas = document.getElementById('contour');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var SEED = 1337;
  var SCALE = 340;     // px per noise unit; bigger = broader hills
  var TILE_CELLS = 3;  // vertical repeat, in noise units
  var TILE = SCALE * TILE_CELLS;
  var CELL = 7;        // grid resolution in px
  var STEP = 0.035;    // elevation between lines
  var INDEX_EVERY = 5;
  var PARALLAX = 0.25; // background scrolls at this fraction of page speed

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hash(x, y) {
    var h = (x * 374761393 + y * 668265263 + SEED * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  // period: lattice cells before the y axis wraps around
  function noise(x, y, period) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = smooth(x - ix), fy = smooth(y - iy);
    var y0 = ((iy % period) + period) % period;
    var y1 = (y0 + 1) % period;
    var a = hash(ix, y0), b = hash(ix + 1, y0);
    var c = hash(ix, y1), d = hash(ix + 1, y1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  function elevation(px, py) {
    var x = px / SCALE, y = py / SCALE, amp = 1, sum = 0, norm = 0;
    var period = TILE_CELLS;
    for (var o = 0; o < 4; o++) {
      sum += amp * noise(x, y, period);
      norm += amp;
      x *= 2; y *= 2; amp *= 0.5; period *= 2;
    }
    return sum / norm;
  }

  // For each marching-squares case (tl=8, tr=4, br=2, bl=1): pairs of edges
  // to join. Edges: 0 top, 1 right, 2 bottom, 3 left.
  var SEGMENTS = [
    [], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[0, 3], [1, 2]], [[0, 2]], [[0, 3]],
    [[0, 3]], [[0, 2]], [[0, 1], [3, 2]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []
  ];

  function lineColor() {
    var c = getComputedStyle(document.documentElement).getPropertyValue('--contour-color');
    return c.trim() || '#e4e4e4';
  }

  function draw() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, vh = window.innerHeight;
    // Canvas is one tile taller than the window so there is always terrain
    // to slide into view.
    var h = reduceMotion ? vh : vh + TILE;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var cols = Math.ceil(w / CELL) + 1, rows = Math.ceil(h / CELL) + 1;
    var field = new Float32Array(cols * rows);
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        field[j * cols + i] = elevation(i * CELL, j * CELL);
      }
    }

    ctx.strokeStyle = lineColor();
    ctx.lineCap = 'round';

    var first = Math.ceil(0.3 / STEP), last = Math.floor(0.7 / STEP);
    for (var n = first; n <= last; n++) {
      var level = n * STEP;
      ctx.lineWidth = n % INDEX_EVERY === 0 ? 1.6 : 0.8;
      ctx.beginPath();
      for (var y = 0; y < rows - 1; y++) {
        for (var x = 0; x < cols - 1; x++) {
          var tl = field[y * cols + x], tr = field[y * cols + x + 1];
          var bl = field[(y + 1) * cols + x], br = field[(y + 1) * cols + x + 1];
          var c = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
          var segs = SEGMENTS[c];
          if (!segs.length) continue;
          var px = x * CELL, py = y * CELL;
          var pts = [
            [px + CELL * (level - tl) / (tr - tl), py],
            [px + CELL, py + CELL * (level - tr) / (br - tr)],
            [px + CELL * (level - bl) / (br - bl), py + CELL],
            [px, py + CELL * (level - tl) / (bl - tl)]
          ];
          for (var s = 0; s < segs.length; s++) {
            var a = pts[segs[s][0]], b = pts[segs[s][1]];
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
          }
        }
      }
      ctx.stroke();
    }
  }

  function place() {
    if (reduceMotion) return;
    var y = (Math.max(0, window.pageYOffset || 0) * PARALLAX) % TILE;
    canvas.style.transform = 'translate3d(0,' + (-y).toFixed(1) + 'px,0)';
  }

  var resizing = false;
  function onResize() {
    if (resizing) return;
    resizing = true;
    requestAnimationFrame(function () { resizing = false; draw(); place(); });
  }

  var scrolling = false;
  function onScroll() {
    if (scrolling) return;
    scrolling = true;
    requestAnimationFrame(function () { scrolling = false; place(); });
  }

  window.addEventListener('resize', onResize);
  if (!reduceMotion) window.addEventListener('scroll', onScroll, { passive: true });
  draw();
  place();
})();
