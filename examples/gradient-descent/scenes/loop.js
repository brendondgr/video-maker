VM.scene('loop', {
  build(ctx) {
    const names = ctx.text.slice(1);
    const u = ctx.u, W = ctx.width, H = ctx.height;
    const title = ctx.add('div', { class: 'safe' });
    VMX.enter(ctx, ctx.add('div', { class: 't-title', text: ctx.text[0] }, title), { at: 0, preset: 'rise' });

    const bw = W * 0.14, bh = H * 0.13, gap = (W * 0.86 - bw * names.length) / (names.length - 1);
    const y = H * 0.5 - bh / 2;
    const boxes = names.map((n, i) => {
      const x = W * 0.07 + i * (bw + gap);
      const b = ctx.add('div', { class: 'card center t-head', text: n,
        style: { position: 'absolute', left: x + 'px', top: y + 'px', width: bw + 'px', height: bh + 'px', padding: '0' } });
      if (n === 'Gradient') b.style.borderColor = 'var(--c-accent)';
      return { el: b, x, y };
    });
    const svg = ctx.svg();
    boxes.forEach((b, i) => {
      const at = ctx.at('boxes') + i * 0.55;
      VMX.enter(ctx, b.el, { at, preset: 'pop', duration: 0.5 });
      if (i > 0) VMX.arrow(ctx, svg, { x1: boxes[i - 1].x + bw + u, y1: y + bh / 2, x2: b.x - u, y2: y + bh / 2, at: at - 0.2, duration: 0.35 });
    });
    const last = boxes[boxes.length - 1], second = boxes[1];
    VMX.arrow(ctx, svg, { x1: last.x + bw / 2, y1: y + bh + u, x2: second.x + bw / 2, y2: y + bh + u, bend: -0.28,
      color: 'var(--c-accent-2)', at: ctx.at('back'), duration: 1.1 });
    const rep = ctx.add('div', { class: 't-body accent-2', text: 'repeat', style: { position: 'absolute', left: (W / 2 - 60) + 'px', top: (H * 0.83) + 'px' } });
    VMX.enter(ctx, rep, { at: ctx.at('back') + 0.9, preset: 'fade' });
  }
});
