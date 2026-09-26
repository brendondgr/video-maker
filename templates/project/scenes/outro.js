VM.scene('outro', {
  build(ctx) {
    const box = ctx.add('div', { class: 'safe center' });
    const row = ctx.add('div', { class: 'row t-display' }, box);
    const words = ctx.text[0].split(' ').map((w, i) =>
      ctx.add('span', { text: w, class: ['', 'accent', 'accent-2', 'accent-3'][i % 4] }, row));
    VMX.enter(ctx, words, { at: ctx.at('words'), preset: 'pop', stagger: 0.35 });
  }
});
