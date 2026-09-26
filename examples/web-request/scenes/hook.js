// Hook: city illustration with the title on its dark left third.
VM.scene('hook', {
  async build(ctx) {
    const K = VMX.kit;
    await K.bg(ctx, 'assets/img/city.jpg', { scrim: 'left', to: 1.07 });
    const box = ctx.add('div', { style: { position: 'absolute', left: '6%', top: '30%', width: '48%' } });
    K.title(ctx, ctx.text[1], { parent: box, kicker: ctx.text[0], size: 't-hero', at: ctx.at('title') });
  }
});
