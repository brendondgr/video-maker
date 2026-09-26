/* Extra scene transitions, ported from HyperFrames (hyperframes-animation/transitions/:
 * TRANSITION-REGISTRY.md, css-dissolve.md, css-push.md, css-scale.md, css-radial.md,
 * css-cover.md, css-grid.md, css-blur.md). Adapted from their __OLD__/__NEW__ wrapper
 * templates to video-maker's signature:
 *
 *   VM.transition(name, function (tl, inEl, at, dur, ease, outEl, spec) { … })
 *
 * tl is the master timeline; inEl/outEl are the incoming/outgoing scene <section>s; the
 * incoming scene starts `dur` seconds before the outgoing one ends. Every tween is fromTo with
 * explicit start values (immediateRender: false), so any seek order gives the same frame.
 * Options come from the storyboard: transition_in = { type, duration, ease, direction, color }.
 *
 * Choose 2–3 types per video and repeat them (HF overview.md). Calm default: blur-crossfade;
 * high-energy default: zoom-through.
 */
(function (global) {
  'use strict';
  var VM = global.VM;
  var IR = { immediateRender: false };
  function o(a, b) { return Object.assign({}, a, b, IR); }

  // Both scenes cross-dissolve (the built-in `fade` only fades the incoming one in).
  VM.transition('crossfade', function (tl, inEl, at, d, ease, outEl) {
    tl.fromTo(outEl, { opacity: 1 }, o({ opacity: 0, duration: d, ease: ease || 'power2.inOut' }), at);
    tl.fromTo(inEl, { opacity: 0 }, o({ opacity: 1, duration: d, ease: ease || 'power2.inOut' }), at);
  });

  // Calm default: the blur hides background changes between scenes.
  VM.transition('blur-crossfade', function (tl, inEl, at, d, ease, outEl) {
    var e = ease || 'power2.inOut';
    tl.fromTo(outEl, { filter: 'blur(0px)', scale: 1, opacity: 1 }, o({ filter: 'blur(10px)', scale: 1.03, opacity: 0, duration: d, ease: e }), at);
    tl.fromTo(inEl, { filter: 'blur(10px)', scale: 0.97, opacity: 0 }, o({ filter: 'blur(0px)', scale: 1, opacity: 1, duration: d, ease: e }), at);
  });

  // High-energy default: fly through the old scene into the new one.
  VM.transition('zoom-through', function (tl, inEl, at, d, ease, outEl) {
    tl.fromTo(outEl, { scale: 1, opacity: 1, filter: 'blur(0px)' }, o({ scale: 2.5, opacity: 0, filter: 'blur(8px)', duration: d, ease: 'power3.in' }), at);
    tl.fromTo(inEl, { scale: 0.5, opacity: 0, filter: 'blur(8px)' }, o({ scale: 1, opacity: 1, filter: 'blur(0px)', duration: d, ease: ease || 'power3.out' }), at);
  });

  // Push: both scenes travel together. direction: left (default) | right | up | down.
  VM.transition('push', function (tl, inEl, at, d, ease, outEl, spec) {
    var dir = (spec && spec.direction || 'left').toLowerCase(), e = ease || 'power3.inOut';
    var axis = dir === 'up' || dir === 'down' ? 'yPercent' : 'xPercent';
    var sign = dir === 'left' || dir === 'up' ? -1 : 1;
    var a = {}, b = {}, c = {}, z = {};
    a[axis] = 0; b[axis] = sign * 100; c[axis] = -sign * 100; z[axis] = 0;
    tl.fromTo(outEl, a, o(b, { duration: d, ease: e }), at);
    tl.fromTo(inEl, c, o(z, { duration: d, ease: e }), at);
  });

  // Old compresses to a line at the left edge; new expands from the right edge.
  VM.transition('squeeze', function (tl, inEl, at, d, ease, outEl) {
    var e = ease || 'power3.inOut';
    tl.fromTo(outEl, { scaleX: 1, transformOrigin: 'left center' }, o({ scaleX: 0, transformOrigin: 'left center', duration: d, ease: e }), at);
    tl.fromTo(inEl, { scaleX: 0, transformOrigin: 'right center' }, o({ scaleX: 1, transformOrigin: 'right center', duration: d, ease: e }), at);
  });

  VM.transition('diamond-iris', function (tl, inEl, at, d, ease) {
    tl.fromTo(inEl, { clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)' },
      o({ clipPath: 'polygon(50% -20%, 120% 50%, 50% 120%, -20% 50%)', duration: d, ease: ease || 'power2.out' }), at);
    tl.set(inEl, { clipPath: 'none' }, at + d);
  });

  // The old scene folds away into the top-right corner, revealing the new one beneath.
  VM.transition('diagonal-split', function (tl, inEl, at, d, ease, outEl) {
    var zi = inEl.style.zIndex;
    tl.set(outEl, { zIndex: +zi + 1 }, at);
    tl.fromTo(outEl, { clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' },
      o({ clipPath: 'polygon(60% 0%, 100% 0%, 100% 40%, 60% 0%)', duration: d, ease: ease || 'power3.inOut' }), at);
    tl.set(outEl, { opacity: 0 }, at + d);
  });

  // Out-of-focus pull: the old scene defocuses, the new one fades in sharp.
  VM.transition('focus-pull', function (tl, inEl, at, d, ease, outEl) {
    tl.fromTo(outEl, { filter: 'blur(0px)' }, o({ filter: 'blur(15px)', duration: d, ease: 'power1.in' }), at);
    tl.fromTo(outEl, { opacity: 1 }, o({ opacity: 0, duration: d * 0.6, ease: 'power2.in' }), at + d * 0.4);
    tl.fromTo(inEl, { opacity: 0 }, o({ opacity: 1, duration: d * 0.6, ease: ease || 'power2.out' }), at + d * 0.4);
  });

  // Dip through a solid colour (default: the palette background). spec.color overrides.
  VM.transition('color-dip', function (tl, inEl, at, d, ease, outEl, spec) {
    var layer = coverLayer(tl, inEl, at, d, spec && spec.color || 'var(--c-bg)');
    tl.fromTo(layer, { opacity: 0 }, o({ opacity: 1, duration: d * 0.45, ease: 'power2.in' }), at);
    tl.fromTo(inEl, { opacity: 0 }, o({ opacity: 1, duration: 0.01 }), at + d * 0.45);
    tl.fromTo(layer, { opacity: 1 }, o({ opacity: 0, duration: d * 0.45, ease: ease || 'power2.out' }), at + d * 0.55);
  });

  // Whip pan: a fast horizontal smear. direction: left (default) | right.
  VM.transition('whip-pan', function (tl, inEl, at, d, ease, outEl, spec) {
    var s = (spec && spec.direction === 'right') ? 1 : -1;
    tl.fromTo(outEl, { xPercent: 0, filter: 'blur(0px)' }, o({ xPercent: s * 60, filter: 'blur(24px)', duration: d * 0.5, ease: 'power3.in' }), at);
    tl.fromTo(inEl, { xPercent: -s * 60, filter: 'blur(24px)', opacity: 0 }, o({ xPercent: 0, filter: 'blur(0px)', opacity: 1, duration: d * 0.5, ease: ease || 'power3.out' }), at + d * 0.5);
  });

  // Two (or spec.blocks) palette-coloured panels sweep across; the swap happens while covered.
  VM.transition('staggered-blocks', function (tl, inEl, at, d, ease, outEl, spec) {
    var n = Math.max(1, Math.min(6, (spec && spec.blocks) || 2));
    var colors = (spec && spec.colors) || ['var(--c-accent)', 'var(--c-surface)', 'var(--c-accent-2)', 'var(--c-line)', 'var(--c-accent-3)', 'var(--c-muted)'];
    var stag = d * 0.12, leg = (d - stag * (n - 1)) / 2, e = ease || 'power3.inOut';
    for (var i = 0; i < n; i++) {
      var b = coverLayer(tl, inEl, at, d, colors[i % colors.length]);
      tl.fromTo(b, { xPercent: -101 }, o({ xPercent: 0, duration: leg, ease: e }), at + i * stag);
      tl.fromTo(b, { xPercent: 0 }, o({ xPercent: 101, duration: leg, ease: e }), at + leg + i * stag + stag * 0.5);
    }
    tl.fromTo(inEl, { opacity: 0 }, o({ opacity: 1, duration: 0.01 }), at + leg);
  });

  // A grid of cells ripples in from the centre, the scenes swap under it, then it ripples out.
  VM.transition('grid-dissolve', function (tl, inEl, at, d, ease, outEl, spec) {
    var cols = (spec && spec.cols) || 8, rows = (spec && spec.rows) || Math.round(cols * 9 / 16) || 1;
    var holder = coverLayer(tl, inEl, at, d, 'transparent');
    var color = spec && spec.color || 'var(--c-accent)';
    var cells = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var cell = VM.el('div', { class: 'vm-tr-cell', style: { left: (c / cols * 100) + '%', top: (r / rows * 100) + '%',
        width: (100 / cols + 0.05) + '%', height: (100 / rows + 0.05) + '%', background: color } }, holder);
      var dx = (c + 0.5) / cols - 0.5, dy = (r + 0.5) / rows - 0.5;
      cells.push({ el: cell, dist: Math.sqrt(dx * dx + dy * dy) });
    }
    var maxD = Math.max.apply(null, cells.map(function (x) { return x.dist; })) || 1;
    var spread = d * 0.3, leg = (d - spread) / 2;
    cells.forEach(function (x) {
      var off = x.dist / maxD * spread * 0.5;
      tl.fromTo(x.el, { opacity: 0, scale: 0.6 }, o({ opacity: 1, scale: 1, duration: leg, ease: 'power2.out' }), at + off);
      tl.fromTo(x.el, { opacity: 1 }, o({ opacity: 0, duration: leg, ease: 'power2.in' }), at + leg + spread * 0.5 + off);
    });
    tl.fromTo(inEl, { opacity: 0 }, o({ opacity: 1, duration: 0.01 }), at + leg + spread * 0.5);
  });

  // A full-frame layer just above the incoming scene, hidden outside its transition.
  function coverLayer(tl, inEl, at, d, bg) {
    var layer = VM.el('div', { class: 'vm-tr-layer', style: { background: bg, zIndex: String(+inEl.style.zIndex + 1) } }, inEl.parentNode);
    tl.set(layer, { visibility: 'visible' }, at);
    tl.set(layer, { visibility: 'hidden' }, at + d);
    return layer;
  }
})(window);
