/* Motion vocabulary: named enter/exit presets so every scene in a video moves
 * the same way. Presets are data, so a style can override them wholesale via
 * storyboard.style.motion.presets or VMX.motion.define(name, {from, to}).
 *
 *   VMX.enter(ctx, '.item', { at: 0.4, preset: 'rise', stagger: 0.08 })
 *   VMX.exit(ctx, '.item',  { at: ctx.duration - 0.6, preset: 'fade' })
 *   VMX.hold(ctx)  -> time at which exits should start (duration - exitLead)
 */
(function (global) {
  'use strict';
  var VM = global.VM, gsap = global.gsap;
  var H = VM.helpers;

  var PRESETS = {
    fade:   { from: { opacity: 0 } },
    rise:   { from: { opacity: 0, y: 'calc(var(--u) * 4)' } },
    drop:   { from: { opacity: 0, y: 'calc(var(--u) * -4)' } },
    'slide-left':  { from: { opacity: 0, x: 'calc(var(--u) * 8)' } },
    'slide-right': { from: { opacity: 0, x: 'calc(var(--u) * -8)' } },
    pop:    { from: { opacity: 0, scale: 0.6 }, ease: 'back.out(1.8)' },
    blur:   { from: { opacity: 0, filter: 'blur(16px)' } },
    grow:   { from: { scaleX: 0, transformOrigin: '0% 50%' }, ease: 'power3.inOut' },
    'grow-y': { from: { scaleY: 0, transformOrigin: '50% 100%' }, ease: 'power3.out' },
    mask:   { from: { clipPath: 'inset(0% 0% 100% 0%)' }, to: { clipPath: 'inset(0% 0% 0% 0%)' }, ease: 'power3.out' }
  };

  function resolveTargets(ctx, targets) {
    if (typeof targets === 'string') return ctx.el.querySelectorAll(targets);
    return targets;
  }
  // GSAP cannot tween calc(); convert calc(var(--u) * n) to px for this canvas.
  function px(ctx, v) {
    if (typeof v !== 'string') return v;
    var m = v.match(/^calc\(var\(--u\)\s*\*\s*(-?[\d.]+)\)$/);
    return m ? (+m[1] * ctx.u) : v;
  }
  function norm(ctx, obj) {
    var o = {};
    Object.keys(obj || {}).forEach(function (k) { o[k] = px(ctx, obj[k]); });
    return o;
  }
  function motionCfg(ctx) { return (ctx.style && ctx.style.motion) || {}; }

  H.motion = {
    presets: PRESETS,
    define: function (name, def) { PRESETS[name] = def; },
    px: px
  };

  H.enter = function (ctx, targets, o) {
    o = o || {};
    var mc = motionCfg(ctx);
    var p = (mc.presets && mc.presets[o.preset]) || PRESETS[o.preset || 'rise'];
    if (!p) throw new Error('unknown motion preset "' + o.preset + '"');
    var t = resolveTargets(ctx, targets);
    var from = norm(ctx, Object.assign({}, p.from, o.from));
    var to = Object.assign({ opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, filter: 'blur(0px)' }, norm(ctx, p.to), norm(ctx, o.to));
    // Only animate the properties the preset actually changes.
    Object.keys(to).forEach(function (k) { if (!(k in from) && !(p.to && k in p.to) && !(o.to && k in o.to)) delete to[k]; });
    to.duration = o.duration != null ? o.duration : (mc.base || 0.7);
    to.ease = o.ease || p.ease || mc.ease || 'power3.out';
    if (o.stagger != null) to.stagger = o.stagger;
    ctx.tl.fromTo(t, from, to, o.at != null ? o.at : 0);
    return ctx.tl;
  };

  H.exit = function (ctx, targets, o) {
    o = o || {};
    var mc = motionCfg(ctx);
    var p = PRESETS[o.preset || 'fade'];
    var t = resolveTargets(ctx, targets);
    var to = norm(ctx, Object.assign({}, p.from, o.to));
    if (p.to && p.to.clipPath) to.clipPath = 'inset(100% 0% 0% 0%)';
    to.duration = o.duration != null ? o.duration : (mc.exit || 0.45);
    to.ease = o.ease || 'power2.in';
    if (o.stagger != null) to.stagger = o.stagger;
    ctx.tl.to(t, to, o.at != null ? o.at : H.hold(ctx, to.duration));
    return ctx.tl;
  };

  /** Latest time an exit of length `d` can start and still finish inside the scene. */
  H.hold = function (ctx, d) {
    return Math.max(0, ctx.duration - (d != null ? d : ((motionCfg(ctx).exit) || 0.45)) - 0.05);
  };

  /** Slow continuous drift so a held frame never looks frozen (Ken Burns for layouts). */
  H.drift = function (ctx, target, o) {
    o = o || {};
    ctx.tl.fromTo(resolveTargets(ctx, target), { scale: o.from || 1 },
      { scale: o.to || 1.04, duration: o.duration || ctx.duration, ease: 'none' }, o.at || 0);
  };
})(window);
