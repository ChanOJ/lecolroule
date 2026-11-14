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
import { OBJLoader } from '../vendor/three-0.160.0/addons/loaders/OBJLoader.js';
import { RoundedBoxGeometry } from '../vendor/three-0.160.0/addons/geometries/RoundedBoxGeometry.js';
// Generated from assets/3d/textures/ by scripts/textures.py: { name: data URI }
import TEX, { OUTLINES } from './visit3d-textures.js';
// Generated from assets/3d/models/ by scripts/models.py: { name: OBJ text }
import MODELS from './visit3d-models.js';

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
  pine: mat(0xd9a55b), brown: mat(0x5a3d2e), lowWall: mat(0xe6e0d4), darkBrown: mat(0x4a3327, { roughness: 0.6 }),   // between the former 0x3b2a20 and brown
  glass: mat(0x9cc7e0, { transparent: true, opacity: 0.3, roughness: 0.05 }),
  bulb: mat(0xfff2cc, { emissive: 0xffb87b, emissiveIntensity: 1.6 }),   // lit, 3200 K (see lamp())
  duct: mat(0xece6d6), cladding: mat(0xc49a62), orange: mat(0xe8703a),
  slate: mat(0x4b4f54), black: mat(0x1d1e20), white: mat(0xf4f4f1), grey: mat(0x74787e),
  fabric: mat(0x8d98a8), mirror: mat(0xbfd3dc),
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

// Hinged doors: each one turns on its hinge (pivot group), from closed (rotation 0) to open
// (rotation `open`). Full screen, a click on a door opens or closes it; a row of TOUR can close one
// during the visit. Named doors (wall openings with `name`, or addDoor(..., name)) are in DOORS.
const DOORS = new Map(), DOOR_LIST = [];
function setDoor(d, openness) { d.openness = openness; d.pivot.rotation.y = d.open * openness; }
// home: openness at load and at the start of every visit (1 = open, 0 = closed).
function addDoor(pivot, open, name, home = 1) {
  const d = { pivot, open, home, openness: home, target: home };
  pivot.traverse((o) => { if (o.isMesh) o.userData.door = d; });
  setDoor(d, home);
  DOOR_LIST.push(d);
  if (name) DOORS.set(name, d);
  return d;
}

// Pictures cut out of the photos of the flat: TEX (assets/3d/textures/, see scripts/textures.py).
// texture(key, flip): the texture of that image, mirrored left to right when flip is true.
const TEXTURES = new Map();
// Bumped when an image finishes loading after the model is built: the viewer then draws a new frame
let loaded = 0;
function texture(key, flip = false) {
  const id = key + (flip ? ':flip' : '');
  if (!TEXTURES.has(id)) {
    if (!TEX[key]) console.error(`3D model: no texture "${key}" (assets/3d/textures/${key}.jpg, then scripts/textures.py)`);
    const tex = new THREE.TextureLoader().load(TEX[key], () => loaded++);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (flip) { tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; }
    TEXTURES.set(id, tex);
  }
  return TEXTURES.get(id);
}
const texMat = (key, flip = false) => mat(0xffffff, { map: texture(key, flip), roughness: 0.7 });
// Repeating wood (pine, oak): one image repeated every size = [u, v] cm, its grain along `grain`
// ('u' or 'v' of the image). Boxes drawn with it get texture coordinates in metres with the grain
// along their longest side (woodUV()); slabs and plates (slab(), stairs) have metre coordinates too.
// Its relief: the height map <key>-bump (the pack's displacement map) as a bump map.
// opts.turn: true turns the image a quarter turn (its u along v): planks in the other direction.
function wood(key, size, grain, { turn = false, ...opts } = {}) {
  const load = (k) => {
    const tex = new THREE.TextureLoader().load(TEX[k], () => loaded++);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / (size[0] * CM), 1 / (size[1] * CM));
    if (turn) tex.rotation = Math.PI / 2;
    tex.anisotropy = 8;
    return tex;
  };
  const map = load(key);
  map.colorSpace = THREE.SRGBColorSpace;
  const m = mat(0xffffff, { map, bumpMap: load(`${key}-bump`), bumpScale: 1, roughness: 0.6, ...opts });
  m.userData.grain = grain;
  return m;
}
const PINE = wood('pine', [60, 60], 'v');    // pine (stairs, shelves, frames, bedside tables...)
const OAK = wood('oak', [100, 50], 'u');     // oak (living room shelves)
const TABLE_TOP = wood('wood034', [100, 50], 'u');                                   // top of the barrel table
const BARREL = wood('pipe002', [30, 66], 'u', { roughness: 0.15, metalness: 0.5 });    // its hooped body, glossy metal (2 hoops)
// Grey woven fabric (ambientCG Fabric030): sofa, armchairs, poufs, spare mattress. FABRIC on metre
// texture coordinates, FABRIC_MODEL on a model's (1 unit of the pack is about 40 cm, see boxUV())
const FABRIC = wood('fabric030', [25, 25], 'u', { roughness: 1 });
const FABRIC_MODEL = wood('fabric030', [62.5, 62.5], 'u', { roughness: 1 });
// Terrace deck: weathered planks (ambientCG Planks027A), running north-south (slab: u = x, v = z)
// Night level floor: grey planks (ambientCG Planks001), running north-south
const NIGHT_FLOOR = wood('planks001', [120, 92], 'u', { roughness: 0.7 });
// Terrace deck, drawn in a canvas: planks 11 cm wide, north-south (slab: u = x, v = z), 1 cm black
// joints between them and at their ends (one per plank and per 2.4 m, staggered), a slight shade
// and streak variation (seeded), and a bump map raising the planks above the joints.
const DECK = (() => {
  const K = 4, N = 10, P = 12, L = 240, w = N * P * K, h = L * K;   // 4 px per cm, 10 planks, 2.4 m long
  const make = (draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d'));
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / (N * P * CM), 1 / (L * CM));
    tex.anisotropy = 8;
    return tex;
  };
  let seed = 5;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const planks = Array.from({ length: N }, () => ({ shade: 0.9 + random() * 0.2, joint: random() * L,
    streaks: Array.from({ length: 6 }, () => [random() * 11, 0.85 + random() * 0.3]) }));
  const base = new THREE.Color(0x837569);
  const draw = (ctx, colour) => {
    ctx.fillStyle = colour ? '#141414' : '#000';
    ctx.fillRect(0, 0, w, h);
    planks.forEach((pl, i) => {
      const x = i * P * K;
      ctx.fillStyle = colour ? `#${base.clone().multiplyScalar(pl.shade).getHexString()}` : '#fff';
      ctx.fillRect(x, 0, 11 * K, h);
      if (colour) for (const [sx, f] of pl.streaks) {                       // grain streaks along the plank
        ctx.fillStyle = `#${base.clone().multiplyScalar(pl.shade * f).getHexString()}`;
        ctx.fillRect(x + sx * K, 0, K / 2, h);
      }
      ctx.fillStyle = colour ? '#141414' : '#000';
      ctx.fillRect(x, pl.joint * K, 11 * K, K);                            // end joint
    });
  };
  const map = make((ctx) => draw(ctx, true));
  map.colorSpace = THREE.SRGBColorSpace;
  return mat(0xffffff, { map, bumpMap: make((ctx) => draw(ctx, false)), bumpScale: 4, roughness: 0.85 });
})();
// Texture coordinates in metres on a cylinder (cyl()): around and up on the side, plan x/z on the caps
function metreUV(mesh, r, h) {
  const g = mesh.geometry, uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.99) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, uv.getX(i) * 2 * Math.PI * r * CM, uv.getY(i) * h * CM);
  }
  uv.needsUpdate = true;
  return mesh;
}
// Texture coordinates of a box in a wood material: on each face, the grain runs along the longer of
// the face's two sides, in metres from the centre of the box
function woodUV(geo, grain) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, p = geo.parameters;
  const dims = [p.width, p.height, p.depth];
  for (let f = 0; f < 6; f++) {
    const n = Math.floor(f / 2), [a, b] = [0, 1, 2].filter((k) => k !== n);
    const [along, across] = dims[a] >= dims[b] ? [a, b] : [b, a];
    for (let i = f * 4; i < f * 4 + 4; i++) {
      const l = pos.getComponent(i, along), c = pos.getComponent(i, across);
      if (grain === 'v') uv.setXY(i, c, l); else uv.setXY(i, l, c);
    }
  }
  uv.needsUpdate = true;
}

// Materials of a box whose face(s) show an image (a cupboard front...): faces = { e, w, s, n, t (top): key }.
function faced(m, faces) {
  // a face given as [key, true] shows the image mirrored (the back of a door)
  return ['e', 'w', 't', null, 's', 'n'].map((f) => (!f || !faces[f] ? m : Array.isArray(faces[f]) ? texMat(...faces[f]) : texMat(faces[f])));   // box face order
}
// Door leaf with the photo of a door on both faces (porte.jpg: handle on the left, hinges on the
// right), mirrored on the faces where the hinges are on the left: the handle is always away from
// them. axis = direction the leaf runs along (closed), dir = +1 when it runs from its hinge towards
// +x or +z, -1 otherwise. Edges: material m.
function leafFaces(axis, dir, key, m) {
  const hingeLeft = axis === 'x' ? { s: dir > 0, n: dir < 0 } : { e: dir < 0, w: dir > 0 };
  const face = (f) => texMat(key, hingeLeft[f]);
  return axis === 'x' ? [m, m, m, m, face('s'), face('n')] : [face('e'), face('w'), m, m, m, m];
}

function box(g, x1, x2, y1, y2, z1, z2, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry((x2 - x1) * CM, (y2 - y1) * CM, (z2 - z1) * CM), m);
  const w = [].concat(m).find((mm) => mm.userData.grain);
  if (w) woodUV(mesh.geometry, w.userData.grain);
  mesh.position.set((x1 + x2) / 2 * CM, (y1 + y2) / 2 * CM, (z1 + z2) / 2 * CM);
  g.add(mesh);
  return mesh;
}

// Axis-aligned wall: axis 'x' runs along x at z = c (centre line), from a to b.
// ops = openings [{ s, e, sill, head, glass }] along the wall axis (a window: glass, panes = leaves
// split by mullions, bars = [columns, rows] of small panes split by thin glazing bars, out = side
// of the outside, -1 north/west or +1 south/east, whose face of the frame is dark brown); a door leaf: { leaf: material,
// swing: [hinge, side] } (hinge at the start 's' or end 'e' of the opening, opening to the north/west
// (-1) or south/east (+1) side), optional name (see DOORS), angle (degrees open, 90 by default),
// closed (true: closed at load and at the start of the visit) and tex (texture key of an image of
// the door on both faces, see leafFaces());
// without swing, a fixed closed leaf.
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
      // pine frame, its outside face (o.out: -1 north/west, +1 south/east) dark brown
      const fr = !o.out ? PINE : Array.from({ length: 6 }, (_, i) => (i === (axis === 'x' ? (o.out > 0 ? 4 : 5) : (o.out > 0 ? 0 : 1)) ? M.darkBrown : PINE));
      seg(o.s, o.e, y1, y2, M.glass, 3);
      seg(o.s, o.e, y1, y1 + F, fr, 8); seg(o.s, o.e, y2 - F, y2, fr, 8);
      if (o.shutter) seg(o.s, o.e, y2, o.head, fr, 12);   // pine box of the roller shutter
      for (let i = 0; i <= n; i++) {
        const x = Math.min(Math.max(o.s + (o.e - o.s) * i / n - F / 2, o.s), o.e - F);
        seg(x, x + F, y1, y2, fr, 8);
      }
      if (o.bars) {                                        // glazing bars, 3 cm wide, inside the frame
        const [cols, rows] = o.bars, B = 3, s1 = o.s + F, s2 = o.e - F, h1 = y1 + F, h2 = y2 - F;
        for (let i = 1; i < cols; i++) { const x = s1 + (s2 - s1) * i / cols; seg(x - B / 2, x + B / 2, h1, h2, fr, 5); }
        for (let j = 1; j < rows; j++) { const y = h1 + (h2 - h1) * j / rows; seg(s1, s2, y - B / 2, y + B / 2, fr, 5); }
      }
    }
    if (o.leaf && !o.swing) seg(o.s + 1, o.e - 1, 0, o.head - 1, o.leaf, 4);   // closed door leaf
    if (o.leaf && o.swing) {                               // hinged leaf (4 cm thick), drawn open
      const [hinge, side] = o.swing, dir = hinge === 's' ? 1 : -1, w = o.e - o.s - 4;
      const p = hinge === 's' ? o.s + 3 : o.e - 3, q = c + side * (t / 2 - 2);   // hinge axis, on the swing side
      const pivot = new THREE.Group(), l1 = Math.min(0, dir * w), l2 = Math.max(0, dir * w);
      const lm = o.tex ? leafFaces(axis, dir, o.tex, o.leaf) : o.leaf;
      if (axis === 'x') { pivot.position.set(p * CM, 0, q * CM); box(pivot, l1, l2, 0, o.head - 1, -2, 2, lm); }
      else { pivot.position.set(q * CM, 0, p * CM); box(pivot, -2, 2, 0, o.head - 1, l1, l2, lm); }
      g.add(pivot);
      addDoor(pivot, (axis === 'x' ? -side : side) * dir * (o.angle ?? 90) * Math.PI / 180, o.name, o.closed ? 0 : 1);
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

// Tiles drawn in a canvas: 4 x 4 tiles of w x h cm with 3 mm grout joints, a slight shade
// variation from tile to tile (seeded: the same at every load), and the same pattern as a bump
// map (joints lower than the tiles). The texture repeats every 4 tiles with UVs in metres: slab()
// gives plan coordinates, tiledWall() wall coordinates; joints fall on multiples of w and h.
function tiles(w, h, color, groutColor) {
  const N = 4, K = 128 / w, PW = 128, PH = Math.round(h * K), G = Math.max(2, Math.round(0.3 * K));
  const make = (draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = N * PW; canvas.height = N * PH;
    draw(canvas.getContext('2d'));
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / (N * w * CM), 1 / (N * h * CM));
    tex.anisotropy = 8;
    return tex;
  };
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const base = new THREE.Color(color), shades = Array.from({ length: N * N }, () => 0.92 + random() * 0.16);
  const grid = (ctx, tileStyle, jointStyle) => {
    ctx.fillStyle = jointStyle;
    ctx.fillRect(0, 0, N * PW, N * PH);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      ctx.fillStyle = tileStyle(i * N + j);
      ctx.fillRect(i * PW + G / 2, j * PH + G / 2, PW - G, PH - G);
    }
  };
  const map = make((ctx) => grid(ctx, (k) => `#${base.clone().multiplyScalar(shades[k]).getHexString()}`, groutColor));
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = make((ctx) => grid(ctx, () => '#fff', '#000'));
  return mat(0xffffff, { map, bumpMap, bumpScale: 1.5, roughness: 0.55 });
}
// Tiled face of a wall (same placement as picture(): facing, wall face c, a..b along the wall,
// y1..y2), 1 mm in front of it; the joints line up on u0 along the wall and v0 in height.
function tiledWall(g, m, facing, c, a, b, y1, y2, u0, v0) {
  const geo = new THREE.PlaneGeometry((b - a) * CM, (y2 - y1) * CM), uv = geo.attributes.uv;
  const ltr = facing === 's' || facing === 'w';   // left to right = increasing coordinate
  for (let i = 0; i < uv.count; i++) {
    const along = ltr ? a + uv.getX(i) * (b - a) : b - uv.getX(i) * (b - a);
    uv.setXY(i, (along - u0) * CM, (y1 + uv.getY(i) * (y2 - y1) - v0) * CM);
  }
  const mesh = new THREE.Mesh(geo, m);
  place(mesh, facing, c, (a + b) / 2, (y1 + y2) / 2, 0.1);
  g.add(mesh);
}

// Anthracite tiles of the living level, the bathroom and the WC downstairs
// Average colour of the front of the terrace cabinet (placard-terrasse.jpg): its east side
const CABINET_SIDE = 0x9c6e4b;
const TILES = tiles(26, 26, 0x4a4f55, '#6b6d70');
// The same tiles, smaller, on the kitchen walls: 3.5 rows between the worktop (90) and the wall units (140)
const KITCHEN_TILES = tiles(50 / 3.5, 50 / 3.5, 0x4a4f55, '#6b6d70');
// Wall tiles of the bathroom, horizontal rectangles: 4.6 tiles along the east wall (187 cm), 7 rows
// between the bath (56 cm high) and the ceiling
const BATH_TILES = tiles(187 / 4.6, (NIGHT_H - 56) / 7, 0xb3ae9b, '#9a9480');

// ---------- Living level ----------
{
  const g = living, S = STAIR;
  const stairHole = [[0, S.zN], [S.x, S.zN], [S.x, S.zS], [0, S.zS]];
  // Anthracite tiles, 26 x 26 cm (top of the slab; its edges plain)
  slab(g, [[-EXT, -EXT], [686, -EXT], [686, 100], [736, 100], [736, 549.5], [-EXT, 549.5]], 0, SLAB,
    [TILES, M.tiles], [stairHole]);

  // Outer walls: render outside, cream inside
  const IN = M.wall, OUT = M.render;
  wall(g, 'x', -EXT / 2, -EXT, 686, EXT, LIVING_H, M.cut, [], [OUT, IN]);
  wall(g, 'z', -EXT / 2, 0, 513.5, EXT, LIVING_H, M.cut, [{ s: 332, e: 407, sill: 110, head: 205, glass: true, shutter: 24, out: -1 }], [OUT, IN]);
  wall(g, 'x', 513.5 + EXT / 2, -EXT, 736, EXT, LIVING_H, M.cut, [
    { s: 100, e: 275, sill: 87, head: 215, glass: true, panes: 2, out: 1 },
    { s: 320, e: 602, sill: 0, head: 215, glass: true, panes: 3, out: 1 },
  ], [IN, OUT]);
  wall(g, 'z', 700 + EXT / 2, 130, 513.5, EXT, LIVING_H, M.cut, [], [IN, OUT]);
  // Front door: hinged on the north side, it opens inwards against the north wall; closed at load
  wall(g, 'z', 650 + EXT / 2, 0, 130, EXT, LIVING_H, M.cut,
    [{ s: 5, e: 95, head: 204, leaf: M.tealGrey, swing: ['s', -1], name: 'front', closed: true }], [M.teal, OUT]);
  box(g, 686, 736, 0, LIVING_H, 100, 130, M.cut);

  // WC block: teal outside, orange inside, door on its east side
  wall(g, 'z', 273.5, 0, 118, PART, LIVING_H, M.teal, [], [M.teal, M.orange]);
  wall(g, 'x', 121.5, 255, 270, PART, LIVING_H, M.teal);                      // 15 cm stub: right support of the shelves
  wall(g, 'x', 121.5, 270, 380, PART, LIVING_H, M.teal, [], [M.orange, M.teal]);   // south wall: with the stub, 125 cm on the living side (x 255..380, the sideboard)
  box(g, 0, 15, 0, LIVING_H, 112, 127, M.wall);                               // post: left support of the west shelves
  wall(g, 'z', 376.5, 0, 118, PART, LIVING_H, M.teal, [{ s: 30, e: 105, head: 204 }], [M.orange, M.teal]);
  // Its door: hinged at the south end, it opens towards the entrance; the visit closes it (see tour)
  wcDoor.position.set(376.5 * CM, 0, 104 * CM);
  box(wcDoor, -2, 2, 0, 203, -73, 0, leafFaces('z', -1, 'porte', M.pine));
  g.add(wcDoor);
  addDoor(wcDoor, WC_DOOR_OPEN, 'wcUp');
  paint(g, 'x', 0.5, 277, 373, LIVING_H, M.orange);
  paint(g, 'x', 0.5, 380, 650, 217, M.teal);                                  // entrance
  paint(g, 'x', 0.75, 0, 270, LIVING_H, M.cladding);                         // wood cladding behind the sofa

  // Service ducts between the entrance and the kitchen, lowered ceiling of the entrance
  // Entrance closet: the block west of the kitchen alcove (x 503..575), as deep as the alcove
  // and its back together (z 118..182.5); its back is the partition with the kitchen radiator
  box(g, 503, 506, 0, LIVING_H, 118, 182.5, M.duct);                          // west side
  box(g, 572, 575, 0, LIVING_H, 118, 182.5, M.duct);                          // east side
  box(g, 506, 572, 0, LIVING_H, 179.5, 182.5, M.duct);                        // back, radiator on the kitchen side
  box(g, 506, 572, 204, LIVING_H, 118, 179.5, M.duct);                        // above its door
  box(g, 575, 640, 0, LIVING_H, 118, 157, M.duct);                            // back of the kitchen alcove (25 cm recess)
  box(g, 640, 650, 0, LIVING_H, 118, 182.5, M.duct);
  box(g, 650, 700, 0, LIVING_H, 130, 182.5, M.duct);
  // Entrance closet door: hinged on the east (on the left seen from the entrance), it opens onto
  // the entrance; closed at load
  { const pivot = new THREE.Group(); pivot.position.set(572 * CM, 0, 117 * CM);
    box(pivot, -66, 0, 0, 204, -1, 1, leafFaces('x', -1, 'porte', M.pine)); g.add(pivot);
    addDoor(pivot, -Math.PI / 2, 'closet', 0); }
  box(g, 506.6, 571.4, 8, 118, 182.5, 188, M.white);                          // kitchen radiator: 90 % of the wall (x 503..575), centred, 110 high
  box(g, 380, 650, 217, LIVING_H, 0, 118, M.wall);

  // Staircase: 15 risers; south flight goes down westwards, winders, north flight comes back east
  const rise = LIVING_Y / 15, going = (S.x - S.turn) / 5, T = 4;
  for (let k = 1; k <= 5; k++)
    box(stairs, S.x - going * k - 3, S.x - going * (k - 1), -k * rise - T, -k * rise, S.zMid + 3.5, S.zS, PINE);   // 1 cm over the riser below
  for (let k = 10; k <= 14; k++)
    box(stairs, S.turn + going * (k - 10), S.turn + going * (k - 9) + 1, -k * rise - T, -k * rise, S.zN, S.zMid - 3.5, PINE);   // idem
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
    slab(stairs, pts, -k * rise, T, PINE);
  }
  // Pine risers: straight ones on both flights, radiating ones between the winders
  const riser = (k) => [-k * rise, -(k - 1) * rise - (k > 1 ? T : 0)];
  for (let k = 1; k <= 5; k++) { const x = S.x - going * (k - 1); box(stairs, x - 2, x, ...riser(k), S.zMid + 3.5, S.zS, PINE); }
  box(stairs, S.turn - 2, S.turn, ...riser(6), S.zMid, S.zS, PINE);
  for (let j = 1; j <= 3; j++) {
    const [hx, hz] = hit(45 * j), len = Math.hypot(hx - S.turn, hz - S.zMid), [y1, y2] = riser(6 + j);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len * CM, (y2 - y1) * CM, 2 * CM), PINE);
    m.position.set((hx + S.turn) / 2 * CM, (y1 + y2) / 2 * CM, (hz + S.zMid) / 2 * CM);
    m.rotation.y = Math.atan2(-(hz - S.zMid), hx - S.turn);
    stairs.add(m);
  }
  box(stairs, S.turn - 2, S.turn, ...riser(10), S.zN, S.zMid, PINE);
  for (let k = 11; k <= 15; k++) { const x = S.turn + going * (k - 10); box(stairs, x - 2, x, ...riser(k), S.zN, S.zMid - 3.5, PINE); }

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
  prism(band(92, 98), S.zMid - 3, S.zMid + 3, PINE);
  prism(band(8, 13), S.zMid - 2, S.zMid + 2, PINE);
  for (let x = x0 + 12; x < S.x - 8; x += 12)
    box(stairs, x - 1.5, x + 1.5, slopeY(x) + 13, slopeY(x) + 92, S.zMid - 1.5, S.zMid + 1.5, PINE);
  box(stairs, S.turn, x0 + 4.5, -10 * rise - T, y0 + 104, S.zMid - 4.5, S.zMid + 4.5, PINE);   // newel, down to the first step of the north flight

  // Plasterboard casing under the stairs, seen from bedroom 1: it follows the slope of the south
  // flight down to the west wall, under the winders
  const casing = [[0, -138], [S.turn - 10, -138], [S.turn, -120], [S.x, -28]];   // kept below every tread and winder
  prism([...casing, ...casing.map(([x, y]) => [x, y - 5]).reverse()], S.zMid + 3.5, S.zS - 1, M.wall);
  // Stairwell: dark blue under the south flight, pine band at floor level, pine facing on the slab edge
  const sidePts = [[0, -163], [S.turn, -5 * rise - 12], [S.x, -12], [S.x, 0], [0, 0]];
  prism(sidePts, S.zS - 1, S.zS, M.petrol);
  prism([...casing.map(([x, y]) => [x, y - 5]), [S.x, -SLAB], [S.x, 0], [0, 0]], S.zS, S.zS + 1, PINE);   // pine side seen from bedroom 1, down to the casing
  box(g, 0, 2, 0, 12, S.zN, S.zS, PINE);
  box(g, 0, S.x, 0, 12, S.zS - 2, S.zS, PINE);
  box(stairs, S.x - 1, S.x, -SLAB, 0, S.zN, S.zMid - 3.5, PINE);

  // Guard rails around the stairwell
  const rail = (axis, c, a, b) => {
    const bx = (s, e, y1, y2, w) => axis === 'x' ? box(g, s, e, y1, y2, c - w / 2, c + w / 2, PINE) : box(g, c - w / 2, c + w / 2, y1, y2, s, e, PINE);
    bx(a, b, 92, 98, 6); bx(a, b, 8, 13, 4);
    const n = Math.round((b - a) / 12);
    for (let i = 1; i < n; i++) bx(a + (b - a) * i / n - 1.5, a + (b - a) * i / n + 1.5, 13, 92, 3);
  };
  const post = (x, z) => box(g, x - 4.5, x + 4.5, 0, 104, z - 4.5, z + 4.5, PINE);
  rail('x', S.zN, 0, S.x);
  rail('z', S.x, S.zN, S.zMid);
  post(4.5, S.zN); post(S.x, S.zN); post(S.x, S.zMid);

  // Terrace: L-shaped deck, low wall with wooden rail, storage cabinet at the end of the short leg
  const tz = 513.5 + EXT, te = 860, ts = tz + 205;
  slab(g, [[-EXT, tz], [736, tz], [736, S.zN], [te + EXT, S.zN], [te + EXT, ts + EXT], [-EXT, ts + EXT]], 0, SLAB, [DECK, M.deck]);
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
  // made-to-measure cabinet: 220 high, 60 deep; its east side in the average colour of its front;
  // an anthracite top 1 cm thick, 4 cm over the south and east sides
  { const m = faced(M.pine, { s: 'placard-terrasse' }); m[0] = mat(CABINET_SIDE);
    box(g, 737, 859, 0, 220, S.zN, S.zN + 60, m); }
  box(g, 737, 863, 220, 221, S.zN, S.zN + 64, M.anthracite);
  // Outside the bay window, the edge of the floor slab: brown like the rail; under the double
  // window, a brown sill board 1 cm thick, 1 cm over the wall
  box(g, 320, 602, 0, 0.6, 535.5, 549.5, M.brown);
  box(g, 100, 275, 87, 88, 535.5, 550.5, M.brown);
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
  slab(g, [[-EXT, -EXT], [W + EXT, -EXT], [W + EXT, D + EXT], [-EXT, D + EXT]], 0, 10, [NIGHT_FLOOR, M.oak]);   // wood floor (tiles on top in the WC and bathroom)
  slab(g, [[655, 0], [W, 0], [W, 187], [655, 187]], 0.5, 0.5, [TILES, M.tiles]);              // bathroom floor
  slab(g, [[552.5, 0], [668, 0], [668, 84.5], [552.5, 84.5]], 0.5, 0.5, [TILES, M.tiles]);    // WC floor

  // Outer walls: render outside, cream inside
  wall(g, 'x', -EXT / 2, -EXT, W + EXT, EXT, NIGHT_H, M.cut, [], [M.render, C]);
  wall(g, 'z', -EXT / 2, 0, D, EXT, NIGHT_H, M.cut, [], [M.render, C]);
  wall(g, 'z', W + EXT / 2, 0, D, EXT, NIGHT_H, M.cut, [], [C, M.render]);
  const win1 = { s: 26, e: 114, sill: 95, head: 215, shutter: 26 }, win2 = { s: 741, e: 820, sill: 95, head: 215, shutter: 26 };
  // (the east bedroom window has 6 small panes: 2 columns, 3 rows)
  wall(g, 'x', D + EXT / 2, -EXT, W + EXT, EXT, NIGHT_H, M.cut, [{ ...win1, glass: true, out: 1 }, { ...win2, glass: true, bars: [2, 3], out: 1 }], [C, M.render]);

  const door = (s, e, hinge, side) => ({ s, e, head: 204, leaf: M.pine, tex: 'porte', swing: [hinge, side] });   // open doors
  // Load-bearing line crossing the level from west to east: the beam of bedroom 1 and every wall in line with it
  const BN = 187, BS = 212, BC = (BN + BS) / 2, BT = BS - BN;
  // Bedroom 1 and the foot of the stairs
  wall(g, 'x', 87.5, S.x, 342 + H, PART, NIGHT_H, C, [door(235, 323, 'e', 1)], [TG, C]);
  wall(g, 'z', 342, 91, BN, PART, NIGHT_H, TG, [], [C, TG]);
  box(g, 345.5, 345.7, 0, NIGHT_H, 84, 91, TG);                                 // end of the wall above, seen from the corridor: its colour
  wall(g, 'x', BC, 259 - H, 321 - H, BT, NIGHT_H, C);                          // north side of the wardrobe
  wall(g, 'x', BC, 321 - H, 342 + H, BT, NIGHT_H, C, [], [C, LB]);             // end of wall north of the cabin:
  wall(g, 'x', BC, 342 + H, 401, BT, NIGHT_H, LB, [], [TG, LB]);               // light blue on the cabin side
  wall(g, 'z', 259, 212, 325 - H, PART, NIGHT_H, C, [{ s: 214, e: 320, head: 215 }]);
  box(g, 258, 261, 0, 215, 214, 320, faced(M.pine, { w: 'placard-coulissant', e: ['placard-coulissant', true] }));   // two sliding doors (mirrored inside)
  wall(g, 'x', 325, 259 - H, 321 - H, PART, NIGHT_H, C);                       // desk recess south of the wardrobe
  wall(g, 'z', 321, 212, D, PART, NIGHT_H, C, [], [C, LB]);                    // bedroom 1 / bunk cabin
  paint(g, 'z', 0.5, 186, D, NIGHT_H, M.sage);
  // Stairwell walls below the living floor: dark blue, up to the pine band at floor level
  paint(g, 'x', 0.5, 0, S.x, NIGHT_H + SLAB, M.petrol);
  paint(g, 'x', 0.5, S.x, 439 - H, NIGHT_H, PG);                               // corridor: north wall up to the cupboard facing the stairs, corridor green
  paint(g, 'z', 0.5, 0, 87.5 - H, NIGHT_H + SLAB, M.petrol);
  box(g, 0, 1, 141, NIGHT_H + SLAB, 87.5 - H, 186, M.petrol);

  // Bunk cabin, and the block between the cabin and bedroom 2: north half = bedroom 2 wardrobe
  // (two doors), south half = recess open onto the cabin (closed by a curtain)
  wall(g, 'z', 480, BS, 316 - H, PART, NIGHT_H, LB, [], [LB, C]);
  wall(g, 'x', 316, 480 - H, 544 - H, PART, NIGHT_H, LB, [], [C, LB]);
  wall(g, 'z', 544, BS, D, PART, NIGHT_H, TP, [{ s: 216, e: 312, head: 210 }], [LB, TP]);
  // its two doors, seen from bedroom 2, hinged on the outer edges, opening into the bedroom; closed at load
  for (const [z, dir, key] of [[216, 1, 'placard-droite'], [312, -1, 'placard-gauche']]) {
    const pivot = new THREE.Group(); pivot.position.set(546 * CM, 0, z * CM);
    box(pivot, -3, 0, 0, 210, Math.min(0, dir * 48), Math.max(0, dir * 48), faced(M.pine, { e: key, w: [key, true] })); g.add(pivot);
    addDoor(pivot, dir * Math.PI / 2, null, 0);
  }
  paint(g, 'x', D - 0.5, 321 + H, 544 - H, NIGHT_H, M.royal);                  // cabin end wall

  // Bedroom 2
  wall(g, 'x', BC, 480 - H, 651.5, BT, NIGHT_H, TP, [door(563, 643, 's', 1)], [TG, TP]);
  // Edges of the passage into the cabin (x 401..476.5, under the beam): corridor green to the west,
  // the cabin's light blue to the east
  box(g, 401, 401.2, 0, NIGHT_H - 25, BN, BS, TG);
  box(g, 476.3, 476.5, 0, NIGHT_H - 25, BN, BS, LB);
  wall(g, 'x', BC, 651.5, W, BT, NIGHT_H, TP, [], [AN, TP]);
  paint(g, 'z', W - 0.5, BS, D, NIGHT_H, TP);
  paint(g, 'x', D - 0.5, 544 + H, W, NIGHT_H, TP, [win2]);

  // Along the north wall: cupboard facing the stairs, WC, bathroom duct, bathroom
  wall(g, 'x', 88, 439 - H, 549, PART, NIGHT_H, PG, [], [C, PG]);
  // WC door: hinged on the east (right when facing it), it opens onto the corridor and, open, hides
  // the bathroom door; the visit closes it after looking into the WC (see TOUR)
  wall(g, 'x', 88, 549, 651.5, PART, NIGHT_H, PG, [{ ...door(565, 635, 'e', 1), name: 'wcDown' }], [GR, PG]);
  wall(g, 'x', 88, 651.5, 671.5 + H, PART, NIGHT_H, AN, [], [GR, AN]);        // WC on one side, bathroom on the other
  wall(g, 'x', 88, 671.5 + H, 705 + H, PART, NIGHT_H, AN, [], [C, AN]);
  wall(g, 'z', 469, 0, 88 - H, PART, NIGHT_H, C);                                  // boxed-in duct, set back 30 cm
  wall(g, 'z', 439, 0, 88 - H, PART, NIGHT_H, PG, [{ s: 0, e: 84.5, head: 235 }], [PG, C]);
  for (const [z1, z2] of [[0, 41.5], [43, 84.5]]) {                            // doors flush with the end of the south partition
    box(g, 437.5, 440.5, 0, 148, z1, z2, M.pine);
    box(g, 437.5, 440.5, 150, 235, z1, z2, M.pine);
  }
  wall(g, 'z', 549, 0, 88 - H, PART, NIGHT_H, GR, [], [C, GR]);
  wall(g, 'z', 671.5, 0, 88 - H, PART, NIGHT_H, GR, [], [GR, C]);                // WC / boxed-in void before the bathroom
  wall(g, 'z', 651.5, 88 + H, BN, PART, NIGHT_H, AN, [door(100, 175, 'e', 1)], [TG, AN]);
  wall(g, 'z', 705, 0, 88 - H, PART, NIGHT_H, AN, [], [C, AN]);
  paint(g, 'x', 0.5, 549 + H, 671.5 - H, NIGHT_H, GR);
  // north wall: anthracite behind the mirror like the duct beside it, tiled from x = 777.7 (two
  // columns of tiles from the east corner)
  const TILED_FROM = W - 1 - 2 * 187 / 4.6;
  paint(g, 'x', 0.5, 705 + H, TILED_FROM, NIGHT_H, AN);
  paint(g, 'x', 0.5, TILED_FROM, W, NIGHT_H, M.bathTile);
  paint(g, 'z', W - 0.5, 0, BN, NIGHT_H, M.bathTile);
  // Their tiles (BATH_TILES): joints from the north-east corner and the top of the bath
  tiledWall(g, BATH_TILES, 'w', W - 1, 0, BN, 0, NIGHT_H, 0, 56);
  tiledWall(g, BATH_TILES, 's', 1, TILED_FROM, W - 1, 0, NIGHT_H, W - 1, 56);
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
// Horizontal slab with rounded corners (radius r): a table top from x1..x2, z1..z2, y1..y2.
function roundedSlab(g, x1, x2, z1, z2, y1, y2, r, m) {
  const hw = (x2 - x1) / 2 * CM, hd = (z2 - z1) / 2 * CM, rr = r * CM, s = new THREE.Shape();
  s.moveTo(-hw + rr, -hd);
  s.lineTo(hw - rr, -hd); s.absarc(hw - rr, -hd + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(hw, hd - rr); s.absarc(hw - rr, hd - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(-hw + rr, hd); s.absarc(-hw + rr, hd - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hd + rr); s.absarc(-hw + rr, -hd + rr, rr, Math.PI, Math.PI * 1.5, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth: (y2 - y1) * CM, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(Math.PI / 2);                                                   // shape y -> z, extruded downwards
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set((x1 + x2) / 2 * CM, y2 * CM, (z1 + z2) / 2 * CM);
  g.add(mesh);
  return mesh;
}
// Round swivel armchair.
// (m: a material on metre texture coordinates, e.g. FABRIC)
// (black base, seat cushion and a back 10 cm thick round the rear, every edge rounded)
function tubChair(g, x, z, deg, m) {
  const c = placed(g, x, z, deg);
  roundedCyl(c, 0, 0, 30, 8, 2, M.black);
  roundedCyl(c, 0, 0, 40, 34, 3, m, 8);
  // Back: an arc in plan (radii 36..46 cm, round the rear over about 210 degrees, rounded ends),
  // extruded from 42 to 76 cm with a bevel that rounds every edge (2 cm). Shape (u, v) -> plan (u, -v).
  const R1 = 38, R2 = 44, Rm = (R1 + R2) / 2, rc = (R2 - R1) / 2, f0 = -0.08 * Math.PI, f1 = 1.08 * Math.PI;
  const s = new THREE.Shape();
  s.absarc(0, 0, R2 * CM, f0, f1, false);
  s.absarc(Rm * CM * Math.cos(f1), Rm * CM * Math.sin(f1), rc * CM, f1, f1 + Math.PI, false);
  s.absarc(0, 0, R1 * CM, f1, f0, true);
  s.absarc(Rm * CM * Math.cos(f0), Rm * CM * Math.sin(f0), rc * CM, f0 + Math.PI, f0 + 2 * Math.PI, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 30 * CM, bevelEnabled: true, bevelSize: 2 * CM, bevelThickness: 2 * CM, bevelSegments: 3, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  const back = new THREE.Mesh(geo, m);   // texture coordinates of the shape: metres
  back.position.y = 44 * CM;
  c.add(back);
}
// Cylinder of radius r and height h standing at (x, y, z), its edges rounded (radius rr), on a lathe
// profile, with texture coordinates in metres (materials such as FABRIC)
function roundedCyl(g, x, z, r, h, rr, m, y = 0) {
  const pts = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 12; pts.push(new THREE.Vector2((r - rr + rr * Math.cos(a)) * CM, (rr + rr * Math.sin(a)) * CM)); }
  for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 12; pts.push(new THREE.Vector2((r - rr + rr * Math.cos(a)) * CM, (h - rr + rr * Math.sin(a)) * CM)); }
  pts.push(new THREE.Vector2(0, h * CM));
  const geo = new THREE.LatheGeometry(pts, 40), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r * CM, uv.getY(i) * (2 * r + h) * CM);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x * CM, y * CM, z * CM);
  g.add(mesh);
  return mesh;
}
// Pouf: 48 cm wide, 38 cm high, in FABRIC, its edges rounded
const pouf = (g, x, z) => roundedCyl(g, x, z, 24, 38, 3, FABRIC);
// Rounded rectangle in plan (cm), as a THREE.Shape or THREE.Path (P), for plate()
function rrect(P, x1, x2, z1, z2, r) {
  const p = new P(), c = (v) => v * CM;
  p.moveTo(c(x1 + r), c(z1)); p.lineTo(c(x2 - r), c(z1)); p.absarc(c(x2 - r), c(z1 + r), c(r), -Math.PI / 2, 0, false);
  p.lineTo(c(x2), c(z2 - r)); p.absarc(c(x2 - r), c(z2 - r), c(r), 0, Math.PI / 2, false);
  p.lineTo(c(x1 + r), c(z2)); p.absarc(c(x1 + r), c(z2 - r), c(r), Math.PI / 2, Math.PI, false);
  p.lineTo(c(x1), c(z1 + r)); p.absarc(c(x1 + r), c(z1 + r), c(r), Math.PI, Math.PI * 1.5, false);
  return p;
}
// Horizontal plate cut from a plan shape (holes allowed), top at `top`, `thick` cm, its edges
// rounded by `bevel` cm (the bevel widens the outline and narrows the holes by that much);
// mats = [faces, edges]; uv(x, z) (cm) gives the texture coordinates of the faces.
function plate(g, shape, top, thick, mats, { bevel = 0, uv = null } = {}) {
  const opts = { depth: (thick - 2 * bevel) * CM, bevelEnabled: bevel > 0, bevelThickness: bevel * CM, bevelSize: bevel * CM, bevelSegments: 3, curveSegments: 12 };
  if (uv) opts.UVGenerator = {
    generateTopUV: (geo, v, a, b, c) => [a, b, c].map((i) => new THREE.Vector2(...uv(v[3 * i] / CM, v[3 * i + 1] / CM))),
    generateSideWallUV: () => [0, 1, 2, 3].map(() => new THREE.Vector2()),
  };
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, opts), mats);
  mesh.rotation.x = Math.PI / 2;                   // shape (x, z) in plan, extruded downwards
  mesh.position.y = (top - bevel) * CM;
  g.add(mesh);
  return mesh;
}

// Open unit facing west (front at x = fx, back against x = bx): 2 cm boards (bottom, top, sides),
// two shelves (three levels) and a back. Only the front edges of the boards are textured: `front`
// with texture coordinates uv(z, y) (cm), the photo of a run of units, or else pine; the inside and
// the back are plain pine colour.
// `base`: height of the solid bottom (its front a full board), the lowest level starting above it.
function openUnit(g, fx, bx, y1, y2, z1, z2, front = null, uv = null, base = T0) {
  const T = 2, f = y1 + base, h = (y2 - T - f) / 3, parts = [
    [y1, f, z1, z2], [y2 - T, y2, z1, z2], [f, y2 - T, z1, z1 + T], [f, y2 - T, z2 - T, z2],
    ...[1, 2].map((k) => [f + k * h - T / 2, f + k * h + T / 2, z1 + T, z2 - T]),
  ];
  for (const [a, b, c, d] of parts) {
    const m = Array(6).fill(M.pine);
    m[1] = front || PINE;
    const mesh = box(g, fx, bx, a, b, c, d, m);
    if (!front) continue;
    const pos = mesh.geometry.attributes.position, t = mesh.geometry.attributes.uv;
    for (let i = 4; i < 8; i++)                                                  // west face (BoxGeometry face 1)
      t.setXY(i, ...uv(mesh.position.z / CM + pos.getZ(i) / CM, mesh.position.y / CM + pos.getY(i) / CM));
    t.needsUpdate = true;
  }
  box(g, bx - 1, bx, f, y2 - T, z1 + T, z2 - T, M.pine);                        // back
}
const T0 = 2;   // default solid bottom of openUnit(): one board

// Double bed with its pine headboard and side panels; head = 'w' or 'e'.
function bed(g, x1, x2, z1, z2, head, side) {
  box(g, x1, x2, 0, 28, z1, z2, M.pine);
  box(g, x1, x2, 28, 50, z1, z2, M.fabric);
  const hx = head === 'w' ? [x1, x1 + 5] : [x2 - 5, x2];
  box(g, hx[0], hx[1], 0, 105, z1, z2, PINE);
  box(g, hx[0], hx[1], 0, 78, z1 - side, z1, PINE);
  box(g, hx[0], hx[1], 0, 78, z2, z2 + side, PINE);
  const tx = head === 'w' ? [x1 + 5, x1 + 40] : [x2 - 40, x2 - 5];
  for (const [a, b] of [[z1 - side, z1 - 2], [z2 + 2, z2 + side]]) {
    box(g, tx[0], tx[1], 40, 45, a, b, PINE);
    box(g, tx[0], tx[1], 0, 40, a, a + 3, PINE);
    box(g, tx[0], tx[1], 0, 40, b - 3, b, PINE);
  }
}
// Furniture model (MODELS: assets/3d/models/, see scripts/models.py), fitted in a box of
// size = [width, depth, height] cm whose bottom centre is at (x, y, z), facing deg (0 = south,
// 90 = east, as placed()). The models face +z (south) as drawn. materials = { name of a material
// of the OBJ file: material of the visit }; a material not listed is grey (reported).
const OBJS = new Map();
// The OBJ files have no texture coordinates: each face gets a planar projection along its main
// axis (1 unit of the pack, about 40 cm, = 1 repeat), enough for a grain bump map (grain()).
function boxUV(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, uv = new Float32Array(pos.count * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i + 2 < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      n.subVectors(c, b).cross(a.clone().sub(b));
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const [u, v] = ax >= ay && ax >= az ? ['z', 'y'] : ay >= az ? ['x', 'z'] : ['x', 'y'];
      for (let k = 0; k < 3; k++) { uv[(i + k) * 2] = pos.getComponent(i + k, 'xyz'.indexOf(u)); uv[(i + k) * 2 + 1] = pos.getComponent(i + k, 'xyz'.indexOf(v)); }
    }
    o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
  return obj;
}
function model(g, key, x, z, deg, size, materials, y = 0) {
  if (!MODELS[key]) { console.error(`3D model: no model "${key}" (assets/3d/models/${key}.obj, then scripts/models.py)`); return null; }
  if (!OBJS.has(key)) OBJS.set(key, boxUV(new OBJLoader().parse(MODELS[key])));
  const obj = OBJS.get(key).clone();
  const pick = (m) => materials[m.name] || (console.error(`3D model: "${key}" has no material for "${m.name}"`), M.grey);
  obj.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material); });
  const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -box.min.y, -c.z);
  const fit = new THREE.Group();
  fit.scale.set(size[0] * CM / s.x, size[2] * CM / s.y, size[1] * CM / s.z);
  fit.add(obj);
  const p = placed(g, x, z, deg);
  p.position.y = y * CM;
  p.add(fit);
  return p;
}
// Grain of fabrics and plastics: seeded noise of 64 x 64 dots, smoothed on a 256 px canvas (blobs
// of about 2 mm when it repeats every 30-40 cm), as a bump map; repeat = [u, v] repeats over the
// texture coordinates of the mesh (models: see boxUV())
const GRAIN = (() => {
  const small = document.createElement('canvas'), N = 64;
  small.width = small.height = N;
  const sctx = small.getContext('2d'), img = sctx.createImageData(N, N);
  let seed = 11;
  for (let i = 0; i < N * N; i++) {
    const v = 64 + ((seed = (seed * 16807) % 2147483647) % 128);
    img.data.set([v, v, v, 255], i * 4);
  }
  sctx.putImageData(img, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 4 * N;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, 4 * N, 4 * N);
  return canvas;
})();
function grain(repeat = [1, 1]) {
  const tex = new THREE.CanvasTexture(GRAIN);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  return tex;
}
const fabric = (color, repeat) => mat(color, { roughness: 1, bumpMap: grain(repeat), bumpScale: 2 });

// Materials of the models
const ceramic = mat(0xf6f6f3, { roughness: 0.12, envMapIntensity: 0.7 });
const chrome = mat(0xd9dcdf, { metalness: 1, roughness: 0.18, envMapIntensity: 1 });
const toiletParts = { White: ceramic };
// Varnished pine (dining table and chairs), and a material that hides a part of a model
const satinPine = wood('pine', [60, 60], 'v', { roughness: 0.35, envMapIntensity: 0.6 });
const hidden = new THREE.MeshBasicMaterial({ visible: false });
// Pine chair (Chair_1), 42 x 46 x 100 cm, centred on (x, z), facing deg
const pineChair = (g, x, z, deg) => model(g, 'Chair_1', x, z, deg, [42, 46, 100], { Wood: satinPine });
// Horizontal rod (curtain rod), radius 1.2 cm, along axis 'x' or 'z' from a to b, at c on the other
// axis, y high. ends = [start wall, end wall]: coordinate (on the other axis) of the wall a rounded
// return at that end bends back to, to hold the rod; null = a plain end (into a wall, or free).
function rod(g, axis, c, a, b, y, m, ends = [null, null]) {
  const v = (u, w) => (axis === 'x' ? new THREE.Vector3(u * CM, y * CM, w * CM) : new THREE.Vector3(w * CM, y * CM, u * CM));
  const path = new THREE.CurvePath(), [w1, w2] = ends, d1 = w1 === null ? 0 : Math.abs(c - w1), d2 = w2 === null ? 0 : Math.abs(c - w2);
  if (w1 !== null) path.add(new THREE.QuadraticBezierCurve3(v(a, w1), v(a, c), v(a + d1, c)));
  path.add(new THREE.LineCurve3(v(a + d1, c), v(b - d2, c)));
  if (w2 !== null) path.add(new THREE.QuadraticBezierCurve3(v(b - d2, c), v(b, c), v(b, w2)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 48, 1.2 * CM, 10, false), m));
}
// Curtain (Curtains_Single, drawn back) hanging from x1..x2 (or z1..z2, axis 'z'), at c on the
// other axis, from y1 to y2, facing deg, in material m (the model's own rod is hidden: see rod())
const curtain = (g, axis, c, a1, a2, y1, y2, deg, m) =>
  model(g, 'Curtains_Single', axis === 'x' ? (a1 + a2) / 2 : c, axis === 'x' ? c : (a1 + a2) / 2, deg, [a2 - a1, 6, y2 - y1], { Couch_Blue: m, LightMetal: hidden }, y1);
// Lights: ceiling light (Light_Ceiling5, white opaque glass in a stainless steel ring), 35 cm wide
// and 9 cm high, under a ceiling at height top; floor lamp (Light_Stand1)
const rodGrey = mat(0x3a3a3c, { roughness: 0.4, metalness: 0.4 });   // window curtain rods: anthracite satin
const steel = mat(0xc8cbce, { metalness: 1, roughness: 0.35, envMapIntensity: 1 });
const litGlass = mat(0xf7f7f4, { roughness: 0.25, emissive: 0xffb87b, emissiveIntensity: 0.9 });   // lit (see lamp())
function ceilingLight(g, x, z, top) {
  model(g, 'Light_Ceiling5', x, z, 0, [35, 36, 9], { Grey: steel, Light: litGlass }, top - 9);
  lamp(g, x, top - 14, z, 2);
}
const paperParts = { LightMetal: chrome, White: mat(0xf3f2ee, { roughness: 0.95 }), Brown: mat(0x9a7a55) };
// Toilet, 40 x 68 x 80 cm; (x, z) = middle of its back, deg = direction it faces. Its paper holder
// goes on the wall to its right (seen sitting), level with the front of the bowl, 60..79 cm high.
function toilet(g, x, z, deg) {
  const r = deg * Math.PI / 180;
  model(g, 'Bathroom_Toilet', x + Math.sin(r) * 34, z + Math.cos(r) * 34, deg, [40, 68, 80], toiletParts);
}

// Picture hung on a wall. facing = direction it faces ('n', 's', 'e', 'w'), c = coordinate of the
// wall face, a..b = extent along the wall, y1..y2 = height of the whole image.
// Without opts: a flat image on the wall. opts:
// - depth: thickness in cm. The picture is then a solid with the image on its front: a PNG with a
//   transparent background is cut along the outline of its opaque parts (OUTLINES, computed by
//   scripts/textures.py), any other image is a rectangular block (a frame, a canvas...);
// - gap: distance from the wall in cm (default 0.1); from 0.3 cm, the picture floats and casts a
//   soft shadow on the wall below it (metal cut-outs);
// - edge: material of its edges (default: average colour of the opaque parts of a PNG, else white);
// - metal: true for a metal sheet (a little shine).
const metalShadows = new Map();
// Picture kinds of the flat
const METAL = { depth: 0.1, gap: 0.5, metal: true };   // metal cut-out, 1 mm thick, 5 mm from the wall
function picture(g, key, facing, c, a, b, y1, y2, opts = null) {
  const w = (b - a) * CM, h = (y2 - y1) * CM, mid = (a + b) / 2, y = (y1 + y2) / 2;
  const cutOut = (TEX[key] || '').startsWith('data:image/png');   // PNG: transparent background
  if (!opts) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: texture(key), roughness: 0.7, envMapIntensity: 0.38, alphaTest: cutOut ? 0.5 : 0 }));
    place(mesh, facing, c, mid, y, 0.8);
    g.add(mesh);
    return mesh;
  }
  const { depth = 1, gap = 0.1, metal = false } = opts, outline = cutOut && OUTLINES[key];
  // Shapes in metres, centred on the image; the image is mapped on both faces (the back one is hidden)
  const pt = (u, v) => new THREE.Vector2((u - 0.5) * w, (v - 0.5) * h);
  const path = (flat, P) => new P(Array.from({ length: flat.length / 2 }, (_, k) => pt(flat[2 * k], flat[2 * k + 1])));
  const shapes = outline
    ? outline.shapes.map(([outer, ...holes]) => { const s = path(outer, THREE.Shape); s.holes = holes.map((l) => path(l, THREE.Path)); return s; })
    : [path([0, 0, 1, 0, 1, 1, 0, 1], THREE.Shape)];
  const UVGenerator = {
    generateTopUV: (geo, v, ...idx) => idx.map((i) => new THREE.Vector2(v[3 * i] / w + 0.5, v[3 * i + 1] / h + 0.5)),
    generateSideWallUV: () => [0, 1, 2, 3].map(() => new THREE.Vector2()),
  };
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: depth * CM, bevelEnabled: false, UVGenerator });
  const face = mat(0xffffff, { map: texture(key), roughness: metal ? 0.45 : 0.7, metalness: metal ? 0.3 : 0, alphaTest: cutOut ? 0.5 : 0 });
  const edge = opts.edge || mat(outline ? outline.color : 0xffffff, { roughness: metal ? 0.45 : 0.8, metalness: metal ? 0.3 : 0 });
  const mesh = new THREE.Mesh(geo, [face, edge]);
  place(mesh, facing, c, mid, y, gap);
  g.add(mesh);
  if (gap >= 0.3) {
    // Soft shadow on the wall, a little lower than the picture (light from the ceiling): the image
    // blurred and painted black, on a plane 1 mm from the wall
    if (!metalShadows.has(key)) {
      const img = new Image(), canvas = document.createElement('canvas'), tex = new THREE.CanvasTexture(canvas);
      img.onload = () => {
        const k = 256 / Math.max(img.width, img.height), pad = 16;
        canvas.width = Math.round(img.width * k) + 2 * pad; canvas.height = Math.round(img.height * k) + 2 * pad;
        const ctx = canvas.getContext('2d');
        ctx.filter = 'blur(5px)';
        ctx.drawImage(img, pad, pad, canvas.width - 2 * pad, canvas.height - 2 * pad);
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        tex.needsUpdate = true;
        loaded++;
      };
      img.src = TEX[key];
      metalShadows.set(key, tex);
    }
    // the canvas has a 16 px margin around the image (256 px on its longest side): 1/16 of that side
    const m = Math.max(w, h) / 8;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w + m, h + m),
      new THREE.MeshBasicMaterial({ map: metalShadows.get(key), transparent: true, opacity: 0.45, depthWrite: false }));
    place(shadow, facing, c, mid, y - 1.5, 0.1);
    g.add(shadow);
  }
  return mesh;
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
// Every lamp is lit, 3200 K: a point light of `cd` candelas (scaled to the scene's lighting) at the
// lamp, no shadows; its bulb (M.bulb) glows in the same colour.
const LAMP = 0xffb87b;
function lamp(g, x, y, z, cd) {
  const l = new THREE.PointLight(LAMP, cd, 0, 2);
  l.position.set(x * CM, y * CM, z * CM);
  g.add(l);
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
  lamp(g, x, y - 22, z, 0.6 * n);
}
function ceilingLamp(g, x, z, y) {
  cyl(g, x, z, 22, y - 2, y, M.black);
  cyl(g, x, z, 3, y - 10, y - 2, M.black);
  const b = new THREE.Mesh(new THREE.SphereGeometry(5 * CM, 16, 12), M.bulb);
  b.position.set(x * CM, (y - 14) * CM, z * CM);
  g.add(b);
  lamp(g, x, y - 20, z, 2.5);
}

// ---------- Living level furniture ----------
{
  const g = living, S = STAIR;

  // Sofa bed against the cladding (mouse grey fabric), shelves on both sides
  model(g, 'Couch_Large2', 144.5, 53, 0, [195, 90, 86],
    { Couch_Beige: FABRIC_MODEL, Couch_BeigeDark: FABRIC_MODEL });
  for (const y of [60, 95, 130, 165, 200]) {
    box(g, 0, 15, y, y + 3, 1.5, 112, OAK);
    box(g, 255, 270, y, y + 3, 1.5, 118, OAK);
  }
  // Curtains: bay window, double window, west window
  // (south: one rod over the double window and the bay window; west: one rod over the window;
  // rounded returns to the wall at both ends)
  for (const [a, b, y] of [[298, 316, 0], [606, 624, 0], [80, 96, 70], [279, 295, 70]]) curtain(g, 'x', 505.5, a, b, y, 228, 180, M.drape);
  rod(g, 'x', 505.5, 76, 628, 222, rodGrey, [513.5, 513.5]);
  curtain(g, 'z', 8, 410, 424, 95, 218, 90, M.drape);
  rod(g, 'z', 8, 328, 428, 214, rodGrey, [0, 0]);
  // Floor lamp against the north wall, between the west shelves and the sofa: beige fabric shade, steel
  // (its shade: Fabric066, a little translucent: the lit bulb shows through)
  const shade = Object.assign(wood('fabric066', [62.5, 62.5], 'u', { roughness: 1, transparent: true, opacity: 0.88,
    emissive: LAMP, emissiveIntensity: 0.25 }), { side: THREE.DoubleSide });
  model(g, 'Light_Stand1', 32, 19.5, 0, [36, 36, 150], { White: shade, LightMetal: steel });
  lamp(g, 32, 128, 22, 1.5);
  box(g, 210, 275, 12, 80, 506, 512, M.white);                                // radiator under the double window
  // Barrel coffee table, two swivel armchairs, two poufs
  metreUV(cyl(g, 137, 165, 29, 0, 44, BARREL), 29, 44);
  metreUV(cyl(g, 137, 165, 31, 44, 46.5, TABLE_TOP), 31, 2.5);
  tubChair(g, 135, 262, 180, FABRIC);
  tubChair(g, 255, 215, 215, FABRIC);
  pouf(g, 45, 160); pouf(g, 78, 128);
  // Corner TV unit between the west wall and the stairwell rail, TV set on the diagonal facing the WC block
  slab(g, [[0, S.zN - 4], [0, S.zN - 104], [100, S.zN - 4]], 45, 45, OAK);
  const tv = placed(g, 40, S.zN - 44, 135);
  const glossy = mat(0x111214, { roughness: 0.1, envMapIntensity: 0.8 }), satin = mat(0x0c0d0f, { roughness: 0.35 });
  box(tv, -14, 14, 45, 50, -8, 8, glossy);
  box(tv, -50, 50, 50, 112, -2, 2, [glossy, glossy, glossy, glossy, satin, glossy]);   // glossy black, satin screen
  // Sideboard (nearly as wide as the wall) and mirror on the south face of the WC block
  // (sideboard: 120 wide, 70 high, 35 deep, centred on the wall (x 255..380) under the mirror; its body 6..70 cm between four
  // glossy black posts at its corners, flush with its front and back, 6 cm longer below: its feet)
  box(g, 261.5, 373.5, 6, 70, 125, 160, faced(M.pine, { s: 'buffet', e: 'buffet-side', w: 'buffet-side', t: 'buffet-top' }));
  { const glossyBlack = mat(0x111214, { roughness: 0.12, envMapIntensity: 0.8 });
    for (const x of [257.5, 373.5]) {
      for (const z of [125, 156]) box(g, x, x + 4, 0, 70, z, z + 4, glossyBlack);
      box(g, x, x + 4, 66, 70, 129, 156, glossyBlack);                        // top rail joining the pair
    } }
  box(g, 284.5, 350.5, 112, 188, 125, 129, PINE);                             // centred on the wall (x 255..380), like the clock
  mirror(g, 's', 129, 292.5, 342.5, 120, 180);
  // Wall decoration: bear clock above the mirror (cut to its shape, 1 cm from the wall), metal mountain on the cladding, three ski panels
  // cut to their shape, metal cyclist on the west face of the closet block between the entrance and
  // the kitchen (80 % of its width, centred 180 cm above the floor)
  picture(g, 'clock', 's', 125, 280.5, 354.5, 210.7, 233.3, { depth: 1, gap: 1 });
  picture(g, 'silhouette', 's', 1.5, 95, 185, 150, 205, METAL);
  picture(g, 'skiA', 'e', 0, 204, 232, 150, 224, { depth: 1 });
  picture(g, 'skiB', 'e', 0, 170, 197, 138, 212, { depth: 1 });
  picture(g, 'skiC', 'e', 0, 138, 163, 126, 200, { depth: 1 });
  picture(g, 'silhouette-velo', 'w', 503, 124.45, 176.05, 163.4, 196.6, METAL);
  // WC: picture (2 cm block) on the west wall
  picture(g, 'lift', 'e', 277, 42, 84, 118, 172, { depth: 2 });
  // Coat hooks on the north wall of the entrance
  for (const [x, y, m] of [[440, 185, M.grey], [468, 150, M.white], [492, 178, M.black], [520, 140, M.grey], [548, 172, M.white], [575, 188, M.black], [600, 150, M.grey], [625, 176, M.white]])
    box(g, x, x + 5, y, y + 11, 1, 5, m);
  // Light fittings (the living level has no ceiling in the model: they hang at ceiling height)
  // Pendants (Light_Icosahedron2, 90 cm long) over the dining table and the sitting area
  for (const [x, z] of [[435, 354], [150, 215]]) {
    model(g, 'Light_Icosahedron2', x, z, 0, [90, 28, 49], { Grey: M.anthracite, LightMetal: steel,   // black shades, anthracite canopy
      White: mat(0x151516, { roughness: 0.5 }), Light: M.bulb }, LIVING_H - 49);
    lamp(g, x, LIVING_H - 40, z, 2.4);
  }
  track(g, 530, 60, 30, 'x', 217, 2);

  // Dining table (198 x 78), varnished pine: two solid end legs joined by a low stretcher, eight chairs
  box(g, 336, 534, 71, 76, 315, 393, satinPine);
  for (const x of [358, 506]) {
    box(g, x, x + 6, 6, 71, 334, 374, satinPine);
    box(g, x - 2, x + 8, 0, 6, 322, 386, satinPine);
  }
  box(g, 364, 506, 22, 30, 351, 357, satinPine);
  for (const x of [372, 435, 498]) { pineChair(g, x, 298, 0); pineChair(g, x, 410, 180); }
  pineChair(g, 318, 354, 90); pineChair(g, 552, 354, -90);

  // Kitchen along the east wall, from north to south: open shelf, oven and hob, two cupboards (the
  // sink above), washing machine, tall unit (fridge); wall units above. Fronts face west: photos.
  openUnit(g, 640, 700, 0, 86, 182.5, 213.5, null, null, 15);                 // open unit, two shelves, solid bottom 15 cm
  // Oven unit: the oven, up against the worktop, and under it a drawer front (kitchen-front-oven.jpg),
  // both flush with the cupboard fronts (x = 640), the unit's box set back behind them
  box(g, 641.5, 700, 0, 86, 213.5, 271.5, M.pine);
  box(g, 640, 641.5, 24, 86, 213.5, 271.5, faced(M.black, { w: 'oven' }));
  box(g, 640, 641.5, 0, 24, 213.5, 271.5, faced(M.pine, { w: 'kitchen-front-oven' }));
  for (const z of [271.5, 332.5]) {                                            // (tops and sides hidden: the sink bowl goes down into them)
    const m = faced(M.pine, { w: 'kitchen-front' }); m[2] = m[4] = m[5] = hidden;
    box(g, 640, 700, 0, 86, z, z + 61, m);
  }
  box(g, 640, 700, 0, 85, 393.5, 453.5, faced(M.white, { w: 'washing-machine' }));
  box(g, 640, 700, 0, 215, 453.5, 513.5, faced(M.pine, { w: 'fridge' }));
  // Worktop: glossy, its edges very slightly rounded, cut out under the sink bowl
  const SINK = { x1: 646, x2: 696, z1: 328, z2: 425 };                           // sink, 50 x 97 cm (kitchen-sink.jpg)
  const BOWL = { x1: 648.3, x2: 694, z1: 330.1, z2: 377.3 };                     // its bowl, measured on the photo (+1 cm: its sloped edge)
  const worktop = mat(0x34383d, { roughness: 0.35, envMapIntensity: 0.6 });     // darker than the tiles (it catches the light), satin
  { const top = rrect(THREE.Shape, 636.5, 699.5, 183, 453, 0.1);
    top.holes.push(rrect(THREE.Path, BOWL.x1 - 0.5, BOWL.x2 + 0.5, BOWL.z1 - 0.5, BOWL.z2 + 0.5, 3));
    plate(g, top, 90, 4, [worktop, worktop], { bevel: 0.5 }); }
  // Induction hob (kitchen-induction.jpg), glossy: its controls at the front (west)
  plate(g, rrect(THREE.Shape, 646, 696, 215, 271, 1), 90.6, 0.6,
    [mat(0xffffff, { map: texture('kitchen-induction'), roughness: 0.08, envMapIntensity: 0.8 }), M.black],
    { uv: (x, z) => [(z - 215) / 56, (x - 646) / 50] });
  // Sink (kitchen-sink.jpg): a plate on the worktop with the photo, the bowl 18 cm deep under it;
  // photo coordinates of the sink: u 0.003..0.998 along z, v 0.261..0.739 from the front (west)
  { const sinkMat = mat(0xffffff, { map: texture('kitchen-sink'), roughness: 0.9, envMapIntensity: 0.3 });   // matt
    const sinkGrey = mat(0x302f2d, { roughness: 0.9, envMapIntensity: 0.3 });                          // average colour of the sink in the photo
    const uv = (x, z) => [0.003 + (z - SINK.z1) / (SINK.z2 - SINK.z1) * 0.995, 0.261 + (x - SINK.x1) / (SINK.x2 - SINK.x1) * 0.478];
    const rim = rrect(THREE.Shape, SINK.x1 + 0.3, SINK.x2 - 0.3, SINK.z1 + 0.3, SINK.z2 - 0.3, 2);
    rim.holes.push(rrect(THREE.Path, BOWL.x1 - 0.3, BOWL.x2 + 0.3, BOWL.z1 - 0.3, BOWL.z2 + 0.3, 3));
    plate(g, rim, 91, 1, [sinkMat, sinkGrey], { bevel: 0.3, uv });
    // bowl: a box seen from inside (back faces), open at the top, the photo on its bottom
    const inside = Object.assign(sinkGrey.clone(), { side: THREE.BackSide });
    const bottom = Object.assign(sinkMat.clone(), { side: THREE.BackSide });
    const b = box(g, BOWL.x1, BOWL.x2, 73, 91, BOWL.z1, BOWL.z2, [inside, inside, hidden, bottom, inside, inside]);
    const pos = b.geometry.attributes.position, n = b.geometry.attributes.normal, buv = b.geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) if (n.getY(i) < -0.5)
      buv.setXY(i, ...uv(b.position.x / CM + pos.getX(i) / CM, b.position.z / CM + pos.getZ(i) / CM));
    buv.needsUpdate = true;
    // Chrome tap: the tap of the pack's Kitchen_Sink, the rest of that model hidden (1 unit = 1 m:
    // tap about 30 cm high); its base on the rim at the south-east corner of the bowl, turned
    // north-west (deg -135). Its base is 43.5 cm behind the model's centre, along its back.
    const off = { Kitchen: hidden, KitchenTop: hidden, White: hidden, LightMetal: chrome };
    const d = 43.5 * Math.SQRT1_2, base = [BOWL.x2 + 1, BOWL.z2 + 2.5];
    model(g, 'Kitchen_Sink', base[0] - d, base[1] - d, -135, [102, 113, 192], off, 91 - 162); }
  box(g, 699, 700, 90, 140, 182.5, 453.5, M.slate);
  // Wall units, 140..215 cm, the one above the oven shorter (154..215): one photo of the whole run
  // (kitchen-top.jpg, z 182.5..453.5), each block showing its part of it; tiles behind the gap
  const wallUnit = (z1, z2, y1) => {
    const L = 453.5 - 182.5, tex = new THREE.TextureLoader().load(TEX['kitchen-top'], () => loaded++);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.offset.set((z1 - 182.5) / L, (y1 - 140) / 75);
    tex.repeat.set((z2 - z1) / L, (215 - y1) / 75);
    const m = Array(6).fill(M.pine);
    m[1] = mat(0xffffff, { map: tex, roughness: 0.7 });                     // west face: u along z, v up
    box(g, 665, 700, y1, 215, z1, z2, m);
  };
  wallUnit(214, 275, 154); wallUnit(275, 396.6, 140);
  // the open units at both ends (photo: x 0..117 and 790..1000 of 1000 px): hollow, two shelves,
  // the photo on the front edges of their boards
  { const top = mat(0xffffff, { map: texture('kitchen-top'), roughness: 0.7 }), uv = (z, y) => [(z - 182.5) / 271, (y - 140) / 75];
    openUnit(g, 665, 700, 140, 215, 182.5, 214, top, uv, 5);                  // solid bottom 5 cm
    openUnit(g, 665, 700, 140, 215, 396.6, 453.5, top, uv, 5); }
  box(g, 699, 700, 140, 154, 214, 275, M.slate);
  // Tiles on the back wall, also behind the gap under the shorter unit; joints from the worktop
  tiledWall(g, KITCHEN_TILES, 'w', 699, 182.5, 453.5, 90, 140, 182.5, 90);
  tiledWall(g, KITCHEN_TILES, 'w', 699, 214, 275, 140, 154, 182.5, 90);
  // Alcove in the north wall, west of the worktop: worktop ledge with the toaster, tiled back,
  // microwave on a pine shelf level with the underside of the wall units, two shelves above, bin below
  plate(g, rrect(THREE.Shape, 575.5, 639.5, 157.5, 185.5, 0.1), 90, 4, [worktop, worktop], { bevel: 0.5 });   // the same worktop
  box(g, 575, 640, 90, 140, 157, 158, M.slate);
  box(g, 640, 700, 90, 140, 182.5, 183.5, M.slate);
  // Tiles in the alcove (its back, its east side) and on the north end of the worktop wall
  tiledWall(g, KITCHEN_TILES, 's', 158, 575, 640, 90, 140, 640, 90);
  tiledWall(g, KITCHEN_TILES, 'w', 640, 158, 182.5, 90, 140, 182.5, 90);
  tiledWall(g, KITCHEN_TILES, 's', 183.5, 640, 699, 90, 140, 699, 90);
  box(g, 575, 652, 137, 140, 157, 200, PINE);
  // microwave: glossy white, edges very slightly rounded (1 cm), its photo on the front (south)
  { const white = mat(0xf4f4f1, { roughness: 0.15, envMapIntensity: 0.7 });
    const m = [white, white, white, white, mat(0xffffff, { map: texture('microwave'), roughness: 0.2 }), white];
    const oven = new THREE.Mesh(new RoundedBoxGeometry(52 * CM, 30 * CM, 40 * CM, 2, 1 * CM), m);
    oven.position.set(606 * CM, 155 * CM, 180 * CM);
    g.add(oven); }
  box(g, 582, 620, 90, 108, 162, 180, M.black);
  for (const y of [190, 222]) box(g, 575, 640, y, y + 3, 157, 183, PINE);
  { const binGrey = mat(0x34383d, { roughness: 0.4, bumpMap: grain([2, 2]), bumpScale: 1 });   // bin: the worktop's grey, satin, fine grain
    model(g, 'Trashcan_Small1', 601.5, 171, 0, [51.6, 26, 72], { Black: binGrey, LightMetal: binGrey }); }

  // WC: toilet against the north wall, corner basin and mirror cabinet in the south-west corner
  toilet(g, 325, 1, 0);                                                        // centred in the WC (x 277..373)
  ceilingLight(g, 325, 59, LIVING_H);
  model(g, 'Bathroom_ToiletPaper', 277 + 4.8, 60, 90, [16.5, 9.6, 19], paperParts, 60);   // on the west wall
  cyl(g, 292, 103, 15, 76, 84, M.white);
  // Corner cabinet: a triangle in plan (20 cm along each wall); its door is the mirror, flat on the diagonal
  slab(g, [[277, 118], [277, 98], [297, 118]], 178, 56, M.grey);
  { const m = mirror(g, 's', 0, 0, 26, 124, 176); m.position.set(287.2 * CM, 150 * CM, 107.8 * CM); m.rotation.y = Math.PI * 0.75; }
  box(g, 294, 356, 120, 185, 1, 18, M.grey);                                   // wall cabinet above the toilet, centred on it

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
  // Table 180 x 80 with slightly rounded corners, in front of the two east leaves of the bay window,
  // leaving the way out of the west leaf (French window, x 320..414) clear: two armchairs on each
  // long side, one at each end, the west one no further west than the mullion (x = 414)
  const T = { x1: 452, x2: 632, z1: 620, z2: 700 };
  roundedSlab(g, T.x1, T.x2, T.z1, T.z2, 71, 75, 8, M.slate);
  for (const x of [T.x1 + 8, T.x2 - 12]) for (const z of [T.z1 + 8, T.z2 - 12]) box(g, x, x + 4, 0, 71, z, z + 4, M.slate);
  for (const x of [497, 587]) { chair(g, x, T.z1 - 17, 0, M.plastic, true); chair(g, x, T.z2 + 17, 180, M.plastic, true); }
  chair(g, T.x1 - 17, (T.z1 + T.z2) / 2, 90, M.plastic, true);
  chair(g, T.x2 + 17, (T.z1 + T.z2) / 2, -90, M.plastic, true);
}

// ---------- Night level furniture ----------
{
  const g = night;

  // Bedroom 1: bed (head to the west), desk in the recess, pouf
  bed(g, 0.5, 200, 227, 387, 'w', 35);
  box(g, 262, 320, 71, 75, 334, 420, PINE);
  for (const z of [342, 408]) { box(g, 286, 292, 6, 71, z, z + 4, PINE); box(g, 270, 312, 0, 6, z - 1, z + 5, PINE); }
  box(g, 286, 292, 25, 32, 346, 408, PINE);
  pineChair(g, 238, 377, 90);
  // Folded spare mattress, clear of the door: fabric, every edge slightly rounded (3 cm)
  { const geo = new RoundedBoxGeometry(78 * CM, 36 * CM, 58 * CM, 3, 3 * CM), pos = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {                                       // metre coordinates, by main direction
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      uv.setXY(i, ax >= ay && ax >= az ? pos.getZ(i) : pos.getX(i), ay >= ax && ay >= az ? pos.getZ(i) : pos.getY(i));
    }
    const mattress = new THREE.Mesh(geo, FABRIC);
    mattress.position.set(147 * CM, 18 * CM, 129 * CM);
    g.add(mattress); }

  // Under the stairs: the partition between the flights carries on west under the winders, with the
  // small door of the storage space
  box(g, 0, 100, 0, 123, 84, 91, M.wall);
  box(g, 16, 90, 3, 103, 91, 92.5, M.pine);
  box(g, 21, 85, 8, 98, 92.5, 93, M.hatch);

  // White beam across bedroom 1, east-west, in line with the north edge of the wardrobe;
  // its west end lands on the pine side of the staircase
  box(g, 1, 255.5, NIGHT_H - 25, NIGHT_H, 187, 212, M.white);
  // Door at the foot of the stairs
  // (dark blue on the stairs side, corridor green on the corridor side; its leaf corridor green too)
  wall(g, 'z', 210.5, 0, 84, PART, NIGHT_H, M.petrol, [{ s: 3, e: 81, head: 204, leaf: M.paleGreen, swing: ['s', 1] }], [M.petrol, M.paleGreen]);
  // Curtains and radiators of the two bedrooms
  curtain(g, 'x', 419, 116, 130, 85, 228, 180, M.redDrape);
  rod(g, 'x', 419, 22, 134, 223.5, rodGrey, [427, 427]);
  curtain(g, 'x', 419, 724, 738, 85, 228, 180, M.redDrape);
  rod(g, 'x', 419, 720, 824, 223.5, rodGrey, [427, 427]);
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
  // Cabin curtains, drawn back; their rods go from wall to wall (the models' own rods are hidden)
  const cabinCurtain = { Couch_Blue: M.curtain, LightMetal: hidden };
  model(g, 'Curtains_Single', 481, 329, -90, [18, 6, 247], cabinCurtain);         // recess curtain, 1 cm under the ceiling
  rod(g, 'z', 481, 319.5, 427, 239.5, chrome);                                  // from the partition to the south wall
  box(g, 494, 540.5, 32, 35, 319.5, 426, PINE);
  for (const y of [168, 198]) box(g, 494, 540.5, y, y + 3, 319.5, 426, PINE);
  box(g, 515, 517, 160, 162, 319.5, 426, M.grey);
  // entrance curtain, stored west of the entrance; its rod halfway between the top of the entrance
  // (NIGHT_H - 25) and the ceiling, up to the east wall of the cabin
  model(g, 'Curtains_Single', 386.5, 219.5, 0, [15, 6, 243], cabinCurtain);
  rod(g, 'x', 219.5, 379, 476.5, NIGHT_H - 12.5, chrome, [212, null]);   // rounded return to the wall at its west end
  box(g, 401, 476.5, NIGHT_H - 25, NIGHT_H, 187, 212,                           // beam above the curtain: cabin colour to the south,
    [M.white, M.white, M.white, M.white, M.lightBlue, M.tealGrey]);            // corridor colour to the north

  // Bedroom 2: bed (head to the east)
  bed(g, 660, 859.5, 239.5, 399.5, 'e', 27.5);

  // WC
  toilet(g, 668, 42.75, -90);                                                  // back against the east partition, centred on it
  model(g, 'Bathroom_ToiletPaper', 565, 1 + 4.8, 0, [16.5, 9.6, 19], paperParts, 60);     // on the north wall

  // Corridor: mirror on the north wall, 30 cm east of the middle between the open door at the foot
  // of the stairs (its edge at x = 286) and the cupboard facing the stairs (x = 437.5): 50 x 150 cm,
  // 40 cm above the floor, in an 8 cm pine frame
  box(g, 367, 417, 40, 190, 1, 3, PINE);
  mirror(g, 's', 3, 375, 409, 48, 182);

  // Bathroom: vanity unit and mirror on the north wall, bath along the east wall with its glass screen
  box(g, 710, 780, 0, 82, 1, 58, M.pine);
  box(g, 709, 781, 82, 86, 1, 60, M.wcGrey);
  cyl(g, 745, 30, 20, 86, 89, M.white).scale.set(1, 1, 0.75);
  box(g, 714, 776, 100, 195, 1, 6, PINE);
  mirror(g, 's', 6, 722, 768, 108, 180);
  // Towel radiator on the south wall, next to the door
  for (const x of [668, 712]) box(g, x, x + 2, 70, 166, 183, 186, M.white);
  for (let y = 74; y < 166; y += 8) box(g, 668, 714, y, y + 2.5, 183.5, 185.5, M.white);
  // Wall decoration
  // (snowboard, panorama, paraglider: cut to their shape; map, plane, posters: blocks)
  picture(g, 'snowboard', 'e', 1, 235, 380, 172, 216, { depth: 1 });
  picture(g, 'panorama', 'w', 859, 255, 385, 165, 212, { depth: 1 });
  picture(g, 'map', 'e', 345.5, 112, 176, 128, 174, { depth: 1 });
  picture(g, 'plane', 's', 1, 560, 632, 130, 181, { depth: 2 });
  picture(g, 'valloire1', 'e', 547.5, 377, 410, 160, 208, { depth: 1, edge: M.pine });   // bedroom 2, left of the wardrobe
  picture(g, 'valloire2', 'e', 547.5, 322, 357, 127, 174, { depth: 1, edge: M.pine });
  // Bedroom 1: paraglider on the south wall, centred between the window (x = 114) and the cabin
  // partition (x = 317.5), centred 160 cm above the floor
  picture(g, 'parapente', 'n', 427, 170.75, 260.75, 130.15, 189.85, { depth: 1 });   // 90 x 60 cm
  // Ceiling lights of the bathroom, the WC and the cabin (and the upstairs WC: living level)
  ceilingLight(g, 757, 93, NIGHT_H); ceilingLight(g, 610, 43, NIGHT_H); ceilingLight(g, 400, 320, NIGHT_H);
  // Ceiling lamps and bedside lamps
  ceilingLamp(g, 150, 310, NIGHT_H); ceilingLamp(g, 700, 320, NIGHT_H); ceilingLamp(g, 500, 140, NIGHT_H);
  for (const [x, z] of [[8, 207], [8, 407], [852, 225], [852, 413]]) {
    cyl(g, x, z, 4, 84, 92, M.black);
    cyl(g, x, z, 3, 78, 84, M.bulb);
    lamp(g, x + (x < 400 ? 8 : -8), 82, z, 0.6);
  }
  box(g, 786, 859.5, 0, 56, 17, 187, M.white);
  box(g, 786, 859.5, 0, 55.5, 1, 17, M.bathTile);                              // tiled ledge north of the bath
  slab(g, [[786, 1], [859.5, 1], [859.5, 17], [786, 17]], 56, 0.5, [BATH_TILES, M.bathTile]);
  box(g, 792, 853, 56, 56.5, 23, 181, M.mirror);
  box(g, 784.5, 786, 0, 52, 17, 187, PINE);
  box(g, 786, 787, 56, 196, 106, 186, M.glass);
}


// Tops of the walls: hidden under the slab of the floor above, they show when a level is seen
// alone from above. One colour for all of them, the grey of the cut outer walls, whatever the
// colours of their faces: the top face of every box reaching the ceiling of its level.
function capTops(g, height) {
  g.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  g.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== 'BoxGeometry' || o.userData.door) return;
    const top = (o.getWorldPosition(p).y - g.position.y + o.geometry.parameters.height / 2) / CM;
    if (top < height - 1) return;
    const mats = Array.isArray(o.material) ? o.material.slice() : Array(6).fill(o.material);
    mats[2] = M.cut;                                                          // face +y of a BoxGeometry
    o.material = mats;
  });
}
capTops(night, NIGHT_H);
capTops(living, LIVING_H);

// ---------- First-person visit ----------
// Keyframes: [x, z, floor height, heading, pitch, duration]. x, z and the floor height are in cm, in the
// living level frame (night level z = its own z + NIGHT_Z). Heading in degrees: 0 = north, 90 = east,
// 180 = south, 270 = west; it is not wrapped, so that the direction of each turn is explicit.
// The duration (s) is optional (null or left out): by default it follows the distance and the angle
// to turn. A 7th element { close: 'doorName' } closes that door (see DOORS) during the row's segment;
// every door is open again when the visit starts.
const NZ = NIGHT_Z, UP = LIVING_Y, STEP = LIVING_Y / 15;
const TOUR = [
  [628, 50, UP, 270, 0],                      // entrance, back against the front door
  [628, 50, UP, 270, 0, 2],                   // a pause before setting off
  [470, 55, UP, 270, 0, null, { close: 'wcUp' }],   // the WC door closes as we set off, out of the way
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
  [600, NZ + 165, 0, 1080, 0],                // step back, out of the way of its door...
  [600, NZ + 165, 0, 1080, 0, 2, { close: 'wcDown' }],   // ...which closes (open, it hides the bathroom)
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

const FPS_PREVIEW = 30, FPS_FULL = 60;   // see frame()
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
  // Zoom: a mouse wheel or trackpad zooms 4.5 times faster than by default; a pinch on a touch
  // screen keeps the default speed (the view follows the fingers). Set before the controls react.
  const ZOOM_WHEEL = 4.5, ZOOM_PINCH = 1;
  controls.zoomSpeed = ZOOM_WHEEL;
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
    // [row index, door] of the rows that close a door
    const closing = TOUR.flatMap((row, j) => {
      const name = row[6] && row[6].close;
      if (name && !DOORS.has(name)) console.error(`3D model: TOUR row ${j} closes an unknown door "${name}"`);
      return name && DOORS.has(name) ? [[j, DOORS.get(name)]] : [];
    });
    const openAll = () => { for (const d of DOOR_LIST) { setDoor(d, d.home); d.target = d.home; } };   // as at load
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
      // Doors closed by the visit: open before their row, closing during it, closed after
      for (const [j, d] of closing) {
        const k = Math.min(1, Math.max(0, (time - times[j - 1]) / (times[j] - times[j - 1])));
        setDoor(d, 1 - k * k * (3 - 2 * k));
        d.target = d.openness;
      }
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
        openAll();
        setView('both');
        controls.enabled = false;
        lens();
        livingCeiling.visible = true;
        tourButton.textContent = labels.stop || 'Stop';
      },
      stop() {
        if (!running) return;
        running = false; livingCeiling.visible = false; openAll();
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
    invalidate();
  };

  // Frame rate: the visit moves at walking pace, so 30 images per second in the preview and 60
  // full screen are enough. Screens refresh at 60 or 120 Hz: the other refreshes are skipped,
  // which saves the GPU (and the battery) up to 4 times the work.
  let lastFrame = -Infinity;
  // Doors opened or closed by a click swing in DOOR_SWING seconds
  const DOOR_SWING = 0.8;
  const swingDoors = (dt) => {
    let moved = false;
    for (const d of DOOR_LIST) {
      if (d.openness === d.target) continue;
      const step = dt / DOOR_SWING;
      setDoor(d, d.target > d.openness ? Math.min(d.target, d.openness + step) : Math.max(d.target, d.openness - step));
      moved = true;
    }
    return moved;
  };

  // Rendering on demand: when nothing moves (no visit, no door swinging, no action on the view, no
  // image loading), no frame is drawn and the GPU rests, even full screen. invalidate() asks for
  // new frames (two: the ambient occlusion settles over a frame).
  let dirty = 2, seen = loaded;
  const invalidate = () => { dirty = 2; };
  const frame = (time) => {
    const interval = 1000 / (full ? FPS_FULL : FPS_PREVIEW);
    if (time - lastFrame < interval - 2) return;   // 2 ms of tolerance for the jitter of the refreshes
    const moved = swingDoors(Math.min(0.25, (time - lastFrame) / 1000) || 0);   // same speed on slow devices
    lastFrame = time;
    if (seen !== loaded) { seen = loaded; invalidate(); }
    if (tour.running) tour.update(); else if (controls.update()) invalidate();
    if (!tour.running && !moved && dirty <= 0) return;
    dirty--;
    if (composer) composer.render(); else renderer.render(scene, camera);
  };
  const updateLoop = () => {
    invalidate();
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
  renderer.domElement.addEventListener('wheel', onAction);   // and pointerdown: see onPress

  // Doors, full screen: a click (not a drag of the view) on a door opens or closes it; the pointer
  // shows a hand over a door. The first visible object under the pointer must be the door.
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const doorAt = (event) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(scene, true).find((h) => h.object.isMesh && shown(h.object));
    return hit ? hit.object.userData.door : null;
  };
  let press = null, hoverAt = 0;
  const onPress = (event) => {
    // The press that stops the visit (the view jumps to the overview) is not a click on a door
    const touring = full && tour.running;
    onAction();
    press = touring ? null : { x: event.clientX, y: event.clientY, t: performance.now() };
  };
  const onRelease = (event) => {
    if (!full || !press) return;
    const still = Math.hypot(event.clientX - press.x, event.clientY - press.y) < 6 && performance.now() - press.t < 600;
    press = null;
    const d = still && doorAt(event);
    if (d) d.target = d.target > 0.5 ? 0 : 1;
  };
  const onHover = (event) => {
    if (!full || event.buttons || performance.now() - hoverAt < 100) return;   // at most 10 times a second
    hoverAt = performance.now();
    renderer.domElement.style.cursor = doorAt(event) ? 'pointer' : '';
  };
  // Any action in the viewer (view buttons, drag, wheel, keys, door click) may change the image
  controls.addEventListener('change', invalidate);
  for (const ev of ['pointerdown', 'pointerup', 'wheel', 'keydown', 'click']) stage.addEventListener(ev, invalidate, true);
  stage.addEventListener('pointerdown', (e) => { controls.zoomSpeed = e.pointerType === 'touch' ? ZOOM_PINCH : ZOOM_WHEEL; }, true);
  stage.addEventListener('wheel', () => { controls.zoomSpeed = ZOOM_WHEEL; }, true);
  renderer.domElement.addEventListener('pointerdown', onPress);
  renderer.domElement.addEventListener('pointerup', onRelease);
  renderer.domElement.addEventListener('pointermove', onHover);
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
