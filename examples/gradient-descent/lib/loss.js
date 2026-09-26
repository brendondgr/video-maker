// Shared maths for the demo: one loss function and its precomputed descent path,
// used by both the 2D field scene and the 3D surface scene so they agree.
window.Loss = (function () {
  function f(x, y) { return 0.28 * x * x + 1.1 * y * y + 0.35 * Math.sin(1.7 * x) * Math.sin(1.3 * y) + 0.15 * x; }
  function grad(x, y) {
    const h = 1e-4;
    return [(f(x + h, y) - f(x - h, y)) / (2 * h), (f(x, y + h) - f(x, y - h)) / (2 * h)];
  }
  function descent(x0, y0, eta, steps) {
    const pts = [[x0, y0]];
    let x = x0, y = y0;
    for (let i = 0; i < steps; i++) { const g = grad(x, y); x -= eta * g[0]; y -= eta * g[1]; pts.push([x, y]); }
    return pts;
  }
  return { f, grad, descent, path: descent(-2.7, 1.55, 0.22, 36), domain: { x: [-3.2, 3.2], y: [-1.8, 1.8] } };
})();
