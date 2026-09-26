// Illustrative trend: load time falls across repeat visits and crosses a 1 s reference line.
VM.scene('latency', {
  build(ctx) {
    const K = VMX.kit;
    K.title(ctx, ctx.text[0], { at: 0.2 });
    K.trend(ctx, { series: [{ name: 'load time', values: [2400, 1700, 1300, 1050, 900, 820, 780], color: 'var(--c-accent)' }],
      y: { label: ctx.text[1], domain: [0, 2600] }, x: { label: 'visit →' }, drawDur: 2.2, readout: { prefix: '', format: ',.0f' },
      refs: [{ name: '1 second', v: 1000, color: 'var(--c-accent-2)' }], refsAt: ctx.at('ref') - 0.4,
      at: { axes: ctx.at('axes'), series: [ctx.at('draw')] } });
    K.note(ctx, ctx.text[2], { at: 0.8, align: 'left' });
  }
});
