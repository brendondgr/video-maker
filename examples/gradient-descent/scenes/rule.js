VM.scene('rule', {
  build(ctx) {
    const wrap = ctx.add('div', { class: 'safe center stack' });
    const head = ctx.add('div', { class: 't-label muted', text: ctx.text[0] }, wrap);
    const eq = ctx.add('div', { class: 'eq' }, wrap);
    // \htmlClass needs trust; instead render pieces separately so we can point at them.
    eq.innerHTML = '<span class="p p-theta"></span><span class="p p-arrow"></span><span class="p p-theta2"></span>' +
      '<span class="p p-minus"></span><span class="p p-eta"></span><span class="p p-grad"></span>';
    VMX.tex(eq.querySelector('.p-theta'), '\\theta', { display: false });
    VMX.tex(eq.querySelector('.p-arrow'), '\\;\\leftarrow\\;', { display: false });
    VMX.tex(eq.querySelector('.p-theta2'), '\\theta', { display: false });
    VMX.tex(eq.querySelector('.p-minus'), '\\;-\\;', { display: false });
    VMX.tex(eq.querySelector('.p-eta'), '\\eta', { display: false });
    VMX.tex(eq.querySelector('.p-grad'), '\\,\\nabla L(\\theta)', { display: false });

    const labels = ctx.add('div', { class: 'eq-labels' }, wrap);
    const lEta = ctx.add('div', { class: 't-head accent-2', text: 'η  = ' + ctx.text[1] }, labels);
    const lGrad = ctx.add('div', { class: 't-head accent', text: '∇L = ' + ctx.text[2] }, labels);

    VMX.enter(ctx, head, { at: 0, preset: 'fade' });
    VMX.enter(ctx, eq.querySelectorAll('.p'), { at: ctx.at('eq'), preset: 'rise', stagger: 0.08 });
    // Circles are measured from final layout, so measure before entrance offsets apply.
    VMX.circle(ctx, eq.querySelector('.p-eta'), { at: ctx.at('eta'), color: 'var(--c-accent-2)', pad: ctx.u * 1.2 });
    VMX.enter(ctx, lEta, { at: ctx.at('eta') + 0.4, preset: 'slide-right' });
    VMX.circle(ctx, eq.querySelector('.p-grad'), { at: ctx.at('grad'), color: 'var(--c-accent)', pad: ctx.u * 1.2 });
    VMX.enter(ctx, lGrad, { at: ctx.at('grad') + 0.4, preset: 'slide-right' });
  }
});
