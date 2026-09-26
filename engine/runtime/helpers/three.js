/* Three.js stage. Three ships ES modules only, so it is loaded lazily through
 * the page import map; builders that use it must be async.
 *
 *   const s = await VMX.scene3d(ctx, { camera: [4, 3, 6], lookAt: [0, 0, 0], fov: 40 })
 *   s.scene.add(mesh)
 *   ctx.tl.to(s.orbit, { angle: Math.PI, duration: 6 })   // camera orbit is a tweenable proxy
 *   s.onFrame(() => { mesh.rotation.y = state.r })          // runs before each render
 *
 *   VMX.surface(THREE, (x, z, p) => y, { size: 6, segments: 120, colormap: d3.interpolateViridis })
 *     -> { mesh, update(p) }
 *
 * Rendering happens in ctx.onFrame after each seek, with preserveDrawingBuffer so
 * screenshots always capture the latest frame. Headless Chromium renders WebGL via
 * SwiftShader (CPU), which is deterministic but slower — keep segment counts sane.
 */
(function (global) {
  'use strict';
  var VM = global.VM;
  var H = VM.helpers;

  H.scene3d = async function (ctx, o) {
    o = o || {};
    var THREE = await ctx.import('three');
    var w = o.width || ctx.width, h = o.height || ctx.height;
    var cv = VM.el('canvas', { class: 'vm-canvas vm-webgl' }, o.parent || ctx.el);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    if (o.left != null) cv.style.left = o.left + 'px';
    if (o.top != null) cv.style.top = o.top + 'px';
    var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: o.antialias !== false, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(global.devicePixelRatio || 1);
    renderer.setSize(w, h, false);
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    var scene = new THREE.Scene();
    if (o.background) scene.background = new THREE.Color(o.background);
    var camera = new THREE.PerspectiveCamera(o.fov || 40, w / h, 0.01, 1000);
    var target = new THREE.Vector3().fromArray(o.lookAt || [0, 0, 0]);
    var c0 = new THREE.Vector3().fromArray(o.camera || [4, 3, 6]);
    var rel = c0.clone().sub(target);
    // Orbit state is plain numbers so GSAP can tween it.
    var orbit = {
      angle: Math.atan2(rel.x, rel.z),
      elevation: Math.atan2(rel.y, Math.hypot(rel.x, rel.z)),
      distance: rel.length(),
      tx: target.x, ty: target.y, tz: target.z
    };
    if (o.lights !== false) {
      scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
      var dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(5, 10, 7); scene.add(dl);
    }
    var hooks = [];
    function render(local, t) {
      var ce = Math.cos(orbit.elevation);
      camera.position.set(
        orbit.tx + orbit.distance * ce * Math.sin(orbit.angle),
        orbit.ty + orbit.distance * Math.sin(orbit.elevation),
        orbit.tz + orbit.distance * ce * Math.cos(orbit.angle));
      camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
      for (var i = 0; i < hooks.length; i++) hooks[i](local, t);
      renderer.render(scene, camera);
    }
    ctx.onFrame(render);
    return { THREE: THREE, scene: scene, camera: camera, renderer: renderer, canvas: cv, orbit: orbit,
      onFrame: function (fn) { hooks.push(fn); }, render: render };
  };

  /** A z=f(x, y, p) surface with vertex colours; call update(p) from an onFrame hook. */
  H.surface = function (THREE, fn, o) {
    o = o || {};
    var size = o.size || 6, seg = o.segments || 100;
    var geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, flatShading: !!o.flat });
    var mesh = new THREE.Mesh(geo, mat);
    var cmap = o.colormap || (global.d3 && global.d3.interpolateViridis);
    var range = o.range || [-1, 1];
    var col = new THREE.Color();
    var last = null;
    function update(p) {
      if (p === last) return; last = p;
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i), z = pos.getZ(i);
        var y = fn(x, z, p);
        pos.setY(i, y);
        var k = Math.max(0, Math.min(1, (y - range[0]) / (range[1] - range[0])));
        col.set(cmap(k));
        colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      }
      pos.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.computeVertexNormals();
    }
    update(o.p0 || 0);
    return { mesh: mesh, update: update, geometry: geo };
  };
})(window);
