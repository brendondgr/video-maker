/* Captions overlay, driven by the narration's word timings (audio/captions.json from
 * voiceover.mjs). Rules adapted from HyperFrames media-use/audio/references/captions/
 * authoring.md and motion.md: one group on screen at a time, groups break on sentences, pauses
 * and a max word count (done in voiceover.mjs), words light up as they are spoken, and every
 * group gets a hard kill (visibility hidden) at its end so nothing lingers.
 *
 * storyboard.audio.captions = { enabled, style: 'clean' | 'karaoke' | 'plain', position:
 *   'bottom' | 'top', size (u, default 4.2) }. A scene can opt out with "captions": false.
 * Keep scene text out of the caption zone (bottom ~16 % of the frame) when captions are on.
 */
(function (global) {
  'use strict';
  var VM = global.VM;

  VM.overlay('captions', {
    build: function (ctx, groups) {
      var cfg = Object.assign({ style: 'clean', position: 'bottom', size: 4.2 },
        (ctx.storyboard.audio && ctx.storyboard.audio.captions) || {});
      var off = {};
      (ctx.storyboard.scenes || []).forEach(function (s) { if (s.captions === false) off[s.id] = true; });
      var zone = ctx.add('div', { class: 'vm-captions is-' + cfg.position + ' is-' + cfg.style });
      zone.style.fontSize = 'calc(var(--u) * ' + cfg.size + ')';
      var tl = ctx.tl;

      (groups || []).forEach(function (g) {
        if (off[g.scene]) return;
        var card = ctx.add('div', { class: 'vm-cap' }, zone);
        var spans = g.words.map(function (w, i) {
          var sp = ctx.add('span', { class: 'vm-cap-w', text: w.w }, card);
          if (i < g.words.length - 1) card.appendChild(document.createTextNode(' '));
          return sp;
        });
        var fadeIn = Math.min(0.18, Math.max(0.06, (g.end - g.start) / 6));
        tl.set(card, { visibility: 'visible' }, g.start);
        tl.fromTo(card, { opacity: 0, y: ctx.u * 0.8 }, { opacity: 1, y: 0, duration: fadeIn, ease: 'power2.out', immediateRender: false }, g.start);
        if (cfg.style !== 'plain') {
          spans.forEach(function (sp, i) {
            var w = g.words[i];
            var on = cfg.style === 'karaoke' ? { color: 'var(--c-accent)' } : { opacity: 1 };
            tl.to(sp, Object.assign({ duration: 0.08, ease: 'none' }, on), Math.max(g.start, w.start - 0.02));
            if (cfg.style === 'karaoke') tl.to(sp, { color: 'var(--c-ink)', duration: 0.12, ease: 'none' }, w.end);
          });
        }
        tl.to(card, { opacity: 0, duration: 0.1, ease: 'power2.in' }, Math.max(g.start + fadeIn, g.end - 0.1));
        tl.set(card, { visibility: 'hidden' }, g.end);   // hard kill
      });
    }
  });
})(window);
