VM.scene('outro', {
  build(ctx) {
    const box = ctx.add('div', { class: 'safe center stack' });
    const row = ctx.add('div', { class: 'row t-hero' }, box);
    const words = ctx.text[0].split(' ').map((w, i) => ctx.add('span', { text: w, class: ['accent', 'accent-2', 'accent-3'][i] }, row));
    const tag = ctx.add('div', { class: 't-head muted', text: ctx.text[1] }, box);
    VMX.enter(ctx, words, { at: ctx.at('words'), preset: 'pop', stagger: 0.4 });
    VMX.enter(ctx, tag, { at: ctx.at('tag'), preset: 'fade' });
  }
});
