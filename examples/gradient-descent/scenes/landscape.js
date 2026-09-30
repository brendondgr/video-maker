VM.scene('landscape', {
  build(ctx) {
    const d = Loss.domain;
    const field = VMX.field(ctx, {
      fn: (x, y) => Loss.f(x, y), domain: d, res: 160, thresholds: 16,
      interpolator: (k) => d3.interpolateLab(VMX.cssVar('--c-surface'), VMX.cssVar('--c-accent'))(Math.pow(k, 0.8))
    });
    ctx.tl.from(field.canvas.el, { opacity: 0, duration: 0.8 }, ctx.at('field'));

    const svg = ctx.svg();
    const pts = Loss.path.map(([x, y]) => field.toPixel(x, y));
    const trail = VM.svg('path', { d: d3.line()(pts), fill: 'none', stroke: 'var(--c-accent-2)', 'stroke-width': ctx.u * 0.45,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const dots = pts.map((p) => VM.svg('circle', { cx: p[0], cy: p[1], r: ctx.u * 0.45, fill: 'var(--c-accent-2)' }, svg));
    const ball = VM.svg('circle', { r: ctx.u * 1.3, fill: 'var(--c-bg)', stroke: 'var(--c-accent-2)', 'stroke-width': ctx.u * 0.5 }, svg);

    const walk = { i: 0 };
    const walkDur = 3.4;
    ctx.tl.to(walk, { i: pts.length - 1, duration: walkDur, ease: 'power1.inOut' }, ctx.at('walk'));
    VMX.draw(ctx, trail, { at: ctx.at('walk'), duration: walkDur, ease: 'power1.inOut' });
    ctx.onFrame(() => {
      const i = Math.floor(walk.i), f = walk.i - i, a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      ball.setAttribute('cx', a[0] + (b[0] - a[0]) * f);
      ball.setAttribute('cy', a[1] + (b[1] - a[1]) * f);
      dots.forEach((c, k) => c.setAttribute('opacity', k <= walk.i ? 1 : 0));
    });

    const cap = ctx.add('div', { class: 'safe' });
    const box = ctx.add('div', { class: 'card stack', style: { position: 'absolute', left: 0, bottom: 0, maxWidth: '60%' } }, cap);
    const t1 = ctx.add('div', { class: 't-title', text: ctx.text[0] }, box);
    const t2 = ctx.add('div', { class: 't-body muted', text: ctx.text[1] }, box);
    VMX.enter(ctx, box, { at: 0.4, preset: 'rise' });
    VMX.enter(ctx, t2, { at: ctx.at('label'), preset: 'fade' });
  }
});
