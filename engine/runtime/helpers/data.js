/* Numbers, charts and drawn lines. D3 is used as a box of primitives (scales,
 * shapes, axes, formats); GSAP owns every change over time.
 *
 *   VMX.counter(ctx, el, { from, to, at, duration, format: ',.0f' | fn, prefix, suffix })
 *   VMX.draw(ctx, pathEl, { at, duration, ease, from: '0%', to: '100%' })
 *   VMX.arrow(ctx, svgEl, { x1, y1, x2, y2, bend, color, width, head, at, duration })
 *   VMX.barChart(ctx, { data:[{label,value,color?}], rect, at, stagger, max, format, horizontal, highlight })
 *   VMX.lineChart(ctx, { series:[{name,points:[[x,y],...],color}], rect, at, duration, x:{label,domain,format}, y:{...}, area, markers })
 *   VMX.axis(ctx, g, scale, { orient, ticks, format, label })
 */
(function (global) {
  'use strict';
  var VM = global.VM, gsap = global.gsap, d3 = global.d3;
  var H = VM.helpers;

  function fmtFn(f) {
    if (typeof f === 'function') return f;
    if (d3 && typeof f === 'string') return d3.format(f);
    return function (v) { return Math.round(v).toLocaleString('en-US'); };
  }
  function tgt(ctx, el) { return typeof el === 'string' ? ctx.el.querySelector(el) : el; }
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  H.color = function (i) {
    var list = ['--c-accent', '--c-accent-2', '--c-accent-3', '--c-warn', '--c-muted'];
    return cssVar(list[i % list.length], '#5eb0ff');
  };
  H.cssVar = cssVar;

  // ------------------------------------------------------------------ counter
  H.counter = function (ctx, el, o) {
    o = o || {};
    el = tgt(ctx, el);
    el.classList.add('tabular');
    var f = fmtFn(o.format);
    var st = { v: o.from || 0 };
    ctx.tl.to(st, { v: o.to, duration: o.duration || 1.6, ease: o.ease || 'power2.out' }, o.at || 0);
    ctx.onFrame(function () { el.textContent = (o.prefix || '') + f(st.v) + (o.suffix || ''); });
    return st;
  };

  // --------------------------------------------------------------------- draw
  H.draw = function (ctx, path, o) {
    o = o || {};
    path = tgt(ctx, path);
    ctx.tl.fromTo(path, { drawSVG: o.from || '0%' },
      { drawSVG: o.to || '100%', duration: o.duration || 1.2, ease: o.ease || 'power2.inOut', immediateRender: true }, o.at || 0);
    return path;
  };

  H.arrow = function (ctx, svgEl, o) {
    var color = o.color || 'var(--c-accent)';
    var w = o.width || Math.max(2, ctx.u * 0.35);
    var g = VM.svg('g', { class: 'vm-arrow' }, svgEl);
    var mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2;
    var dx = o.x2 - o.x1, dy = o.y2 - o.y1;
    var len = Math.hypot(dx, dy) || 1;
    var bend = o.bend || 0;
    var cx = mx - dy / len * bend * len, cy = my + dx / len * bend * len;
    var head = o.head != null ? o.head : w * 4;
    // Stop the shaft short of the tip so the head sits on the end.
    var ang = Math.atan2(o.y2 - cy, o.x2 - cx);
    var ex = o.x2 - Math.cos(ang) * head * 0.6, ey = o.y2 - Math.sin(ang) * head * 0.6;
    var p = VM.svg('path', { d: 'M' + o.x1 + ',' + o.y1 + ' Q' + cx + ',' + cy + ' ' + ex + ',' + ey,
      fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, g);
    var hd = VM.svg('path', { d: 'M0,0 L' + (-head) + ',' + (head * 0.55) + ' L' + (-head) + ',' + (-head * 0.55) + 'Z',
      fill: color, transform: 'translate(' + o.x2 + ',' + o.y2 + ') rotate(' + (ang * 180 / Math.PI) + ')' }, g);
    var at = o.at || 0, d = o.duration || 0.8;
    H.draw(ctx, p, { at: at, duration: d });
    ctx.tl.fromTo(hd, { opacity: 0, scale: 0.3, svgOrigin: o.x2 + ' ' + o.y2 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)' }, at + d * 0.85);
    return { g: g, path: p, head: hd };
  };

  // --------------------------------------------------------------------- axes
  H.axis = function (ctx, g, scale, o) {
    o = o || {};
    var orient = o.orient || 'bottom';
    var ax = d3['axis' + orient[0].toUpperCase() + orient.slice(1)](scale);
    if (o.ticks != null) ax.ticks(o.ticks);
    if (o.format) ax.tickFormat(fmtFn(o.format));
    if (o.tickValues) ax.tickValues(o.tickValues);
    ax.tickSizeOuter(0).tickPadding(ctx.u * 1.1).tickSize(o.grid ? -o.grid : ctx.u * 0.8);
    var sel = d3.select(g).call(ax);
    sel.attr('font-family', 'var(--f-sans)').attr('font-size', o.fontSize || ctx.u * 2.3);
    sel.selectAll('text').attr('fill', 'var(--c-muted)');
    sel.selectAll('line').attr('stroke', 'var(--c-line)');
    sel.select('.domain').attr('stroke', 'var(--c-line)');
    return sel;
  };

  // ---------------------------------------------------------------- bar chart
  H.barChart = function (ctx, o) {
    var r = Object.assign({ x: ctx.width * 0.12, y: ctx.height * 0.2, w: ctx.width * 0.76, h: ctx.height * 0.6 }, o.rect || {});
    var data = o.data;
    var f = fmtFn(o.format);
    var svgEl = o.svg || ctx.svg();
    var g = VM.svg('g', { class: 'vm-bars', transform: 'translate(' + r.x + ',' + r.y + ')' }, svgEl);
    var max = o.max != null ? o.max : d3.max(data, function (d) { return d.value; }) * 1.1;
    var horiz = !!o.horizontal;
    var band = d3.scaleBand().domain(data.map(function (d) { return d.label; })).range(horiz ? [0, r.h] : [0, r.w]).padding(o.padding != null ? o.padding : 0.28);
    var lin = d3.scaleLinear().domain([0, max]).range(horiz ? [0, r.w] : [r.h, 0]);
    var at = o.at || 0, stagger = o.stagger != null ? o.stagger : 0.12, dur = o.duration || 0.9;
    var labelSize = o.labelSize || ctx.u * 2.7;

    var axisG = VM.svg('g', { transform: horiz ? '' : 'translate(0,' + r.h + ')' }, g);
    if (horiz) H.axis(ctx, axisG, band, { orient: 'left' });
    else H.axis(ctx, axisG, band, { orient: 'bottom' });
    axisG.querySelectorAll('text').forEach(function (t) { t.setAttribute('font-size', labelSize); t.setAttribute('fill', 'var(--c-ink)'); });
    ctx.tl.from(axisG, { opacity: 0, duration: 0.4 }, at);

    var bars = data.map(function (d, i) {
      var color = d.color || (o.highlight != null ? (o.highlight === i || o.highlight === d.label ? 'var(--c-accent)' : 'var(--c-line)') : (o.color || 'var(--c-accent)'));
      var rect, label;
      var st = { v: 0 };
      if (horiz) {
        rect = VM.svg('rect', { x: 0, y: band(d.label), height: band.bandwidth(), width: 0, rx: Math.min(6, band.bandwidth() / 6), fill: color }, g);
        label = VM.svg('text', { x: 0, y: band(d.label) + band.bandwidth() / 2, dy: '0.35em', 'font-size': labelSize, fill: 'var(--c-ink)', 'font-weight': 600, class: 'tabular' }, g);
      } else {
        rect = VM.svg('rect', { x: band(d.label), width: band.bandwidth(), y: r.h, height: 0, rx: Math.min(6, band.bandwidth() / 6), fill: color }, g);
        label = VM.svg('text', { x: band(d.label) + band.bandwidth() / 2, y: r.h, 'text-anchor': 'middle', 'font-size': labelSize, fill: 'var(--c-ink)', 'font-weight': 600, class: 'tabular' }, g);
      }
      ctx.tl.to(st, { v: d.value, duration: dur, ease: 'power3.out' }, at + 0.2 + i * stagger);
      ctx.onFrame(function () {
        var v = st.v;
        if (horiz) {
          rect.setAttribute('width', Math.max(0, lin(v)));
          label.setAttribute('x', lin(v) + ctx.u);
        } else {
          rect.setAttribute('y', lin(v));
          rect.setAttribute('height', Math.max(0, r.h - lin(v)));
          label.setAttribute('y', lin(v) - ctx.u);
        }
        label.textContent = o.valueLabels === false ? '' : f(v) + (o.suffix || '');
        label.style.opacity = v > 0 ? 1 : 0;
      });
      return { rect: rect, label: label, state: st, datum: d };
    });
    return { svg: svgEl, g: g, bars: bars, x: horiz ? lin : band, y: horiz ? band : lin, rect: r,
      end: at + 0.2 + (data.length - 1) * stagger + dur };
  };

  // --------------------------------------------------------------- line chart
  H.lineChart = function (ctx, o) {
    var r = Object.assign({ x: ctx.width * 0.12, y: ctx.height * 0.18, w: ctx.width * 0.76, h: ctx.height * 0.62 }, o.rect || {});
    var series = o.series;
    var svgEl = o.svg || ctx.svg();
    var g = VM.svg('g', { class: 'vm-lines', transform: 'translate(' + r.x + ',' + r.y + ')' }, svgEl);
    var all = [].concat.apply([], series.map(function (s) { return s.points; }));
    var xo = o.x || {}, yo = o.y || {};
    var xs = (xo.log ? d3.scaleLog() : d3.scaleLinear()).domain(xo.domain || d3.extent(all, function (p) { return p[0]; })).range([0, r.w]);
    var yd = yo.domain || [Math.min(0, d3.min(all, function (p) { return p[1]; })), d3.max(all, function (p) { return p[1]; }) * 1.08];
    var ys = (yo.log ? d3.scaleLog() : d3.scaleLinear()).domain(yd).range([r.h, 0]).nice();
    var at = o.at || 0, dur = o.duration || 1.8;

    var gx = VM.svg('g', { transform: 'translate(0,' + r.h + ')' }, g);
    var gy = VM.svg('g', {}, g);
    H.axis(ctx, gx, xs, { orient: 'bottom', ticks: xo.ticks || 6, format: xo.format });
    H.axis(ctx, gy, ys, { orient: 'left', ticks: yo.ticks || 5, format: yo.format, grid: o.grid === false ? 0 : r.w });
    gy.querySelectorAll('.tick line').forEach(function (l) { l.setAttribute('stroke-opacity', 0.5); });
    if (xo.label) VM.svg('text', { x: r.w, y: r.h + ctx.u * 6, 'text-anchor': 'end', fill: 'var(--c-muted)', 'font-size': ctx.u * 2.4, text: xo.label }, g);
    if (yo.label) VM.svg('text', { x: 0, y: -ctx.u * 2.5, fill: 'var(--c-muted)', 'font-size': ctx.u * 2.4, text: yo.label }, g);
    ctx.tl.from([gx, gy], { opacity: 0, duration: 0.5 }, at);

    var line = d3.line().x(function (p) { return xs(p[0]); }).y(function (p) { return ys(p[1]); }).curve(o.curve || d3.curveMonotoneX);
    var area = d3.area().x(function (p) { return xs(p[0]); }).y0(r.h).y1(function (p) { return ys(p[1]); }).curve(o.curve || d3.curveMonotoneX);
    var out = series.map(function (s, i) {
      var color = s.color || H.color(i);
      var a = null;
      if (o.area || s.area) {
        a = VM.svg('path', { d: area(s.points), fill: color, opacity: 0.14 }, g);
        ctx.tl.from(a, { opacity: 0, duration: 0.8 }, at + 0.3 + dur * 0.6 + i * 0.3);
      }
      var p = VM.svg('path', { d: line(s.points), fill: 'none', stroke: color, 'stroke-width': s.width || ctx.u * 0.45,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': s.dashed ? (ctx.u + ' ' + ctx.u) : null }, g);
      if (s.dashed) ctx.tl.from(p, { opacity: 0, duration: dur * 0.6 }, at + 0.3 + i * (o.seriesStagger || 0.4));
      else H.draw(ctx, p, { at: at + 0.3 + i * (o.seriesStagger || 0.4), duration: dur, ease: o.ease || 'power1.inOut' });
      var lab = null;
      if (s.name && o.labels !== false) {
        var last = s.points[s.points.length - 1];
        lab = VM.svg('text', { x: xs(last[0]) + ctx.u, y: ys(last[1]), dy: '0.35em', fill: color, 'font-size': o.labelSize || ctx.u * 2.7, 'font-weight': 650, text: s.name }, g);
        ctx.tl.from(lab, { opacity: 0, x: '-=10', duration: 0.4 }, at + 0.3 + i * (o.seriesStagger || 0.4) + dur * 0.9);
      }
      return { path: p, area: a, label: lab, color: color };
    });
    return { svg: svgEl, g: g, x: xs, y: ys, rect: r, series: out,
      end: at + 0.3 + (series.length - 1) * (o.seriesStagger || 0.4) + dur };
  };

  // ----------------------------------------------- moving marker along a line
  /** A dot that rides a data series as `progress` (0..1) is tweened. Returns its state proxy. */
  H.tracer = function (ctx, chart, seriesIndex, o) {
    o = o || {};
    var pts = (o.points) || (chart.series[seriesIndex] && chart.series[seriesIndex].path && null);
    var path = chart.series[seriesIndex].path;
    var len = path.getTotalLength();
    var dot = VM.svg('circle', { r: o.r || ctx.u * 0.9, fill: o.color || chart.series[seriesIndex].color, stroke: 'var(--c-bg)', 'stroke-width': ctx.u * 0.35 }, chart.g);
    var st = { p: 0 };
    ctx.tl.fromTo(st, { p: o.fromP || 0 }, { p: o.toP != null ? o.toP : 1, duration: o.duration || 2, ease: o.ease || 'power1.inOut' }, o.at || 0);
    ctx.tl.from(dot, { opacity: 0, duration: 0.3 }, o.at || 0);
    ctx.onFrame(function () {
      var pt = path.getPointAtLength(st.p * len);
      dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
      if (o.onMove) o.onMove(pt, st.p);
    });
    return st;
  };
})(window);
