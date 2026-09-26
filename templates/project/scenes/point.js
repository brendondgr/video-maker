VM.scene('point', {
  build(ctx) {
    const box = ctx.add('div', { class: 'safe center stack' });
    const line = ctx.add('div', { class: 't-display' }, box);
    line.innerHTML = 'One idea <span class="key">per scene.</span>';
    const support = ctx.add('div', { class: 't-head muted', text: ctx.text[1] }, box);

    VMX.enter(ctx, line, { at: ctx.at('line'), preset: 'rise' });
    VMX.highlight(ctx, line.querySelector('.key'), { at: ctx.at('mark'), color: 'color-mix(in srgb, var(--c-accent) 45%, transparent)' });
    VMX.enter(ctx, support, { at: ctx.at('support'), preset: 'rise' });
  }
});
