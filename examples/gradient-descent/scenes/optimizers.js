VM.scene('optimizers', {
  build(ctx) {
    const title = ctx.add('div', { class: 'safe' });
    const h = ctx.add('div', { class: 't-title', text: ctx.text[0] }, title);
    const note = ctx.add('div', { class: 't-small muted', text: 'illustrative', style: { position: 'absolute', right: 0, bottom: 0 } }, title);
    VMX.enter(ctx, h, { at: 0, preset: 'rise' });
    VMX.enter(ctx, note, { at: 1, preset: 'fade' });
    VMX.barChart(ctx, {
      horizontal: true, at: ctx.at('bars'), stagger: 0.25, highlight: 'Adam', format: ',.0f', suffix: ' steps',
      rect: { x: ctx.width * 0.2, y: ctx.height * 0.3, w: ctx.width * 0.58, h: ctx.height * 0.5 },
      data: [ { label: ctx.text[1], value: 1200 }, { label: ctx.text[2], value: 480 }, { label: ctx.text[3], value: 210 } ]
    });
  }
});
