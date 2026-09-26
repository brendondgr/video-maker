/* Diagram and emphasis helpers, adapted from HyperFrames motion rules
 * (hyperframes-animation/rules/: avatar-cloud-network.md → hubSpokes, center-outward-expansion.md,
 * viewport-change.md + coordinate-target-zoom.md → camera, stat-bars-and-fills.md → ring,
 * asr-keyword-glow.md → pulse). Everything is positioned in canvas px, animated on ctx.tl.
 *
 *   VMX.hubSpokes(ctx, { hub, spokes:[…], cx, cy, radius, at, stagger, startAngle })
 *       → { hub, nodes:[el], links:[path], point(i) }
 *   VMX.cycle(ctx, { labels:[…], cx, cy, radius, at, stagger, color })   nodes on a ring + curved arrows
 *       → { nodes:[el], arrows:[{path,head}] }
 *   VMX.camera(ctx, wrap, [ { at, duration, focus:[x,y] | el, scale } … ])  zoom/pan a wrapper
 *   VMX.ring(ctx, parent, { value, max, at, duration, size, color, label, format, suffix })
 *   VMX.pulse(ctx, el, { at, color, scale })    one emphasis beat (e.g. on a narration word cue)
 */
(function (global) {
  'use strict';
  var VM = global.VM, H = VM.helpers, gsap = global.gsap;

  function node(ctx, label, x, y, cls, parent) {
    var n = ctx.add('div', { class: 'vm-node ' + (cls || ''), text: label }, parent);
    n.style.left = x + 'px'; n.style.top = y + 'px';
    gsap.set(n, { xPercent: -50, yPercent: -50 });   // centre on (x, y); tweens keep it
    return n;
  }

  H.hubSpokes = function (ctx, o) {
    var cx = o.cx != null ? o.cx : ctx.width / 2, cy = o.cy != null ? o.cy : ctx.height / 2;
    var R = o.radius || Math.min(ctx.width, ctx.height) * 0.32;
    var n = o.spokes.length, a0 = o.startAngle != null ? o.startAngle : -Math.PI / 2;
    var at = o.at || 0, st = o.stagger != null ? o.stagger : 0.12;
    var svg = ctx.svg();
    var pts = o.spokes.map(function (_, i) { var a = a0 + i * 2 * Math.PI / n; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    var links = pts.map(function (p) {
      return VM.svg('path', { d: 'M' + cx + ',' + cy + ' L' + p[0] + ',' + p[1], stroke: o.linkColor || 'var(--c-line)',
        'stroke-width': Math.max(2, ctx.u * 0.3), fill: 'none' }, svg);
    });
    var hub = node(ctx, o.hub, cx, cy, 'is-hub');
    var nodes = o.spokes.map(function (s, i) { return node(ctx, s, pts[i][0], pts[i][1], 'is-spoke'); });
    ctx.tl.fromTo(hub, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)', immediateRender: true }, at);
    links.forEach(function (l, i) { H.draw(ctx, l, { at: at + 0.3 + i * st, duration: 0.45 }); });
    nodes.forEach(function (el, i) {
      ctx.tl.fromTo(el, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.7)', immediateRender: true }, at + 0.55 + i * st);
    });
    return { hub: hub, nodes: nodes, links: links, svg: svg, point: function (i) { return pts[i]; }, center: [cx, cy] };
  };

  H.cycle = function (ctx, o) {
    var cx = o.cx != null ? o.cx : ctx.width / 2, cy = o.cy != null ? o.cy : ctx.height / 2;
    var R = o.radius || Math.min(ctx.width, ctx.height) * 0.28;
    var n = o.labels.length, a0 = o.startAngle != null ? o.startAngle : -Math.PI / 2;
    var at = o.at || 0, st = o.stagger != null ? o.stagger : 0.5;
    var svg = ctx.svg();
    var ang = function (i) { return a0 + i * 2 * Math.PI / n; };
    var nodes = o.labels.map(function (l, i) { return node(ctx, l, cx + R * Math.cos(ang(i)), cy + R * Math.sin(ang(i)), 'is-cycle'); });
    var gap = o.gap != null ? o.gap : 0.42;          // radians kept clear around each node
    var arrows = [];
    o.labels.forEach(function (_, i) {
      var t0 = at + i * st;
      ctx.tl.fromTo(nodes[i], { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.7)', immediateRender: true }, t0);
      var a1 = ang(i) + gap, a2 = ang(i + 1) - gap;
      var p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)], p2 = [cx + R * Math.cos(a2), cy + R * Math.sin(a2)];
      var large = (a2 - a1) > Math.PI ? 1 : 0;
      var path = VM.svg('path', { d: 'M' + p1[0] + ',' + p1[1] + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + p2[0] + ',' + p2[1],
        fill: 'none', stroke: o.color || 'var(--c-accent)', 'stroke-width': Math.max(2, ctx.u * 0.35), 'stroke-linecap': 'round' }, svg);
      var tan = a2 + Math.PI / 2, h = ctx.u * 1.4;
      var head = VM.svg('path', { d: 'M0,0 L' + (-h) + ',' + (h * 0.55) + ' L' + (-h) + ',' + (-h * 0.55) + 'Z', fill: o.color || 'var(--c-accent)',
        transform: 'translate(' + p2[0] + ',' + p2[1] + ') rotate(' + (tan * 180 / Math.PI) + ')' }, svg);
      H.draw(ctx, path, { at: t0 + 0.3, duration: Math.max(0.3, st * 0.8) });
      ctx.tl.fromTo(head, { opacity: 0 }, { opacity: 1, duration: 0.15, immediateRender: true }, t0 + 0.3 + Math.max(0.3, st * 0.8) * 0.9);
      arrows.push({ path: path, head: head });
    });
    return { nodes: nodes, arrows: arrows, svg: svg, center: [cx, cy] };
  };

  // Zoom/pan a full-frame wrapper so `focus` (canvas px or an element) sits at frame centre.
  H.camera = function (ctx, wrap, keys) {
    wrap.style.transformOrigin = '0 0';
    var prev = { x: 0, y: 0, scale: 1 };
    keys.forEach(function (k) {
      var s = k.scale || 1, f = k.focus;
      if (f && f.nodeType === 1) { var b = H.layoutBox(ctx, f); f = [b.x + b.width / 2, b.y + b.height / 2]; }
      f = f || [ctx.width / 2, ctx.height / 2];
      var to = { x: ctx.width / 2 - f[0] * s, y: ctx.height / 2 - f[1] * s, scale: s };
      if (s === 1 && !k.focus) { to.x = 0; to.y = 0; }
      ctx.tl.fromTo(wrap, { x: prev.x, y: prev.y, scale: prev.scale },
        { x: to.x, y: to.y, scale: to.scale, duration: k.duration || 1.2, ease: k.ease || 'power2.inOut', immediateRender: false }, k.at || 0);
      prev = to;
    });
  };

  H.ring = function (ctx, parent, o) {
    var size = o.size || ctx.u * 22, sw = o.stroke || size * 0.08, r = (size - sw) / 2;
    var box = ctx.add('div', { class: 'vm-ring', style: { width: size + 'px', height: size + 'px' } }, parent);
    var svg = VM.svg('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size }, box);
    VM.svg('circle', { cx: size / 2, cy: size / 2, r: r, fill: 'none', stroke: 'var(--c-line)', 'stroke-width': sw }, svg);
    var arc = VM.svg('circle', { cx: size / 2, cy: size / 2, r: r, fill: 'none', stroke: o.color || 'var(--c-accent)', 'stroke-width': sw,
      'stroke-linecap': 'round', transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' }, svg);
    var frac = Math.max(0, Math.min(1, o.value / (o.max || 100)));
    var at = o.at || 0, d = o.duration || 1.4;
    ctx.tl.fromTo(arc, { drawSVG: '0%' }, { drawSVG: (frac * 100) + '%', duration: d, ease: o.ease || 'power2.out', immediateRender: true }, at);
    var num = ctx.add('div', { class: 'vm-ring-num tabular' }, box);
    H.counter(ctx, num, { from: 0, to: o.value, at: at, duration: d, format: o.format || ',.0f', suffix: o.suffix || '', prefix: o.prefix || '' });
    if (o.label) ctx.add('div', { class: 'vm-ring-label t-small muted', text: o.label }, box);
    return { el: box, arc: arc, num: num };
  };

  H.pulse = function (ctx, el, o) {
    o = o || {};
    var at = o.at || 0, s = o.scale || 1.08;
    ctx.tl.fromTo(el, { scale: 1 }, { scale: s, duration: 0.18, ease: 'power2.out', immediateRender: false }, at);
    ctx.tl.fromTo(el, { scale: s }, { scale: 1, duration: 0.45, ease: 'power2.inOut', immediateRender: false }, at + 0.18);
    if (o.color) {
      ctx.tl.fromTo(el, { color: o.from || 'var(--c-ink)' }, { color: o.color, duration: 0.2, ease: 'none', immediateRender: false }, at);
    }
  };
})(window);
