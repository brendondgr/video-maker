/*!
 * video-maker runtime (VM)
 * ---------------------------------------------------------------------------
 * Turns a storyboard.json + a set of scene builders into ONE paused, seekable
 * GSAP master timeline. Nothing here depends on the wall clock: the renderer
 * calls window.__vm.seek(t) for every frame and screenshots the result, so the
 * same inputs always produce the same frames.
 *
 * Contract (see references/composition-contract.md):
 *   VM.scene(id, { build(ctx) { ... } })   register a builder for storyboard scene `id`
 *   VM.start({ storyboard: 'storyboard.json' })
 *   window.__vm = { ready, duration, fps, width, height, frames, scenes, seek(t),
 *                   warnings, errors, storyboard }
 *
 * Rules the runtime relies on (the linter enforces them):
 *   - every animation lives on ctx.tl (or a timeline nested in it); no free-running tweens
 *   - anything drawn imperatively (canvas, WebGL, text computed from a number) is
 *     drawn inside ctx.onFrame(fn), which runs after every seek
 *   - randomness comes from ctx.random() (seeded per scene), never Math.random
 *   - no setTimeout / setInterval / requestAnimationFrame / Date.now / CSS animations
 */
(function (global) {
  'use strict';

  var gsap = global.gsap;
  if (!gsap) throw new Error('[vm] GSAP must be loaded before vm.js');

  // Register whichever bundled plugins are present (all free since GSAP 3.13).
  ['SplitText', 'TextPlugin', 'DrawSVGPlugin', 'MorphSVGPlugin', 'MotionPathPlugin', 'CustomEase']
    .forEach(function (n) { if (global[n]) gsap.registerPlugin(global[n]); });

  // 2D transforms only: 3D promotion creates compositor layers whose rasterisation
  // differs by a level or two between frames, and softens text mid-tween.
  gsap.config({ force3D: false, nullTargetWarn: false });
  gsap.ticker.lagSmoothing(0);

  var params = new URLSearchParams(global.location.search);
  // Render mode is the default so external players (HyperFrames render/Studio) get a clean
  // frame; our own scrubber UI mounts only with ?preview (what preview.mjs opens).
  var RENDER = !params.has('preview');
  var builders = {};
  var order = [];
  var overlays = {};

  // ---------------------------------------------------------------- utilities
  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Global randomness is seeded too, so third-party code that calls Math.random
  // (d3-force jiggle, rough.js without a seed, ...) is still reproducible.
  Math.random = mulberry32(0xC0FFEE);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function el(tag, attrs, parent) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(n.style, attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(n);
    return n;
  }
  function svg(tag, attrs, parent) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(n);
    return n;
  }

  // ------------------------------------------------------------ style tokens
  function applyStyle(style, canvas) {
    var root = document.documentElement.style;
    var pal = (style && style.palette) || {};
    Object.keys(pal).forEach(function (k) { root.setProperty('--c-' + k, pal[k]); });
    var fonts = (style && style.fonts) || {};
    Object.keys(fonts).forEach(function (k) { root.setProperty('--f-' + k, fonts[k]); });
    // One "unit" = 1/100 of the short side. Size type in u so a 1080p and a
    // vertical 1080x1920 composition scale sensibly from the same scene code.
    var u = Math.min(canvas.width, canvas.height) / 100;
    root.setProperty('--u', u + 'px');
    root.setProperty('--w', canvas.width + 'px');
    root.setProperty('--h', canvas.height + 'px');
    root.setProperty('--safe', (canvas.safe_area != null ? canvas.safe_area : 0.05) * 100 + '%');
    if (canvas.background) root.setProperty('--c-bg', canvas.background);
  }

  // -------------------------------------------------------------- transitions
  // Each transition animates the INCOMING scene over `duration` seconds, while
  // the outgoing scene stays visible underneath until its own end.
  var TRANSITIONS = {
    cut: function () {},
    fade: function (tl, sEl, at, d) {
      tl.fromTo(sEl, { opacity: 0 }, { opacity: 1, duration: d, ease: 'none', immediateRender: false }, at);
    },
    'slide-left': function (tl, sEl, at, d, ease) {
      tl.fromTo(sEl, { xPercent: 100 }, { xPercent: 0, duration: d, ease: ease || 'power3.inOut', immediateRender: false }, at);
    },
    'slide-up': function (tl, sEl, at, d, ease) {
      tl.fromTo(sEl, { yPercent: 100 }, { yPercent: 0, duration: d, ease: ease || 'power3.inOut', immediateRender: false }, at);
    },
    wipe: function (tl, sEl, at, d, ease) {
      tl.fromTo(sEl, { clipPath: 'inset(0% 100% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: d, ease: ease || 'power2.inOut', immediateRender: false }, at);
    },
    iris: function (tl, sEl, at, d, ease) {
      tl.fromTo(sEl, { clipPath: 'circle(0% at 50% 50%)' },
        { clipPath: 'circle(75% at 50% 50%)', duration: d, ease: ease || 'power2.inOut', immediateRender: false }, at);
    },
    zoom: function (tl, sEl, at, d, ease) {
      tl.fromTo(sEl, { opacity: 0, scale: 1.08 },
        { opacity: 1, scale: 1, duration: d, ease: ease || 'power2.out', immediateRender: false }, at);
    },
    blur: function (tl, sEl, at, d) {
      tl.fromTo(sEl, { opacity: 0, filter: 'blur(24px)' },
        { opacity: 1, filter: 'blur(0px)', duration: d, ease: 'power2.out', immediateRender: false }, at);
    }
  };

  // ------------------------------------------------------------------ public
  var VM = {
    RENDER: RENDER,
    TRANSITIONS: TRANSITIONS,
    helpers: {},
    el: el,
    svg: svg,
    clamp: clamp,
    seeded: function (s) { return mulberry32(typeof s === 'number' ? s : hashString(String(s))); },

    /** Register a builder. `def` is { build(ctx) } or just the build function. */
    scene: function (id, def) {
      if (builders[id]) console.warn('[vm] scene "' + id + '" registered twice; last one wins');
      builders[id] = typeof def === 'function' ? { build: def } : def;
      order.push(id);
    },

    /** Add a transition type usable from storyboard `transition_in.type`. */
    transition: function (name, fn) { TRANSITIONS[name] = fn; },

    /**
     * Register a whole-video overlay layer (captions, watermark, progress bar…). Its builder
     * gets a ctx like a scene's, but ctx.tl spans the full timeline (time 0 = video start).
     * Enabled overlays: storyboard.overlays: ["name" | {name, …options}] plus captions when
     * audio.captions.enabled. build(ctx, data) receives options (or the caption groups).
     */
    overlay: function (name, def) { overlays[name] = typeof def === 'function' ? { build: def } : def; },

    start: function (opts) { return start(opts || {}).catch(fail); }
  };

  function fail(err) {
    console.error('[vm] start failed:', err && err.stack || err);
    global.__vm = global.__vm || {};
    global.__vm.ready = false;
    global.__vm.failed = true;
    global.__vm.errors = (global.__vm.errors || []).concat([String(err && err.message || err)]);
    var box = document.getElementById('vm-fatal') || el('pre', { id: 'vm-fatal' }, document.body);
    box.textContent = 'video-maker: ' + (err && err.stack || err);
  }

  async function loadStoryboard(src) {
    if (src && typeof src === 'object') return src;
    var res = await fetch(src || 'storyboard.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('could not load storyboard (' + res.status + ')');
    return res.json();
  }

  async function start(opts) {
    var sb = await loadStoryboard(opts.storyboard);
    VM.storyboard = sb;   // read-only for helpers that need project tokens (e.g. kit roles)
    var canvas = Object.assign({ width: 1920, height: 1080, fps: 30, safe_area: 0.05 }, sb.canvas || {});
    var W = canvas.width, H = canvas.height, FPS = canvas.fps;
    var warnings = [], errors = [];

    applyStyle(sb.style || {}, canvas);
    document.documentElement.classList.toggle('vm-render', RENDER);
    document.documentElement.classList.toggle('vm-preview', !RENDER);

    var stage = document.getElementById('stage') || el('div', { id: 'stage' }, document.body);
    stage.style.width = W + 'px';
    stage.style.height = H + 'px';
    stage.dataset.width = W; stage.dataset.height = H;

    // Measuring text (SplitText, KaTeX, layout) before fonts load gives wrong
    // boxes, so builders only run once every declared font face is ready.
    if (document.fonts && document.fonts.ready) {
      try {
        var fams = Object.values((sb.style && sb.style.fonts) || {});
        await Promise.all(fams.map(function (f) {
          return document.fonts.load('400 1em ' + f).catch(function () {});
        }));
        await document.fonts.ready;
      } catch (e) { /* non-fatal */ }
    }

    // Kept in a variable rather than read back from master.vars: HyperFrames' page wraps
    // gsap.timeline and the vars object it returns doesn't carry `defaults`.
    var tlDefaults = { ease: (sb.style && sb.style.motion && sb.style.motion.ease) || 'power3.out' };
    var master = gsap.timeline({ paused: true, defaults: tlDefaults });
    var sceneRecords = [];
    var cursor = 0;
    var scenes = sb.scenes || [];
    if (!scenes.length) throw new Error('storyboard has no scenes');

    for (var i = 0; i < scenes.length; i++) {
      var spec = scenes[i];
      var def = builders[spec.id];
      var sEl = el('section', { class: 'vm-scene', 'data-scene': spec.id }, stage);
      if (spec.background) sEl.style.background = spec.background;
      var dur = +spec.duration;
      if (!(dur > 0)) throw new Error('scene "' + spec.id + '" needs a positive duration');

      var tr = spec.transition_in || { type: 'cut', duration: 0 };
      var trDur = i === 0 ? 0 : Math.min(+tr.duration || 0, dur, sceneRecords[i - 1].duration);
      var at = Math.max(0, cursor - trDur);

      var tl = gsap.timeline({ defaults: tlDefaults });
      var frameFns = [];
      var ctx = makeCtx(spec, sEl, tl, frameFns, sb, canvas, at);
      // Each scene gets its own Math.random stream, so a scene builds the same whether it is
      // rendered alone (?solo=) or after any other scenes, and editing one scene never
      // changes another's randomness.
      Math.random = mulberry32(hashString('Math.random:' + spec.id));

      if (!def) {
        errors.push('no builder registered for storyboard scene "' + spec.id + '"');
        placeholder(ctx);
      } else {
        try { await def.build(ctx); }
        catch (e) {
          errors.push('scene "' + spec.id + '" build threw: ' + (e && e.message || e));
          console.error(e);
          placeholder(ctx, e);
        }
      }

      var built = tl.duration();
      if (built > dur + 1 / FPS) {
        warnings.push('scene "' + spec.id + '" animates for ' + built.toFixed(2) + 's but is ' + dur +
          's long; the tail will be cut');
      }
      // Pin the local timeline to exactly the scene duration.
      tl.set({}, {}, dur);
      master.add(tl, at);

      sEl.style.zIndex = String(i + 1);
      var tFn = TRANSITIONS[tr.type || 'cut'];
      if (!tFn) { warnings.push('unknown transition "' + tr.type + '" on scene "' + spec.id + '"; using cut'); tFn = TRANSITIONS.cut; }
      // (master, incoming, start, duration, ease, outgoing, transition spec)
      if (i > 0 && trDur > 0) tFn(master, sEl, at, trDur, tr.ease, sceneRecords[i - 1].el, tr);

      sceneRecords.push({ id: spec.id, start: at, end: at + dur, duration: dur, el: sEl, frameFns: frameFns, zIndex: i });
      cursor = at + dur;
    }

    var total = cursor;
    Math.random = mulberry32(0xC0FFEE);

    // Whole-video overlays sit above every scene and run on composition time.
    var overlayRecords = [];
    var wanted = (sb.overlays || []).map(function (o) { return typeof o === 'string' ? { name: o } : o; });
    if (sb.audio && sb.audio.captions && sb.audio.captions.enabled) {
      if (opts.captions) wanted.push({ name: 'captions', data: opts.captions });
      else warnings.push('audio.captions.enabled but audio/captions.json is missing — run voiceover.mjs');
    }
    for (var oi = 0; oi < wanted.length; oi++) {
      var ow = wanted[oi], odef = overlays[ow.name];
      if (!odef) { errors.push('no overlay registered as "' + ow.name + '"'); continue; }
      var oEl = el('section', { class: 'vm-overlay', 'data-overlay': ow.name }, stage);
      oEl.style.zIndex = String(1000 + oi);
      var otl = gsap.timeline({ defaults: tlDefaults }), oFns = [];
      var octx = makeCtx({ id: 'overlay-' + ow.name, duration: total, beats: [] }, oEl, otl, oFns, sb, canvas, 0);
      try { await odef.build(octx, ow.data !== undefined ? ow.data : ow); }
      catch (e) { errors.push('overlay "' + ow.name + '" build threw: ' + (e && e.message || e)); console.error(e); }
      otl.set({}, {}, total);
      master.add(otl, 0);
      overlayRecords.push({ id: ow.name, el: oEl, frameFns: oFns });
    }

    // Guarantee the master's duration equals the storyboard's total.
    master.set({}, {}, total);

    var lastT = -1, seeking = false;
    function seek(t) {
      t = clamp(+t || 0, 0, total);
      seeking = true;
      master.totalTime(t, true);           // suppressEvents: callbacks never fire
      seeking = false;
      return applyFrame(t);
    }
    // External seek-based renderers (HyperFrames) only move the GSAP timeline, so the
    // per-frame work (scene visibility, onFrame drawing) also runs from the master's
    // onUpdate. Our own seek suppresses events and calls applyFrame itself.
    master.eventCallback('onUpdate', function () { if (!seeking) applyFrame(master.time()); });
    function applyFrame(t) {
      for (var k = 0; k < sceneRecords.length; k++) {
        var r = sceneRecords[k];
        // End is exclusive, except the final scene which owns the last frame.
        var on = t >= r.start && (t < r.end || (k === sceneRecords.length - 1 && t <= r.end));
        r.el.style.visibility = on ? 'visible' : 'hidden';
        r.el.classList.toggle('is-active', on);
        if (on) {
          var local = t - r.start;
          for (var j = 0; j < r.frameFns.length; j++) {
            try { r.frameFns[j](local, t); }
            catch (e) {
              var msg = 'onFrame error in scene "' + r.id + '": ' + (e && e.message || e);
              if (errors.indexOf(msg) < 0) errors.push(msg);
            }
          }
        }
      }
      for (var q = 0; q < overlayRecords.length; q++) {
        for (var z = 0; z < overlayRecords[q].frameFns.length; z++) {
          try { overlayRecords[q].frameFns[z](t, t); }
          catch (e) { var om = 'onFrame error in overlay "' + overlayRecords[q].id + '": ' + (e && e.message || e); if (errors.indexOf(om) < 0) errors.push(om); }
        }
      }
      lastT = t;
      return t;
    }

    seek(0);

    var api = {
      ready: true,
      version: 1,
      render: RENDER,
      duration: total,
      fps: FPS,
      width: W,
      height: H,
      frames: Math.max(1, Math.round(total * FPS)),
      scenes: sceneRecords.map(function (r) { return { id: r.id, start: r.start, end: r.end, duration: r.duration }; }),
      overlays: overlayRecords.map(function (r) { return r.id; }),
      storyboard: sb,
      warnings: warnings,
      errors: errors,
      timeline: master,
      seek: seek,
      time: function () { return lastT; },
      registered: order.slice()
    };
    global.__vm = api;
    // HyperFrames-style registration, so external seek-based renderers can find the timeline.
    global.__timelines = global.__timelines || {};
    global.__timelines.main = master;

    if (!RENDER && VM.preview) VM.preview(api, stage);
    document.documentElement.classList.add('vm-ready');
    return api;
  }

  // ---------------------------------------------------------------- scene ctx
  function makeCtx(spec, sEl, tl, frameFns, sb, canvas, sceneStart) {
    var beats = spec.beats || [];
    var ctx = {
      id: spec.id,
      spec: spec,
      data: spec.data || {},
      text: spec.on_screen_text || [],
      el: sEl,
      tl: tl,
      duration: +spec.duration,
      start: sceneStart,
      width: canvas.width,
      height: canvas.height,
      fps: canvas.fps,
      u: Math.min(canvas.width, canvas.height) / 100,
      portrait: canvas.height > canvas.width,
      style: sb.style || {},
      palette: (sb.style && sb.style.palette) || {},
      storyboard: sb,
      random: mulberry32(hashString(spec.id)),
      /** Run fn(localTime, globalTime) after every seek while this scene is visible. */
      onFrame: function (fn) { frameFns.push(fn); return fn; },
      /**
       * Time (seconds, scene-local) of a named/indexed beat from the storyboard.
       * Keeping times in the storyboard means a future voice-over pass can retime
       * beats from word timestamps without touching scene code.
       */
      at: function (key, fallback) {
        var b = typeof key === 'number' ? beats[key] : beats.filter(function (x) { return x.id === key; })[0];
        if (b && typeof b.t === 'number') return b.t;
        if (fallback != null) return fallback;
        throw new Error('scene "' + spec.id + '" has no beat "' + key + '"');
      },
      /** Shorthand for creating an element inside the scene (or a given parent). */
      add: function (tag, attrs, parent) { return el(tag, attrs, parent || sEl); },
      svg: function (attrs, parent) {
        var s = svg('svg', Object.assign({ width: canvas.width, height: canvas.height,
          viewBox: '0 0 ' + canvas.width + ' ' + canvas.height }, attrs || {}), parent || sEl);
        s.classList.add('vm-svg');
        return s;
      },
      /** A HiDPI-correct <canvas>; draw inside ctx.onFrame. */
      canvas: function (opts) {
        opts = opts || {};
        var w = opts.width || canvas.width, h = opts.height || canvas.height;
        var dpr = global.devicePixelRatio || 1;
        var c = el('canvas', { class: 'vm-canvas' }, opts.parent || sEl);
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        c.style.width = w + 'px'; c.style.height = h + 'px';
        // Full-frame canvases are full-bleed by design; tell HyperFrames' layout check.
        if (w === canvas.width && h === canvas.height) c.setAttribute('data-layout-allow-overflow', '');
        var g = c.getContext(opts.context || '2d', opts.contextOptions);
        if (g && g.setTransform) g.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { el: c, g: g, width: w, height: h, dpr: dpr };
      },
      /** ES module import resolved through the page's import map (e.g. 'three'). */
      import: function (spec) { return import(spec); }
    };
    return ctx;
  }

  function placeholder(ctx, err) {
    var box = ctx.add('div', { class: 'vm-placeholder' });
    box.innerHTML = '<b>' + ctx.id + '</b><span>' + (err ? 'build error: ' + (err.message || err) :
      'no builder registered') + '</span><small>' + ((ctx.spec.visual && ctx.spec.visual.type) || '') + '</small>';
  }

  global.VM = VM;
})(window);
