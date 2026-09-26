VM.scene('ideas', {
  build(ctx) {
    const [center, ...rest] = ctx.text;
    const nodes = [{ id: center, label: center, r: ctx.u * 3, stroke: 'var(--c-accent-2)' }, ...rest.map((t) => ({ id: t, label: t }))];
    const links = rest.map((t) => ({ source: center, target: t }));
    links.push({ source: 'Momentum', target: 'Adam' }, { source: 'Loss', target: 'Backprop' });
    VMX.network(ctx, { nodes, links, at: ctx.at('graph'), stagger: 0.12,
      rect: { x: ctx.width * 0.12, y: ctx.height * 0.1, w: ctx.width * 0.76, h: ctx.height * 0.78 } });
  }
});
