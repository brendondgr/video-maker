VM.scene('surface', {
  async build(ctx) {
    const s = await VMX.scene3d(ctx, { camera: [5.5, 5.5, 7.8], lookAt: [0, 0.5, 0], fov: 36 });
    const { THREE } = s;
    const H = (x, y) => Loss.f(x, y) * 0.32;
    const ZS = 1.8 / 3.2;   // plane spans ±3.2 on both axes; the loss domain is ±3.2 × ±1.8
    const surf = VMX.surface(THREE, (x, z) => H(x, z * ZS), { size: 6.4, segments: 110, range: [-0.3, 2.0],
      colormap: (k) => d3.interpolateLab(VMX.cssVar('--c-surface'), VMX.cssVar('--c-accent'))(k) });
    surf.mesh.scale.set(1, 1, ZS);          // squash z so the mesh is 6.4 × 3.6 like the domain
    s.scene.add(surf.mesh);

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color(VMX.cssVar('--c-accent-2')), emissive: new THREE.Color(VMX.cssVar('--c-accent-2')).multiplyScalar(0.25) }));
    s.scene.add(ball);
    const pts = Loss.path;
    const roll = { i: 0 };
    ctx.tl.to(s.orbit, { angle: s.orbit.angle + 0.9, duration: ctx.duration, ease: 'none' }, ctx.at('orbit'));
    ctx.tl.to(roll, { i: pts.length - 1, duration: 3.6, ease: 'power1.inOut' }, ctx.at('roll'));
    s.onFrame(() => {
      const i = Math.floor(roll.i), f = roll.i - i, a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      // plane z axis points toward camera; scene y = height
      ball.position.set(x, H(x, y) + 0.13, y);   // mesh z = y after the squash
    });

    const cap = ctx.add('div', { class: 'safe' });
    const t = ctx.add('div', { class: 't-title', text: ctx.text[0], style: { position: 'absolute', left: 0, top: 0 } }, cap);
    VMX.enter(ctx, t, { at: 0.5, preset: 'rise' });
  }
});
