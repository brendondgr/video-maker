/* Scene kit, part 2: diagrams and charts that build step by step, one step per beat.
 * Each takes explicit times (from ctx.at) so every reveal can land on the word that names it.
 * Items accept a role key or an inline { label, color, icon } (see kit.js).
 *
 *   const K = VMX.kit;
 *   K.flow(ctx, { steps:[{ label, sub, icon, role, at }], y, h, ghost, ghostAt })   → { steps:[el] }
 *        a left-to-right process; arrows draw just before each step lands. ghost: all steps show
 *        faint from ghostAt (default 0.3) and light up on their beat, so the frame is never empty.
 *   K.lanes(ctx, { rect, lanes, roles:[…], from, to, tasks? })                      → { lanes, bars }
 *        parallel work (workers, threads, teams): coloured bars fill across lanes; seeded.
 *   K.clusters(ctx, { rect, groups:[{ color, n, cx, cy }], spread, r })
 *        → { dots, appear(at), settle(at, dur), link(at, maxD) }   scattered dots that gather
 *   K.rankList(ctx, { rows:[{ label, value, hi }], x, y, w, title, at })
 *        → { el, rows, move(from, to, at, newValue) }             a ranked list that re-sorts
 *   K.trend(ctx, { series:[{ name, values | points, color, dashed }], rect, x:{ label }, y:{ label, domain, format },
 *                  at:{ axes, series:[t…], extend }, drawDur, refs:[{ name, v, color }], refsAt, readout:{ prefix, format } })
 *        → { x, y, g, paths, readout }   axes first, series drawn in turn, dashed reference lines that
 *        grow (dashes kept), an optional live readout riding series 0, and an optional
 *        "keeps going" dashed extension (at.extend, extendLabel).
 *   K.dotPlot(ctx, { rows:[{ label, value, hi }], domain, better:'lower'|'higher', rect, at, title, format, note })
 *        for scores where "shorter is better" would make a misleading bar chart.
 *   K.funnel(ctx, { stages:[{ value, label, at }], rect, color })   narrowing selection stages.
 *   await K.imageCards(ctx, { items:[{ src, head, fact, color, at }], y, h })   a row of image cards.
 */
(function (global) {
  'use strict';
  var VM = global.VM, gsap = global.gsap, d3 = global.d3;
  var H = VM.helpers, K = H.kit;

  function safeRect(ctx) { var m = ctx.width * 0.05, t = ctx.height * 0.05; return { x: m, y: t, w: ctx.width - 2 * m, h: ctx.height * 0.79 - t }; }

  // ------------------------------------------------------------------ flow
  K.flow = function (ctx, o) {
    var u = ctx.u, R = safeRect(ctx), n = o.steps.length;
    var gap = o.gap != null ? o.gap : u * 6, w = (R.w - gap * (n - 1)) / n, h = o.h || ctx.height * 0.4, y = o.y || ctx.height * 0.5;
    var svg = ctx.svg(), els = [];
    o.steps.forEach(function (s, i) {
      var a = K.role(s.role || { label: s.label, color: s.color || 'var(--c-accent)', icon: s.icon });
      var x = R.x + i * (w + gap);
      var el = ctx.add('div', { class: 'k-step', style: { left: x + 'px', top: (y - h / 2) + 'px', width: w + 'px', height: h + 'px', borderColor: a.color } });
      if (s.icon || a.icon) K.badge(ctx, el, s.icon || a.icon, { color: a.color, size: Math.min(u * 11, w * 0.4) });
      ctx.add('div', { class: 'k-step-label', text: s.label || a.name }, el);
      if (s.sub) ctx.add('div', { class: 'k-step-sub muted', text: s.sub }, el);
      if (o.ghost) {
        ctx.tl.fromTo(el, { opacity: 0 }, { opacity: 0.2, duration: 0.5, immediateRender: true }, o.ghostAt != null ? o.ghostAt : 0.3);
        ctx.tl.fromTo(el, { opacity: 0.2, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)', immediateRender: false }, s.at);
      } else ctx.tl.fromTo(el, { opacity: 0, y: u * 4, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out', immediateRender: true }, s.at);
      if (i > 0) H.arrow(ctx, svg, { x1: x - gap + u, y1: y, x2: x - u, y2: y, at: s.at - 0.3, duration: 0.3, color: a.color, width: u * 0.4 });
      els.push(el);
    });
    return { steps: els, svg: svg };
  };

  // ------------------------------------------------------------------ lanes
  K.lanes = function (ctx, o) {
    var u = ctx.u, r = o.rect, n = o.lanes || 4, gap = u * 1.2, lh = (r.h - gap * (n - 1)) / n;
    var from = o.from != null ? o.from : 0.3, to = o.to != null ? o.to : ctx.duration - 0.3;
    var roles = (o.roles || ['var(--c-accent)']).map(function (k) { return K.role(k); });
    var labelW = u * 12, lanes = [], bars = [];
    for (var i = 0; i < n; i++) {
      var ln = ctx.add('div', { class: 'k-lane', style: { left: r.x + 'px', top: (r.y + i * (lh + gap)) + 'px', width: r.w + 'px', height: lh + 'px' } });
      ctx.add('span', { class: 'k-lane-label', text: (o.label || 'worker') + ' ' + (i + 1) }, ln);
      ctx.tl.fromTo(ln, { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: true }, from + i * 0.06);
      lanes.push(ln);
    }
    // seeded task list unless given: each lane runs back-to-back tasks from `from` to `to`
    var tasks = o.tasks || [];
    if (!o.tasks) for (var l = 0; l < n; l++) {
      var t = from + 0.2 + ctx.random() * 0.6;
      while (t < to - 0.4) { var d = Math.min(0.8 + ctx.random() * 1.6, to - t); tasks.push({ lane: l, start: t, dur: d, role: Math.floor(ctx.random() * roles.length) }); t += d + 0.15; }
    }
    var span = to - from, pxPerS = (r.w - labelW - u * 2) / span;
    tasks.forEach(function (tk) {
      var a = typeof tk.role === 'number' ? roles[tk.role % roles.length] : K.role(tk.role);
      var b = ctx.add('div', { class: 'k-lane-bar', style: { left: (labelW + (tk.start - from) * pxPerS) + 'px', width: Math.max(u, tk.dur * pxPerS - u * 0.4) + 'px', background: a.color } }, lanes[tk.lane]);
      ctx.tl.fromTo(b, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: tk.dur, ease: 'none', immediateRender: true }, tk.start);
      bars.push(b);
    });
    return { lanes: lanes, bars: bars };
  };

  // --------------------------------------------------------------- clusters
  K.clusters = function (ctx, o) {
    var u = ctx.u, r = o.rect, svg = o.svg || ctx.svg(), edges = VM.svg('g', {}, svg), dots = [];
    var spread = o.spread || 0.13;
    o.groups.forEach(function (g, gi) {
      var cx = g.cx != null ? g.cx : (gi + 0.5) / o.groups.length, cy = g.cy != null ? g.cy : 0.5;
      for (var i = 0; i < (g.n || 10); i++) {
        var a = ctx.random() * Math.PI * 2, d = Math.sqrt(ctx.random()) * spread;
        var x = r.x + (cx + Math.cos(a) * d) * r.w, y = r.y + (cy + Math.sin(a) * d * (r.w / r.h) * 0.6) * r.h;
        var sx = r.x + ctx.random() * r.w, sy = r.y + ctx.random() * r.h;
        var el = VM.svg('circle', { cx: sx, cy: sy, r: u * (o.r || 1.2), fill: g.color || 'var(--c-accent)' }, svg);
        dots.push({ el: el, x: x, y: y, sx: sx, sy: sy, group: gi, color: g.color });
      }
    });
    return {
      svg: svg, dots: dots,
      appear: function (at) {
        ctx.tl.fromTo(dots.map(function (d) { return d.el; }), { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.015, immediateRender: true }, at);
      },
      settle: function (at, dur) {
        dots.forEach(function (d, i) { ctx.tl.to(d.el, { attr: { cx: d.x, cy: d.y }, duration: dur || 1.2, ease: 'power3.inOut' }, at + (i % 7) * 0.03); });
      },
      link: function (at, maxD) {
        var out = [];
        for (var i = 0; i < dots.length; i++) for (var j = i + 1; j < dots.length; j++) {
          var a = dots[i], b = dots[j];
          if (a.group !== b.group || Math.hypot(a.x - b.x, a.y - b.y) > (maxD || u * 12)) continue;
          out.push(VM.svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: a.color || 'var(--c-accent)', 'stroke-width': u * 0.18, opacity: 0 }, edges));
        }
        ctx.tl.fromTo(out, { opacity: 0 }, { opacity: 0.45, duration: 0.6, stagger: 0.008, immediateRender: true }, at);
        return out;
      }
    };
  };

  // --------------------------------------------------------------- rank list
  K.rankList = function (ctx, o) {
    var u = ctx.u, rh = u * 6.4, top = o.title ? u * 5.5 : u * 1;
    var box = ctx.add('div', { class: 'k-rank', style: { left: o.x + 'px', top: o.y + 'px', width: (o.w || u * 36) + 'px', height: (top + o.rows.length * rh + u) + 'px' } });
    if (o.title) ctx.add('div', { class: 'k-kicker muted', text: o.title }, box);
    var rows = o.rows.map(function (r, i) {
      var e = ctx.add('div', { class: 'k-rank-row' + (r.hi ? ' is-hi' : ''), style: { top: (top + i * rh) + 'px', height: rh + 'px' } }, box);
      ctx.add('span', { class: 'k-rank-n tabular', text: String(i + 1) }, e);
      ctx.add('span', { class: 'k-rank-label', text: r.label }, e);
      var v = ctx.add('span', { class: 'k-rank-v tabular', text: r.value != null ? K.fmt(r.value) : '' }, e);
      return { el: e, v: v, value: r.value };
    });
    ctx.tl.fromTo(box, { opacity: 0, y: u * 3 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', immediateRender: true }, o.at || 0);
    return {
      el: box, rows: rows,
      move: function (from, to, at, newValue) {
        ctx.tl.to(rows[from].el, { top: (top + to * rh) + 'px', duration: 0.7, ease: 'power3.inOut' }, at);
        var step = from > to ? 1 : -1;
        for (var k = to; k !== from; k += step) ctx.tl.to(rows[k].el, { top: (top + (k + step) * rh) + 'px', duration: 0.7, ease: 'power3.inOut' }, at);
        if (newValue != null) H.counter(ctx, rows[from].v, { from: rows[from].value, to: newValue, at: at, duration: 0.7, format: ',.0f' });
      }
    };
  };

  // ------------------------------------------------------------------ trend
  K.trend = function (ctx, o) {
    var u = ctx.u, r = o.rect || { x: ctx.width * 0.1, y: ctx.height * 0.24, w: ctx.width * 0.7, h: ctx.height * 0.46 };
    var at = o.at || {}, dur = o.drawDur || 2;
    var series = o.series.map(function (s) { return Object.assign({}, s, { points: s.points || s.values.map(function (v, i) { return [i + 1, v]; }) }); });
    var all = [].concat.apply([], series.map(function (s) { return s.points; })).concat((o.refs || []).map(function (f) { return [null, f.v]; }));
    var xd = (o.x && o.x.domain) || d3.extent(all.filter(function (p) { return p[0] != null; }), function (p) { return p[0]; });
    var yd = (o.y && o.y.domain) || d3.extent(all, function (p) { return p[1]; });
    var xs = d3.scaleLinear().domain(xd).range([0, r.w]), ys = d3.scaleLinear().domain(yd).range([r.h, 0]).nice();
    var fy = typeof (o.y && o.y.format) === 'function' ? o.y.format : d3.format((o.y && o.y.format) || ',.0f');
    var svg = ctx.svg(), g = VM.svg('g', { transform: 'translate(' + r.x + ',' + r.y + ')' }, svg), axes = VM.svg('g', {}, g);
    ys.ticks(4).forEach(function (t) {
      VM.svg('line', { x1: 0, x2: r.w, y1: ys(t), y2: ys(t), stroke: 'var(--c-line)', 'stroke-width': 1 }, axes);
      VM.svg('text', { x: -u, y: ys(t), dy: '0.35em', 'text-anchor': 'end', fill: 'var(--c-muted)', 'font-size': u * 2.4, text: fy(t) }, axes);
    });
    VM.svg('line', { x1: 0, x2: r.w, y1: r.h, y2: r.h, stroke: 'var(--c-muted)', 'stroke-width': u * 0.15 }, axes);
    if (o.x && o.x.label) VM.svg('text', { x: r.w, y: r.h + u * 4.5, 'text-anchor': 'end', fill: 'var(--c-muted)', 'font-size': u * 2.6, text: o.x.label }, axes);
    if (o.y && o.y.label) VM.svg('text', { x: 0, y: -u * 2.6, fill: 'var(--c-muted)', 'font-size': u * 2.6, text: o.y.label }, axes);
    var tAxes = at.axes != null ? at.axes : 0.2;
    ctx.tl.fromTo(axes, { opacity: 0 }, { opacity: 1, duration: 0.5, immediateRender: true }, tAxes);
    // reference lines grow by x2 so their dash pattern survives (drawSVG would make them solid)
    var refs = (o.refs || []).map(function (f, i) {
      var yy = ys(f.v), c = f.color || 'var(--c-muted)', t = (o.refsAt != null ? o.refsAt : tAxes + 0.3) + i * 0.25;
      var ln = VM.svg('line', { x1: 0, x2: 0, y1: yy, y2: yy, stroke: c, 'stroke-width': u * 0.28, 'stroke-dasharray': u + ' ' + u * 0.8 }, g);
      var tx = VM.svg('text', { x: r.w + u, y: yy, dy: '0.35em', fill: c, 'font-size': u * 2.5, text: f.name }, g);
      ctx.tl.fromTo(ln, { attr: { x2: 0 } }, { attr: { x2: r.w }, duration: 0.7, ease: 'power2.out', immediateRender: true }, t);
      ctx.tl.fromTo(tx, { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: true }, t + 0.4);
      return { line: ln, text: tx, v: f.v };
    });
    var line = d3.line().x(function (p) { return xs(p[0]); }).y(function (p) { return ys(p[1]); }).curve(o.curve || d3.curveMonotoneX);
    var starts = (at.series || []).slice();
    var paths = series.map(function (s, i) {
      var c = s.color || H.color(i), t = starts[i] != null ? starts[i] : tAxes + 0.4 + i * (dur + 0.3);
      var p = VM.svg('path', { d: line(s.points), fill: 'none', stroke: c, 'stroke-width': s.width || u * 0.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'stroke-dasharray': s.dashed ? (u + ' ' + u * 0.8) : null }, g);
      if (s.dashed) ctx.tl.fromTo(p, { opacity: 0 }, { opacity: 1, duration: dur * 0.5, immediateRender: true }, t);
      else H.draw(ctx, p, { at: t, duration: dur, ease: 'power1.inOut' });
      if (s.name) {
        var last = s.points[s.points.length - 1];
        var lab = VM.svg('text', { x: xs(last[0]) + u, y: ys(last[1]), dy: '0.35em', fill: c, 'font-size': u * 2.8, 'font-weight': 650, text: s.name }, g);
        ctx.tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: true }, t + dur * 0.9);
      }
      starts[i] = t;
      return p;
    });
    var readout = null;
    if (o.readout) {
      var p0 = paths[0], len = p0.getTotalLength(), st = { p: 0 };
      readout = ctx.add('div', { class: 'k-readout tabular', style: { left: (r.x + r.w) + 'px', top: (r.y - u * 7.5) + 'px', color: series[0].color || H.color(0) } });
      var dot = VM.svg('circle', { r: u * 0.9, fill: series[0].color || H.color(0), stroke: 'var(--c-bg)', 'stroke-width': u * 0.35 }, g);
      ctx.tl.fromTo(st, { p: 0 }, { p: 1, duration: dur, ease: 'power1.inOut', immediateRender: true }, starts[0]);
      ctx.tl.fromTo([readout, dot], { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: true }, starts[0]);
      var fr = typeof o.readout.format === 'function' ? o.readout.format : d3.format(o.readout.format || ',.0f');
      ctx.onFrame(function () {
        var pt = p0.getPointAtLength(st.p * len);
        dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
        readout.textContent = (o.readout.prefix || '') + fr(ys.invert(pt.y));
        refs.forEach(function (f) { f.line.setAttribute('stroke-opacity', pt.y < ys(f.v) ? 0.35 : 1); });
      });
    }
    if (at.extend != null) {
      var s0 = series[0].points, lp = s0[s0.length - 1], px = xs(lp[0]), py = ys(lp[1]), c0 = series[0].color || H.color(0);
      var ex = VM.svg('line', { x1: px, y1: py, x2: px, y2: py, stroke: c0, 'stroke-width': u * 0.4, 'stroke-dasharray': u * 0.9 + ' ' + u * 0.7, 'stroke-linecap': 'round' }, g);
      ctx.tl.fromTo(ex, { attr: { x2: px, y2: py } }, { attr: { x2: px + u * 6, y2: py - u * 6 }, duration: 0.6, ease: 'power2.out', immediateRender: true }, at.extend);
      if (o.extendLabel) {
        var el = VM.svg('text', { x: px + u * 7, y: py - u * 7, fill: c0, 'font-size': u * 2.6, 'font-weight': 650, text: o.extendLabel }, g);
        ctx.tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: true }, at.extend + 0.4);
      }
    }
    return { x: xs, y: ys, g: g, svg: svg, rect: r, paths: paths, refs: refs, readout: readout, starts: starts };
  };

  // ---------------------------------------------------------------- dot plot
  K.dotPlot = function (ctx, o) {
    var u = ctx.u, r = o.rect, svg = ctx.svg(), labelW = r.w * 0.42, ax0 = r.x + labelW, ax1 = r.x + r.w - u * 6;
    var d = o.domain || d3.extent(o.rows, function (x) { return x.value; });
    var sc = d3.scaleLinear().domain(d).range([ax0, ax1]);
    var f = d3.format(o.format || '.2f'), rh = r.h / o.rows.length, at = o.at || 0;
    if (o.title) { var hd = ctx.add('div', { class: 't-head', text: o.title, style: { position: 'absolute', left: r.x + 'px', top: (r.y - u * 7) + 'px' } });
      ctx.tl.fromTo(hd, { opacity: 0 }, { opacity: 1, duration: 0.5, immediateRender: true }, at - 0.2); }
    o.rows.forEach(function (row, i) {
      var yy = r.y + rh * (i + 0.5), col = row.hi ? 'var(--c-accent)' : 'var(--c-muted)';
      var lab = ctx.add('div', { class: 't-body', text: row.label, style: { position: 'absolute', left: r.x + 'px', top: yy + 'px', width: (labelW - u * 2) + 'px',
        textAlign: 'right', color: row.hi ? 'var(--c-ink)' : 'var(--c-muted)', fontWeight: row.hi ? 700 : 450 } });
      gsap.set(lab, { yPercent: -50 });
      var ln = VM.svg('line', { x1: ax0, x2: ax1, y1: yy, y2: yy, stroke: 'var(--c-line)', 'stroke-width': u * 0.2 }, svg);
      var c = VM.svg('circle', { cx: sc(row.value), cy: yy, r: u * (row.hi ? 1.5 : 1.1), fill: col }, svg);
      var v = VM.svg('text', { x: sc(row.value) + u * 2.2, y: yy, dy: '0.35em', fill: col, 'font-size': u * 2.7, 'font-weight': row.hi ? 700 : 500, text: f(row.value) }, svg);
      var t = at + i * 0.18;
      ctx.tl.fromTo([lab, ln], { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: true }, t);
      ctx.tl.fromTo(c, { attr: { cx: o.better === 'lower' ? ax1 : ax0 }, opacity: 0 }, { attr: { cx: sc(row.value) }, opacity: 1, duration: 0.7, ease: 'power3.out', immediateRender: true }, t);
      ctx.tl.fromTo(v, { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: true }, t + 0.5);
    });
    var hint = VM.svg('text', { x: o.better === 'lower' ? ax0 : ax1, y: r.y + r.h + u * 3, 'text-anchor': o.better === 'lower' ? 'start' : 'end',
      fill: 'var(--c-muted)', 'font-size': u * 2.4, text: o.note || (o.better === 'lower' ? '← better' : 'better →') }, svg);
    ctx.tl.fromTo(hint, { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: true }, at + 0.8);
    return { svg: svg, scale: sc };
  };

  // ------------------------------------------------------------------ funnel
  K.funnel = function (ctx, o) {
    var u = ctx.u, r = o.rect, n = o.stages.length, sw = r.w / n, svg = ctx.svg(), c = o.color || 'var(--c-accent)';
    var hMax = r.h, hMin = r.h * 0.28, cy = r.y + r.h / 2;
    var hAt = function (k) { return hMax - (hMax - hMin) * (k / n); };
    return o.stages.map(function (s, i) {
      var x0 = r.x + i * sw, x1 = x0 + sw - u * 0.8, h0 = hAt(i), h1 = hAt(i + 1);
      var poly = VM.svg('path', { d: 'M' + x0 + ',' + (cy - h0 / 2) + 'L' + x1 + ',' + (cy - h1 / 2) + 'L' + x1 + ',' + (cy + h1 / 2) + 'L' + x0 + ',' + (cy + h0 / 2) + 'Z',
        fill: 'color-mix(in srgb, ' + (s.color || c) + ' ' + (18 + i * 10) + '%, var(--c-surface))', stroke: s.color || c, 'stroke-width': u * 0.2 }, svg);
      var num = ctx.add('div', { class: 'k-funnel-n tabular', text: typeof s.value === 'number' ? K.fmt(s.value) : s.value });
      K.pos(num, (x0 + x1) / 2, cy);
      var lab = ctx.add('div', { class: 'k-funnel-l muted', text: s.label || '' });
      K.pos(lab, (x0 + x1) / 2, cy + hMax / 2 + u * 3.5);
      ctx.tl.fromTo(poly, { opacity: 0 }, { opacity: 1, duration: 0.5, immediateRender: true }, s.at);
      K.pop(ctx, num, s.at + 0.1, 0.45);
      ctx.tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: true }, s.at + 0.2);
      return { poly: poly, num: num, label: lab };
    });
  };

  // ------------------------------------------------------------ image cards
  K.imageCards = async function (ctx, o) {
    var u = ctx.u, R = safeRect(ctx), n = o.items.length, gap = u * 3, w = (R.w - gap * (n - 1)) / n;
    var y = o.y || ctx.height * 0.2, h = o.h || ctx.height * 0.55, cards = [];
    for (var i = 0; i < n; i++) {
      var it = o.items[i];
      var c = ctx.add('div', { class: 'k-imgcard', style: { left: (R.x + i * (w + gap)) + 'px', top: y + 'px', width: w + 'px', height: h + 'px', borderColor: it.color || 'var(--c-line)' } });
      var box = ctx.add('div', { class: 'k-imgcard-img' }, c);
      var img = ctx.add('img', { src: it.src, alt: '' }, box);
      await img.decode();
      ctx.tl.fromTo(img, { scale: 1.04 }, { scale: 1.14, duration: ctx.duration, ease: 'none' }, 0);
      var tx = ctx.add('div', { class: 'k-imgcard-text' }, c);
      var hh = ctx.add('div', { class: 't-head', text: it.head || '' }, tx); if (it.color) hh.style.color = it.color;
      var ff = it.fact ? ctx.add('div', { class: 't-body', text: it.fact }, tx) : null;
      ctx.tl.fromTo(c, { opacity: 0, y: u * 8 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', immediateRender: true }, it.at);
      cards.push({ el: c, text: tx, head: hh, fact: ff });
    }
    return cards;
  };
})(window);
