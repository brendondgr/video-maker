VM.scene('hook', {
  build(ctx) {
    const box = ctx.add('div', { class: 'safe center stack' });
    const kicker = ctx.add('div', { class: 't-label accent', text: ctx.text[0] }, box);
    const title = ctx.add('div', { class: 't-hero' }, box);
    title.innerHTML = 'How does a model <span class="accent">learn?</span>';
    VMX.enter(ctx, kicker, { at: ctx.at('kicker'), preset: 'fade' });
    VMX.reveal(ctx, title, { at: ctx.at('title'), by: 'words', stagger: 0.09 });
    VMX.exit(ctx, box, { preset: 'fade' });
  }
});
