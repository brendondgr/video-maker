// Scene "intro" — see storyboard.json for its purpose, text and beats.
VM.scene('intro', {
  build(ctx) {
    const box = ctx.add('div', { class: 'safe center stack' });
    const title = ctx.add('div', { class: 't-hero', text: ctx.text[0] }, box);
    const sub = ctx.add('div', { class: 't-head muted', text: ctx.text[1] }, box);

    VMX.reveal(ctx, title, { at: ctx.at('title'), by: 'words', stagger: 0.08 });
    VMX.enter(ctx, sub, { at: ctx.at('sub'), preset: 'fade' });
    VMX.exit(ctx, box, { preset: 'fade' });
  }
});
