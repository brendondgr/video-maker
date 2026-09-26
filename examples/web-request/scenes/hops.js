// The four hops: a ghosted flow whose steps light up on the words that name them.
VM.scene('hops', {
  build(ctx) {
    const K = VMX.kit;
    K.title(ctx, 'Four hops', { at: 0.2, kicker: 'One request' });
    K.flow(ctx, { ghost: true, y: ctx.height * 0.5, steps: [
      { role: 'browser', sub: 'you click', at: ctx.at('b') },
      { role: 'dns', sub: 'finds the address', at: ctx.at('d') },
      { role: 'server', sub: 'handles the request', at: ctx.at('s') },
      { role: 'db', sub: 'returns the data', at: ctx.at('db') }
    ] });
  }
});
