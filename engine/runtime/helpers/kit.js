/* Scene kit: the building blocks of an explainer frame, sized and animated the same way every
 * time. Generalised from the Co-Scientist series (60 s / 3 min / 10 min), where these parts
 * carried every scene. Everything is animated on ctx.tl at a time the caller passes in
 * (normally ctx.at('<beat>')). Styles live in vm.css under the `k-` prefix.
 *
 * Roles: the recurring actors of a video (agents, components, stakeholders) get one colour and
 * one icon for the whole video. Declare them in storyboard.style.roles:
 *   "roles": { "gen": { "name": "Generation", "color": "#c2562a", "icon": "bulb" }, … }
 * then pass the key ("gen") anywhere a role is accepted, or an inline { label, color, icon }.
 *
 *   const K = VMX.kit;
 *   K.icon(name, { size, color, sw })                 → inline 24×24 stroke <svg>   (K.ICONS lists names)
 *   K.badge(ctx, parent, icon, { color, size })       → round tinted icon badge
 *   await K.bg(ctx, src, { scrim, dim, from, to, x, y, overlay, at })   full-bleed image, slow push-in
 *                                                        scrim: left | right | full | soft | none
 *                                                        overlay: true → .over layer that moves with the image
 *   await K.panel(ctx, src, { x, y, w, h, at, zoom })  rounded image panel with slow zoom
 *   K.header(ctx, role, { at, sub, name })            role header (badge + name), top-left of .safe
 *   K.title(ctx, text, { at, kicker, sub, size })     section title, top-left of .safe
 *   K.chapter(ctx, { num, title, at, icon, color, sub })        chapter card (outlined number + title + rule)
 *   await K.chapterScene(ctx, { bg, icon, color, sub, dim })    whole chapter scene from ctx.text[0..1]
 *   K.chip(ctx, parent, role, { x, y, at, big })      icon + label chip
 *   K.pill(ctx, parent, text, { color, x, y, at, fill })
 *   K.card(ctx, parent, { x, y, w, title, value, color, lines, text, at })   compact item card
 *   K.note(ctx, text, { at, align, y })               footnote just above the caption zone (sources, "illustrative")
 *   K.stamp(ctx, parent, text, { x, y, at, color, rot })        a stamp that slams in
 *   K.app(ctx, { x, y, w, h, title, at })             illustrative app window → { el, body, bar }
 *   K.field(ctx, parent, label, { text, minH, mono }) → { el, text }   (fill with VMX.typeOn)
 *   K.button(ctx, parent, label, icon) · K.press(ctx, btn, at, color)
 *   K.tracker(ctx, step, labels, { scale })           numbered step tracker, top-right
 *   K.pos(el, x, y) · K.pop(ctx, el, at, d) · K.glow(ctx, el, at, color, d) · K.role(key) · K.fmt(n)
 */
(function (global) {
  'use strict';
  var VM = global.VM, gsap = global.gsap;
  var H = VM.helpers;

  var ICONS = {
    bulb: 'M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7V18h6v-2c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2.5z',
    magnifier: 'M10.5 3.5a7 7 0 1 1 0 14a7 7 0 1 1 0-14zM20.5 20.5l-5-5',
    trophy: 'M8 21h8M12 16.5V21M7 3.5h10V9a5 5 0 0 1-10 0zM7 5.5H4a3 3 0 0 0 3.2 4.3M17 5.5h3a3 3 0 0 1-3.2 4.3',
    seedling: 'M12 21.5V11M12 11c0-4-3-7-8.5-7c0 5 3.2 7 8.5 7zM12 13.5c0-3.2 2.6-6.2 8.5-6.2c0 4.6-3.1 6.2-8.5 6.2z',
    compass: 'M12 2.5a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19zM15.8 8.2l-2.4 5.2l-5.2 2.4l2.4-5.2z',
    clipboard: 'M9 2.5h6v3H9zM9 4H6.2a1 1 0 0 0-1 1v15.5a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H15M8.5 10.5h7M8.5 14h7M8.5 17.5h4.5',
    grid: 'M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z',
    user: 'M12 12a4.2 4.2 0 1 0 0-8.4a4.2 4.2 0 0 0 0 8.4zM4 21a8 8 0 0 1 16 0',
    users: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 13.6a6.5 6.5 0 0 1 3.5 6.4',
    chat: 'M20.5 11.5a8 8 0 0 1-11.7 7.1L3.5 20.5l1.9-5A8 8 0 1 1 20.5 11.5zM8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01',
    rail: 'M2 4h20M5 4v8h5V4M14 4v11h5V4',
    notebook: 'M6.5 2.5h11a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1h-11zM6.5 2.5v19M3.5 7h3M3.5 12h3M3.5 17h3M10 8h5.5M10 12h5.5',
    flask: 'M9 2.5h6M10 2.5v6.5L4.4 19a1.6 1.6 0 0 0 1.4 2.4h12.4a1.6 1.6 0 0 0 1.4-2.4L14 9V2.5M7 15h10',
    check: 'M4 12.5l5 5L20 6.5',
    x: 'M6 6l12 12M18 6L6 18',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    doc: 'M6 2.5h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1zM14 2.5v5h5M8.5 13h7M8.5 17h7',
    lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
    clock: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM12 7v5l3.2 2',
    key: 'M7.5 16.5a4 4 0 1 1 0-8a4 4 0 0 1 0 8zM11.5 12.5H21M18 12.5v3M21 12.5v2',
    warning: 'M12 3.5L2.5 20.5h19zM12 10v5M12 17.8v.01',
    database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3s-3.6 3-8 3s-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    star: 'M12 2.5l2.9 6.2l6.8.8l-5 4.7l1.3 6.8L12 17.6l-6 3.4l1.3-6.8l-5-4.7l6.8-.8z',
    pill: 'M10.6 3.6a4.9 4.9 0 0 1 6.9 6.9l-7 7a4.9 4.9 0 0 1-6.9-6.9zM7.1 7.1l6.9 6.9',
    shield: 'M12 2.5l8 3v6c0 5-3.4 8.8-8 10.5c-4.6-1.7-8-5.5-8-10.5v-6z',
    book: 'M3.5 5h6a2.5 2.5 0 0 1 2.5 2.5V20a2 2 0 0 0-2-2H3.5zM20.5 5h-6A2.5 2.5 0 0 0 12 7.5V20a2 2 0 0 1 2-2h6.5z',
    wrench: 'M14.7 3.5a5 5 0 0 0-5.3 6.6L3.5 16l4.5 4.5l5.9-5.9a5 5 0 0 0 6.6-5.3l-3 3l-2.6-.6l-.6-2.6z',
    merge: 'M5.5 3c0 7 6.5 8 6.5 13v5M18.5 3c0 7-6.5 8-6.5 13',
    simplify: 'M4 6h16M4 12h10M4 18h5',
    outbox: 'M13 3.5H4.5v16h16V11M11 13l9.5-9.5M15 3.5h5.5V9',
    robot: 'M5 8.5h14v11H5zM12 4.5v4M9 13.5v.01M15 13.5v.01M9.5 16.5h5M12 4.5a.8.8 0 1 0 0-.01',
    crown: 'M3 18.5h18M4 18.5L3 7l5 4l4-7l4 7l5-4l-1 11.5',
    sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18',
    chip: 'M7 7h10v10H7zM9.5 3v4M14.5 3v4M9.5 17v4M14.5 17v4M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4',
    search: 'M10.5 3.5a7 7 0 1 1 0 14a7 7 0 1 1 0-14zM20.5 20.5l-5-5',
    globe: 'M12 2.5a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19zM2.5 12h19M12 2.5c2.8 3 2.8 16 0 19M12 2.5c-2.8 3-2.8 16 0 19',
    protein: 'M4 18c3-6 5 2 8-4s5 2 8-4M6 7a1.5 1.5 0 1 1 0 .01M18 17a1.5 1.5 0 1 1 0 .01',
    arrowR: 'M4 12h15M13 6l6 6l-6 6',
    loop: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5',
    brain: 'M9 4.5a3 3 0 0 0-3 3a3 3 0 0 0-2 5.3A3 3 0 0 0 7 18a2.5 2.5 0 0 0 5 .5V6.5a2.5 2.5 0 0 0-3-2zM15 4.5a3 3 0 0 1 3 3a3 3 0 0 1 2 5.3A3 3 0 0 1 17 18a2.5 2.5 0 0 1-5 .5',
    folder: 'M3 6.5a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
    microscope: 'M9 3.5l4 2l-3 6l-4-2zM11 10.5l2.5 1.3M6 21h12M9 21a6 6 0 0 1 8-9.5M14 17.5h4',
    plate: 'M3 6h18v12H3zM7 9.5h.01M11 9.5h.01M15 9.5h.01M19 9.5h.01M7 14.5h.01M11 14.5h.01M15 14.5h.01M19 14.5h.01',
    cloud: 'M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.6a4 4 0 0 1-.5 9.9z',
    server: 'M4 4h16v6H4zM4 14h16v6H4zM7.5 7h.01M7.5 17h.01',
    code: 'M8.5 7L3.5 12l5 5M15.5 7l5 5l-5 5M13.5 4.5l-3 15',
    bolt: 'M13 2.5L4.5 13.5H11l-1 8l8.5-11H12z',
    target: 'M12 2.5a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19zM12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10zM12 11.2a.8.8 0 1 1 0 1.6a.8.8 0 1 1 0-1.6z',
    heart: 'M12 20.5s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8 2.7c0 5.8-8 10.4-8 10.4z',
    leaf: 'M5 19c0-8 6-14 15-14c0 9-6 15-14 15M5 19l7-7',
    atom: 'M12 11.2a.8.8 0 1 1 0 1.6a.8.8 0 1 1 0-1.6zM12 3c4.5 0 5 18 0 18s-4.5-18 0-18zM4.2 7.5c2.2-3.9 17.8 5.1 15.6 9s-17.8-5.1-15.6-9zM19.8 7.5c2.2 3.9-13.4 12.9-15.6 9s13.4-12.9 15.6-9z',
    dollar: 'M12 2.5v19M16.5 6.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3.2s2 2.8 4.5 3.3s4.5 1.5 4.5 3.5s-2 3.5-4.5 3.5s-4.5-1.4-4.5-3.3',
    chart: 'M3.5 20.5h17M6.5 17V11M11 17V6.5M15.5 17v-4M20 17V8'
  };

  function roles() { return ((VM.storyboard && VM.storyboard.style) || {}).roles || {}; }
  function role(k) {
    if (k && typeof k === 'object') return k;
    var r = roles()[k] || {};
    return { key: k, name: r.name || k, label: r.label || r.name || k, color: r.color || 'var(--c-accent)', icon: r.icon || null };
  }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d }); }

  function icon(name, o) {
    o = o || {};
    var s = VM.svg('svg', { viewBox: '0 0 24 24', width: o.size || 24, height: o.size || 24, fill: 'none',
      stroke: o.color || 'currentColor', 'stroke-width': o.sw || 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'k-icon' });
    VM.svg('path', { d: ICONS[name] || ICONS.star }, s);
    return s;
  }
  function pos(el, x, y) {
    el.style.position = 'absolute'; el.style.left = x + 'px'; el.style.top = y + 'px';
    gsap.set(el, { xPercent: -50, yPercent: -50 });
    return el;
  }
  function pop(ctx, el, at, d) {
    ctx.tl.fromTo(el, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: d || 0.5, ease: 'back.out(1.7)', immediateRender: true }, at);
  }
  function glow(ctx, el, at, color, d) {
    ctx.tl.fromTo(el, { boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
      { boxShadow: '0 0 ' + (ctx.u * 4) + 'px ' + (ctx.u * 0.6) + 'px ' + color, duration: d || 0.5, ease: 'power2.out', immediateRender: false }, at);
  }
  function badge(ctx, parent, name, o) {
    o = o || {};
    var size = o.size || ctx.u * 6, c = o.color || 'var(--c-accent)';
    var b = ctx.add('div', { class: 'k-badge', style: { width: size + 'px', height: size + 'px', color: c, borderColor: c,
      background: 'color-mix(in srgb, ' + c + ' 16%, var(--c-surface))' } }, parent);
    b.appendChild(icon(name, { size: size * 0.56, sw: o.sw || 1.9 }));
    return b;
  }
  function safe(ctx) { return ctx.add('div', { class: 'safe' }); }

  // ------------------------------------------------------------------ images
  async function bg(ctx, src, o) {
    o = o || {};
    var wrap = ctx.add('div', { class: 'k-bg' });
    ctx.el.insertBefore(wrap, ctx.el.firstChild);
    var img = ctx.add('img', { src: src, class: 'k-bg-img', alt: '' }, wrap);
    await img.decode();
    var over = o.overlay ? ctx.add('div', { class: 'k-bg-over' }) : null;
    ctx.tl.fromTo(over ? [img, over] : img, { scale: o.from || 1, xPercent: 0, yPercent: 0 },
      { scale: o.to || 1.08, xPercent: o.x || 0, yPercent: o.y || 0, duration: ctx.duration, ease: 'none' }, 0);
    if (o.dim) ctx.add('div', { class: 'k-dim', style: { opacity: o.dim } }, wrap);
    if (o.scrim !== 'none') ctx.add('div', { class: 'k-scrim k-scrim-' + (o.scrim || 'left') }, wrap);
    ctx.add('div', { class: 'k-scrim k-scrim-captions' }, wrap);   // keeps captions legible on bright images
    if (over) wrap.appendChild(over);
    if (o.at != null) ctx.tl.fromTo(wrap, { opacity: 0 }, { opacity: 1, duration: o.fade || 0.8, ease: 'none', immediateRender: true }, o.at);
    return { wrap: wrap, img: img, over: over };
  }
  async function panel(ctx, src, o) {
    var p = ctx.add('div', { class: 'k-panel', style: { left: o.x + 'px', top: o.y + 'px', width: o.w + 'px', height: o.h + 'px' } }, o.parent);
    var img = ctx.add('img', { src: src, alt: '', class: 'k-panel-img', style: o.objectPosition ? { objectPosition: o.objectPosition } : {} }, p);
    await img.decode();
    ctx.tl.fromTo(img, { scale: 1.02 }, { scale: o.zoom || 1.1, duration: ctx.duration, ease: 'none' }, 0);
    if (o.at != null) ctx.tl.fromTo(p, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'power3.out', immediateRender: true }, o.at);
    return { el: p, img: img };
  }

  // ------------------------------------------------------------- text blocks
  function header(ctx, k, o) {
    o = o || {};
    var a = role(k), box = ctx.add('div', { class: 'k-header' }, o.parent || safe(ctx));
    var b = badge(ctx, box, a.icon || 'star', { color: a.color, size: ctx.u * 8.5 });
    var tx = ctx.add('div', { class: 'k-header-text' }, box);
    var nm = ctx.add('div', { class: 'k-header-name', text: o.name || a.name }, tx);
    nm.style.color = a.color;
    var sub = o.sub ? ctx.add('div', { class: 'k-header-sub muted', text: o.sub }, tx) : null;
    var at = o.at || 0;
    pop(ctx, b, at, 0.5);
    ctx.tl.fromTo(tx, { opacity: 0, x: -ctx.u * 3 }, { opacity: 1, x: 0, duration: 0.6, ease: 'power3.out', immediateRender: true }, at + 0.15);
    return { el: box, badge: b, name: nm, sub: sub };
  }
  function title(ctx, text, o) {
    o = o || {};
    var box = ctx.add('div', { class: 'k-title' }, o.parent || safe(ctx));
    var k = o.kicker ? ctx.add('div', { class: 'k-kicker accent', text: o.kicker }, box) : null;
    var t = ctx.add('div', { class: o.size || 't-title', text: text }, box);
    var s = o.sub ? ctx.add('div', { class: 't-body muted', text: o.sub }, box) : null;
    var at = o.at || 0;
    if (k) ctx.tl.fromTo(k, { opacity: 0 }, { opacity: 1, duration: 0.5, immediateRender: true }, at);
    ctx.tl.fromTo(t, { opacity: 0, y: ctx.u * 3 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', immediateRender: true }, at + 0.1);
    if (s) ctx.tl.fromTo(s, { opacity: 0 }, { opacity: 1, duration: 0.6, immediateRender: true }, at + (o.subAt != null ? o.subAt : 0.4));
    return { el: box, title: t, kicker: k, sub: s };
  }
  function chapter(ctx, o) {
    var box = ctx.add('div', { class: 'k-chapter' }, safe(ctx));
    var num = ctx.add('div', { class: 'k-chapter-num', text: o.num }, box);
    var col = ctx.add('div', { class: 'k-chapter-col' }, box);
    var row = ctx.add('div', { class: 'k-chapter-row' }, col);
    var b = o.icon ? badge(ctx, row, o.icon, { color: o.color || 'var(--c-accent)', size: ctx.u * 8 }) : null;
    var t = ctx.add('div', { class: 't-display k-chapter-title', text: o.title }, row);
    var rule = ctx.add('div', { class: 'k-chapter-rule' }, col);
    if (o.color) rule.style.background = o.color;
    var sub = o.sub ? ctx.add('div', { class: 't-head muted', text: o.sub }, col) : null;
    var at = o.at || 0;
    ctx.tl.fromTo(num, { opacity: 0, x: -ctx.u * 4 }, { opacity: 1, x: 0, duration: 0.8, ease: 'expo.out', immediateRender: true }, at);
    if (b) pop(ctx, b, at + 0.2, 0.5);
    ctx.tl.fromTo(t, { opacity: 0, x: ctx.u * 4 }, { opacity: 1, x: 0, duration: 0.8, ease: 'expo.out', immediateRender: true }, at + 0.25);
    ctx.tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'power3.inOut', transformOrigin: '0% 50%', immediateRender: true }, at + 0.45);
    if (sub) ctx.tl.fromTo(sub, { opacity: 0 }, { opacity: 1, duration: 0.6, immediateRender: true }, at + (o.subAt != null ? o.subAt : 0.8));
    H.drift(ctx, box, { to: 1.025 });
    return { el: box, num: num, title: t, sub: sub, badge: b };
  }
  async function chapterScene(ctx, o) {
    o = o || {};
    if (o.bg) await bg(ctx, o.bg, { scrim: 'left', dim: o.dim != null ? o.dim : 0.35, from: 1.02, to: 1.1 });
    return chapter(ctx, { num: ctx.text[0], title: ctx.text[1], sub: o.sub, icon: o.icon, color: o.color, at: ctx.at('num', 0.2) });
  }
  function note(ctx, text, o) {
    o = o || {};
    var n = ctx.add('div', { class: 'k-note t-small muted', text: text });
    if (o.align === 'left') { n.style.left = '5%'; n.style.textAlign = 'left'; } else { n.style.right = '5%'; }
    if (o.y != null) n.style.top = o.y + 'px';
    ctx.tl.fromTo(n, { opacity: 0 }, { opacity: 1, duration: 0.6, immediateRender: true }, o.at != null ? o.at : 0.6);
    return n;
  }

  // ------------------------------------------------------------ small parts
  function chip(ctx, parent, k, o) {
    o = o || {};
    var a = role(k);
    var c = ctx.add('div', { class: 'k-chip' + (o.big ? ' is-big' : '') }, parent || ctx.el);
    c.style.borderColor = a.color;
    if (a.icon) c.appendChild(icon(a.icon, { size: (o.big ? ctx.u * 3.6 : ctx.u * 2.9), color: a.color }));
    ctx.add('span', { text: a.label || a.name }, c);
    if (o.x != null) pos(c, o.x, o.y);
    if (o.at != null) pop(ctx, c, o.at, 0.45);
    return c;
  }
  function pill(ctx, parent, text, o) {
    o = o || {};
    var p = ctx.add('div', { class: 'k-pill' + (o.fill ? ' is-fill' : ''), text: text }, parent || ctx.el);
    if (o.color) { p.style.borderColor = o.color; p.style.color = o.fill ? 'var(--c-bg)' : o.color; if (o.fill) p.style.background = o.color; }
    if (o.x != null) pos(p, o.x, o.y);
    if (o.at != null) pop(ctx, p, o.at, 0.4);
    return p;
  }
  function card(ctx, parent, o) {
    o = o || {};
    var c = ctx.add('div', { class: 'k-card', style: { width: (o.w || ctx.u * 32) + 'px' } }, parent || ctx.el);
    if (o.color) c.style.borderColor = o.color;
    var top = ctx.add('div', { class: 'k-card-top' }, c);
    var dot = ctx.add('span', { class: 'k-card-dot' }, top);
    dot.style.background = o.color || 'var(--c-accent)';
    var tt = ctx.add('span', { class: 'k-card-title', text: o.title || '' }, top);
    var val = o.value != null ? ctx.add('span', { class: 'k-card-value tabular', text: typeof o.value === 'number' ? fmt(o.value) : o.value }, top) : null;
    var n = o.lines != null ? o.lines : 2;
    for (var i = 0; i < n; i++) ctx.add('div', { class: 'k-card-line', style: { width: (i === n - 1 ? 45 + ctx.random() * 20 : 78 + ctx.random() * 20) + '%' } }, c);
    if (o.text) ctx.add('div', { class: 'k-card-text t-small', text: o.text }, c);
    if (o.x != null) pos(c, o.x, o.y);
    if (o.at != null) pop(ctx, c, o.at, 0.5);
    return { el: c, value: val, title: tt, dot: dot };
  }
  function stamp(ctx, parent, text, o) {
    o = o || {};
    var s = ctx.add('div', { class: 'k-stamp', text: text }, parent || ctx.el);
    s.style.color = o.color || 'var(--c-warn)'; s.style.borderColor = o.color || 'var(--c-warn)';
    pos(s, o.x, o.y);
    ctx.tl.fromTo(s, { opacity: 0, scale: 1.8, rotation: (o.rot || -8) - 6 },
      { opacity: 1, scale: 1, rotation: o.rot || -8, duration: 0.35, ease: 'power4.in', immediateRender: true }, o.at || 0);
    return s;
  }

  // -------------------------------------------------------------------- UI
  function app(ctx, o) {
    var el = ctx.add('div', { class: 'k-app', style: { left: o.x + 'px', top: o.y + 'px', width: o.w + 'px', height: o.h + 'px' } }, o.parent);
    var bar = ctx.add('div', { class: 'k-app-bar' }, el);
    ['#ff6b6b', '#ffb454', '#7ee0a1'].forEach(function (c) { ctx.add('span', { class: 'k-app-dot', style: { background: c } }, bar); });
    ctx.add('span', { class: 'k-app-title', text: o.title || 'App' }, bar);
    if (o.tag !== false) ctx.add('span', { class: 'k-app-tag', text: o.tag || 'illustrative' }, bar);
    var body = ctx.add('div', { class: 'k-app-body' }, el);
    if (o.at != null) ctx.tl.fromTo(el, { opacity: 0, y: ctx.u * 4 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', immediateRender: true }, o.at);
    return { el: el, body: body, bar: bar };
  }
  function field(ctx, parent, label, o) {
    o = o || {};
    var f = ctx.add('div', { class: 'k-field' }, parent);
    ctx.add('div', { class: 'k-field-label', text: label }, f);
    var t = ctx.add('div', { class: 'k-field-text' + (o.mono ? ' t-mono' : ''), text: o.text || '' }, f);
    if (o.minH) t.style.minHeight = o.minH + 'px';
    return { el: f, text: t };
  }
  function button(ctx, parent, label, ic) {
    var b = ctx.add('div', { class: 'k-btn' }, parent);
    if (ic) b.appendChild(icon(ic, { size: ctx.u * 2.8 }));
    ctx.add('span', { text: label }, b);
    return b;
  }
  function press(ctx, btn, at, color) {
    color = color || 'var(--c-accent)';
    ctx.tl.fromTo(btn, { scale: 1 }, { scale: 0.92, duration: 0.12, ease: 'power2.out', immediateRender: false }, at);
    ctx.tl.fromTo(btn, { scale: 0.92 }, { scale: 1, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, at + 0.12);
    ctx.tl.fromTo(btn, { backgroundColor: 'rgba(0,0,0,0)', borderColor: 'var(--c-line)' },
      { backgroundColor: 'color-mix(in srgb, ' + color + ' 28%, transparent)', borderColor: color, duration: 0.25, immediateRender: false }, at);
  }
  function tracker(ctx, step, labels, o) {
    o = o || {};
    var box = ctx.add('div', { class: 'k-tracker' });
    if (o.scale) { box.style.transform = 'scale(' + o.scale + ')'; box.style.transformOrigin = '100% 0%'; }
    labels.forEach(function (l, i) {
      var d = ctx.add('div', { class: 'k-tracker-step' + (i + 1 < step ? ' is-done' : '') + (i + 1 === step ? ' is-now' : '') }, box);
      ctx.add('span', { class: 'k-tracker-dot', text: String(i + 1) }, d);
      ctx.add('span', { class: 'k-tracker-label', text: l }, d);
      if (i < labels.length - 1) ctx.add('span', { class: 'k-tracker-bar' + (i + 1 < step ? ' is-done' : '') }, box);
    });
    var now = box.querySelector('.is-now .k-tracker-dot');
    if (now) ctx.tl.fromTo(now, { scale: 0.6 }, { scale: 1, duration: 0.5, ease: 'back.out(2)', immediateRender: true }, o.at != null ? o.at : 0.3);
    return box;
  }

  H.kit = {
    ICONS: ICONS, icon: icon, pos: pos, pop: pop, glow: glow, badge: badge, role: role, roles: roles, fmt: fmt, safe: safe,
    bg: bg, panel: panel, header: header, title: title, chapter: chapter, chapterScene: chapterScene, note: note,
    chip: chip, pill: pill, card: card, stamp: stamp, app: app, field: field, button: button, press: press, tracker: tracker
  };
})(window);
