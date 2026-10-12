const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../assets/katamari-core.js');

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const BOUNDS = { minX: 0, minY: 0, maxX: 10000, maxY: 10000 };

test('ballVolume and radiusFor are inverses', () => {
  for (const r of [1, 12, 140.5, 900]) near(K.radiusFor(K.ballVolume(r)), r, 1e-9);
});

test('itemVolume favours long thin things and discounts hollow boxes', () => {
  assert.equal(K.itemVolume(10, 20), 10 * 20 * 10);
  assert.ok(K.itemVolume(400, 20) < K.itemVolume(100, 100));
  near(K.itemVolume(300, 300, true), K.itemVolume(300, 300) * K.HOLLOW);
});

test('itemVolume caps the depth so huge blocks stay reachable', () => {
  assert.equal(K.itemVolume(800, 400), 800 * 400 * K.THICK);
  assert.equal(K.itemVolume(30, 20), 30 * 20 * 20);
});

test('canPickUp is inclusive at the FIT boundary', () => {
  const ball = K.createBall({ x: 0, y: 0, r: 20 });
  const limit = K.ballVolume(20) * K.FIT;
  assert.equal(K.canPickUp(ball, limit), true);
  assert.equal(K.canPickUp(ball, limit * 1.0001), false);
});

test('grow adds GAIN times the item volume to the ball', () => {
  const ball = K.createBall({ x: 0, y: 0, r: 20 });
  const before = K.ballVolume(ball.r);
  K.grow(ball, 5000);
  near(K.ballVolume(ball.r), before + 5000 * K.GAIN, 1e-6);
  const r1 = ball.r;
  K.grow(ball, 1);
  assert.ok(ball.r > r1);
});

test('step accelerates toward a target', () => {
  const ball = K.createBall({ x: 100, y: 100, r: 20 });
  for (let i = 0; i < 10; i++) K.step(ball, { target: { x: 600, y: 100 } }, 1 / 60, BOUNDS);
  assert.ok(ball.vx > 0 && ball.x > 100);
  near(ball.vy, 0);
});

test('step caps speed and the cap grows with size', () => {
  const small = K.createBall({ x: 5000, y: 5000, r: 15 });
  const big = K.createBall({ x: 5000, y: 5000, r: 400 });
  for (let i = 0; i < 600; i++) {
    K.step(small, { dir: { x: 1, y: 0 } }, 1 / 60, BOUNDS);
    small.x = 5000;
    K.step(big, { dir: { x: 1, y: 0 } }, 1 / 60, BOUNDS);
    big.x = 5000;
  }
  assert.ok(Math.hypot(small.vx, small.vy) <= K.maxSpeed(15) + 1e-9);
  assert.ok(K.maxSpeed(400) > K.maxSpeed(15));
});

test('step with no input slows the ball down', () => {
  const ball = K.createBall({ x: 500, y: 500, r: 20 });
  ball.vx = 300;
  K.step(ball, null, 1 / 60, BOUNDS);
  assert.ok(ball.vx < 300 && ball.vx > 0);
});

test('step keeps the ball inside the bounds and bounces', () => {
  const ball = K.createBall({ x: 25, y: 500, r: 20 });
  ball.vx = -500;
  K.step(ball, null, 1 / 30, BOUNDS);
  assert.ok(ball.x >= 20);
  assert.ok(ball.vx > 0);
});

test('the roll moves the top of the ball in the direction of travel', () => {
  const ball = K.createBall({ x: 500, y: 500, r: 20 });
  ball.vx = 300;
  const roll = K.step(ball, null, 1 / 60, BOUNDS);
  assert.ok(roll.angle > 0);
  const top = K.rotate([0, 0, 1], roll.axis, roll.angle);
  assert.ok(top[0] > 0, 'top swings toward +x');
  near(top[1], 0);
  near(roll.angle, (ball.x - 500) / ball.r, 1e-9);
});

test('step reports no roll when the ball does not move', () => {
  const ball = K.createBall({ x: 500, y: 500, r: 20 });
  const roll = K.step(ball, null, 1 / 60, BOUNDS);
  assert.equal(roll.angle, 0);
});

test('rotate preserves length over many steps', () => {
  let v = [0.3, -0.5, 0.81];
  v = v.map((c) => c / len(v));
  for (let i = 0; i < 1000; i++) v = K.rotate(v, [Math.SQRT1_2, Math.SQRT1_2, 0], 0.07);
  near(len(v), 1, 1e-9);
});

test('rotating a full turn returns to the start', () => {
  const v = K.rotate([1, 0, 0], [0, 1, 0], Math.PI * 2);
  near(v[0], 1); near(v[1], 0); near(v[2], 0);
});

test('attach points toward the contact and leans toward the viewer', () => {
  const ball = K.createBall({ x: 100, y: 100, r: 20 });
  const v = K.attach(ball, 130, 100);
  near(len(v), 1);
  assert.ok(v[0] > 0.8 && v[2] > 0);
  near(v[1], 0);
  const p = K.project(v, 20);
  assert.ok(p.x > 0 && p.front);
});

test('attach at the exact centre still gives a unit vector', () => {
  const ball = K.createBall({ x: 100, y: 100, r: 20 });
  near(len(K.attach(ball, 100, 100)), 1);
});

test('project scales by the drawn radius and reports the back as not front', () => {
  const p = K.project([0.6, 0, -0.8], 50);
  near(p.x, 30); near(p.y, 0); near(p.z, -0.8);
  assert.equal(p.front, false);
});

test('tangentFor is a unit vector perpendicular to the attach vector', () => {
  const v = K.attach(K.createBall({ x: 0, y: 0, r: 10 }), 3, 4);
  for (const tilt of [-0.5, 0, 0.4]) {
    const t = K.tangentFor(v, tilt);
    near(len(t), 1);
    near(t[0] * v[0] + t[1] * v[1] + t[2] * v[2], 0);
  }
});

test('circleRect: inside, edge, corner and miss', () => {
  const rect = { left: 100, top: 100, right: 200, bottom: 150 };
  assert.equal(K.circleRect(150, 120, 5, rect), true);
  assert.equal(K.circleRect(95, 120, 6, rect), true);
  assert.equal(K.circleRect(95, 120, 4, rect), false);
  assert.equal(K.circleRect(97, 97, 4.3, rect), true);
  assert.equal(K.circleRect(97, 97, 4.2, rect), false);
  assert.equal(K.circleRect(400, 400, 50, rect), false);
});

test('splitWords round-trips text exactly', () => {
  for (const s of ['Brian Smith', '  leading and trailing  ', 'one', '\n  multi\tspace  words\n', '']) {
    assert.equal(K.splitWords(s).join(''), s);
  }
});

test('splitWords alternates words and whitespace', () => {
  const t = K.splitWords(' Senior  Business ');
  assert.deepEqual(t, [' ', 'Senior', '  ', 'Business', ' ']);
  assert.deepEqual(t.filter(K.isWord), ['Senior', 'Business']);
});

test('the emitter calls listeners with the payload', () => {
  const e = K.createEmitter();
  const got = [];
  e.on('pickup', (p) => got.push(p));
  e.on('pickup', (p) => got.push(p.count));
  e.emit('pickup', { count: 3 });
  e.emit('other', {});
  assert.deepEqual(got, [{ count: 3 }, 3]);
});

test('drawScale is 1 until the cap, then shrinks', () => {
  assert.equal(K.drawScale(100, 300), 1);
  near(K.drawScale(600, 300), 0.5);
});
