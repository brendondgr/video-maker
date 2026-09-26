/* Preview player: only mounted when the page is opened WITHOUT ?render.
 * Scales the stage to fit the window and adds play / scrub / scene markers.
 * Playback uses requestAnimationFrame to advance time and calls the same
 * __vm.seek(t) the renderer uses, so what you scrub is what renders.
 *
 * Keys: Space play/pause · ←/→ one frame · Shift+←/→ one second · [ / ] prev/next scene · Home/End
 * URL:  ?t=12.5 opens at 12.5 s · ?scene=id opens at that scene · ?loop
 */
(function (global) {
  'use strict';
  var VM = global.VM;

  VM.preview = function (vm, stage) {
    var params = new URLSearchParams(location.search);
    var css = document.createElement('style');
    css.textContent = [
      'body.vmp{background:#07090d;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}',
      '.vmp-wrap{position:relative;box-shadow:0 20px 60px rgba(0,0,0,.6)}',
      '.vmp-bar{position:fixed;left:0;right:0;bottom:0;padding:10px 16px 12px;background:rgba(10,13,19,.92);border-top:1px solid #1d2533;font:12px/1.2 ui-monospace,monospace;color:#b8c2d3;display:flex;flex-direction:column;gap:8px;z-index:50}',
      '.vmp-row{display:flex;gap:12px;align-items:center}',
      '.vmp-bar button{background:#18202d;color:#e8edf5;border:1px solid #2b3647;border-radius:6px;padding:5px 10px;font:inherit;cursor:pointer}',
      '.vmp-track{position:relative;flex:1;height:22px;cursor:pointer}',
      '.vmp-seg{position:absolute;top:4px;height:14px;border-radius:3px;background:#1a2331;border:1px solid #2a3547;overflow:hidden;white-space:nowrap;font-size:10px;color:#7f8ca1;padding:1px 4px;box-sizing:border-box}',
      '.vmp-seg.on{border-color:#5eb0ff;color:#d7e9ff}',
      '.vmp-head{position:absolute;top:0;width:2px;height:22px;background:#ff5d5d;pointer-events:none}',
      '.vmp-time{min-width:150px;text-align:right}'
    ].join('');
    document.head.appendChild(css);
    document.body.classList.add('vmp');

    var wrap = document.createElement('div');
    wrap.className = 'vmp-wrap';
    stage.parentNode.insertBefore(wrap, stage);
    wrap.appendChild(stage);

    var bar = document.createElement('div');
    bar.className = 'vmp-bar';
    bar.innerHTML = '<div class="vmp-row"><button data-a="play">▶ Play</button><button data-a="prev">⟨ scene</button>' +
      '<button data-a="next">scene ⟩</button><span class="vmp-scene"></span><span style="flex:1"></span>' +
      '<span class="vmp-info"></span><span class="vmp-time"></span></div><div class="vmp-track"></div>';
    document.body.appendChild(bar);
    var track = bar.querySelector('.vmp-track');
    var timeEl = bar.querySelector('.vmp-time');
    var sceneEl = bar.querySelector('.vmp-scene');
    var playBtn = bar.querySelector('[data-a=play]');
    bar.querySelector('.vmp-info').textContent = vm.width + '×' + vm.height + ' · ' + vm.fps + ' fps · ' +
      vm.scenes.length + ' scenes';

    var segs = vm.scenes.map(function (s) {
      var d = document.createElement('div');
      d.className = 'vmp-seg';
      d.style.left = (s.start / vm.duration * 100) + '%';
      d.style.width = (s.duration / vm.duration * 100) + '%';
      d.textContent = s.id;
      d.title = s.id + '  ' + s.start.toFixed(2) + '–' + s.end.toFixed(2) + 's';
      track.appendChild(d);
      return d;
    });
    var head = document.createElement('div');
    head.className = 'vmp-head';
    track.appendChild(head);

    function fit() {
      var availW = innerWidth - 40, availH = innerHeight - 110;
      var k = Math.min(availW / vm.width, availH / vm.height, 1);
      stage.style.transform = 'scale(' + k + ')';
      wrap.style.width = vm.width * k + 'px';
      wrap.style.height = vm.height * k + 'px';
    }
    addEventListener('resize', fit);
    fit();

    var t = 0, playing = false, last = 0, loop = params.has('loop');
    function fmt(x) { var m = Math.floor(x / 60), s = x - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
    function show(x) {
      t = vm.seek(x);
      head.style.left = (t / vm.duration * 100) + '%';
      var f = Math.round(t * vm.fps);
      timeEl.textContent = fmt(t) + ' / ' + fmt(vm.duration) + '  f' + f;
      var cur = null;
      vm.scenes.forEach(function (s, i) {
        var on = t >= s.start && t < s.end;
        segs[i].classList.toggle('on', on);
        if (on) cur = s;
      });
      sceneEl.textContent = cur ? cur.id + '  (' + (t - cur.start).toFixed(2) + 's)' : '';
    }
    function tick(now) {
      if (!playing) return;
      var dt = (now - last) / 1000; last = now;
      var nt = t + dt;
      if (nt >= vm.duration) { if (loop) nt = 0; else { nt = vm.duration; setPlaying(false); } }
      show(nt);
      requestAnimationFrame(tick);
    }
    function setPlaying(p) {
      playing = p;
      playBtn.textContent = p ? '❚❚ Pause' : '▶ Play';
      if (p) { if (t >= vm.duration) t = 0; last = performance.now(); requestAnimationFrame(tick); }
    }
    function sceneIndex() {
      for (var i = vm.scenes.length - 1; i >= 0; i--) if (t >= vm.scenes[i].start - 1e-6) return i;
      return 0;
    }
    bar.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'play') setPlaying(!playing);
      if (a === 'prev') show(vm.scenes[Math.max(0, sceneIndex() - (t - vm.scenes[sceneIndex()].start < 0.25 ? 1 : 0))].start);
      if (a === 'next') show(vm.scenes[Math.min(vm.scenes.length - 1, sceneIndex() + 1)].start);
    });
    var dragging = false;
    function trackSeek(e) {
      var r = track.getBoundingClientRect();
      show(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * vm.duration);
    }
    track.addEventListener('pointerdown', function (e) { dragging = true; setPlaying(false); trackSeek(e); track.setPointerCapture(e.pointerId); });
    track.addEventListener('pointermove', function (e) { if (dragging) trackSeek(e); });
    track.addEventListener('pointerup', function () { dragging = false; });
    addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 1 : 1 / vm.fps;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === 'ArrowRight') { setPlaying(false); show(t + step); }
      else if (e.key === 'ArrowLeft') { setPlaying(false); show(t - step); }
      else if (e.key === ']') bar.querySelector('[data-a=next]').click();
      else if (e.key === '[') bar.querySelector('[data-a=prev]').click();
      else if (e.key === 'Home') show(0);
      else if (e.key === 'End') show(vm.duration);
    });

    var t0 = 0;
    if (params.get('t')) t0 = +params.get('t');
    if (params.get('scene')) {
      var s = vm.scenes.filter(function (x) { return x.id === params.get('scene'); })[0];
      if (s) t0 = s.start;
    }
    show(t0);
    if (vm.errors.length || vm.warnings.length) {
      console.warn('[vm] errors:', vm.errors, 'warnings:', vm.warnings);
    }
  };
})(window);
