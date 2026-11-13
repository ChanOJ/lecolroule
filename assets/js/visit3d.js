// 3D model of the flat, with a first-person visit (apartment page, layouts/_shortcodes/visit3d.html).
// How to work on it: README.md, "3D visit" (test page assets/3d/dev.html, textures, tour).
// Built by Hugo (js.Build) into one file with three.js (assets/vendor/three-0.160.0/), loaded by
// main.js ("3D visit") only when the visit comes into view. The model is code: walls, furniture
// and pictures are drawn from the plans and photos of the flat. Parts of this file:
// - the model (dimensions, materials, levels, furniture): edit freely;
// - TOUR, the keyframes of the first-person visit;
// - the viewer (createVisit): preview, full screen, controls; rarely needs a change.
import * as THREE from '../vendor/three-0.160.0/three.module.js';
import { OrbitControls } from '../vendor/three-0.160.0/addons/controls/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three-0.160.0/addons/environments/RoomEnvironment.js';
import { Reflector } from '../vendor/three-0.160.0/addons/objects/Reflector.js';
import { EffectComposer } from '../vendor/three-0.160.0/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three-0.160.0/addons/postprocessing/RenderPass.js';
import { GTAOPass } from '../vendor/three-0.160.0/addons/postprocessing/GTAOPass.js';
import { OutputPass } from '../vendor/three-0.160.0/addons/postprocessing/OutputPass.js';
// Generated from assets/3d/textures/ by scripts/textures.py: { name: data URI }
import TEX from './visit3d-textures.js';

// All dimensions below are in centimetres, in plan coordinates:
// x = east, z = south, origin = inner north-west corner of the living room.
// The night level has its own origin (its inner north-west corner), which is
// NIGHT_Z south of the living room origin (north edge of the stairwell).
const CM = 0.01;
const EXT = 36;            // outer wall thickness
const PART = 7;            // partition thickness
const LIVING_H = 246, NIGHT_H = 248, SLAB = 25;
const LIVING_Y = NIGHT_H + SLAB;
const STAIR = { x: 207, zN: 327.5, zMid: 415, zS: 513.5, turn: 95 };
const NIGHT_Z = STAIR.zN;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, envMapIntensity: 0.38, ...opts });
const M = {
  wall: mat(0xece6d6), cut: mat(0xcfc8bc), render: mat(0xd9bfb4), teal: mat(0x3f7f8c),
  tiles: mat(0x4a4f55), oak: mat(0x9a948a), deck: mat(0x7a5a44),
  pine: mat(0xd9a55b), brown: mat(0x5a3d2e), lowWall: mat(0xe6e0d4),
  glass: mat(0x9cc7e0, { transparent: true, opacity: 0.3, roughness: 0.05 }),
  bulb: mat(0xfff2cc, { emissive: 0xffd890, emissiveIntensity: 1.6 }),
  duct: mat(0xece6d6), cladding: mat(0xc49a62), orange: mat(0xe8703a),
  slate: mat(0x4b4f54), black: mat(0x1d1e20), white: mat(0xf4f4f1), grey: mat(0x74787e),
  fabric: mat(0x8d98a8), buffet: mat(0x7c8a78), barrel: mat(0x6b6a4f), mirror: mat(0xbfd3dc),
  sage: mat(0xa9c4b0), taupe: mat(0xb5b0a0), tealGrey: mat(0x6f8587), paleGreen: mat(0xc5cbb4),
  lightBlue: mat(0x9db7d6), royal: mat(0x2c3fa8), anthracite: mat(0x3a3a3c), wcGrey: mat(0x9d9c94),
  bathTile: mat(0xb9b3a0), curtain: mat(0xcdbf9f), bunk: mat(0x7f9a9a), plastic: mat(0x555a60), petrol: mat(0x234b55), concrete: mat(0xb9bcbd), drape: mat(0x1f5a66), redDrape: mat(0xa8323a), lounger: mat(0x8fb5ad), hatch: mat(0x8fb5a8),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9edf0);
const living = new THREE.Group(); living.position.y = LIVING_Y * CM;
const night = new THREE.Group(); night.position.z = NIGHT_Z * CM;
const stairs = new THREE.Group(); stairs.position.y = LIVING_Y * CM;   // shown with both levels
scene.add(living, night, stairs);
const wcDoor = new THREE.Group(), WC_DOOR_OPEN = -Math.PI / 2;   // door of the upstairs WC (0 = closed)

function box(g, x1, x2, y1, y2, z1, z2, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry((x2 - x1) * CM, (y2 - y1) * CM, (z2 - z1) * CM), m);
  mesh.position.set((x1 + x2) / 2 * CM, (y1 + y2) / 2 * CM, (z1 + z2) / 2 * CM);
  g.add(mesh);
  return mesh;
}

// Axis-aligned wall: axis 'x' runs along x at z = c (centre line), from a to b.
// ops = openings [{ s, e, sill, head, glass }] along the wall axis.
// sides = [material of the north or west face, material of the south or east face].
function wall(g, axis, c, a, b, t, h, m, ops = [], sides = null) {
  const faces = !sides ? m : axis === 'x' ? [m, m, m, m, sides[1], sides[0]] : [sides[1], sides[0], m, m, m, m];
  const seg = (s, e, y1, y2, mm = faces, tt = t) => {
    if (e - s < 0.1 || y2 - y1 < 0.1) return;
    if (axis === 'x') box(g, s, e, y1, y2, c - tt / 2, c + tt / 2, mm);
    else box(g, c - tt / 2, c + tt / 2, y1, y2, s, e, mm);
  };
  let cur = a;
  for (const o of [...ops].sort((p, q) => p.s - q.s)) {
    seg(cur, o.s, 0, h);
    seg(o.s, o.e, 0, o.sill || 0);
    seg(o.s, o.e, o.head, h);
    if (o.glass) {                                         // glazing, pine frame and mullions (o.panes)
      const y1 = o.sill || 0, y2 = o.head - (o.shutter || 0), n = o.panes || 1, F = 6;
      seg(o.s, o.e, y1, y2, M.glass, 3);
      seg(o.s, o.e, y1, y1 + F, M.pine, 8); seg(o.s, o.e, y2 - F, y2, M.pine, 8);
      if (o.shutter) seg(o.s, o.e, y2, o.head, M.pine, 12);   // pine box of the roller shutter
      for (let i = 0; i <= n; i++) {
        const x = Math.min(Math.max(o.s + (o.e - o.s) * i / n - F / 2, o.s), o.e - F);
        seg(x, x + F, y1, y2, M.pine, 8);
      }
    }
    if (o.leaf && !o.swing) seg(o.s + 1, o.e - 1, 0, o.head - 1, o.leaf, 4);   // closed door leaf
    if (o.leaf && o.swing) {                               // open leaf: hinge at the start ('s') or end ('e') of the
      const [hinge, side] = o.swing, w = o.e - o.s - 2;    // opening, swung to the north/west (-1) or south/east (+1)
      const p = hinge === 's' ? o.s + 1 : o.e - 5, f1 = c + side * t / 2, f2 = f1 + side * w;
      if (axis === 'x') box(g, p, p + 4, 0, o.head - 1, Math.min(f1, f2), Math.max(f1, f2), o.leaf);
      else box(g, Math.min(f1, f2), Math.max(f1, f2), 0, o.head - 1, p, p + 4, o.leaf);
    }
    cur = o.e;
  }
  seg(cur, b, 0, h);
}
// Coat of paint (1 cm) on one face of a wall; c is the centre line of the coat.
const paint = (g, axis, c, a, b, h, m, ops = []) => wall(g, axis, c, a, b, 1, h, m, ops);

function cyl(g, x, z, r, y1, y2, m) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * CM, r * CM, (y2 - y1) * CM, 28), m);
  mesh.position.set(x * CM, (y1 + y2) / 2 * CM, z * CM);
  g.add(mesh);
  return mesh;
}
// Sub-group placed at (x, z) and turned by deg (0 = facing south, 90 = facing east).
function placed(g, x, z, deg) {
  const sub = new THREE.Group();
  sub.position.set(x * CM, 0, z * CM);
  sub.rotation.y = deg * Math.PI / 180;
  g.add(sub);
  return sub;
}

// Horizontal slab from a plan polygon ([x, z] points), top at y, with optional holes.
function slab(g, pts, y, thick, m, holes = []) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x * CM, z * CM)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x * CM, z * CM))));
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thick * CM, bevelEnabled: false }), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y * CM;
  g.add(mesh);
  return mesh;
}

// ---------- Living level ----------
{
  const g = living, S = STAIR;
  const stairHole = [[0, S.zN], [S.x, S.zN], [S.x, S.zS], [0, S.zS]];
  slab(g, [[-EXT, -EXT], [686, -EXT], [686, 100], [736, 100], [736, 549.5], [-EXT, 549.5]], 0, SLAB, M.tiles, [stairHole]);

  // Outer walls: render outside, cream inside
  const IN = M.wall, OUT = M.render;
  wall(g, 'x', -EXT / 2, -EXT, 686, EXT, LIVING_H, M.cut, [], [OUT, IN]);
  wall(g, 'z', -EXT / 2, 0, 513.5, EXT, LIVING_H, M.cut, [{ s: 332, e: 407, sill: 110, head: 205, glass: true, shutter: 24 }], [OUT, IN]);
  wall(g, 'x', 513.5 + EXT / 2, -EXT, 736, EXT, LIVING_H, M.cut, [
    { s: 100, e: 275, sill: 87, head: 215, glass: true, panes: 2 },
    { s: 320, e: 602, sill: 0, head: 215, glass: true, panes: 3 },
  ], [IN, OUT]);
  wall(g, 'z', 700 + EXT / 2, 130, 513.5, EXT, LIVING_H, M.cut, [], [IN, OUT]);
  wall(g, 'z', 650 + EXT / 2, 0, 130, EXT, LIVING_H, M.cut, [{ s: 5, e: 95, head: 204, leaf: M.tealGrey }], [M.teal, OUT]);
  box(g, 686, 736, 0, LIVING_H, 100, 130, M.cut);

  // WC block: teal outside, orange inside, door on its east side
  wall(g, 'z', 273.5, 0, 118, PART, LIVING_H, M.teal, [], [M.teal, M.orange]);
  wall(g, 'x', 121.5, 255, 270, PART, LIVING_H, M.teal);                      // 15 cm stub: right support of the shelves
  wall(g, 'x', 121.5, 270, 410, PART, LIVING_H, M.teal, [], [M.orange, M.teal]);
  box(g, 0, 15, 0, LIVING_H, 112, 127, M.wall);                               // post: left support of the west shelves
  wall(g, 'z', 406.5, 0, 118, PART, LIVING_H, M.teal, [{ s: 30, e: 105, head: 204 }], [M.orange, M.teal]);
  // Its door: hinged at the south end, it opens towards the entrance; the visit closes it (see tour)
  wcDoor.position.set(406.5 * CM, 0, 104 * CM);
  box(wcDoor, -2, 2, 0, 203, -73, 0, M.pine);
  wcDoor.rotation.y = WC_DOOR_OPEN;
  g.add(wcDoor);
  paint(g, 'x', 0.5, 277, 403, LIVING_H, M.orange);
  paint(g, 'x', 0.5, 410, 650, 217, M.teal);                                  // entrance
  paint(g, 'x', 0.75, 0, 270, LIVING_H, M.cladding);                         // wood cladding behind the sofa

  // Service ducts between the entrance and the kitchen, lowered ceiling of the entrance
  box(g, 520, 575, 0, LIVING_H, 118, 182.5, M.duct);                          // pier (ducts) with the radiator
  box(g, 575, 640, 0, LIVING_H, 118, 157, M.duct);                            // back of the kitchen alcove (25 cm recess)
  box(g, 640, 650, 0, LIVING_H, 118, 182.5, M.duct);
  box(g, 650, 700, 0, LIVING_H, 130, 182.5, M.duct);
  box(g, 562, 642, 0, 204, 116, 118, M.pine);                                 // entrance closet door
  box(g, 525, 570, 8, 95, 182.5, 188, M.white);                               // radiator
  box(g, 410, 650, 217, LIVING_H, 0, 118, M.wall);

  // Staircase: 15 risers; south flight goes down westwards, winders, north flight comes back east
  const rise = LIVING_Y / 15, going = (S.x - S.turn) / 5, T = 4;
  for (let k = 1; k <= 5; k++)
    box(stairs, S.x - going * k, S.x - going * (k - 1), -k * rise - T, -k * rise, S.zMid + 3.5, S.zS, M.pine);
  for (let k = 10; k <= 14; k++)
    box(stairs, S.turn + going * (k - 10), S.turn + going * (k - 9), -k * rise - T, -k * rise, S.zN, S.zMid - 3.5, M.pine);
  const dS = S.zS - S.zMid, dN = S.zMid - S.zN;
  const hit = (deg) => {
    const r = deg * Math.PI / 180, dx = -Math.sin(r), dz = Math.cos(r);
    let t = Infinity;
    if (dx < -1e-9) t = Math.min(t, S.turn / -dx);
    if (dz > 1e-9) t = Math.min(t, dS / dz);
    if (dz < -1e-9) t = Math.min(t, dN / -dz);
    return [S.turn + dx * t, S.zMid + dz * t];
  };
  const corners = [
    [Math.atan2(S.turn, dS) * 180 / Math.PI, [0, S.zS]],
    [Math.atan2(S.turn, -dN) * 180 / Math.PI, [0, S.zN]],
  ];
  for (let j = 0; j < 4; j++) {
    const a1 = 45 * j, a2 = 45 * (j + 1), k = 6 + j;
    const pts = [[S.turn, S.zMid], hit(a1), ...corners.filter(([a]) => a > a1 && a < a2).map(([, p]) => p), hit(a2)];
    slab(stairs, pts, -k * rise, T, M.pine);
  }
  // Pine risers: straight ones on both flights, radiating ones between the winders
  const riser = (k) => [-k * rise, -(k - 1) * rise - (k > 1 ? T : 0)];
  for (let k = 1; k <= 5; k++) { const x = S.x - going * (k - 1); box(stairs, x - 2, x, ...riser(k), S.zMid + 3.5, S.zS, M.pine); }
  box(stairs, S.turn - 2, S.turn, ...riser(6), S.zMid, S.zS, M.pine);
  for (let j = 1; j <= 3; j++) {
    const [hx, hz] = hit(45 * j), len = Math.hypot(hx - S.turn, hz - S.zMid), [y1, y2] = riser(6 + j);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len * CM, (y2 - y1) * CM, 2 * CM), M.pine);
    m.position.set((hx + S.turn) / 2 * CM, (y1 + y2) / 2 * CM, (hz + S.zMid) / 2 * CM);
    m.rotation.y = Math.atan2(-(hz - S.zMid), hx - S.turn);
    stairs.add(m);
  }
  box(stairs, S.turn - 2, S.turn, ...riser(10), S.zN, S.zMid, M.pine);
  for (let k = 11; k <= 15; k++) { const x = S.turn + going * (k - 10); box(stairs, x - 2, x, ...riser(k), S.zN, S.zMid - 3.5, M.pine); }

  // Wall and guard rail between the two flights: they follow the slope of the upper (south) flight
  const slopeY = (x) => -(S.x - x) / going * rise;
  const prism = (pts, z1, z2, m) => {                      // vertical plate from a polygon in the (x, y) plane
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * CM, y * CM)));
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: (z2 - z1) * CM, bevelEnabled: false }), m);
    mesh.position.z = z1 * CM;
    stairs.add(mesh);
  };
  const x0 = 100, y0 = slopeY(x0), band = (lo, hi) => [[x0, y0 + lo], [S.x, lo], [S.x, hi], [x0, y0 + hi]];
  prism([[x0, -LIVING_Y], [S.x, -LIVING_Y], [S.x, 0], [x0, y0]], S.zMid - 3.5, S.zMid + 3.5, M.petrol);   // same dark blue as the stairwell
  prism([[x0, -LIVING_Y], [S.x, -LIVING_Y], [S.x, -33], [x0, -121]], S.zMid + 3.5, S.zMid + 4.5, M.wall);  // bedroom 1 side, under the casing: cream
  prism(band(92, 98), S.zMid - 3, S.zMid + 3, M.pine);
  prism(band(8, 13), S.zMid - 2, S.zMid + 2, M.pine);
  for (let x = x0 + 12; x < S.x - 8; x += 12)
    box(stairs, x - 1.5, x + 1.5, slopeY(x) + 13, slopeY(x) + 92, S.zMid - 1.5, S.zMid + 1.5, M.pine);
  box(stairs, S.turn, x0 + 4.5, -10 * rise - T, y0 + 104, S.zMid - 4.5, S.zMid + 4.5, M.pine);   // newel, down to the first step of the north flight

  // Plasterboard casing under the stairs, seen from bedroom 1: it follows the slope of the south
  // flight down to the west wall, under the winders
  const casing = [[0, -138], [S.turn - 10, -138], [S.turn, -120], [S.x, -28]];   // kept below every tread and winder
  prism([...casing, ...casing.map(([x, y]) => [x, y - 5]).reverse()], S.zMid + 3.5, S.zS - 1, M.wall);
  // Stairwell: dark blue under the south flight, pine band at floor level, pine facing on the slab edge
  const sidePts = [[0, -163], [S.turn, -5 * rise - 12], [S.x, -12], [S.x, 0], [0, 0]];
  prism(sidePts, S.zS - 1, S.zS, M.petrol);
  prism([...casing.map(([x, y]) => [x, y - 5]), [S.x, -SLAB], [S.x, 0], [0, 0]], S.zS, S.zS + 1, M.pine);   // pine side seen from bedroom 1, down to the casing
  box(g, 0, 2, 0, 12, S.zN, S.zS, M.pine);
  box(g, 0, S.x, 0, 12, S.zS - 2, S.zS, M.pine);
  box(stairs, S.x - 1, S.x, -SLAB, 0, S.zN, S.zMid - 3.5, M.pine);

  // Guard rails around the stairwell
  const rail = (axis, c, a, b) => {
    const bx = (s, e, y1, y2, w) => axis === 'x' ? box(g, s, e, y1, y2, c - w / 2, c + w / 2, M.pine) : box(g, c - w / 2, c + w / 2, y1, y2, s, e, M.pine);
    bx(a, b, 92, 98, 6); bx(a, b, 8, 13, 4);
    const n = Math.round((b - a) / 12);
    for (let i = 1; i < n; i++) bx(a + (b - a) * i / n - 1.5, a + (b - a) * i / n + 1.5, 13, 92, 3);
  };
  const post = (x, z) => box(g, x - 4.5, x + 4.5, 0, 104, z - 4.5, z + 4.5, M.pine);
  rail('x', S.zN, 0, S.x);
  rail('z', S.x, S.zN, S.zMid);
  post(4.5, S.zN); post(S.x, S.zN); post(S.x, S.zMid);

  // Terrace: L-shaped deck, low wall with wooden rail, storage cabinet at the end of the short leg
  const tz = 513.5 + EXT, te = 860, ts = tz + 205;
  slab(g, [[-EXT, tz], [736, tz], [736, S.zN], [te + EXT, S.zN], [te + EXT, ts + EXT], [-EXT, ts + EXT]], 0, SLAB, M.deck);
  // Low wall as thick as the outer walls, outside the clear 860 x 205, flush with the night level walls
  const guard = (axis, c, a, b, plain = false, ra = a, rb = b) => {
    const bx = (y1, y2, w, m) => axis === 'x' ? box(g, a, b, y1, y2, c - w / 2, c + w / 2, m) : box(g, c - w / 2, c + w / 2, y1, y2, a, b, m);
    if (plain) { bx(0, 96, EXT, M.lowWall); bx(96, 100, EXT + 4, M.brown); return; }
    const rl = (y1, y2, w) => axis === 'x' ? box(g, ra, rb, y1, y2, c - w / 2, c + w / 2, M.brown) : box(g, c - w / 2, c + w / 2, y1, y2, ra, rb, M.brown);
    bx(0, 45, EXT, M.lowWall); bx(45, 49, EXT + 4, M.brown); rl(62, 76, 4); rl(92, 100, 8);
  };
  guard('x', ts + EXT / 2, -EXT, te, false, -EXT / 2 - 4, te);
  guard('z', te + EXT / 2, S.zN, ts + EXT, true);                              // east side: wall only, no rail
  guard('z', -EXT / 2, tz, ts + EXT, false, tz, ts + EXT / 2 + 4);
  box(g, 737, 859, 0, 220, S.zN, S.zN + 60, M.pine);     // made-to-measure cabinet: 220 high, 60 deep
  box(g, 736, te + EXT, -SLAB, LIVING_H, S.zN - EXT, S.zN, M.concrete);                 // concrete wall closing the short leg behind the cabinet
}

// Ceilings: the one of the night level is the white underside of the slab; the living level only gets
// one during the first-person visit, so that the usual view from above stays open
slab(living, [[0, NIGHT_Z], [860, NIGHT_Z], [860, NIGHT_Z + 427], [0, NIGHT_Z + 427]], -SLAB, 0.8, M.white,
  [[[0, STAIR.zN], [STAIR.x, STAIR.zN], [STAIR.x, STAIR.zS], [0, STAIR.zS]]]);
const livingCeiling = slab(living, [[0, 0], [650, 0], [650, 130], [700, 130], [700, 513.5], [0, 513.5]], LIVING_H + 2, 2, M.white);
livingCeiling.visible = false;

// ---------- Night level ----------
{
  const g = night, W = 860, D = 427, S = STAIR, H = PART / 2;
  const { wall: C, tealGrey: TG, paleGreen: PG, taupe: TP, lightBlue: LB, anthracite: AN, wcGrey: GR } = M;
  slab(g, [[-EXT, -EXT], [W + EXT, -EXT], [W + EXT, D + EXT], [-EXT, D + EXT]], 0, 10, M.oak);
  box(g, 655, W, 0, 0.5, 0, 187, M.tiles);                                     // bathroom floor
  box(g, 552.5, 648, 0, 0.5, 0, 84.5, M.tiles);                                // WC floor

  // Outer walls: render outside, cream inside
  wall(g, 'x', -EXT / 2, -EXT, W + EXT, EXT, NIGHT_H, M.cut, [], [M.render, C]);
  wall(g, 'z', -EXT / 2, 0, D, EXT, NIGHT_H, M.cut, [], [M.render, C]);
  wall(g, 'z', W + EXT / 2, 0, D, EXT, NIGHT_H, M.cut, [], [C, M.render]);
  const win1 = { s: 26, e: 114, sill: 95, head: 215, shutter: 26 }, win2 = { s: 741, e: 820, sill: 95, head: 215, shutter: 26 };
  wall(g, 'x', D + EXT / 2, -EXT, W + EXT, EXT, NIGHT_H, M.cut, [{ ...win1, glass: true }, { ...win2, glass: true }], [C, M.render]);

  const door = (s, e, hinge, side) => ({ s, e, head: 204, leaf: M.pine, swing: [hinge, side] });   // open doors
  // Load-bearing line crossing the level from west to east: the beam of bedroom 1 and every wall in line with it
  const BN = 187, BS = 212, BC = (BN + BS) / 2, BT = BS - BN;
  // Bedroom 1 and the foot of the stairs
  wall(g, 'x', 87.5, S.x, 342 + H, PART, NIGHT_H, C, [door(235, 323, 'e', 1)], [TG, C]);
  wall(g, 'z', 342, 91, BN, PART, NIGHT_H, TG, [], [C, TG]);
  wall(g, 'x', BC, 259 - H, 321 - H, BT, NIGHT_H, C);                          // north side of the wardrobe
  wall(g, 'x', BC, 321 - H, 342 + H, BT, NIGHT_H, C, [], [C, LB]);             // end of wall north of the cabin:
  wall(g, 'x', BC, 342 + H, 401, BT, NIGHT_H, LB, [], [TG, LB]);               // light blue on the cabin side
  wall(g, 'z', 259, 212, 325 - H, PART, NIGHT_H, C, [{ s: 214, e: 320, head: 215 }]);
  box(g, 258, 261, 0, 215, 214, 320, M.pine);                                  // two sliding doors
  wall(g, 'x', 325, 259 - H, 321 - H, PART, NIGHT_H, C);                       // desk recess south of the wardrobe
  wall(g, 'z', 321, 212, D, PART, NIGHT_H, C, [], [C, LB]);                    // bedroom 1 / bunk cabin
  paint(g, 'z', 0.5, 186, D, NIGHT_H, M.sage);
  // Stairwell walls below the living floor: dark blue, up to the pine band at floor level
  paint(g, 'x', 0.5, 0, S.x, NIGHT_H + SLAB, M.petrol);
  paint(g, 'x', 0.5, S.x, 439 - H, NIGHT_H, M.petrol);                         // north wall up to the cupboard facing the stairs
  paint(g, 'z', 0.5, 0, 87.5 - H, NIGHT_H + SLAB, M.petrol);
  box(g, 0, 1, 141, NIGHT_H + SLAB, 87.5 - H, 186, M.petrol);

  // Bunk cabin, and the block between the cabin and bedroom 2: north half = bedroom 2 wardrobe
  // (two doors), south half = recess open onto the cabin (closed by a curtain)
  wall(g, 'z', 480, BS, 316 - H, PART, NIGHT_H, LB, [], [LB, C]);
  wall(g, 'x', 316, 480 - H, 544 - H, PART, NIGHT_H, LB, [], [C, LB]);
  wall(g, 'z', 544, BS, D, PART, NIGHT_H, TP, [{ s: 216, e: 312, head: 210 }], [LB, TP]);
  box(g, 543, 546, 0, 210, 216, 312, M.pine);
  paint(g, 'x', D - 0.5, 321 + H, 544 - H, NIGHT_H, M.royal);                  // cabin end wall

  // Bedroom 2
  wall(g, 'x', BC, 480 - H, 651.5, BT, NIGHT_H, TP, [door(563, 643, 's', 1)], [TG, TP]);
  wall(g, 'x', BC, 651.5, W, BT, NIGHT_H, TP, [], [AN, TP]);
  paint(g, 'z', W - 0.5, BS, D, NIGHT_H, TP);
  paint(g, 'x', D - 0.5, 544 + H, W, NIGHT_H, TP, [win2]);

  // Along the north wall: cupboard facing the stairs, WC, bathroom duct, bathroom
  wall(g, 'x', 88, 439 - H, 549, PART, NIGHT_H, PG, [], [C, PG]);
  wall(g, 'x', 88, 549, 651.5, PART, NIGHT_H, PG, [door(565, 635, 's', -1)], [GR, PG]);
  wall(g, 'x', 88, 651.5, 705 + H, PART, NIGHT_H, AN, [], [C, AN]);
  wall(g, 'z', 469, 0, 88 - H, PART, NIGHT_H, C);                                  // boxed-in duct, set back 30 cm
  wall(g, 'z', 439, 0, 88 - H, PART, NIGHT_H, PG, [{ s: 0, e: 84.5, head: 235 }], [PG, C]);
  for (const [z1, z2] of [[0, 41.5], [43, 84.5]]) {                            // doors flush with the end of the south partition
    box(g, 437.5, 440.5, 0, 148, z1, z2, M.pine);
    box(g, 437.5, 440.5, 150, 235, z1, z2, M.pine);
  }
  wall(g, 'z', 549, 0, 88 - H, PART, NIGHT_H, GR, [], [C, GR]);
  wall(g, 'z', 651.5, 0, 88 - H, PART, NIGHT_H, GR, [], [GR, C]);
  wall(g, 'z', 651.5, 88 + H, BN, PART, NIGHT_H, AN, [door(100, 175, 'e', 1)], [TG, AN]);
  wall(g, 'z', 705, 0, 88 - H, PART, NIGHT_H, AN, [], [C, AN]);
  paint(g, 'x', 0.5, 549 + H, 651.5 - H, NIGHT_H, GR);
  paint(g, 'x', 0.5, 705 + H, W, NIGHT_H, M.bathTile);
  paint(g, 'z', W - 0.5, 0, BN, NIGHT_H, M.bathTile);
}

// ---------- Furniture ----------
// Pine chair with a slatted back; deg = direction it faces.
function chair(g, x, z, deg, m = M.pine, arms = false) {
  const c = placed(g, x, z, deg);
  box(c, -21, 21, 42, 46, -21, 21, m);
  for (const [lx, lz] of [[-19, -19], [15, -19], [-19, 15], [15, 15]]) box(c, lx, lx + 4, 0, lz < 0 ? 100 : 42, lz, lz + 4, m);
  for (const y of [58, 72, 88]) box(c, -17, 17, y, y + 7, -19, -17, m);
  if (arms) for (const lx of [-25, 21]) {
    box(c, lx, lx + 4, 62, 66, -19, 19, m);
    box(c, lx, lx + 4, 0, 62, 15, 19, m);
    box(c, lx, lx + 4, 42, 62, -19, -15, m);
  }
}
// Round swivel armchair.
function tubChair(g, x, z, deg, m) {
  const c = placed(g, x, z, deg);
  cyl(c, 0, 0, 30, 0, 8, M.black);
  cyl(c, 0, 0, 40, 8, 42, m);
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(43 * CM, 40 * CM, 34 * CM, 28, 1, true, Math.PI * 0.42, Math.PI * 1.16),
    new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.85, side: THREE.DoubleSide }));
  shell.position.y = 59 * CM;
  c.add(shell);
}
// Double bed with its pine headboard and side panels; head = 'w' or 'e'.
function bed(g, x1, x2, z1, z2, head, side) {
  box(g, x1, x2, 0, 28, z1, z2, M.pine);
  box(g, x1, x2, 28, 50, z1, z2, M.fabric);
  const hx = head === 'w' ? [x1, x1 + 5] : [x2 - 5, x2];
  box(g, hx[0], hx[1], 0, 105, z1, z2, M.pine);
  box(g, hx[0], hx[1], 0, 78, z1 - side, z1, M.pine);
  box(g, hx[0], hx[1], 0, 78, z2, z2 + side, M.pine);
  const tx = head === 'w' ? [x1 + 5, x1 + 40] : [x2 - 40, x2 - 5];
  for (const [a, b] of [[z1 - side, z1 - 2], [z2 + 2, z2 + side]]) {
    box(g, tx[0], tx[1], 40, 45, a, b, M.pine);
    box(g, tx[0], tx[1], 0, 40, a, a + 3, M.pine);
    box(g, tx[0], tx[1], 0, 40, b - 3, b, M.pine);
  }
}
// Toilet; (x, z) = middle of the back of the cistern, deg = direction it faces.
function toilet(g, x, z, deg) {
  const c = placed(g, x, z, deg);
  box(c, -19, 19, 40, 82, 0, 18, M.white);
  box(c, -18, 18, 0, 40, 18, 45, M.white);
  cyl(c, 0, 45, 18, 0, 40, M.white);
  cyl(c, 0, 42, 19, 40, 43, M.white);
}

// Pictures cut out of the photos of the flat: TEX (assets/3d/textures/, see scripts/textures.py)

// Picture hung on a wall. facing = direction it faces ('n', 's', 'e', 'w'), c = coordinate of the
// wall face, a..b = extent along the wall, y1..y2 = height.
function picture(g, key, facing, c, a, b, y1, y2) {
  if (!TEX[key]) console.error(`3D model: no texture "${key}" (assets/3d/textures/${key}.jpg, then scripts/textures.py)`);
  const tex = new THREE.TextureLoader().load(TEX[key]);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((b - a) * CM, (y2 - y1) * CM),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, envMapIntensity: 0.38 }));
  place(mesh, facing, c, (a + b) / 2, (y1 + y2) / 2, 0.8);
  g.add(mesh);
}
// Mirror with a real reflection, same placement rules as picture().
function mirror(g, facing, c, a, b, y1, y2) {
  const mesh = new Reflector(new THREE.PlaneGeometry((b - a) * CM, (y2 - y1) * CM),
    { clipBias: 0.003, textureWidth: 512, textureHeight: 512, color: 0xb8c0c4 });
  place(mesh, facing, c, (a + b) / 2, (y1 + y2) / 2, 0.8);
  g.add(mesh);
  return mesh;
}
function place(mesh, facing, c, mid, y, off) {
  const d = { s: [0, 1, 0], n: [0, -1, Math.PI], e: [1, 0, Math.PI / 2], w: [-1, 0, -Math.PI / 2] }[facing];
  if (d[0]) mesh.position.set((c + d[0] * off) * CM, y * CM, mid * CM);
  else mesh.position.set(mid * CM, y * CM, (c + d[1] * off) * CM);
  mesh.rotation.y = d[2];
}
// Ceiling track with spots (axis 'x' or 'z'), and round ceiling lamp.
function track(g, x, z, len, axis, y, n = 4) {
  const h = len / 2;
  if (axis === 'x') box(g, x - h, x + h, y - 3, y, z - 1.5, z + 1.5, M.black);
  else box(g, x - 1.5, x + 1.5, y - 3, y, z - h, z + h, M.black);
  for (let i = 0; i < n; i++) {
    const p = -h + len * (i + 0.5) / n, px = axis === 'x' ? x + p : x, pz = axis === 'x' ? z : z + p;
    cyl(g, px, pz, 5, y - 16, y - 3, M.black);
    cyl(g, px, pz, 3.5, y - 18, y - 16, M.bulb);
  }
}
function ceilingLamp(g, x, z, y) {
  cyl(g, x, z, 22, y - 2, y, M.black);
  cyl(g, x, z, 3, y - 10, y - 2, M.black);
  const b = new THREE.Mesh(new THREE.SphereGeometry(5 * CM, 16, 12), M.bulb);
  b.position.set(x * CM, (y - 14) * CM, z * CM);
  g.add(b);
}

// ---------- Living level furniture ----------
{
  const g = living, S = STAIR;

  // Sofa bed against the cladding, shelves on both sides
  box(g, 37, 232, 0, 42, 8, 98, M.grey);
  box(g, 37, 232, 42, 86, 8, 30, M.grey);
  box(g, 37, 55, 42, 62, 30, 98, M.grey);
  box(g, 214, 232, 42, 62, 30, 98, M.grey);
  for (const y of [60, 95, 130, 165, 200]) {
    box(g, 0, 15, y, y + 3, 1.5, 112, M.pine);
    box(g, 255, 270, y, y + 3, 1.5, 118, M.pine);
  }
  // Curtains: bay window, double window, west window
  for (const [a, b, y] of [[298, 316, 0], [606, 624, 0], [80, 96, 70], [279, 295, 70]]) box(g, a, b, y, 228, 509, 512, M.drape);
  box(g, 1.5, 4.5, 95, 218, 410, 424, M.drape);
  box(g, 210, 275, 12, 80, 506, 512, M.white);                                // radiator under the double window
  // Barrel coffee table, two swivel armchairs, two poufs
  cyl(g, 137, 165, 29, 0, 44, M.barrel);
  cyl(g, 137, 165, 31, 44, 49, M.pine);
  tubChair(g, 135, 262, 180, M.grey);
  tubChair(g, 255, 215, 215, M.grey);
  cyl(g, 45, 160, 24, 0, 38, M.grey);
  cyl(g, 78, 128, 24, 0, 38, M.grey);
  // Corner TV unit between the west wall and the stairwell rail, TV set on the diagonal facing the WC block
  slab(g, [[0, S.zN - 4], [0, S.zN - 104], [100, S.zN - 4]], 45, 45, M.pine);
  const tv = placed(g, 40, S.zN - 44, 135);
  box(tv, -14, 14, 45, 50, -8, 8, M.black);
  box(tv, -50, 50, 50, 112, -2, 2, M.black);
  // Sideboard (nearly as wide as the wall) and mirror on the south face of the WC block
  box(g, 262, 404, 12, 85, 125, 165, M.buffet);
  for (const x of [264, 398]) for (const z of [127, 159]) box(g, x, x + 4, 0, 12, z, z + 4, M.black);
  box(g, 300, 366, 112, 188, 125, 129, M.pine);
  mirror(g, 's', 129, 308, 358, 120, 180);
  // Wall decoration: bear clock above the mirror, metal mountain on the cladding, three ski panels
  picture(g, 'clock', 's', 125, 296, 370, 206, 238);
  picture(g, 'silhouette', 's', 1.5, 95, 185, 150, 205);
  picture(g, 'skiA', 'e', 0, 204, 232, 150, 224);
  picture(g, 'skiB', 'e', 0, 170, 197, 138, 212);
  picture(g, 'skiC', 'e', 0, 138, 163, 126, 200);
  // WC: picture on the west wall, mirror door of the corner cabinet
  picture(g, 'lift', 'e', 277, 42, 84, 118, 172);
  { const m = mirror(g, 's', 0, 0, 26, 124, 176); m.position.set(292.5 * CM, 150 * CM, 102.5 * CM); m.rotation.y = Math.PI * 0.75; }
  // Coat hooks on the north wall of the entrance
  for (const [x, y, m] of [[440, 185, M.grey], [468, 150, M.white], [492, 178, M.black], [520, 140, M.grey], [548, 172, M.white], [575, 188, M.black], [600, 150, M.grey], [625, 176, M.white]])
    box(g, x, x + 5, y, y + 11, 1, 5, m);
  // Light fittings (the living level has no ceiling in the model: they hang at ceiling height)
  track(g, 435, 354, 90, 'x', LIVING_H);
  track(g, 150, 215, 90, 'x', LIVING_H);
  track(g, 600, 330, 70, 'z', LIVING_H, 3);
  track(g, 530, 60, 30, 'x', 217, 2);

  // Dining table (198 x 78): two solid end legs joined by a low stretcher, eight chairs
  box(g, 336, 534, 71, 76, 315, 393, M.pine);
  for (const x of [358, 506]) {
    box(g, x, x + 6, 6, 71, 334, 374, M.pine);
    box(g, x - 2, x + 8, 0, 6, 322, 386, M.pine);
  }
  box(g, 364, 506, 22, 30, 351, 357, M.pine);
  for (const x of [372, 435, 498]) { chair(g, x, 298, 0); chair(g, x, 410, 180); }
  chair(g, 318, 354, 90); chair(g, 552, 354, -90);

  // Kitchen along the east wall, from north to south: open shelf, oven and hob, base unit
  // with the sink, washing machine, tall unit; wall units above
  box(g, 640, 700, 0, 86, 182.5, 393.5, M.pine);
  box(g, 640, 700, 0, 85, 393.5, 453.5, M.white);
  box(g, 640, 700, 0, 215, 453.5, 513.5, M.pine);
  box(g, 636, 700, 86, 90, 182.5, 453.5, M.slate);
  box(g, 638.5, 640, 12, 74, 213.5, 271.5, M.black);
  box(g, 646, 696, 90, 90.6, 215, 271, M.black);
  box(g, 650, 692, 90, 90.6, 328, 388, M.black);
  box(g, 638.5, 640, 12, 60, 404, 443, M.grey);
  box(g, 699, 700, 90, 140, 182.5, 453.5, M.slate);
  box(g, 665, 700, 140, 215, 182.5, 453.5, M.pine);
  // Alcove in the north wall, west of the worktop: worktop ledge with the toaster, tiled back,
  // microwave on a pine shelf level with the underside of the wall units, two shelves above, bin below
  box(g, 575, 640, 86, 90, 157, 186, M.slate);
  box(g, 575, 640, 90, 140, 157, 158, M.slate);
  box(g, 640, 700, 90, 140, 182.5, 183.5, M.slate);
  box(g, 575, 652, 137, 140, 157, 200, M.pine);
  box(g, 580, 632, 140, 170, 160, 200, M.white);
  box(g, 582, 620, 90, 108, 162, 180, M.black);
  for (const y of [190, 222]) box(g, 575, 640, y, y + 3, 157, 183, M.pine);
  box(g, 583, 618, 0, 75, 162, 200, M.grey);

  // WC: toilet against the north wall, corner basin and mirror cabinet in the south-west corner
  toilet(g, 345, 1, 0);
  cyl(g, 292, 103, 15, 76, 84, M.white);
  box(g, 277, 297, 122, 178, 98, 118, M.grey);
  box(g, 314, 376, 120, 185, 1, 18, M.grey);

  // Terrace: two loungers at the west end, table and six plastic armchairs
  for (const x of [55, 125]) {
    const c = placed(g, x, 650, 0);
    box(c, -28, 28, 36, 40, -20, 45, M.lounger);
    for (const lx of [-28, 25]) { box(c, lx, lx + 3, 0, 36, -18, -15, M.plastic); box(c, lx, lx + 3, 0, 36, 30, 33, M.plastic); }
    const back = new THREE.Group(); back.position.set(0, 38 * CM, -20 * CM); back.rotation.x = 0.9; c.add(back);
    box(back, -28, 28, -2, 2, -65, 0, M.lounger);
    const legs = new THREE.Group(); legs.position.set(0, 38 * CM, 45 * CM); legs.rotation.x = 0.35; c.add(legs);
    box(legs, -28, 28, -2, 2, 0, 45, M.lounger);
  }
  box(g, 300, 480, 71, 75, 615, 705, M.slate);
  for (const x of [304, 472]) for (const z of [619, 697]) box(g, x, x + 4, 0, 71, z, z + 4, M.slate);
  for (const x of [335, 390, 445]) { chair(g, x, 598, 0, M.plastic, true); chair(g, x, 722, 180, M.plastic, true); }
}

// ---------- Night level furniture ----------
{
  const g = night;

  // Bedroom 1: bed (head to the west), desk in the recess, pouf
  bed(g, 0.5, 200, 227, 387, 'w', 35);
  box(g, 262, 320, 71, 75, 334, 420, M.pine);
  for (const z of [342, 408]) { box(g, 286, 292, 6, 71, z, z + 4, M.pine); box(g, 270, 312, 0, 6, z - 1, z + 5, M.pine); }
  box(g, 286, 292, 25, 32, 346, 408, M.pine);
  chair(g, 238, 377, 90);
  box(g, 108, 186, 0, 36, 100, 158, M.grey);                                   // folded spare mattress, clear of the door

  // Under the stairs: the partition between the flights carries on west under the winders, with the
  // small door of the storage space
  box(g, 0, 100, 0, 123, 84, 91, M.wall);
  box(g, 16, 90, 3, 103, 91, 92.5, M.pine);
  box(g, 21, 85, 8, 98, 92.5, 93, M.hatch);

  // White beam across bedroom 1, east-west, in line with the north edge of the wardrobe;
  // its west end lands on the pine side of the staircase
  box(g, 1, 255.5, NIGHT_H - 25, NIGHT_H, 187, 212, M.white);
  // Door at the foot of the stairs
  wall(g, 'z', 210.5, 0, 84, PART, NIGHT_H, M.petrol, [{ s: 3, e: 81, head: 204, leaf: M.pine, swing: ['s', 1] }]);
  // Curtains and radiators of the two bedrooms
  box(g, 116, 130, 85, 228, 423, 426, M.redDrape);
  box(g, 724, 738, 85, 228, 423, 425.5, M.redDrape);
  box(g, 30, 110, 12, 72, 420, 426, M.white);
  box(g, 745, 816, 12, 72, 419, 425.5, M.white);

  // Cabin: bunk beds (90 x 200), curtains
  for (const x of [325, 409]) for (const z of [227, 421]) box(g, x, x + 6, 0, 165, z, z + 6, M.pine);
  for (const y of [28, 118]) {
    box(g, 325, 415, y, y + 12, 227, 427, M.pine);
    box(g, 329, 411, y + 12, y + 26, 231, 423, M.bunk);
  }
  box(g, 412, 415, 142, 150, 227, 427, M.pine);
  for (const y of [40, 68, 96]) box(g, 412, 416, y, y + 4, 233, 279, M.pine);    // ladder at the north end
  box(g, 411, 416, 0, 150, 279, 284, M.pine);                                  // upright holding the south side of the rungs
  box(g, 478, 484, 0, 215, 320, 338, M.curtain);                               // recess curtain, drawn back
  box(g, 494, 540.5, 32, 35, 319.5, 426, M.pine);
  for (const y of [168, 198]) box(g, 494, 540.5, y, y + 3, 319.5, 426, M.pine);
  box(g, 515, 517, 160, 162, 319.5, 426, M.grey);
  box(g, 399, 414, 0, 215, 213, 226, M.curtain);                               // entrance curtain, stored west between the wall and the bunk
  box(g, 401, 476.5, NIGHT_H - 25, NIGHT_H, 187, 212,                           // beam above the curtain: cabin colour to the south,
    [M.white, M.white, M.white, M.white, M.lightBlue, M.tealGrey]);            // corridor colour to the north

  // Bedroom 2: bed (head to the east)
  bed(g, 660, 859.5, 239.5, 399.5, 'e', 27.5);

  // WC
  toilet(g, 647, 42, -90);                                                     // back against the east partition

  // Bathroom: vanity unit and mirror on the north wall, bath along the east wall with its glass screen
  box(g, 710, 780, 0, 82, 1, 58, M.pine);
  box(g, 709, 781, 82, 86, 1, 60, M.wcGrey);
  cyl(g, 745, 30, 20, 86, 89, M.white).scale.set(1, 1, 0.75);
  box(g, 714, 776, 100, 195, 1, 6, M.pine);
  mirror(g, 's', 6, 722, 768, 108, 180);
  // Towel radiator on the south wall, next to the door
  for (const x of [668, 712]) box(g, x, x + 2, 70, 166, 183, 186, M.white);
  for (let y = 74; y < 166; y += 8) box(g, 668, 714, y, y + 2.5, 183.5, 185.5, M.white);
  // Wall decoration
  picture(g, 'snowboard', 'e', 1, 235, 380, 172, 216);
  picture(g, 'panorama', 'w', 859, 255, 385, 165, 212);
  picture(g, 'map', 'e', 345.5, 112, 176, 128, 174);
  picture(g, 'plane', 's', 1, 560, 632, 130, 181);
  // Ceiling lamps and bedside lamps
  ceilingLamp(g, 150, 310, NIGHT_H); ceilingLamp(g, 700, 320, NIGHT_H); ceilingLamp(g, 500, 140, NIGHT_H);
  for (const [x, z] of [[8, 207], [8, 407], [852, 225], [852, 413]]) {
    cyl(g, x, z, 4, 84, 92, M.black);
    cyl(g, x, z, 3, 78, 84, M.bulb);
  }
  box(g, 786, 859.5, 0, 56, 17, 187, M.white);
  box(g, 786, 859.5, 0, 56, 1, 17, M.bathTile);                                // tiled ledge north of the bath
  box(g, 792, 853, 56, 56.5, 23, 181, M.mirror);
  box(g, 784.5, 786, 0, 52, 17, 187, M.pine);
  box(g, 786, 787, 56, 196, 106, 186, M.glass);
}


// ---------- First-person visit ----------
// Keyframes: [x, z, floor height, heading, pitch, duration]. x, z and the floor height are in cm, in the
// living level frame (night level z = its own z + NIGHT_Z). Heading in degrees: 0 = north, 90 = east,
// 180 = south, 270 = west; it is not wrapped, so that the direction of each turn is explicit.
// The duration (s) is optional: by default it follows the distance and the angle to turn.
const NZ = NIGHT_Z, UP = LIVING_Y, STEP = LIVING_Y / 15;
const TOUR = [
  [628, 50, UP, 270, 0],                      // entrance, back against the front door
  [628, 50, UP, 270, 0, 2],                   // a pause before setting off
  [470, 55, UP, 270, 0],
  [465, 150, UP, 180, 0],                     // left into the main room
  [455, 232, UP, 180, 0],
  [455, 232, UP, 540, 0, 13],                 // full turn on the spot
  [600, 250, UP, 450, 0],                     // round the table, kitchen side
  [600, 465, UP, 540, 0],
  [585, 468, UP, 630, 0],                     // along the bay window towards the stairs
  [215, 466, UP, 630, -8],
  [95, 466, UP - 5 * STEP, 630, -22],         // south flight
  [45, 415, UP - 7.5 * STEP, 720, -22],       // winders
  [95, 370, UP - 10 * STEP, 810, -22],        // north flight
  [215, 369.5, 0, 810, -8],
  [279, NZ + 45, 0, 810, 0],                  // foot of the stairs
  [279, NZ + 45, 0, 900, 0],                  // right: bedroom 1
  [262, NZ + 130, 0, 925, 0],
  [228, NZ + 212, 0, 945, 0],
  [228, NZ + 212, 0, 885, 0, 2.5],            // look left...
  [228, NZ + 212, 0, 1025, 0, 5],             // ...and right
  [228, NZ + 212, 0, 900, 0, 3],
  [262, NZ + 130, 0, 900, 0],
  [279, NZ + 45, 0, 900, 0],                  // back out
  [279, NZ + 45, 0, 810, 0],
  [392, NZ + 45, 0, 810, 0],
  [392, NZ + 140, 0, 900, 0],                 // right into the corridor
  [438, NZ + 165, 0, 900, 0],
  [438, NZ + 196, 0, 925, -5],                // a look into the bunk cabin
  [438, NZ + 196, 0, 870, -5, 3],
  [438, NZ + 140, 0, 900, 0],                 // step back
  [438, NZ + 140, 0, 810, 0],                 // left, towards bedroom 2
  [603, NZ + 140, 0, 810, 0],
  [603, NZ + 140, 0, 900, 0],
  [606, NZ + 225, 0, 900, 0],
  [622, NZ + 300, 0, 880, 0],
  [622, NZ + 300, 0, 825, 0, 2.5],            // look left...
  [622, NZ + 300, 0, 955, 0, 5],              // ...and right
  [622, NZ + 300, 0, 900, 0, 2.5],
  [603, NZ + 140, 0, 900, 0],                 // back out
  [600, NZ + 128, 0, 1080, -8, 4],            // WC
  [600, NZ + 110, 0, 1080, -8],
  [600, NZ + 137, 0, 1170, 0, 3.5],           // bathroom
  [700, NZ + 137, 0, 1170, 0],
  [700, NZ + 137, 0, 1120, -5, 2.5],
  [700, NZ + 137, 0, 1225, -8, 4],
  [700, NZ + 137, 0, 1170, 0, 2.5],
];
// ---------- Viewer ----------
// createVisit(stage, options) draws the model in `stage` (an element of the page, sized by CSS).
// - Preview (in the article): the first-person visit plays in a loop, nothing to handle; a click
//   or Enter opens the full-screen view.
// - Full screen: the stage moves to <body> (articles are transformed by the theme, which would
//   confine a fixed element), with the level buttons, the visit button and the orbit controls.
//   The visit keeps playing until the first action on the model. Escape or the close button go
//   back to the preview.
// Rendering only runs while the stage is on screen and the tab is visible.
// options: labels ({ both, living, night, start, stop, close, help }), onOpen(), onClose(),
// standalone (test page: full screen from the start, no close button).
// Returns the viewer, with the scene objects for debugging (the test page sets it as window.lcr).

// The sun, the environment and the shadows belong to the scene: set up once.
const sun = new THREE.DirectionalLight(0xfff4e0, 1.7);
sun.position.set(-3, 14, 15);
sun.target.position.set(4.3, 1.5, 4.5);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
scene.traverse((o) => {
  if (!o.isMesh || o.type === 'Reflector') return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const solid = !mats.some((m) => m.transparent || m.emissiveIntensity > 1);
  o.castShadow = solid;
  o.receiveShadow = solid;
});

let current = null;   // one viewer at a time (a page swapped in by the in-site navigation gets a new one)

export function createVisit(stage, { labels = {}, onOpen = () => {}, onClose = () => {}, standalone = false } = {}) {
  if (current) current.dispose();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'visit3d-canvas';
  stage.prepend(renderer.domElement);

  // Soft ambient light from a neutral studio environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI / 2;
  controls.enabled = false;

  // Ambient occlusion (darker corners and contact shadows); plain rendering if it cannot be set up
  let composer = null;
  try {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, 1, 1);
    ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 16 });
    composer.addPass(ao);
    composer.addPass(new OutputPass());
  } catch (e) { console.warn('Ambient occlusion disabled:', e); composer = null; }

  // Full-screen controls
  const ui = document.createElement('div');
  ui.className = 'visit3d-ui';
  ui.innerHTML = '<div class="visit3d-bar">'
    + '<button type="button" data-view="both" class="on"></button>'
    + '<button type="button" data-view="living"></button>'
    + '<button type="button" data-view="night"></button>'
    + '<button type="button" class="visit3d-tour"></button>'
    + '</div>'
    + '<button type="button" class="visit3d-close"></button>'
    + '<p class="visit3d-help"></p>';
  for (const k of ['both', 'living', 'night']) ui.querySelector(`[data-view="${k}"]`).textContent = labels[k] || k;
  const closeButton = ui.querySelector('.visit3d-close'), tourButton = ui.querySelector('.visit3d-tour');
  closeButton.classList.add('icon', 'solid', 'fa-times');   // Font Awesome cross, as the image viewer
  closeButton.setAttribute('aria-label', labels.close || 'Close');
  closeButton.title = labels.close || 'Close';
  ui.querySelector('.visit3d-help').textContent = labels.help || '';
  stage.append(ui);

  let full = false, visible = false, placeholder = null;

  const overview = () => {
    const fit = Math.max(1, 1.2 / camera.aspect);   // step back on portrait screens
    camera.fov = 45; camera.updateProjectionMatrix();
    camera.position.set(4.3, 13 * fit, 3.7 + 11.3 * fit);
    controls.target.set(4.3, 1.5, 3.7);
    controls.enabled = full;
  };
  const setView = (view) => {
    for (const o of ui.querySelectorAll('[data-view]')) o.classList.toggle('on', o.dataset.view === view);
    living.visible = view !== 'night';
    night.visible = view !== 'living';
  };

  const tour = (() => {
    const EYE = 160, WALK = 105, CLIMB = 55, TURN = 55;        // cm, cm/s, cm/s, degrees/s
    const times = [0];
    for (let i = 1; i < TOUR.length; i++) {
      const [x0, z0, h0, y0] = TOUR[i - 1], [x1, z1, h1, y1, , t] = TOUR[i];
      const d = Math.hypot(x1 - x0, z1 - z0);
      times.push(times[i - 1] + (t ?? Math.max(d / (h0 === h1 ? WALK : CLIMB), Math.abs(y1 - y0) / TURN, 0.4)));
    }
    const total = times[times.length - 1];
    let running = false, paused = false, clock = 0, last = 0;
    const lens = () => {
      // wide lens: about 109 degrees of horizontal field of view, whatever the shape of the frame
      camera.fov = Math.min(118, Math.max(60, 2 * Math.atan(Math.tan(40 * Math.PI / 180) / 0.6 / camera.aspect) * 180 / Math.PI));
      camera.updateProjectionMatrix();
    };
    const pose = (time) => {
      let i = 1;
      while (i < TOUR.length - 1 && times[i] < time) i++;
      const a = TOUR[i - 1], b = TOUR[i], u = Math.min(1, Math.max(0, (time - times[i - 1]) / (times[i] - times[i - 1])));
      const e = u * u * (3 - 2 * u), mix = (k, w) => a[k] + (b[k] - a[k]) * w;
      const yaw = mix(3, e) * Math.PI / 180, pitch = mix(4, e) * Math.PI / 180;
      camera.position.set(mix(0, u) * CM, (mix(2, u) + EYE) * CM, mix(1, u) * CM);
      // The upstairs WC door stands open while we lean against the front door, then closes gently
      // as we set off, so that it is out of the way
      const k = Math.min(1, Math.max(0, (time - 1.6) / 2));
      wcDoor.rotation.y = WC_DOOR_OPEN * (1 - k * k * (3 - 2 * k));
      camera.lookAt(camera.position.x + Math.sin(yaw) * Math.cos(pitch), camera.position.y + Math.sin(pitch), camera.position.z - Math.cos(yaw) * Math.cos(pitch));
    };
    return {
      get running() { return running; },
      get clock() { return clock; },
      total,
      times,
      lens,
      // Jump to a moment of the visit and hold it (debugging: window.lcr.tour.seek(42))
      seek(time) { if (!running) this.start(); clock = time; paused = true; pose(clock); },
      start() {
        running = true; paused = false; clock = 0; last = performance.now();
        setView('both');
        controls.enabled = false;
        lens();
        livingCeiling.visible = true;
        tourButton.textContent = labels.stop || 'Stop';
      },
      stop() {
        if (!running) return;
        running = false; livingCeiling.visible = false; wcDoor.rotation.y = WC_DOOR_OPEN;
        tourButton.textContent = labels.start || 'Visit';
        overview();
      },
      update() {
        if (!running) return;
        const now = performance.now();
        if (!paused) clock += Math.min(0.1, (now - last) / 1000);
        last = now;
        pose(Math.min(clock, total));
        if (clock > total + 2) {
          if (full) this.stop();
          else { clock = 0; }   // the preview plays in a loop
        }
      },
    };
  })();

  const resize = () => {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    const ratio = Math.min(devicePixelRatio, full ? 2 : 1.5);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(ratio); composer.setSize(w, h); }
    camera.aspect = w / h;
    if (tour.running) tour.lens(); else camera.updateProjectionMatrix();
  };

  const frame = () => {
    if (tour.running) tour.update(); else controls.update();
    if (composer) composer.render(); else renderer.render(scene, camera);
  };
  const updateLoop = () => {
    const on = (visible || full) && !document.hidden && stage.isConnected;
    renderer.setAnimationLoop(on ? frame : null);
  };

  const open = () => {
    if (full) return;
    full = true;
    placeholder = document.createComment('visit3d');
    stage.before(placeholder);
    document.body.append(stage);
    stage.classList.add('is-full');
    stage.removeAttribute('role');
    stage.removeAttribute('tabindex');
    controls.enabled = !tour.running;
    resize();
    updateLoop();
    onOpen();
    closeButton.focus();
  };
  const close = () => {
    if (!full || standalone) return;
    full = false;
    stage.classList.remove('is-full');
    placeholder.replaceWith(stage);
    placeholder = null;
    stage.setAttribute('role', 'button');
    stage.setAttribute('tabindex', '0');
    controls.enabled = false;
    tour.start();
    resize();
    updateLoop();
    onClose();
    stage.focus({ preventScroll: true });
  };

  // Events
  for (const b of ui.querySelectorAll('[data-view]')) b.onclick = () => { tour.stop(); setView(b.dataset.view); };
  tourButton.onclick = () => (tour.running ? tour.stop() : tour.start());
  closeButton.onclick = close;
  // Clicks stay in the viewer: the page would close the article (body handler).
  const onClick = (event) => {
    event.stopPropagation();
    // Not the click of the close button, which has just closed the full screen
    if (!full && !event.target.closest('.visit3d-ui')) open();
  };
  const onKey = (event) => {
    if (!full && (event.key === 'Enter' || event.key === ' ') && event.target === stage) { event.preventDefault(); open(); }
  };
  // Any action on the model hands the camera back (full screen only)
  const onAction = () => { if (full) { tour.stop(); controls.enabled = true; } };
  const onEscape = (event) => {
    if (!full || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  stage.addEventListener('click', onClick);
  stage.addEventListener('keydown', onKey);
  for (const ev of ['pointerdown', 'wheel']) renderer.domElement.addEventListener(ev, onAction);
  document.addEventListener('keydown', onEscape, true);
  document.addEventListener('visibilitychange', updateLoop);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  const visibility = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    updateLoop();
  }, { rootMargin: '100px' });
  visibility.observe(stage);

  setView('both');
  overview();
  resize();
  tour.start();
  updateLoop();
  if (standalone) { closeButton.hidden = true; open(); }

  current = {
    scene, camera, controls, renderer, tour, living, night, stairs, sun,
    get composer() { return composer; },
    open, close,
    dispose() {
      if (full) close();
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      visibility.disconnect();
      document.removeEventListener('keydown', onEscape, true);
      document.removeEventListener('visibilitychange', updateLoop);
      stage.removeEventListener('click', onClick);
      stage.removeEventListener('keydown', onKey);
      controls.dispose();
      if (composer) composer.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      ui.remove();
      current = null;
    },
  };
  return current;
}
