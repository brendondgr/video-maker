/* video-maker boot loader.
 * A project's index.html only needs:  vm.css, style.css, the import map, and this file.
 * Boot order: engine libraries -> project extra scripts (storyboard.assets.scripts)
 *             -> one scene file per storyboard scene -> VM.start().
 * Scene file path: scene.module if given, else `scenes/<id>.js`.
 */
(function () {
  'use strict';
  // Engine base = the directory above this file, so projects work under any static server
  // (ours at /_engine/, HyperFrames' through the project's _engine link).
  var E = new URL('../', (document.currentScript && document.currentScript.src) || (location.origin + '/_engine/runtime/boot.js')).href;
  var LIBS = [
    'node_modules/gsap/dist/gsap.min.js',
    'node_modules/gsap/dist/SplitText.min.js',
    'node_modules/gsap/dist/TextPlugin.min.js',
    'node_modules/gsap/dist/DrawSVGPlugin.min.js',
    'node_modules/gsap/dist/MorphSVGPlugin.min.js',
    'node_modules/gsap/dist/MotionPathPlugin.min.js',
    'node_modules/gsap/dist/CustomEase.min.js',
    'node_modules/d3/dist/d3.min.js',
    'node_modules/katex/dist/katex.min.js',
    'node_modules/roughjs/bundled/rough.js',
    'runtime/vm.js',
    'runtime/transitions.js',
    'runtime/preview.js',
    'runtime/helpers/motion.js',
    'runtime/helpers/text.js',
    'runtime/helpers/data.js',
    'runtime/helpers/science.js',
    'runtime/helpers/three.js',
    'runtime/helpers/figures.js',
    'runtime/helpers/captions.js'
  ].map(function (p) { return E + p; });

  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function fatal(e) {
    console.error('[boot]', e);
    window.__vm = { ready: false, failed: true, errors: [String(e && e.message || e)] };
    var pre = document.createElement('pre');
    pre.id = 'vm-fatal'; pre.textContent = 'video-maker boot failed: ' + (e && e.stack || e);
    (document.body || document.documentElement).appendChild(pre);
  }

  async function boot() {
    for (var i = 0; i < LIBS.length; i++) await load(LIBS[i]);
    window.VMX = window.VM.helpers;
    var res = await fetch('storyboard.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('storyboard.json not found (' + res.status + ')');
    var sb = await res.json();
    var extra = (sb.assets && sb.assets.scripts) || [];
    for (var j = 0; j < extra.length; j++) await load(extra[j]);
    var seen = {};
    var files = (sb.scenes || []).map(function (s) { return s.module || ('scenes/' + s.id + '.js'); })
      .filter(function (f) { if (seen[f]) return false; seen[f] = 1; return true; });
    for (var k = 0; k < files.length; k++) {
      try { await load(files[k]); }
      catch (e) { console.error('[boot] ' + e.message); (window.__vmBootErrors = window.__vmBootErrors || []).push(e.message); }
    }
    var captions = null;
    if (sb.audio && sb.audio.captions && sb.audio.captions.enabled) {
      var cr = await fetch('audio/captions.json', { cache: 'no-store' }).catch(function () { return null; });
      if (cr && cr.ok) captions = (await cr.json()).groups;
    }
    var api = await window.VM.start({ storyboard: sb, captions: captions });
    if (api && window.__vmBootErrors) api.errors.push.apply(api.errors, window.__vmBootErrors);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot().catch(fatal); });
  else boot().catch(fatal);
})();
