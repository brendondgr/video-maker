VM.scene('rates', {
  build(ctx) {
    const k = d3.range(0, 41);
    const series = [
      { name: ctx.text[1], color: 'var(--c-muted)', points: k.map((i) => [i, Math.exp(-0.035 * i)]) },
      { name: ctx.text[2], color: 'var(--c-accent-3)', points: k.map((i) => [i, Math.exp(-0.16 * i) * 0.98 + 0.02]) },
      { name: ctx.text[3], color: 'var(--c-warn)', dashed: true, points: d3.range(0, 9).map((i) => [i, Math.max(0.02, Math.min(1.05, 0.62 + 0.1 * Math.pow(1.28, i) * (i % 2 ? -1 : 1)))]) }
    ];
    const title = ctx.add('div', { class: 'safe' });
    const h = ctx.add('div', { class: 't-title', text: ctx.text[0] }, title);
    VMX.enter(ctx, h, { at: 0, preset: 'rise' });
    VMX.lineChart(ctx, {
      series, at: ctx.at('chart'), duration: 1.8, seriesStagger: 0.9,
      rect: { x: ctx.width * 0.1, y: ctx.height * 0.26, w: ctx.width * 0.7, h: ctx.height * 0.56 },
      x: { label: ctx.text[4], ticks: 5 }, y: { label: ctx.text[5], domain: [0, 1.05], ticks: 4, format: '.1f' },
      curve: d3.curveLinear
    });
  }
});
