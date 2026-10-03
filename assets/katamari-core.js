/* Katamari physics and geometry. Pure functions, no DOM, so it can be tested in node.
   The idea (clone page elements onto a ball rolling over the page) comes from Katamari Hack,
   kathack.com, Alex Leone, David Nufer and David Truong, 2011; this is an independent rewrite.

   Coordinates: x right, y down (page pixels), z toward the viewer. Things stuck to the ball
   are unit vectors in that space, rotated a little every frame as the ball rolls. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KatamariCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FIT = 0.5;       // an item sticks if its volume is at most this share of the ball's
  const GAIN = 1.1;      // how much of an item's volume the ball gains
  const HOLLOW = 0.02;   // an emptied card or panel is mostly air
  const ACCEL = 1500;    // px/s² toward the target
  const GRIP = 1.6;      // friction while steering, per second
  const COAST = 2.6;     // friction while coasting, per second

  const ballVolume = (r) => (4 / 3) * Math.PI * r * r * r;
  const radiusFor = (vol) => Math.cbrt(vol * 3 / (4 * Math.PI));
  const itemVolume = (w, h, hollow) => w * h * Math.min(w, h) * (hollow ? HOLLOW : 1);
  const canPickUp = (ball, vol) => vol <= ballVolume(ball.r) * FIT;
  const maxSpeed = (r) => 260 + 34 * Math.sqrt(r);
  const drawScale = (r, cap) => (r <= cap ? 1 : cap / r);

  function grow(ball, vol) {
    ball.r = radiusFor(ballVolume(ball.r) + vol * GAIN);
    return ball.r;
  }

  function createBall({ x, y, r }) {
    return { x, y, r, vx: 0, vy: 0 };
  }

  // Advance one frame. input: {target:{x,y}} steers toward a point, {dir:{x,y}} along a
  // direction, null coasts. rad is the drawn radius (defaults to r), used for walls and roll.
  // Returns the rotation this step applied to the ball's surface.
  function step(ball, input, dt, bounds, rad) {
    rad = rad || ball.r;
    let ax = 0, ay = 0;
    if (input && input.target) {
      const dx = input.target.x - ball.x, dy = input.target.y - ball.y, d = Math.hypot(dx, dy);
      if (d > rad * 0.35) { ax = dx / d; ay = dy / d; }
    } else if (input && input.dir) {
      const d = Math.hypot(input.dir.x, input.dir.y);
      if (d > 0) { ax = input.dir.x / d; ay = input.dir.y / d; }
    }
    const steering = ax !== 0 || ay !== 0;
    ball.vx += ax * ACCEL * dt;
    ball.vy += ay * ACCEL * dt;
    const f = Math.exp(-(steering ? GRIP : COAST) * dt);
    ball.vx *= f; ball.vy *= f;
    const cap = maxSpeed(ball.r), sp = Math.hypot(ball.vx, ball.vy);
    if (sp > cap) { ball.vx *= cap / sp; ball.vy *= cap / sp; }

    const ox = ball.x, oy = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const minX = bounds.minX + rad, maxX = Math.max(minX, bounds.maxX - rad);
    const minY = bounds.minY + rad, maxY = Math.max(minY, bounds.maxY - rad);
    if (ball.x < minX) { ball.x = minX; ball.vx = Math.abs(ball.vx) * 0.6; }
    if (ball.x > maxX) { ball.x = maxX; ball.vx = -Math.abs(ball.vx) * 0.6; }
    if (ball.y < minY) { ball.y = minY; ball.vy = Math.abs(ball.vy) * 0.6; }
    if (ball.y > maxY) { ball.y = maxY; ball.vy = -Math.abs(ball.vy) * 0.6; }

    const mx = ball.x - ox, my = ball.y - oy, dist = Math.hypot(mx, my);
    if (dist === 0) return { axis: [1, 0, 0], angle: 0 };
    // Axis in the screen plane, at right angles to the motion, chosen so the top (+z) swings forward.
    return { axis: [-my / dist, mx / dist, 0], angle: dist / rad };
  }

  // Rodrigues' rotation of v about a unit axis.
  function rotate(v, a, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const dot = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
    const cx = a[1] * v[2] - a[2] * v[1], cy = a[2] * v[0] - a[0] * v[2], cz = a[0] * v[1] - a[1] * v[0];
    return [
      v[0] * c + cx * s + a[0] * dot * (1 - c),
      v[1] * c + cy * s + a[1] * dot * (1 - c),
      v[2] * c + cz * s + a[2] * dot * (1 - c),
    ];
  }

  function normalize(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  // Where on the ball a newly picked-up item sticks: toward the contact point, tipped a little
  // toward the viewer so it lands where you can see it.
  function attach(ball, cx, cy) {
    let dx = cx - ball.x, dy = cy - ball.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
    return normalize([dx, dy, 0.45]);
  }

  // The item's long axis: the circle's tangent at v, twisted about v by tilt radians.
  function tangentFor(v, tilt) {
    let t = Math.abs(v[2]) > 0.999 ? [1, 0, 0] : [-v[1], v[0], 0];
    t = normalize(t);
    return normalize(rotate(t, v, tilt));
  }

  const project = (v, drawR) => ({ x: v[0] * drawR, y: v[1] * drawR, z: v[2], front: v[2] >= 0 });

  function circleRect(cx, cy, r, rect) {
    const nx = Math.max(rect.left, Math.min(cx, rect.right));
    const ny = Math.max(rect.top, Math.min(cy, rect.bottom));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  }

  const splitWords = (text) => text.split(/(\s+)/).filter((t) => t.length > 0);
  const isWord = (t) => /\S/.test(t);

  function createEmitter() {
    const map = {};
    return {
      on(name, fn) { (map[name] = map[name] || []).push(fn); },
      emit(name, payload) { (map[name] || []).forEach((fn) => fn(payload)); },
    };
  }

  return {
    FIT, GAIN, HOLLOW, ballVolume, radiusFor, itemVolume, canPickUp, maxSpeed, drawScale, grow,
    createBall, step, rotate, normalize, attach, tangentFor, project, circleRect, splitWords, isWord,
    createEmitter,
  };
});
