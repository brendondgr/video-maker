VM.scene('scale', {
  build(ctx) {
    const box = ctx.add('div', { class: 'safe center stack' });
    const num = ctx.add('div', { class: 't-hero accent tabular', text: '0' }, box);
    const unit = ctx.add('div', { class: 't-title', text: ctx.text[1] }, box);
    const cap = ctx.add('div', { class: 't-head muted', text: ctx.text[2] }, box);
    VMX.enter(ctx, num, { at: ctx.at('count'), preset: 'fade', duration: 0.3 });
    VMX.counter(ctx, num, { from: 0, to: 175e9, at: ctx.at('count'), duration: 1.8, format: ',.0f', ease: 'expo.out' });
    VMX.enter(ctx, unit, { at: ctx.at('count') + 0.3, preset: 'rise' });
    VMX.enter(ctx, cap, { at: ctx.at('caption'), preset: 'rise' });
    VMX.drift(ctx, box, { to: 1.03 });
  }
});
