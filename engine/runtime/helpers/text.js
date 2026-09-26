/* Kinetic typography.
 *
 *   VMX.reveal(ctx, el, { at, by: 'words'|'lines'|'chars', preset: 'rise'|'mask'|'fade'|'blur', stagger })
 *   VMX.typeOn(ctx, el, 'text', { at, cps: 30, cursor: true })
 *   VMX.highlight(ctx, el, { at, color, duration })     marker sweep behind inline text
 *   VMX.swap(ctx, el, ['first', 'second'], { at: [0, 2] })  replace text in place with a roll
 */
(function (global) {
  'use strict';
  var VM = global.VM, gsap = global.gsap;
  var H = VM.helpers;

  function target(ctx, el) { return typeof el === 'string' ? ctx.el.querySelector(el) : el; }

  H.split = function (el, by, opts) {
    if (!global.SplitText) throw new Error('SplitText plugin not loaded');
    var types = by === 'lines' ? 'lines' : by === 'chars' ? 'words,chars' : 'words';
    return global.SplitText.create(el, Object.assign({ type: types, mask: by === 'lines' ? 'lines' : undefined,
      linesClass: 'vm-line', wordsClass: 'vm-word', charsClass: 'vm-char', aria: 'none' }, opts || {}));
  };

  H.reveal = function (ctx, el, o) {
    o = o || {};
    el = target(ctx, el);
    var by = o.by || 'words';
    var st = H.split(el, by);
    var parts = by === 'lines' ? st.lines : by === 'chars' ? st.chars : st.words;
    var preset = o.preset || (by === 'lines' ? 'mask-up' : 'rise');
    var from;
    switch (preset) {
      case 'mask-up': from = { yPercent: 110 }; break;
      case 'fade': from = { opacity: 0 }; break;
      case 'blur': from = { opacity: 0, filter: 'blur(12px)' }; break;
      case 'pop': from = { opacity: 0, scale: 0.5 }; break;
      default: from = { opacity: 0, y: ctx.u * 3 };
    }
    var to = { opacity: 1, y: 0, yPercent: 0, scale: 1, filter: 'blur(0px)',
      duration: o.duration || 0.7, ease: o.ease || (preset === 'pop' ? 'back.out(2)' : 'power3.out'),
      stagger: o.stagger != null ? o.stagger : (by === 'chars' ? 0.025 : by === 'lines' ? 0.12 : 0.06) };
    Object.keys(to).forEach(function (k) {
      if (['duration', 'ease', 'stagger'].indexOf(k) < 0 && !(k in from)) delete to[k];
    });
    ctx.tl.fromTo(parts, from, to, o.at || 0);
    return { split: st, parts: parts, end: (o.at || 0) + to.duration + to.stagger * (parts.length - 1) };
  };

  /** Deterministic typewriter: the visible character count is a tweened number. */
  H.typeOn = function (ctx, el, text, o) {
    o = o || {};
    el = target(ctx, el);
    var cps = o.cps || 28;
    var st = { n: 0 };
    var dur = o.duration || text.length / cps;
    ctx.tl.to(st, { n: text.length, duration: dur, ease: 'none' }, o.at || 0);
    var caret = o.cursor !== false;
    ctx.onFrame(function (local) {
      var n = Math.round(st.n);
      var blinkOn = Math.floor(local * 2) % 2 === 0 || (n > 0 && n < text.length);
      el.textContent = text.slice(0, n);
      if (caret) el.setAttribute('data-caret', blinkOn ? '1' : '0');
    });
    if (caret && !document.getElementById('vm-caret-css')) {
      var s = document.createElement('style');
      s.id = 'vm-caret-css';
      s.textContent = '[data-caret]::after{content:"";display:inline-block;width:.08em;height:1em;margin-left:.06em;vertical-align:-0.12em;background:currentColor}[data-caret="0"]::after{opacity:0}';
      document.head.appendChild(s);
    }
    return (o.at || 0) + dur;
  };

  H.highlight = function (ctx, el, o) {
    o = o || {};
    el = target(ctx, el);
    var color = o.color || 'var(--c-accent)';
    el.style.backgroundImage = 'linear-gradient(' + color + ',' + color + ')';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = '0 88%';
    el.style.backgroundSize = '0% ' + (o.thickness || '0.32em');
    el.style.boxDecorationBreak = 'clone';
    el.style.webkitBoxDecorationBreak = 'clone';
    ctx.tl.to(el, { backgroundSize: '100% ' + (o.thickness || '0.32em'), duration: o.duration || 0.6, ease: 'power2.inOut' }, o.at || 0);
  };

  H.swap = function (ctx, el, words, o) {
    o = o || {};
    el = target(ctx, el);
    el.style.display = 'inline-grid';
    el.style.overflow = 'hidden';
    el.style.verticalAlign = 'bottom';
    el.textContent = '';
    var spans = words.map(function (w) {
      var s = document.createElement('span');
      s.textContent = w; s.style.gridArea = '1/1'; el.appendChild(s); return s;
    });
    var times = o.at || words.map(function (_, i) { return i * 1.5; });
    gsap.set(spans.slice(1), { yPercent: 110 });
    spans.forEach(function (s, i) {
      if (i === 0) return;
      ctx.tl.to(spans[i - 1], { yPercent: -110, duration: 0.5, ease: 'power3.inOut' }, times[i]);
      ctx.tl.fromTo(s, { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: 'power3.inOut', immediateRender: false }, times[i]);
    });
  };
})(window);
