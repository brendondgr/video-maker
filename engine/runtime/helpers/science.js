/* Math typesetting, scalar fields, networks, sketch annotation, images.
 *
 *   VMX.tex(el, '\\int_0^1 f(x)\\,dx', { display: true })        KaTeX, synchronous
 *   VMX.texSteps(ctx, container, ['a=b', 'a-b=0'], { at, gap })    step-through derivation
 *   VMX.field(ctx, { fn(x,y,p), domain, rect, res, thresholds, interpolator, param })  -> state proxy
 *   VMX.network(ctx, { nodes, links, rect, ticks, at, stagger })   precomputed d3-force layout
 *   VMX.sketch(ctx, svgEl)                                          rough.js with a fixed seed
 *   VMX.circle(ctx, el, { at, color, pad })                         hand-drawn circle around an element
 *   VMX.kenBurns(ctx, img, { from:{scale,x,y}, to:{scale,x,y} })
 */
(function (global) {
  'use strict';
  var VM = global.VM, gsap = global.gsap, d3 = global.d3;
  var H = VM.helpers;

  // -------------------------------------------------------------------- KaTeX
  H.tex = function (el, latex, o) {
    o = o || {};
    if (!global.katex) throw new Error('KaTeX not loaded');
    global.katex.render(latex, el, { displayMode: o.display !== false, throwOnError: true, output: 'html', trust: false, macros: o.macros });
    return el;
  };

  H.texSteps = function (ctx, container, steps, o) {
    o = o || {};
    var at = o.at || 0, gap = o.gap || 1.4;
    var rows = steps.map(function (s, i) {
      var row = VM.el('div', { class: 'vm-tex-step' }, container);
      H.tex(row, s, { display: true });
      ctx.tl.fromTo(row, { opacity: 0, y: ctx.u * 2 }, { opacity: 1, y: 0, duration: 0.6 }, at + i * gap);
      if (o.dimPrevious !== false && i > 0) ctx.tl.to(rows ? rows[i - 1] : container.children[i - 1], { opacity: 0.35, duration: 0.4 }, at + i * gap);
      return row;
    });
    return { rows: rows, end: at + (steps.length - 1) * gap + 0.6 };
  };

  // -------------------------------------------------------------------- field
  // A scalar field f(x, y, p) drawn as filled contours on a canvas. `p` is a
  // tweenable parameter: animate state.p on ctx.tl and the field re-contours.
  H.field = function (ctx, o) {
    var r = Object.assign({ x: 0, y: 0, w: ctx.width, h: ctx.height }, o.rect || {});
    var res = o.res || 140;
    var nx = res, ny = Math.round(res * r.h / r.w);
    var dom = o.domain || { x: [-3, 3], y: [-3, 3] };
    var cv = ctx.canvas({ width: r.w, height: r.h });
    cv.el.style.left = r.x + 'px'; cv.el.style.top = r.y + 'px';
    var st = Object.assign({ p: o.p0 || 0, opacity: 1 }, o.state || {});
    var interp = o.interpolator || d3.interpolateViridis;
    var values = new Float64Array(nx * ny);
    var lastKey = null;
    var path = d3.geoPath(null, cv.g);
    ctx.onFrame(function () {
      var key = st.p.toFixed(5);
      if (key === lastKey) return;         // nothing changed; skip the expensive part
      lastKey = key;
      var lo = Infinity, hi = -Infinity;
      for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
        var x = dom.x[0] + (dom.x[1] - dom.x[0]) * i / (nx - 1);
        var y = dom.y[1] - (dom.y[1] - dom.y[0]) * j / (ny - 1);
        var v = o.fn(x, y, st.p);
        values[j * nx + i] = v;
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
      if (o.range) { lo = o.range[0]; hi = o.range[1]; }
      var n = o.thresholds || 14;
      var th = d3.range(n).map(function (k) { return lo + (hi - lo) * k / n; });
      var contours = d3.contours().size([nx, ny]).thresholds(th)(values);
      var g = cv.g;
      g.save();
      g.clearRect(0, 0, r.w, r.h);
      g.scale(r.w / nx, r.h / ny);
      contours.forEach(function (c, k) {
        g.beginPath(); path(c);
        g.fillStyle = interp(k / (n - 1)); g.fill();
        if (o.lines !== false) { g.lineWidth = 0.6 * nx / r.w * 1.5; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke(); }
      });
      g.restore();
    });
    return { state: st, canvas: cv, toPixel: function (x, y) {
      return [r.x + (x - dom.x[0]) / (dom.x[1] - dom.x[0]) * r.w, r.y + (dom.y[1] - y) / (dom.y[1] - dom.y[0]) * r.h];
    } };
  };

  // ------------------------------------------------------------------ network
  // Layout is computed ONCE at build time (synchronously, seeded), so the video
  // never depends on a live simulation.
  H.network = function (ctx, o) {
    var r = Object.assign({ x: ctx.width * 0.1, y: ctx.height * 0.12, w: ctx.width * 0.8, h: ctx.height * 0.76 }, o.rect || {});
    var nodes = o.nodes.map(function (n) { return Object.assign({}, n); });
    var links = o.links.map(function (l) { return Object.assign({}, l); });
    var rand = ctx.random;
    nodes.forEach(function (n) { if (n.x == null) { n.x = (rand() - 0.5) * r.w * 0.5; n.y = (rand() - 0.5) * r.h * 0.5; } });
    var sim = d3.forceSimulation(nodes).randomSource(rand)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(o.linkDistance || Math.min(r.w, r.h) / 5))
      .force('charge', d3.forceManyBody().strength(o.charge || -Math.min(r.w, r.h) * 1.2))
      .force('center', d3.forceCenter(0, 0))
      .force('collide', d3.forceCollide(ctx.u * 4))
      .stop();
    for (var i = 0; i < (o.ticks || 400); i++) sim.tick();
    // Fit into rect.
    var xe = d3.extent(nodes, function (n) { return n.x; }), ye = d3.extent(nodes, function (n) { return n.y; });
    var pad = ctx.u * 6;
    var k = Math.min((r.w - 2 * pad) / ((xe[1] - xe[0]) || 1), (r.h - 2 * pad) / ((ye[1] - ye[0]) || 1));
    nodes.forEach(function (n) {
      n.px = r.x + r.w / 2 + (n.x - (xe[0] + xe[1]) / 2) * k;
      n.py = r.y + r.h / 2 + (n.y - (ye[0] + ye[1]) / 2) * k;
    });
    var svgEl = o.svg || ctx.svg();
    var gl = VM.svg('g', { class: 'vm-links' }, svgEl), gn = VM.svg('g', { class: 'vm-nodes' }, svgEl);
    var at = o.at || 0, stagger = o.stagger != null ? o.stagger : 0.06;
    var nodeR = o.nodeRadius || ctx.u * 2.2;
    var nodeEls = {};
    nodes.forEach(function (n, i) {
      var g = VM.svg('g', { transform: 'translate(' + n.px + ',' + n.py + ')' }, gn);
      var c = VM.svg('circle', { r: n.r || nodeR, fill: n.color || 'var(--c-surface)', stroke: n.stroke || 'var(--c-accent)', 'stroke-width': ctx.u * 0.35 }, g);
      var t = n.label ? VM.svg('text', { y: (n.r || nodeR) + ctx.u * 3.2, 'text-anchor': 'middle', 'font-size': o.labelSize || ctx.u * 2.6, fill: 'var(--c-ink)', text: n.label }, g) : null;
      ctx.tl.fromTo(g, { opacity: 0, scale: 0.2, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, at + i * stagger);
      nodeEls[n.id] = { g: g, circle: c, label: t, node: n };
    });
    var linkEls = links.map(function (l, i) {
      var p = VM.svg('path', { d: 'M' + l.source.px + ',' + l.source.py + 'L' + l.target.px + ',' + l.target.py,
        stroke: l.color || 'var(--c-line)', 'stroke-width': l.width || ctx.u * 0.3, fill: 'none' }, gl);
      H.draw(ctx, p, { at: at + nodes.length * stagger * 0.5 + i * stagger * 0.5, duration: 0.6 });
      return { path: p, link: l };
    });
    return { svg: svgEl, nodes: nodeEls, links: linkEls, end: at + nodes.length * stagger + 0.6 };
  };

  /**
   * An element's FINAL layout box in stage pixels, ignoring every CSS transform
   * (entrance offsets, scale-ins, preview scaling). Use it to place annotations at
   * build time, when elements still sit in their tweens' from-state.
   */
  H.layoutBox = function (ctx, el) {
    var saved = [];
    for (var n = el; n && n !== ctx.el.parentNode; n = n.parentElement) {
      if (n.style) { saved.push([n, n.style.transform, n.style.translate, n.style.scale, n.style.rotate]);
        n.style.transform = 'none'; n.style.translate = 'none'; n.style.scale = 'none'; n.style.rotate = 'none'; }
    }
    var stage = ctx.el.parentNode;
    var st = stage.style.transform; stage.style.transform = 'none';
    var sr = stage.getBoundingClientRect(), br = el.getBoundingClientRect();
    stage.style.transform = st;
    saved.forEach(function (s) { s[0].style.transform = s[1]; s[0].style.translate = s[2]; s[0].style.scale = s[3]; s[0].style.rotate = s[4]; });
    return { x: br.left - sr.left, y: br.top - sr.top, w: br.width, h: br.height };
  };

  // -------------------------------------------------------------------- rough
  H.sketch = function (ctx, svgEl) {
    if (!global.rough) throw new Error('rough.js not loaded');
    var rc = global.rough.svg(svgEl, { options: { seed: Math.floor(ctx.random() * 2 ** 31) + 1 } });
    return rc;
  };

  /** Hand-drawn ellipse around an element (or {x,y,w,h}), drawn on. */
  H.circle = function (ctx, target, o) {
    o = o || {};
    var box = target && target.nodeType ? H.layoutBox(ctx, target) : target;
    var pad = o.pad != null ? o.pad : ctx.u * 1.5;
    var svgEl = o.svg || ctx.svg({ style: 'pointer-events:none' });
    var rc = H.sketch(ctx, svgEl);
    var node = rc.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w + pad * 2, box.h + pad * 2,
      { stroke: o.color || H.cssVar('--c-accent-2', '#ffb454'), strokeWidth: o.width || ctx.u * 0.4, roughness: o.roughness || 1.4 });
    svgEl.appendChild(node);
    node.querySelectorAll('path').forEach(function (p) { H.draw(ctx, p, { at: o.at || 0, duration: o.duration || 0.7, ease: 'power1.inOut' }); });
    return node;
  };

  // -------------------------------------------------------------------- media
  H.kenBurns = function (ctx, img, o) {
    o = o || {};
    img = typeof img === 'string' ? ctx.el.querySelector(img) : img;
    var f = Object.assign({ scale: 1, xPercent: 0, yPercent: 0 }, o.from || {});
    var t = Object.assign({ scale: 1.12, xPercent: -2, yPercent: -1 }, o.to || {});
    t.duration = o.duration || ctx.duration; t.ease = o.ease || 'none';
    ctx.tl.fromTo(img, f, t, o.at || 0);
  };
})(window);
