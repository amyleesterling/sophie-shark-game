// ---------------------------------------------------------------
//  Sophie's Shark & Fish Game
//  Designed by Sophie (age 6, almost 7!)
//  You are a little fish: collect 4 gems, hide behind coral,
//  and don't get eaten by the sharks. You have 3 lives!
// ---------------------------------------------------------------
import * as THREE from './lib/three.module.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './leaderboard-config.js';

// ----------------------------- setup -----------------------------
const WORLD_SIZE = 190;          // playable square is [-95, 95]
const FLOOR_Y = 0;
const CEILING_Y = 26;

const canvas = document.getElementById('game');
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// phones get a lower pixel-ratio cap so the reef stays smooth
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic color response instead of raw 90s RGB
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2fb9dc); // bright tropical lagoon water
scene.fog = new THREE.Fog(0x2fb9dc, 30, 130);
let skyDome = null;
let waterSurface = null;

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

// iOS Safari ignores user-scalable=no, so block pinch and double-tap zoom by hand
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, e => e.preventDefault());
}
document.addEventListener('dblclick', e => e.preventDefault());
let lastTapTime = 0;
document.addEventListener('touchend', e => {
  const now = performance.now();
  // double-tap: swallow the second tap unless it's on a button (keep taps working)
  if (now - lastTapTime < 350 && !e.target.closest('button')) e.preventDefault();
  lastTapTime = now;
}, { passive: false });

// lights: bright sunny lagoon with real shadows
scene.add(new THREE.HemisphereLight(0xe0fbff, 0x3e9db6, 1.4));
const sun = new THREE.DirectionalLight(0xfff3d6, 1.9);
sun.position.set(40, 80, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouchDevice ? 1024 : 2048, isTouchDevice ? 1024 : 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -115;
sun.shadow.camera.right = sun.shadow.camera.top = 115;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0005;
scene.add(sun);

// gradient depth backdrop: darker deep water below, sunlit aqua above
{
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, '#0d5e8c');
  grad.addColorStop(0.45, '#2fb9dc');
  grad.addColorStop(1, '#9fe8ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(280, 32, 24),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.userData.noShadow = true;
  scene.add(sky);
  skyDome = sky; // follows the player so the horizon never arrives
}

// ----------------------------- helpers -----------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// height of the rolling sand dunes at any world position — everything that
// sits on the floor uses this so nothing floats or sinks.
// Every term repeats every TILE units, so the sand mesh can hop by whole
// tiles as you swim and the dunes always line up: the ocean never ends.
const TILE = 120;
const W1 = (Math.PI * 2) / TILE, W2 = (Math.PI * 2) / (TILE / 5), W3 = (Math.PI * 2) / (TILE / 3);
function floorY(x, z) {
  return Math.sin(x * W1) * Math.cos(z * W1) * 1.7 + Math.sin(x * W2 + z * W3) * 0.3;
}
const snapToTile = v => Math.round(v / TILE) * TILE;

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...extra });
}

// tiny synth sounds (no audio files needed)
let audioCtx = null;
function beep(freq, dur = 0.15, type = 'sine', vol = 0.2, slideTo = null) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + dur);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* sound is optional */ }
}
const sfx = {
  gem: () => { beep(660, 0.12, 'sine', 0.25); setTimeout(() => beep(880, 0.15, 'sine', 0.25), 90); setTimeout(() => beep(1320, 0.2, 'sine', 0.2), 180); },
  hit: () => beep(220, 0.4, 'sawtooth', 0.25, 80),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle', 0.25), i * 130)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'triangle', 0.2), i * 200)),
  nap: () => { beep(500, 0.3, 'sine', 0.15, 250); },
  // dragon roar: a big low rumble that swoops upward
  dragon: () => { beep(90, 0.6, 'sawtooth', 0.28, 200); setTimeout(() => beep(140, 0.5, 'sawtooth', 0.22, 320), 120); setTimeout(() => beep(1100, 0.15, 'square', 0.12), 260); },
};

// ----------------------------- ocean floor & water -----------------------------
let sandTile = null; // follows the player in TILE-sized hops (dunes are TILE-periodic)
{
  const SAND_SPAN = TILE * 3; // covers well past the fog in every direction
  const sandGeo = new THREE.PlaneGeometry(SAND_SPAN, SAND_SPAN, 120, 120);
  const pos = sandGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const warm = new THREE.Color(0xffffff), cool = new THREE.Color(0xd8ceb2), tint = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    // the plane is rotated -90° about x, so its local +y is world -z
    const h = floorY(x, -y);
    pos.setZ(i, h);
    // subtle color variation with height so the floor doesn't read as one flat sheet
    tint.lerpColors(cool, warm, clamp(0.55 + h * 0.25, 0, 1));
    colors[i * 3] = tint.r; colors[i * 3 + 1] = tint.g; colors[i * 3 + 2] = tint.b;
  }
  sandGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, mat(0xf9e9b6, { roughness: 1, vertexColors: true }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = FLOOR_Y;
  sand.receiveShadow = true;
  sand.userData.noShadow = true; // gentle dunes self-shadow badly at grazing sun angles
  scene.add(sand);
  sandTile = sand;

  // shimmering water surface above (follows the player — the sea is endless)
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4),
    new THREE.MeshStandardMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.2 })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = CEILING_Y + 4;
  scene.add(surface);
  waterSurface = surface;
}

// makers for the small seafloor decorations, used by the chunk generator
const PEBBLE_COLORS = [0xffc6d9, 0xc5b3ff, 0xaee9ff, 0xffe3a3, 0xc8f7c5, 0xf6d4ff];
function makePebble(x, z) {
  const pebble = new THREE.Mesh(
    new THREE.SphereGeometry(rand(0.3, 0.9), 8, 6),
    mat(PEBBLE_COLORS[Math.floor(Math.random() * PEBBLE_COLORS.length)])
  );
  pebble.position.set(x, floorY(x, z) + 0.2, z);
  pebble.scale.y = 0.5;
  return pebble;
}
function makeStarfish(x, z) {
  const star = new THREE.Group();
  const c = [0xff8fab, 0xffa94d, 0xff6b6b][Math.floor(rand(0, 3))];
  for (let a = 0; a < 5; a++) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 3, 6), mat(c));
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = (a / 5) * Math.PI * 2;
    arm.position.set(Math.cos((a / 5) * Math.PI * 2) * 0.4, 0, -Math.sin((a / 5) * Math.PI * 2) * 0.4);
    star.add(arm);
  }
  star.position.set(x, floorY(x, z) + 0.25, z);
  return star;
}

// dancing caustic light patterns on the sand
let causticTex = null, causticTile = null;
{
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 5;
  for (let i = 0; i < 46; i++) {
    ctx.lineWidth = rand(1, 2.6);
    ctx.beginPath();
    ctx.ellipse(rand(0, 256), rand(0, 256), rand(10, 34), rand(6, 22), rand(0, Math.PI), 0, Math.PI * 2);
    ctx.stroke();
  }
  causticTex = new THREE.CanvasTexture(c);
  causticTex.wrapS = causticTex.wrapT = THREE.RepeatWrapping;
  causticTex.repeat.set(12, 12); // 12 repeats over 3 tiles = whole repeats per TILE, so tile hops are seamless
  // drape the caustic sheet over the same dunes, a hair above the sand
  // (same TILE-periodic trick as the sand — it hops along with the player)
  const cGeo = new THREE.PlaneGeometry(TILE * 3, TILE * 3, 120, 120);
  const cPos = cGeo.attributes.position;
  for (let i = 0; i < cPos.count; i++) {
    cPos.setZ(i, floorY(cPos.getX(i), -cPos.getY(i)) + 0.1);
  }
  const caustics = new THREE.Mesh(
    cGeo,
    new THREE.MeshBasicMaterial({
      map: causticTex, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.y = FLOOR_Y;
  scene.add(caustics);
  causticTile = caustics;
}

// soft sun rays slanting down from the surface
const sunRays = [];
for (let i = 0; i < 6; i++) {
  const ray = new THREE.Mesh(
    new THREE.ConeGeometry(rand(7, 13), 46, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfffbe0, transparent: true, opacity: rand(0.04, 0.07),
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    })
  );
  ray.position.set(rand(-70, 70), CEILING_Y - 3, rand(-70, 70));
  ray.rotation.z = rand(-0.12, 0.12);
  ray.userData.phase = rand(0, Math.PI * 2);
  scene.add(ray);
  sunRays.push(ray);
}

// marine snow: tiny drifting motes that make the water feel like water
let snowPositions = null, snowPoints = null;
{
  const N = 260;
  snowPositions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    snowPositions[i * 3] = rand(-95, 95);
    snowPositions[i * 3 + 1] = rand(0, CEILING_Y);
    snowPositions[i * 3 + 2] = rand(-95, 95);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  snowPoints = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xe8f8ff, size: 0.14, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  scene.add(snowPoints);
}

// rising bubbles
const bubbles = [];
{
  const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.4, roughness: 0.1 });
  for (let i = 0; i < 60; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(rand(0.08, 0.3), 8, 8), bubbleMat);
    b.position.set(rand(-95, 95), rand(0, CEILING_Y), rand(-95, 95));
    b.userData.speed = rand(0.8, 2.2);
    scene.add(b);
    bubbles.push(b);
  }
}

// ----------------------------- coral hiding spots -----------------------------
// Each cluster is a safe zone: swim inside its ring and sharks can't see you!
const coralClusters = [];

function makeCoralCluster(x, z) {
  const group = new THREE.Group();
  const colors = [0xff6f91, 0xff9671, 0xffc75f, 0xd65db1, 0x845ec2, 0xf9f871];
  const n = Math.floor(rand(5, 9));
  for (let i = 0; i < n; i++) {
    const c = colors[Math.floor(Math.random() * colors.length)];
    const kind = Math.floor(Math.random() * 3);
    let piece;
    if (kind === 0) {
      // branching coral: a few leaning capsules
      piece = new THREE.Group();
      const branches = Math.floor(rand(3, 6));
      for (let bIdx = 0; bIdx < branches; bIdx++) {
        const h = rand(1.5, 3.5);
        const br = new THREE.Mesh(new THREE.CapsuleGeometry(rand(0.15, 0.3), h, 4, 8), mat(c));
        br.position.y = h / 2;
        br.rotation.z = rand(-0.5, 0.5);
        br.rotation.x = rand(-0.5, 0.5);
        piece.add(br);
      }
    } else if (kind === 1) {
      // brain coral: squashed bumpy sphere
      piece = new THREE.Mesh(new THREE.SphereGeometry(rand(0.9, 1.8), 10, 8), mat(c));
      piece.scale.y = 0.7;
      piece.position.y = 0.6;
    } else {
      // tube coral: cluster of cylinders
      piece = new THREE.Group();
      for (let t = 0; t < 4; t++) {
        const h = rand(1, 2.6);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.2, 0.35), rand(0.3, 0.5), h, 8), mat(c));
        tube.position.set(rand(-0.5, 0.5), h / 2, rand(-0.5, 0.5));
        piece.add(tube);
      }
    }
    piece.position.set(rand(-3, 3), 0, rand(-3, 3));
    group.add(piece);
  }
  // swaying kelp blades — curved and tapered so they read as plants, not planks
  for (let s = 0; s < 6; s++) {
    const h = rand(2.5, 5.5);
    const weed = new THREE.Mesh(
      makeKelpBlade(h),
      new THREE.MeshStandardMaterial({
        color: [0x35c26b, 0x2ea45f, 0x51d98a, 0x7fd45e][s % 4],
        side: THREE.DoubleSide, roughness: 0.85,
      })
    );
    weed.position.set(rand(-4, 4), 0, rand(-4, 4));
    weed.rotation.y = rand(0, Math.PI * 2);
    weed.userData.sway = rand(0, Math.PI * 2);
    group.add(weed);
  }
  group.position.set(x, floorY(x, z), z);
  scene.add(group);
  const entry = { group, x, z, hideRadius: 6.5 };
  coralClusters.push(entry);
  return entry;
}

// a kelp blade: base-pivoted, tapering toward the tip, with a gentle S-curve
function makeKelpBlade(h) {
  const geo = new THREE.PlaneGeometry(0.55, h, 3, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getY(i) / h + 0.5; // 0 at base → 1 at tip
    pos.setX(i, pos.getX(i) * (1 - v * 0.72) * (1 + Math.sin(v * Math.PI) * 0.5));
    pos.setZ(i, Math.sin(v * Math.PI * 1.3) * h * 0.14);
  }
  geo.translate(0, h / 2, 0); // pivot at the base so swaying looks rooted
  geo.computeVertexNormals();
  return geo;
}

// small decorative reef patches everywhere (pretty, but too little to hide in —
// the big lush clusters are the real hideouts)
const anemones = [];
const anemoneSpots = []; // clownfish move in nearby
function makeReefPatch(x, z) {
  const g = new THREE.Group();
  const bright = [0xff6f91, 0xff9671, 0xffc75f, 0xf9f871, 0x9df9ef, 0xd65db1, 0xb39cff];
  const kind = Math.floor(Math.random() * 3);
  const c = bright[Math.floor(Math.random() * bright.length)];
  if (kind === 0) {
    // sea anemone: squishy base with a crown of waving tentacles
    const base = new THREE.Mesh(new THREE.SphereGeometry(rand(0.5, 0.8), 10, 8), mat(c));
    base.scale.y = 0.55;
    base.position.y = 0.25;
    g.add(base);
    const tentColor = bright[Math.floor(Math.random() * bright.length)];
    const tents = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const tent = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, rand(0.5, 0.9), 3, 6), mat(tentColor));
      tent.position.set(Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3);
      tent.rotation.z = Math.cos(a) * 0.55;
      tent.rotation.x = -Math.sin(a) * 0.55;
      g.add(tent);
      tents.push({ mesh: tent, angle: a, baseZ: tent.rotation.z, baseX: tent.rotation.x });
    }
    g.userData.anemoneEntry = { tents, phase: rand(0, Math.PI * 2) };
    anemones.push(g.userData.anemoneEntry);
    anemoneSpots.push({ x, z });
  } else if (kind === 1) {
    // fan coral: a flat colorful fan
    const fan = new THREE.Mesh(
      new THREE.CircleGeometry(rand(0.8, 1.5), 16, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.9 })
    );
    fan.position.y = 0.1;
    fan.rotation.y = rand(0, Math.PI);
    g.add(fan);
  } else {
    // little coral sprig
    for (let i = 0; i < 3; i++) {
      const h = rand(0.6, 1.4);
      const sprig = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, h, 3, 6), mat(c));
      sprig.position.set(rand(-0.4, 0.4), h / 2, rand(-0.4, 0.4));
      sprig.rotation.z = rand(-0.4, 0.4);
      g.add(sprig);
    }
  }
  g.position.set(x, floorY(x, z), z);
  scene.add(g);
  return g;
}

// ---------- infinite world: the reef generates itself in chunks around you ----------
const CHUNK = 60;        // chunk edge length
const CHUNK_RADIUS = 2;  // keep a 5×5 grid of chunks alive around the player
const chunks = new Map(); // "cx,cz" → { objects: Mesh/Group[], cluster: coralClusters entry | null }

function applyShadows(root) {
  root.traverse(obj => {
    if (obj.isMesh && !obj.material.transparent && obj.material.blending === THREE.NormalBlending
        && !obj.userData.noShadow) {
      obj.castShadow = true;
    }
  });
}

function spawnChunk(cx, cz) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const objects = [];
  let cluster = null;
  // roughly every third chunk gets a big coral hideout
  if (Math.random() < 0.35) {
    const hx = x0 + rand(8, CHUNK - 8), hz = z0 + rand(8, CHUNK - 8);
    cluster = makeCoralCluster(hx, hz);
    objects.push(cluster.group);
  }
  const patches = Math.floor(rand(2, 5));
  for (let i = 0; i < patches; i++) {
    const px = x0 + rand(2, CHUNK - 2), pz = z0 + rand(2, CHUNK - 2);
    if (cluster && Math.hypot(px - cluster.x, pz - cluster.z) < 10) continue;
    objects.push(makeReefPatch(px, pz));
  }
  for (let i = 0; i < 4; i++) objects.push(makePebble(x0 + rand(0, CHUNK), z0 + rand(0, CHUNK)));
  if (Math.random() < 0.6) objects.push(makeStarfish(x0 + rand(0, CHUNK), z0 + rand(0, CHUNK)));
  for (const o of objects) {
    if (!o.parent) scene.add(o);
    applyShadows(o);
  }
  chunks.set(`${cx},${cz}`, { objects, cluster });
}

function despawnChunk(key) {
  const chunk = chunks.get(key);
  for (const o of chunk.objects) {
    scene.remove(o);
    o.traverse(child => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
      if (child.userData.anemoneEntry) {
        const i = anemones.indexOf(child.userData.anemoneEntry);
        if (i >= 0) anemones.splice(i, 1);
      }
    });
  }
  if (chunk.cluster) {
    const i = coralClusters.indexOf(chunk.cluster);
    if (i >= 0) coralClusters.splice(i, 1);
  }
  chunks.delete(key);
}

function ensureChunksAround(x, z) {
  const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
  const needed = new Set();
  for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
    for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
      needed.add(`${pcx + dx},${pcz + dz}`);
    }
  }
  for (const key of needed) {
    if (!chunks.has(key)) {
      const [cx, cz] = key.split(',').map(Number);
      spawnChunk(cx, cz);
    }
  }
  for (const key of [...chunks.keys()]) {
    if (!needed.has(key)) despawnChunk(key);
  }
}
ensureChunksAround(0, 88); // the reef around the starting pool

function nearestCoralDistance(p) {
  let best = Infinity;
  for (const c of coralClusters) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < best) best = d;
  }
  return best;
}
function isHiddenAt(p) {
  return coralClusters.some(c => Math.hypot(p.x - c.x, p.z - c.z) < c.hideRadius);
}

// ----------------------------- kawaii face helpers -----------------------------
// big sparkly anime eyes: white → big dark pupil → little white shine dot
function addKawaiiEye(g, x, y, z, size) {
  const side = Math.sign(z) || 1;
  const white = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 12), mat(0xffffff, { roughness: 0.25 }));
  white.position.set(x, y, z);
  g.add(white);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.62, 10, 10), mat(0x2b2b3d, { roughness: 0.25 }));
  pupil.position.set(x + size * 0.35, y, z + side * size * 0.35);
  g.add(pupil);
  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.22, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  shine.position.set(x + size * 0.55, y + size * 0.35, z + side * size * 0.45);
  g.add(shine);
}
// rosy blush cheeks
function addBlush(g, x, y, z, size = 0.16) {
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), mat(0xff9eb5, { roughness: 1 }));
    cheek.scale.set(1, 0.6, 1);
    cheek.position.set(x, y, side * z);
    g.add(cheek);
  }
}

// ----------------------------- smooth curvy fins -----------------------------
// extruded 2D shapes with rounded bevels, so tails look like real cute fishtails
function finMesh(shapeFn, color, size) {
  const shape = new THREE.Shape();
  shapeFn(shape);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12, curveSegments: 16,
    bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3,
  });
  geo.translate(0, 0, -0.06); // center the thickness
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.setScalar(size);
  return m;
}
// classic forked tail: two rounded lobes with a notch between them
function makeTailFin(color, size = 1) {
  return finMesh(s => {
    s.moveTo(0, 0);
    s.bezierCurveTo(-0.35, 0.45, -0.7, 0.85, -1.05, 1.0);
    s.quadraticCurveTo(-0.7, 0.42, -0.6, 0);
    s.quadraticCurveTo(-0.7, -0.42, -1.05, -1.0);
    s.bezierCurveTo(-0.7, -0.85, -0.35, -0.45, 0, 0);
  }, color, size);
}
// rounded dorsal fin swept gently back
function makeDorsalFin(color, size = 1) {
  return finMesh(s => {
    s.moveTo(0.25, 0);
    s.quadraticCurveTo(0.3, 0.55, -0.05, 0.9);
    s.quadraticCurveTo(-0.5, 0.6, -0.6, 0);
    s.lineTo(0.25, 0);
  }, color, size);
}
// soft teardrop pectoral fin sweeping back and down
function makeSideFin(color, size = 1) {
  return finMesh(s => {
    s.moveTo(0, 0);
    s.quadraticCurveTo(0.2, -0.45, -0.15, -0.85);
    s.quadraticCurveTo(-0.5, -0.5, -0.45, -0.05);
    s.quadraticCurveTo(-0.2, 0.08, 0, 0);
  }, color, size);
}

// ----------------------------- the player fish -----------------------------
function makeFish(bodyColor, finColor, size = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mat(bodyColor));
  body.scale.set(1.4, 0.9, 0.7);
  g.add(body);
  const tail = makeTailFin(finColor, 0.75);
  tail.position.x = -1.3;
  g.add(tail);
  const topFin = makeDorsalFin(finColor, 0.55);
  topFin.position.set(0.1, 0.8, 0);
  g.add(topFin);
  const fins = [tail, topFin];
  for (const side of [-1, 1]) {
    const fin = makeSideFin(finColor, 0.75);
    fin.position.set(0.35, -0.15, side * 0.6);
    fin.rotation.x = -side * 0.8; // flare outward from the body
    g.add(fin);
    fins.push(fin);
    addKawaiiEye(g, 0.85, 0.3, side * 0.45, 0.28);
  }
  addBlush(g, 1.0, -0.05, 0.55, 0.14);
  // happy little mouth
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12, Math.PI), mat(0x883344));
  mouth.position.set(1.28, -0.05, 0);
  mouth.rotation.y = Math.PI / 2;
  mouth.rotation.z = Math.PI;
  g.add(mouth);
  g.scale.setScalar(size);
  return { group: g, tail, body, fins };
}

const START_POS = new THREE.Vector3(0, 4, 88);
const START_YAW = Math.PI / 2; // fish model faces +x; this heading points it at the world center (-z)

// pick-your-fish colors (body, fins) — wired to the start-screen swatches below
const FISH_COLORS = [
  { name: 'sunny',  body: 0xffa94d, fin: 0xff7b54 },
  { name: 'pinky',  body: 0xff9ecd, fin: 0xe64980 },
  { name: 'grape',  body: 0xb197fc, fin: 0x7048e8 },
  { name: 'splash', body: 0x74c0fc, fin: 0x1c7ed6 },
  { name: 'minty',  body: 0x8ce99a, fin: 0x37b24d },
  { name: 'sunny2', body: 0xffe066, fin: 0xf59f00 },
];
const playerParts = makeFish(FISH_COLORS[0].body, FISH_COLORS[0].fin, 0.9);
const player = playerParts.group;
player.rotation.order = 'YZX'; // yaw, then pitch, then bank — intrinsic for a +x-facing model
player.position.copy(START_POS);
player.rotation.y = START_YAW;
scene.add(player);

// bubble shield shown while invulnerable
const shield = new THREE.Mesh(
  new THREE.SphereGeometry(2.2, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.25, roughness: 0.1 })
);
shield.visible = false;
player.add(shield);

// sparkle trail (unlocked with the 3rd gem)
const trail = [];
{
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), trailMat.clone());
    s.visible = false;
    scene.add(s);
    trail.push({ mesh: s, life: 0 });
  }
}

// ----------------------------- gems -----------------------------
// 4 gems per level, scattered around wherever the player currently is —
// the ocean is endless, so the treasure comes to your neighborhood
const gems = [];
[0x59d4ff, 0xff6bd6, 0x7dff8a, 0xffd93d].forEach(color => {
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.2 })
  );
  const halo = new THREE.PointLight(color, 20, 14);
  gem.add(halo);
  scene.add(gem);
  gems.push({ mesh: gem, collected: false, baseY: 4 });
});

function placeGemNear(g, cx, cz) {
  const a = rand(0, Math.PI * 2), d = rand(45, 85);
  const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
  g.baseY = floorY(x, z) + rand(3.5, 7);
  g.mesh.position.set(x, g.baseY, z);
}
function spawnGemsForLevel(cx, cz) {
  gems.forEach(g => {
    g.collected = false;
    g.mesh.visible = true;
    placeGemNear(g, cx, cz);
  });
}
spawnGemsForLevel(0, 30); // ahead of the starting pool, for the menu backdrop

// ----------------------------- the bedazzled octopus (grand finale) -----------------------------
// after the last gem level, the objective becomes finding this one special
// octopus, completely covered in sparkling gems
const FINAL_GEM_LEVEL = 5; // levels 1..5 collect gems; level 6 is the finale hunt
const bedazzled = { found: false };
{
  const g = new THREE.Group();
  const purple = 0xb15bd8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 18), mat(purple));
  head.scale.y = 1.15;
  head.position.y = 1.3;
  g.add(head);
  // big sparkly eyes + blush
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 12), mat(0xffffff, { roughness: 0.25 }));
    white.position.set(side * 0.6, 1.5, 1.2);
    g.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 10), mat(0x2b2b3d));
    pupil.position.set(side * 0.6, 1.5, 1.45);
    g.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(side * 0.52, 1.63, 1.6);
    g.add(shine);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8), mat(0xff9eb5, { roughness: 1 }));
    cheek.scale.y = 0.6;
    cheek.position.set(side * 1.05, 1.12, 1.05);
    g.add(cheek);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12, Math.PI), mat(0x883344));
  smile.position.set(0, 1.2, 1.45);
  smile.rotation.z = Math.PI;
  g.add(smile);
  // eight wiggly tentacles
  const bTentacles = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.8, 4, 8), mat(purple));
    t.position.set(Math.cos(a) * 0.9, 0.1, Math.sin(a) * 0.9);
    t.rotation.z = Math.cos(a) * 0.5;
    t.rotation.x = -Math.sin(a) * 0.5;
    g.add(t);
    bTentacles.push({ mesh: t, angle: a });
  }
  // BEDAZZLED: gems all over the body and tentacles
  const gemColors = [0x59d4ff, 0xff6bd6, 0x7dff8a, 0xffd93d, 0xff6b6b, 0xb197fc];
  const gemMats = gemColors.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.3 }));
  for (let i = 0; i < 40; i++) {
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.1, 0.2)), gemMats[i % gemMats.length]);
    // scatter over the head sphere
    const u = rand(0, Math.PI * 2), v = rand(-0.3, 1);
    const r = 1.5;
    jewel.position.set(Math.cos(u) * r * Math.sqrt(1 - v * v), 1.3 + v * r * 1.15, Math.sin(u) * r * Math.sqrt(1 - v * v) * 0.95);
    g.add(jewel);
  }
  const halo = new THREE.PointLight(0xfff0a0, 25, 20);
  halo.position.y = 1.5;
  g.add(halo);
  g.visible = false;
  scene.add(g);
  bedazzled.group = g;
  bedazzled.tentacles = bTentacles;
}
function placeBedazzledNear(cx, cz) {
  const a = rand(0, Math.PI * 2), d = rand(55, 80);
  const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
  bedazzled.group.position.set(x, floorY(x, z) + 3, z);
  bedazzled.group.visible = true;
  bedazzled.found = false;
}

// compass sparkles: a trail of glowing dots leading toward the next goal
const compassDots = [];
{
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22 - i * 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    d.visible = false;
    scene.add(d);
    compassDots.push(d);
  }
}

// burst of sparkles when something wonderful happens
const burstPool = [];
{
  for (let i = 0; i < 26; i++) {
    const p = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
    );
    p.visible = false;
    p.userData.vel = new THREE.Vector3();
    p.userData.life = 0;
    scene.add(p);
    burstPool.push(p);
  }
}
function sparkleBurst(pos, color) {
  for (const p of burstPool) {
    p.visible = true;
    p.userData.life = 1;
    p.material.color.set(color);
    p.material.opacity = 1;
    p.position.copy(pos);
    p.userData.vel.set(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, 9));
  }
}

// the treasure chest that appears when all 4 gems are found
const chest = new THREE.Group();
const chestLid = new THREE.Group();
const crown = new THREE.Group();
{
  const wood = mat(0x9a6633);
  const gold = mat(0xffd43b, { metalness: 0.6, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.5), wood);
  base.position.y = 0.55;
  chest.add(base);
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 1.6), gold);
  band.position.y = 0.85;
  chest.add(band);
  // lid pivots along the back top edge
  const lidBox = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.2, 16, 1, false, 0, Math.PI), wood);
  lidBox.rotation.z = Math.PI / 2;
  lidBox.position.set(0, 0, 0.75);
  chestLid.position.set(0, 1.1, -0.75);
  chestLid.add(lidBox);
  chest.add(chestLid);
  const glow = new THREE.PointLight(0xffe066, 0, 12); // lights up when it opens
  glow.position.y = 1.4;
  chest.add(glow);
  chest.userData.glow = glow;
  chest.visible = false;
  scene.add(chest);

  // the royal crown inside
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.3, 12, 1, true), gold);
  crown.add(ring);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12), gold);
  top.position.y = 0.12;
  crown.add(top);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), gold);
    spike.position.set(Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4);
    crown.add(spike);
    const jewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshStandardMaterial({ color: [0xff6b6b, 0x59d4ff, 0x7dff8a][i % 3], emissive: [0xff6b6b, 0x59d4ff, 0x7dff8a][i % 3], emissiveIntensity: 0.5 })
    );
    jewel.position.set(Math.cos(a) * 0.4, 0.48, Math.sin(a) * 0.4);
    crown.add(jewel);
  }
  crown.visible = false;
  scene.add(crown);
}

// ----------------------------- sharks -----------------------------
function makeShark() {
  const g = new THREE.Group();
  const grey = 0x8fb9e2; // soft kawaii blue instead of scary grey
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), mat(grey));
  body.scale.set(2.6, 1.1, 0.95);
  g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.98, 20, 16), mat(0xe8f1f8));
  belly.scale.set(2.45, 0.95, 0.85);
  belly.position.y = -0.28;
  g.add(belly);
  const tail = makeTailFin(grey, 1.45);
  tail.position.x = -2.55;
  g.add(tail);
  const dorsal = makeDorsalFin(grey, 1.05);
  dorsal.position.set(-0.2, 1.0, 0);
  g.add(dorsal);
  for (const side of [-1, 1]) {
    const fin = makeSideFin(grey, 1.35);
    fin.position.set(0.55, -0.5, side * 0.75);
    fin.rotation.x = -side * 0.9; // flare outward from the body
    g.add(fin);
    addKawaiiEye(g, 1.7, 0.4, side * 0.58, 0.3);
  }
  addBlush(g, 1.95, 0.05, 0.72, 0.18);
  // toothy but not-too-scary grin
  const grin = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 14, Math.PI), mat(0x33202a));
  grin.position.set(2.25, -0.15, 0);
  grin.rotation.y = Math.PI / 2;
  grin.rotation.z = Math.PI;
  g.add(grin);
  for (let t = -2; t <= 2; t++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), mat(0xffffff));
    tooth.position.set(2.3, -0.1, t * 0.16);
    tooth.rotation.x = Math.PI;
    g.add(tooth);
  }
  // scared "😱" label shown while a dragon is chasing the shark away
  const scared = makeTextSprite('😱');
  scared.position.set(0, 2.4, 0);
  scared.visible = false;
  g.add(scared);
  g.userData.scared = scared;
  g.userData.tail = tail;
  return g;
}

function makeTextSprite(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '90px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.setScalar(2.2);
  return sp;
}

// a pool of 6 sharks — higher levels wake up more of them
const sharks = [];
[
  { home: [-40, -40], range: 38 },
  { home: [45, 0], range: 36 },
  { home: [0, 45], range: 40 },
  { home: [55, -55], range: 34 },
  { home: [-60, 25], range: 34 },
  { home: [25, 65], range: 32 },
].forEach(({ home, range }) => {
  const mesh = makeShark();
  mesh.rotation.order = 'YZX'; // so rotation.x barrel-rolls around its own long axis
  mesh.position.set(home[0], rand(3, 7), home[1]);
  scene.add(mesh);
  sharks.push({
    mesh,
    home: new THREE.Vector3(home[0], 5, home[1]),
    range,
    target: new THREE.Vector3(home[0], 5, home[1]),
    state: 'patrol',           // patrol | chase | nap
    speed: rand(6.5, 7.5),
    newTargetTimer: 0,
    active: true,
    spin: 0,                   // celebratory barrel roll after a chomp
  });
});

// levels: more sharks, faster sharks
function levelCfg(l) {
  return {
    sharkCount: Math.min(2 + l, 6),
    speedMult: 1 + (l - 1) * 0.12,
  };
}
const SCARE_DURATION = 10; // 2nd gem: the dragon scares the sharks away for 10 seconds

// ----------------------------- the friendly dragon -----------------------------
// summoned by the 2nd gem; it swoops in and frightens every shark away
function makeDragon() {
  const g = new THREE.Group();
  const green = 0x4fc76a, belly = 0xd6f5b0;
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), mat(green));
  body.scale.set(2.4, 1.2, 1.1);
  g.add(body);
  const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.97, 20, 16), mat(belly));
  tummy.scale.set(2.2, 1.0, 0.95);
  tummy.position.y = -0.3;
  g.add(tummy);
  // long curvy neck + head reaching forward
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.6, 12), mat(green));
  neck.rotation.z = -Math.PI / 2.6;
  neck.position.set(2.0, 0.6, 0);
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 14), mat(green));
  head.position.set(2.9, 1.15, 0);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), mat(green));
  snout.scale.set(1.3, 0.8, 0.9);
  snout.position.set(3.5, 1.0, 0);
  g.add(snout);
  for (const side of [-1, 1]) {
    addKawaiiEye(g, 3.15, 1.45, side * 0.42, 0.24);
    // little horns
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8), mat(0xfff1c1));
    horn.position.set(2.7, 1.85, side * 0.3);
    horn.rotation.z = side * 0.2;
    g.add(horn);
    // wings
    const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), mat(0x8be0a0, { roughness: 0.7 }));
    wing.scale.set(1.4, 0.15, 2.0);
    wing.position.set(-0.3, 0.9, side * 1.6);
    wing.rotation.x = side * 0.5;
    g.add(wing);
    g.userData[`wing${side < 0 ? 'L' : 'R'}`] = wing;
  }
  // fiery breath puff (shown while roaring)
  const fire = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.6, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9636, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  fire.rotation.z = -Math.PI / 2;
  fire.position.set(4.6, 0.95, 0);
  g.add(fire);
  g.userData.fire = fire;
  // spiky back ridge
  for (let i = -2; i <= 2; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), mat(0xfff1c1));
    spike.position.set(i * 0.6 - 0.2, 1.15, 0);
    g.add(spike);
  }
  const tail = makeTailFin(green, 1.2);
  tail.position.x = -2.4;
  tail.rotation.z = Math.PI / 2; // vertical dragon tail-fin
  g.add(tail);
  g.scale.setScalar(1.5);
  g.visible = false;
  scene.add(g);
  return g;
}
const dragon = makeDragon();

// 2nd gem: the dragon swoops in and frightens every shark
function summonDragon() {
  state.scareTimer = SCARE_DURATION;
  const dir = new THREE.Vector3(Math.cos(player.rotation.y), 0, -Math.sin(player.rotation.y));
  dragon.position.copy(player.position).addScaledVector(dir, 10).add(new THREE.Vector3(0, 6, 0));
  dragon.visible = true;
  sharks.forEach(s => {
    if (s.active) {
      s.state = 'scared';
      s.mesh.userData.scared.visible = true;
    }
  });
  sfx.dragon();
}

function pickPatrolTarget(shark) {
  // wander near home but never inside a coral hideout (sharks don't like coral!)
  for (let tries = 0; tries < 12; tries++) {
    const t = new THREE.Vector3(
      shark.home.x + rand(-shark.range, shark.range),
      rand(2.5, 12),
      shark.home.z + rand(-shark.range, shark.range)
    );
    if (nearestCoralDistance(t) > 9) return t;
  }
  return shark.home.clone();
}

// the ocean is endless — when a shark's hunting ground falls too far behind
// the player, it quietly moves to a new patch of sea nearby (never on top of you)
function relocateShark(s, px, pz) {
  const a = rand(0, Math.PI * 2), d = rand(45, 85);
  s.home.set(px + Math.cos(a) * d, 5, pz + Math.sin(a) * d);
  if (s.mesh.position.distanceTo(new THREE.Vector3(px, s.mesh.position.y, pz)) > 130) {
    s.mesh.position.set(s.home.x, rand(3, 7), s.home.z);
  }
  s.target = pickPatrolTarget(s);
}

// ----------------------------- friendly sea creatures -----------------------------
const friends = []; // { group, update(t, dt) }

// Ollie the octopus
function makeOctopus(x, z, color) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.3, 18, 16), mat(color));
  head.scale.y = 1.15;
  head.position.y = 1.2;
  g.add(head);
  // kawaii face on the front of the head (+z side)
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), mat(0xffffff, { roughness: 0.25 }));
    white.position.set(side * 0.55, 1.35, 1.05);
    g.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10), mat(0x2b2b3d));
    pupil.position.set(side * 0.55, 1.35, 1.28);
    g.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(side * 0.48, 1.47, 1.42);
    g.add(shine);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), mat(0xff9eb5, { roughness: 1 }));
    cheek.scale.y = 0.6;
    cheek.position.set(side * 0.95, 1.0, 0.95);
    g.add(cheek);
  }
  // tiny happy mouth
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 6, 12, Math.PI), mat(0x883344));
  smile.position.set(0, 1.08, 1.28);
  smile.rotation.z = Math.PI;
  g.add(smile);
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.6, 4, 8), mat(color));
    t.position.set(Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8);
    t.rotation.z = Math.cos(a) * 0.5;
    t.rotation.x = -Math.sin(a) * 0.5;
    g.add(t);
    tentacles.push({ mesh: t, angle: a });
  }
  g.position.set(x, 2.2, z);
  scene.add(g);
  const home = new THREE.Vector3(x, 2.2, z);
  friends.push({
    group: g,
    update(t, dt) {
      g.position.x = home.x + Math.sin(t * 0.3) * 6;
      g.position.z = home.z + Math.cos(t * 0.22) * 6;
      g.position.y = home.y + Math.sin(t * 0.8) * 0.6;
      g.rotation.y = Math.atan2(Math.cos(t * 0.3) * 0.3 * 6, -Math.sin(t * 0.22) * 0.22 * 6) + Math.PI / 2;
      for (const tn of tentacles) {
        tn.mesh.rotation.z = Math.cos(tn.angle) * (0.5 + Math.sin(t * 3 + tn.angle) * 0.2);
        tn.mesh.rotation.x = -Math.sin(tn.angle) * (0.5 + Math.sin(t * 3 + tn.angle + 1) * 0.2);
      }
    },
    recycle(x2, z2) { home.x = x2; home.z = z2; },
  });
}
makeOctopus(-20, 0, 0xc678dd);
makeOctopus(40, -50, 0xff8fab);

// jellyfish that gently pulse up and down
function makeJellyfish(x, z, color) {
  const g = new THREE.Group();
  const bellMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.7, roughness: 0.3 });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), bellMat);
  g.add(bell);
  // sweet sleepy face under the bell rim
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat(0x2b2b3d));
    eye.position.set(side * 0.3, -0.05, 0.75);
    g.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(side * 0.27, 0.01, 0.82);
    g.add(shine);
  }
  const jSmile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 6, 10, Math.PI), mat(0x883344));
  jSmile.position.set(0, -0.18, 0.78);
  jSmile.rotation.z = Math.PI;
  g.add(jSmile);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat(0xff9eb5, { roughness: 1 }));
    cheek.scale.y = 0.6;
    cheek.position.set(side * 0.5, -0.12, 0.62);
    g.add(cheek);
  }
  const strands = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 1.4, 3, 6), bellMat);
    s.position.set(Math.cos(a) * 0.4, -0.8, Math.sin(a) * 0.4);
    g.add(s);
    strands.push(s);
  }
  const baseY = rand(8, 16);
  g.position.set(x, baseY, z);
  scene.add(g);
  const phase = rand(0, Math.PI * 2);
  friends.push({
    group: g,
    update(t) {
      g.position.y = baseY + Math.sin(t * 0.9 + phase) * 2.2;
      const squish = 1 + Math.sin(t * 2.4 + phase) * 0.15;
      bell.scale.set(squish, 2 - squish, squish);
    },
    recycle(x2, z2) { g.position.x = x2; g.position.z = z2; },
  });
}
[[-35, -70, 0xa0e7ff], [55, 40, 0xffb3f0], [-70, 35, 0xc8ffd4], [20, -20, 0xfff3a0]].forEach(
  ([x, z, c]) => makeJellyfish(x, z, c)
);

// a slow happy sea turtle
function makeTurtle(x, z) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), mat(0x3f8f5f));
  shell.scale.set(1.2, 0.6, 1);
  g.add(shell);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat(0x7ccf8f));
  head.position.set(1.35, 0.1, 0);
  g.add(head);
  for (const side of [-1, 1]) addKawaiiEye(g, 1.55, 0.3, side * 0.22, 0.13);
  addBlush(g, 1.62, 0.02, 0.34, 0.09);
  const flippers = [];
  for (const [fx, fz] of [[0.7, 0.9], [0.7, -0.9], [-0.7, 0.9], [-0.7, -0.9]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mat(0x7ccf8f));
    f.scale.set(1.4, 0.3, 0.7);
    f.position.set(fx, -0.15, fz);
    g.add(f);
    flippers.push(f);
  }
  g.position.set(x, rand(5, 10), z);
  scene.add(g);
  const radius = rand(18, 28);
  let cx = x, cz = z;
  const phase = rand(0, Math.PI * 2), speed = rand(0.08, 0.14);
  friends.push({
    group: g,
    update(t) {
      const a = t * speed + phase;
      g.position.x = cx + Math.cos(a) * radius;
      g.position.z = cz + Math.sin(a) * radius;
      g.rotation.y = -a - Math.PI / 2;
      for (let i = 0; i < flippers.length; i++) flippers[i].rotation.z = Math.sin(t * 3 + i) * 0.4;
    },
    recycle(x2, z2) { cx = x2; cz = z2; },
  });
}
makeTurtle(0, 0);
makeTurtle(-40, 50);

// a big gentle whale slowly circling high above the reef
{
  const g = new THREE.Group();
  const color = 0x8fc1e8;
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mat(color));
  body.scale.set(3.6, 1.6, 1.5);
  g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.97, 24, 18), mat(0xeaf6ff));
  belly.scale.set(3.45, 1.45, 1.35);
  belly.position.y = -0.35;
  g.add(belly);
  const fluke = makeTailFin(color, 1.9);
  fluke.rotation.x = Math.PI / 2; // whale tails are horizontal
  fluke.position.set(-3.7, 0.2, 0);
  g.add(fluke);
  for (const side of [-1, 1]) {
    const flipper = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), mat(color));
    flipper.scale.set(1.6, 0.3, 0.8);
    flipper.position.set(0.8, -0.9, side * 1.3);
    flipper.rotation.z = -0.3;
    g.add(flipper);
    addKawaiiEye(g, 2.4, 0.35, side * 1.05, 0.32);
  }
  addBlush(g, 2.7, -0.1, 1.25, 0.2);
  const whaleSmile = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 14, Math.PI), mat(0x33202a));
  whaleSmile.position.set(3.35, -0.25, 0);
  whaleSmile.rotation.y = Math.PI / 2;
  whaleSmile.rotation.z = Math.PI;
  g.add(whaleSmile);
  scene.add(g);
  let wcx = 0, wcz = 0;
  friends.push({
    group: g,
    update(t) {
      const a = t * 0.045;
      g.position.set(wcx + Math.cos(a) * 58, 17 + Math.sin(t * 0.4) * 1.5, wcz + Math.sin(a) * 58);
      g.rotation.y = -a - Math.PI / 2;
      fluke.rotation.z = Math.sin(t * 1.2) * 0.25; // slow happy fluke flaps
    },
    recycle(x2, z2) { wcx = x2; wcz = z2; },
  });
}

// seahorses bobbing near their favorite coral
function makeSeahorse(x, z, color) {
  const g = new THREE.Group();
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), mat(color));
  belly.scale.set(0.8, 1.2, 0.7);
  g.add(belly);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat(color));
  head.position.set(0.12, 0.72, 0);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.45, 8), mat(color));
  snout.rotation.z = -Math.PI / 2.3;
  snout.position.set(0.42, 0.66, 0);
  g.add(snout);
  const crest = makeDorsalFin(color, 0.4);
  crest.rotation.z = -0.5;
  crest.position.set(-0.15, 0.95, 0);
  g.add(crest);
  // curly tail
  const curl = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.09, 8, 14, 4.6), mat(color));
  curl.position.set(0.05, -0.62, 0);
  curl.rotation.z = 2.4;
  g.add(curl);
  for (const side of [-1, 1]) addKawaiiEye(g, 0.28, 0.78, side * 0.18, 0.1);
  g.position.set(x, 2.2, z);
  scene.add(g);
  const phase = rand(0, Math.PI * 2);
  friends.push({
    group: g,
    update(t) {
      const baseY = floorY(g.position.x, g.position.z) + 2.2;
      g.position.y = baseY + Math.sin(t * 1.3 + phase) * 0.7;
      g.rotation.y = Math.sin(t * 0.4 + phase) * 0.9;
    },
    recycle(x2, z2) { g.position.x = x2; g.position.z = z2; },
  });
}
makeSeahorse(-52, 55, 0xffd43b);
makeSeahorse(62, -50, 0xff9ecd);
makeSeahorse(-70, -5, 0x9df9ef);

// little crabs scuttling sideways on the sand
function makeCrab(x, z, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), mat(color));
  body.scale.set(1.2, 0.7, 1);
  body.position.y = 0.45;
  g.add(body);
  const legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 3, 6), mat(color));
      leg.position.set((i - 1) * 0.35, 0.25, side * 0.6);
      leg.rotation.x = side * 0.9;
      g.add(leg);
      legs.push(leg);
    }
    const claw = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat(color));
    claw.position.set(0.6, 0.45, side * 0.35);
    g.add(claw);
    // eyes on little stalks
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), mat(color));
    stalk.position.set(0.35, 0.85, side * 0.2);
    g.add(stalk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0xffffff, { roughness: 0.25 }));
    eye.position.set(0.35, 1.02, side * 0.2);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(0x2b2b3d));
    pupil.position.set(0.42, 1.04, side * 0.2);
    g.add(pupil);
  }
  addBlush(g, 0.5, 0.35, 0.5, 0.09);
  g.position.set(x, floorY(x, z), z);
  scene.add(g);
  const phase = rand(0, Math.PI * 2), range = rand(4, 8);
  let hz = z;
  friends.push({
    group: g,
    update(t) {
      g.position.z = hz + Math.sin(t * 0.6 + phase) * range; // scuttle sideways!
      g.position.y = floorY(g.position.x, g.position.z); // stay on the dunes
      for (let i = 0; i < legs.length; i++) legs[i].rotation.z = Math.sin(t * 8 + i * 1.3) * 0.25;
    },
    recycle(x2, z2) { g.position.x = x2; hz = z2; },
  });
}
makeCrab(15, 55, 0xff6b6b);
makeCrab(-45, -20, 0xff9671);
makeCrab(50, 30, 0xffa8a8);
makeCrab(-10, -60, 0xff8787);

// clownfish circling their anemone homes
for (const spot of anemoneSpots.slice(0, 4)) {
  const nemo = makeFish(0xff7f2a, 0xffffff, 0.35).group;
  scene.add(nemo);
  const home = { x: spot.x, z: spot.z };
  const phase = rand(0, Math.PI * 2), r = rand(1.6, 2.4), speed = rand(0.8, 1.4);
  friends.push({
    group: nemo,
    update(t) {
      const a = t * speed + phase;
      const y = floorY(home.x, home.z) + 1.4;
      nemo.position.set(home.x + Math.cos(a) * r, y + Math.sin(t * 2 + phase) * 0.3, home.z + Math.sin(a) * r);
      nemo.rotation.y = -a - Math.PI / 2;
    },
    recycle(x2, z2) { home.x = x2; home.z = z2; },
  });
}

// a school of tiny neutral fish swimming in a lazy circle
{
  const school = new THREE.Group();
  const minis = [];
  for (let i = 0; i < 14; i++) {
    const mini = makeFish([0x59d4ff, 0xffd93d, 0x7dff8a, 0xff8fab][i % 4], 0xffffff, 0.35).group;
    mini.position.set(rand(-3, 3), rand(-1.5, 1.5), rand(-3, 3));
    school.add(mini);
    minis.push(mini);
  }
  scene.add(school);
  let scx = 0, scz = 0;
  friends.push({
    group: school,
    update(t) {
      const a = t * 0.18;
      school.position.set(scx + Math.cos(a) * 45, 9 + Math.sin(t * 0.5) * 2, scz + Math.sin(a) * 45);
      school.rotation.y = -a - Math.PI / 2;
      for (let i = 0; i < minis.length; i++) minis[i].position.y = Math.sin(t * 2 + i) * 0.4 + (i % 3) - 1;
    },
    recycle(x2, z2) { scx = x2; scz = z2; },
  });
}

// ----------------------------- HUD & game state -----------------------------
const hudLives = document.getElementById('lives');
const hudGems = document.getElementById('gems');
const gemSlots = hudGems.querySelectorAll('.gem-slot');
const powerupEl = document.getElementById('powerup');
const dangerEl = document.getElementById('danger');
const hiddenBadge = document.getElementById('hidden-badge');
const messageEl = document.getElementById('message');
const startBtn = document.getElementById('start-btn');

const hudLevel = document.getElementById('level');

const state = {
  running: false,
  lives: 3,
  level: 1,
  score: 0,              // +100 per gem, +500 per crown; one run = menu start → game over
  fishName: 'Little Fish',
  gemsCollected: 0,
  speedBoost: false,     // 1st gem
  scareTimer: 0,         // 2nd gem: a dragon scares the sharks away
  sparkles: false,       // 3rd gem
  invulnerable: 0,
  gameOver: false,
  shake: 0,              // camera shake after a chomp
  rollTimer: 0,          // happy barrel roll after a gem
  chestPhase: null,      // null | 'placed' | 'opening' | 'crown'
  chestTimer: 0,
  finale: false,         // grand finale: hunt the bedazzled octopus
};

function updateHud() {
  hudLives.textContent = '❤️'.repeat(state.lives) + '🖤'.repeat(4 - state.lives);
  hudLevel.textContent = state.finale
    ? `🐙 FINAL! · ${state.score}`
    : `⭐ Level ${state.level} · ${state.score}`;
  gemSlots.forEach((slot, i) => slot.classList.toggle('got', i < state.gemsCollected));
}

// ----------------------------- leaderboard -----------------------------
// Scores go to Supabase when leaderboard-config.js is filled in; they are
// always also kept in localStorage so the leaderboard works offline too.
const sbOverride = window.__SUPABASE__ || {}; // test hook
const SB_URL = sbOverride.url !== undefined ? sbOverride.url : SUPABASE_URL;
const SB_KEY = sbOverride.key !== undefined ? sbOverride.key : SUPABASE_ANON_KEY;
const lbOnline = !!(SB_URL && SB_KEY);
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

function localScores() {
  try { return JSON.parse(localStorage.getItem('localScores') || '[]'); } catch (e) { return []; }
}
function saveLocalScore(name, score, level) {
  const list = localScores();
  const mine = list.find(r => r.name === name);
  if (mine) {
    mine.score = Math.max(mine.score, score);
    mine.level = Math.max(mine.level, level);
  } else {
    list.push({ name, score, level });
  }
  list.sort((a, b) => b.score - a.score);
  localStorage.setItem('localScores', JSON.stringify(list.slice(0, 25)));
}

function submitScore() {
  const { fishName: name, score, level } = state;
  if (score <= 0) return;
  saveLocalScore(name, score, level);
  if (!lbOnline) return;
  fetch(`${SB_URL}/rest/v1/shark_scores`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({ name, score, level }),
  }).catch(() => { /* offline is fine — the local copy is already saved */ });
}

async function fetchTopScores() {
  if (lbOnline) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/shark_top_scores?select=name,score,level&limit=10`, { headers: sbHeaders });
      if (res.ok) return { rows: await res.json(), online: true };
    } catch (e) { /* fall through to local */ }
  }
  return { rows: localScores().slice(0, 10), online: false };
}

const lbEl = document.getElementById('leaderboard');
const lbListEl = document.getElementById('lb-list');
const lbSourceEl = document.getElementById('lb-source');
async function showLeaderboard() {
  lbEl.classList.add('show');
  lbListEl.innerHTML = '<li class="lb-empty">Loading…</li>';
  lbSourceEl.textContent = '';
  const { rows, online } = await fetchTopScores();
  const medals = ['🥇', '🥈', '🥉'];
  lbListEl.innerHTML = rows.length
    ? rows.map((r, i) =>
        `<li><span>${medals[i] || (i + 1) + '.'}</span>` +
        `<span class="lb-name">${String(r.name).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</span>` +
        `<span class="lb-lvl">Lv ${r.level}</span><span class="lb-pts">${r.score}</span></li>`).join('')
    : '<li class="lb-empty">No scores yet — go collect some gems! 💎</li>';
  lbSourceEl.textContent = online
    ? '🌍 Online leaderboard'
    : lbOnline ? '📴 Offline — showing scores from this device' : '📱 Scores from this device';
}
document.getElementById('lb-btn').addEventListener('click', showLeaderboard);
document.getElementById('lb-close').addEventListener('click', () => lbEl.classList.remove('show'));

// ---------- pick-your-fish (start screen only; choice is remembered) ----------
const nameInputEl = document.getElementById('fish-name');
let fishColorIdx = parseInt(localStorage.getItem('fishColor') || '0', 10);
if (!(fishColorIdx >= 0 && fishColorIdx < FISH_COLORS.length)) fishColorIdx = 0;
function applyFishColors() {
  const c = FISH_COLORS[fishColorIdx];
  playerParts.body.material.color.set(c.body);
  playerParts.fins.forEach(f => f.material.color.set(c.fin));
}
{
  const swatchesEl = document.getElementById('swatches');
  FISH_COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'swatch' + (i === fishColorIdx ? ' sel' : '');
    sw.style.background = `linear-gradient(135deg, #${c.body.toString(16).padStart(6, '0')}, #${c.fin.toString(16).padStart(6, '0')})`;
    sw.addEventListener('click', () => {
      fishColorIdx = i;
      localStorage.setItem('fishColor', String(i));
      applyFishColors();
      swatchesEl.querySelectorAll('.swatch').forEach((el, j) => el.classList.toggle('sel', j === i));
    });
    swatchesEl.appendChild(sw);
  });
  if (nameInputEl) nameInputEl.value = localStorage.getItem('fishName') || '';
  applyFishColors();
}

let powerupTimeout = null;
function showPowerup(text, ms = 3200) {
  powerupEl.innerHTML = text;
  powerupEl.classList.add('show');
  clearTimeout(powerupTimeout);
  powerupTimeout = setTimeout(() => powerupEl.classList.remove('show'), ms);
}

function showMessage(title, lines, buttonText, onClick) {
  hiddenBadge.classList.remove('show');
  powerupEl.classList.remove('show');
  dangerEl.style.opacity = 0;
  messageEl.innerHTML =
    `<h1>${title}</h1>` + lines.map(l => `<p>${l}</p>`).join('') +
    `<button id="msg-btn">${buttonText}</button>` +
    `<button id="msg-lb-btn" class="secondary">🏆 High Scores</button>`;
  messageEl.classList.add('show');
  document.getElementById('msg-btn').addEventListener('click', onClick);
  document.getElementById('msg-lb-btn').addEventListener('click', showLeaderboard);
}

function resetGame(level = 1, keepScore = false) {
  // iOS/Android only allow sound after a user gesture — the start tap is one
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* sound is optional */ }
  state.running = true;
  state.lives = 4;
  state.level = level;
  if (!keepScore) state.score = 0; // a new run starts fresh; level-ups keep the streak
  state.gemsCollected = 0;
  state.speedBoost = false;
  state.scareTimer = 0;
  dragon.visible = false;
  state.sparkles = false;
  state.invulnerable = 0;
  state.gameOver = false;
  state.shake = 0;
  state.rollTimer = 0;
  state.chestPhase = null;
  state.finale = false;
  bedazzled.group.visible = false;
  bedazzled.found = false;
  chest.visible = false;
  chest.userData.glow.intensity = 0;
  chestLid.rotation.x = 0;
  crown.visible = false;
  player.remove(crown);
  player.position.copy(START_POS);
  player.rotation.y = START_YAW;
  ensureChunksAround(player.position.x, player.position.z);
  spawnGemsForLevel(player.position.x, player.position.z);
  const cfg = levelCfg(level);
  sharks.forEach((s, i) => {
    s.active = i < cfg.sharkCount;
    s.mesh.visible = s.active;
    s.state = 'patrol';
    s.spin = 0;
    s.mesh.rotation.x = 0;
    relocateShark(s, player.position.x, player.position.z);
    s.mesh.position.copy(s.home);
    s.mesh.userData.scared.visible = false;
  });
  updateHud();
  messageEl.classList.remove('show');
  showPowerup(`🌊 Go, ${state.fishName}! Level ${level} — find the 4 gems! 💎`);
}

startBtn.addEventListener('click', () => {
  state.fishName = (nameInputEl && nameInputEl.value.trim().slice(0, 14)) || 'Little Fish';
  localStorage.setItem('fishName', state.fishName === 'Little Fish' ? '' : state.fishName);
  resetGame(1);
});

// ----------------------------- input -----------------------------
const keys = {};
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return; // let the name box have its letters
  keys[e.code] = true;
  if ([ 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight' ].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// touch joystick
const joy = { active: false, dx: 0, dy: 0, up: false, down: false };
{
  const joyEl = document.getElementById('joystick');
  const knob = joyEl.querySelector('.knob');
  let joyId = null;
  const center = () => {
    const r = joyEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  joyEl.addEventListener('touchstart', e => {
    joyId = e.changedTouches[0].identifier;
    joy.active = true;
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (joyId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const c = center();
      const dx = clamp((t.clientX - c.x) / 45, -1, 1);
      const dy = clamp((t.clientY - c.y) / 45, -1, 1);
      joy.dx = dx; joy.dy = dy;
      knob.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
    }
  }, { passive: true });
  window.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      joyId = null; joy.active = false; joy.dx = 0; joy.dy = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    }
  });
  for (const [id, prop] of [['btn-up', 'up'], ['btn-down', 'down']]) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); joy[prop] = true; });
    el.addEventListener('touchend', () => { joy[prop] = false; });
  }
}

// ----------------------------- gem powers -----------------------------
function collectGem(gem) {
  gem.collected = true;
  gem.mesh.visible = false;
  state.gemsCollected++;
  state.score += 100;
  updateHud();
  sfx.gem();
  sparkleBurst(gem.mesh.position, gem.mesh.material.color);
  state.rollTimer = 0.7; // happy barrel roll!

  if (state.gemsCollected === 1) {
    state.speedBoost = true;
    showPowerup('💎 First gem! ⚡ You can swim SUPER FAST now!');
  } else if (state.gemsCollected === 2) {
    summonDragon();
    showPowerup(`💎 Second gem! 🐉 A dragon scared the sharks away — ${SCARE_DURATION} second head start!`);
  } else if (state.gemsCollected === 3) {
    state.sparkles = true;
    showPowerup('💎 Third gem! ✨ You leave a sparkle trail! One more to go!');
  } else if (state.gemsCollected >= 4) {
    placeChest();
  }
}

// all 4 gems → a treasure chest appears; swim to it for the crown!
function placeChest() {
  const dir = new THREE.Vector3(Math.cos(player.rotation.y), 0, -Math.sin(player.rotation.y));
  chest.position.copy(player.position).addScaledVector(dir, 14);
  chest.position.y = floorY(chest.position.x, chest.position.z);
  chest.rotation.y = Math.atan2(player.position.x - chest.position.x, player.position.z - chest.position.z);
  chest.visible = true;
  state.chestPhase = 'placed';
  showPowerup('💎 All 4 gems! A treasure chest appeared — follow the sparkles! ✨', 5000);
}

// the crown is on your head — level up and keep swimming, no menus in an endless ocean
function levelUp() {
  state.score += 500; // crown bonus!
  state.level++;
  state.gemsCollected = 0;
  chest.visible = false;
  chest.userData.glow.intensity = 0;
  chestLid.rotation.x = 0;
  submitScore();
  sfx.win();
  const cfg = levelCfg(state.level);
  sharks.forEach((s, i) => {
    const wasActive = s.active;
    s.active = i < cfg.sharkCount;
    s.mesh.visible = s.active;
    if (s.active && !wasActive) relocateShark(s, player.position.x, player.position.z);
    if (s.state === 'chase') { s.state = 'patrol'; s.target = pickPatrolTarget(s); }
  });
  if (state.level > FINAL_GEM_LEVEL) {
    // grand finale: no more gems — hunt down the bedazzled octopus!
    state.finale = true;
    gems.forEach(g => { g.collected = true; g.mesh.visible = false; });
    placeBedazzledNear(player.position.x, player.position.z);
    updateHud();
    showPowerup(
      `🎉 FINAL CHALLENGE! 👑 +500 points!<br>` +
      `Now find the 💎 BEDAZZLED OCTOPUS 🐙 — an octopus covered in gems! Follow the sparkles, ${state.fishName}!`,
      8000
    );
  } else {
    spawnGemsForLevel(player.position.x, player.position.z);
    updateHud();
    showPowerup(
      `🎉 LEVEL ${state.level}! 👑 +500 points!<br>` +
      `${cfg.sharkCount} sharks now, and 4 new gems just appeared — keep swimming, ${state.fishName}!`,
      6000
    );
  }
}

// reaching the bedazzled octopus wins the whole adventure
function findBedazzled() {
  bedazzled.found = true;
  bedazzled.group.visible = false;
  state.finale = false;
  state.score += 2000; // grand prize!
  state.running = false;
  state.gameOver = true;
  updateHud();
  submitScore();
  sfx.win();
  sparkleBurst(player.position, 0xffd93d);
  showMessage(
    '🐙✨ YOU DID IT! ✨🐙',
    [`${state.fishName} found the BEDAZZLED OCTOPUS! 💎`,
     `You beat all ${FINAL_GEM_LEVEL} levels AND the final challenge!`,
     `Final score: <b>${state.score}</b> 👑`],
    'Play Again! 🌊',
    () => resetGame(1)
  );
}

function loseLife(chompingShark) {
  if (state.invulnerable > 0 || !state.running) return;
  state.lives--;
  updateHud();
  sfx.hit();
  state.shake = 0.6; // camera shake!
  if (chompingShark) chompingShark.spin = 1; // the shark does a proud barrel roll
  if (state.lives <= 0) {
    state.running = false;
    state.gameOver = true;
    submitScore();
    sfx.lose();
    showMessage(
      '🦈 Chomp! Game Over',
      [`The sharks got ${state.fishName} this time…`,
       `Final score: <b>${state.score}</b> ✨`,
       'But brave fish always try again!'],
      `Try Level ${state.level} Again! 💪`,
      () => resetGame(state.level)
    );
    return;
  }
  // stay where you are with a safety bubble — the chasing sharks swim off to sulk
  state.invulnerable = 3;
  sharks.forEach(s => {
    if (s.state === 'chase') {
      s.state = 'patrol';
      relocateShark(s, player.position.x, player.position.z);
      // nudge the biter itself well out of chomping range
      const away = new THREE.Vector3().subVectors(s.mesh.position, player.position).setY(0).normalize();
      s.mesh.position.copy(player.position).addScaledVector(away, 45);
      s.mesh.position.y = clamp(s.mesh.position.y, 3, CEILING_Y - 2);
    }
  });
  showPowerup(state.lives > 1
    ? `💔 Ouch! ${state.lives} lives left — hide behind the coral!`
    : '💔 Careful! Last life!');
}

// ----------------------------- main loop -----------------------------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
let camYaw = START_YAW; // follows the player's heading smoothly
let playerBank = 0;     // turn-banking, kept separate so barrel rolls can stack on top

let worldTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const px = player.position.x, pz = player.position.z;

  // ---------- the endless ocean follows the player ----------
  sandTile.position.x = snapToTile(px);
  sandTile.position.z = snapToTile(pz);
  causticTile.position.x = sandTile.position.x;
  causticTile.position.z = sandTile.position.z;
  skyDome.position.set(px, 0, pz);
  waterSurface.position.x = px;
  waterSurface.position.z = pz;
  sun.position.set(px + 40, 80, pz + 20);
  sun.target.position.set(px, 0, pz);

  worldTimer -= dt;
  if (worldTimer <= 0) {
    worldTimer = 0.8;
    ensureChunksAround(px, pz);
    // creatures and sharks left far behind quietly move to fresh water nearby
    for (const f of friends) {
      if (f.recycle && Math.hypot(f.group.position.x - px, f.group.position.z - pz) > 170) {
        const a = rand(0, Math.PI * 2), d = rand(60, 120);
        f.recycle(px + Math.cos(a) * d, pz + Math.sin(a) * d);
      }
    }
    for (const s of sharks) {
      if (s.active && Math.hypot(s.home.x - px, s.home.z - pz) > 150) relocateShark(s, px, pz);
    }
    // gems too — the treasure never gets lost over the horizon
    if (state.running) {
      for (const g of gems) {
        if (!g.collected && Math.hypot(g.mesh.position.x - px, g.mesh.position.z - pz) > 170) {
          placeGemNear(g, px, pz);
        }
      }
    }
  }

  // ambient world animation (always on, even on menus — it's cute)
  for (const f of friends) f.update(t, dt);
  for (const b of bubbles) {
    b.position.y += b.userData.speed * dt;
    if (b.position.y > CEILING_Y + 2) b.position.y = 0;
    if (b.position.x - px > 95) b.position.x -= 190; else if (px - b.position.x > 95) b.position.x += 190;
    if (b.position.z - pz > 95) b.position.z -= 190; else if (pz - b.position.z > 95) b.position.z += 190;
  }
  for (const ray of sunRays) {
    // drifted out of view? fade to a fresh random spot so rays never stack up
    if (Math.hypot(ray.position.x - px, ray.position.z - pz) > 110) {
      const a = rand(0, Math.PI * 2), d = rand(25, 90);
      ray.position.x = px + Math.cos(a) * d;
      ray.position.z = pz + Math.sin(a) * d;
    }
  }
  for (const c of coralClusters) {
    for (const child of c.group.children) {
      if (child.userData.sway !== undefined) child.rotation.z = Math.sin(t * 1.4 + child.userData.sway) * 0.18;
    }
  }
  for (const a of anemones) {
    const wave = Math.sin(t * 2 + a.phase) * 0.12;
    for (const tn of a.tents) {
      tn.mesh.rotation.z = tn.baseZ + Math.cos(tn.angle) * wave;
      tn.mesh.rotation.x = tn.baseX - Math.sin(tn.angle) * wave;
    }
  }
  for (const g of gems) {
    if (g.collected) continue;
    g.mesh.rotation.y += dt * 1.5;
    g.mesh.position.y = g.baseY + Math.sin(t * 2 + g.baseY) * 0.5;
  }
  // sparkle bursts fly out, drift down, and fade
  for (const p of burstPool) {
    if (p.userData.life > 0) {
      p.userData.life -= dt * 1.4;
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.y -= dt * 2;
      p.rotation.y += dt * 8;
      p.material.opacity = Math.max(p.userData.life, 0);
      if (p.userData.life <= 0) p.visible = false;
    }
  }
  // the waiting chest twinkles so it's easy to spot
  if (chest.visible && state.chestPhase === 'placed') {
    chest.userData.glow.intensity = 8 + Math.sin(t * 3) * 5;
  }
  // caustic light dances across the sand
  causticTex.offset.set(t * 0.012, Math.sin(t * 0.35) * 0.03);
  // sun rays gently pulse
  for (const ray of sunRays) {
    ray.material.opacity = 0.045 + Math.sin(t * 0.6 + ray.userData.phase) * 0.02;
    ray.rotation.y = t * 0.05 + ray.userData.phase;
  }
  // marine snow drifts down and wraps around the player
  for (let i = 0; i < snowPositions.length; i += 3) {
    snowPositions[i] += Math.sin(t * 0.5 + i) * dt * 0.15;
    snowPositions[i + 1] -= dt * 0.35;
    if (snowPositions[i + 1] < 0) snowPositions[i + 1] = CEILING_Y;
    if (snowPositions[i] - px > 95) snowPositions[i] -= 190; else if (px - snowPositions[i] > 95) snowPositions[i] += 190;
    if (snowPositions[i + 2] - pz > 95) snowPositions[i + 2] -= 190; else if (pz - snowPositions[i + 2] > 95) snowPositions[i + 2] += 190;
  }
  snowPoints.geometry.attributes.position.needsUpdate = true;
  if (!state.running) compassDots.forEach(d2 => { d2.visible = false; });

  if (state.running) {
    // ---------- player movement ----------
    const baseSpeed = state.speedBoost ? 16 : 10;
    const turnSpeed = 2.6;

    let forward = 0, turn = 0, vertical = 0;
    if (keys['KeyW'] || keys['ArrowUp']) forward += 1;
    if (keys['KeyS'] || keys['ArrowDown']) forward -= 0.6;
    if (keys['KeyA'] || keys['ArrowLeft']) turn += 1;
    if (keys['KeyD'] || keys['ArrowRight']) turn -= 1;
    if (keys['Space']) vertical += 1;
    if (keys['ShiftLeft'] || keys['ShiftRight']) vertical -= 1;
    if (joy.active) {
      forward += clamp(-joy.dy, -0.6, 1);
      turn -= joy.dx;
    }
    if (joy.up) vertical += 1;
    if (joy.down) vertical -= 1;

    player.rotation.y += turn * turnSpeed * dt;
    const dir = new THREE.Vector3(Math.cos(player.rotation.y), 0, -Math.sin(player.rotation.y));
    player.position.addScaledVector(dir, forward * baseSpeed * dt); // no walls — the ocean is endless
    const seabed = floorY(player.position.x, player.position.z) + 1.0;
    player.position.y = clamp(player.position.y + vertical * baseSpeed * 0.7 * dt, seabed, CEILING_Y);

    // wiggle the tail while swimming, pitch when climbing/diving, bank into turns
    playerParts.tail.rotation.y = Math.sin(t * (Math.abs(forward) > 0.05 ? 14 : 5)) * 0.5;
    player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, vertical * 0.35, 0.12);
    playerBank = THREE.MathUtils.lerp(playerBank, -turn * 0.25, 0.1);
    let rollAngle = 0;
    if (state.rollTimer > 0) { // happy barrel roll after grabbing a gem
      state.rollTimer -= dt;
      rollAngle = (1 - Math.max(state.rollTimer, 0) / 0.7) * Math.PI * 2;
    }
    player.rotation.x = playerBank + rollAngle;

    // invulnerability bubble
    if (state.invulnerable > 0) {
      state.invulnerable -= dt;
      shield.visible = true;
      shield.material.opacity = 0.15 + Math.sin(t * 10) * 0.1;
    } else {
      shield.visible = false;
    }

    // sparkle trail
    if (state.sparkles && Math.abs(forward) > 0.05) {
      const s = trail.find(x => x.life <= 0);
      if (s) {
        s.life = 1;
        s.mesh.visible = true;
        s.mesh.position.copy(player.position).addScaledVector(dir, -1.6);
        s.mesh.position.y += rand(-0.4, 0.4);
      }
    }
    for (const s of trail) {
      if (s.life > 0) {
        s.life -= dt * 1.2;
        s.mesh.material.opacity = Math.max(s.life, 0);
        s.mesh.rotation.y += dt * 6;
        s.mesh.position.y += dt * 0.5;
        if (s.life <= 0) s.mesh.visible = false;
      }
    }

    // ---------- hiding ----------
    const hidden = isHiddenAt(player.position);
    hiddenBadge.classList.toggle('show', hidden);

    // ---------- gems ----------
    for (const g of gems) {
      if (!g.collected && player.position.distanceTo(g.mesh.position) < 2.6) collectGem(g);
    }

    // ---------- bedazzled octopus (grand finale) ----------
    if (state.finale && !bedazzled.found) {
      const bg = bedazzled.group;
      // wiggle, bob, and sparkle in place
      bg.position.y = floorY(bg.position.x, bg.position.z) + 3 + Math.sin(t * 1.2) * 0.4;
      bg.rotation.y += dt * 0.5;
      for (const tn of bedazzled.tentacles) {
        tn.mesh.rotation.z = Math.cos(tn.angle) * (0.5 + Math.sin(t * 3 + tn.angle) * 0.25);
        tn.mesh.rotation.x = -Math.sin(tn.angle) * (0.5 + Math.sin(t * 3 + tn.angle + 1) * 0.25);
      }
      // keep it from disappearing over the horizon if the player wanders off
      if (Math.hypot(bg.position.x - px, bg.position.z - pz) > 170) placeBedazzledNear(px, pz);
      if (player.position.distanceTo(bg.position) < 3.5) findBedazzled();
    }

    // ---------- treasure chest finale ----------
    if (state.chestPhase === 'placed') {
      // horizontal distance only — the chest should open even if you hover above it
      const dxz = Math.hypot(player.position.x - chest.position.x, player.position.z - chest.position.z);
      if (dxz < 4.5) {
        state.chestPhase = 'opening';
        state.chestTimer = 0;
        sfx.nap();
      }
    } else if (state.chestPhase === 'opening') {
      state.invulnerable = Math.max(state.invulnerable, 0.5); // no chomps mid-celebration
      state.chestTimer += dt;
      chestLid.rotation.x = -Math.min(state.chestTimer / 0.8, 1) * 1.9;
      chest.userData.glow.intensity = Math.min(state.chestTimer / 0.8, 1) * 30;
      if (state.chestTimer >= 0.9) {
        state.chestPhase = 'crown';
        state.chestTimer = 0;
        scene.add(crown); // re-parent from the player's head back into the world
        crown.visible = true;
        crown.position.copy(chest.position).add(new THREE.Vector3(0, 1.2, 0));
        sparkleBurst(crown.position, 0xffd43b);
      }
    } else if (state.chestPhase === 'crown') {
      state.invulnerable = Math.max(state.invulnerable, 0.5);
      state.chestTimer += dt;
      const k = Math.min(state.chestTimer / 1.2, 1);
      const headPos = player.position.clone().add(new THREE.Vector3(0, 1.1, 0));
      crown.position.lerpVectors(chest.position.clone().add(new THREE.Vector3(0, 1.2 + k * 3, 0)), headPos, k * k);
      crown.rotation.y += dt * 5;
      if (k >= 1) {
        // the crown lands on your head! 👑
        state.chestPhase = null;
        crown.rotation.set(0, 0, 0);
        crown.position.set(0.25, 1.05, 0);
        player.add(crown);
        sparkleBurst(headPos, 0xffd43b);
        levelUp();
      }
    }

    // ---------- compass sparkles: point to the next goal ----------
    {
      let goal = null, goalColor = 0xffffff;
      if (state.finale && !bedazzled.found) {
        goal = bedazzled.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        goalColor = 0xff6bd6;
      } else if (state.chestPhase) {
        goal = chest.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        goalColor = 0xffd43b;
      } else {
        let best = Infinity;
        for (const g of gems) {
          if (g.collected) continue;
          const d = player.position.distanceTo(g.mesh.position);
          if (d < best) { best = d; goal = g.mesh.position; goalColor = g.mesh.material.color.getHex(); }
        }
      }
      if (goal) {
        const toGoal = new THREE.Vector3().subVectors(goal, player.position);
        const dGoal = toGoal.length();
        toGoal.normalize();
        compassDots.forEach((d2, i) => {
          const along = 2.5 + i * 1.1;
          d2.visible = dGoal > 7; // hide when the goal is right there
          d2.position.copy(player.position).addScaledVector(toGoal, Math.min(along, dGoal - 1));
          d2.position.y += Math.sin(t * 4 + i) * 0.15;
          d2.rotation.y = t * 3 + i;
          d2.material.color.set(goalColor);
          d2.material.opacity = 0.9 - i * 0.12;
        });
      } else {
        compassDots.forEach(d2 => { d2.visible = false; });
      }
    }

    // ---------- dragon scare (2nd gem) ----------
    if (state.scareTimer > 0) {
      state.scareTimer -= dt;
      // the dragon circles protectively over the player, roaring
      const a = t * 1.1;
      dragon.position.x += ((player.position.x + Math.cos(a) * 12) - dragon.position.x) * Math.min(1, dt * 2);
      dragon.position.z += ((player.position.z + Math.sin(a) * 12) - dragon.position.z) * Math.min(1, dt * 2);
      dragon.position.y += ((player.position.y + 7) - dragon.position.y) * Math.min(1, dt * 2);
      dragon.rotation.y = -a - Math.PI / 2;
      const flap = Math.sin(t * 8) * 0.5;
      if (dragon.userData.wingL) { dragon.userData.wingL.rotation.x = 0.5 + flap; dragon.userData.wingR.rotation.x = -0.5 - flap; }
      dragon.userData.fire.scale.setScalar(0.8 + Math.sin(t * 20) * 0.3);
      dragon.userData.fire.material.opacity = 0.6 + Math.sin(t * 25) * 0.25;
      if (state.scareTimer <= 0) {
        sharks.forEach(s => {
          if (s.state === 'scared') { s.state = 'patrol'; relocateShark(s, player.position.x, player.position.z); s.mesh.userData.scared.visible = false; }
        });
        dragon.visible = false;
        showPowerup('🐉 The dragon flew home… the sharks are back!', 2500);
      }
    }

    let anyChasing = false;
    for (const s of sharks) {
      if (!s.active) continue;
      const toPlayer = player.position.distanceTo(s.mesh.position);

      // proud barrel roll after a successful chomp
      if (s.spin > 0) {
        s.spin -= dt;
        s.mesh.rotation.x = (1 - Math.max(s.spin, 0)) * Math.PI * 2;
      }

      if (s.state === 'scared') {
        // bolt straight away from the player as fast as possible!
        const flee = new THREE.Vector3().subVectors(s.mesh.position, player.position).setY(0);
        if (flee.lengthSq() < 0.01) flee.set(1, 0, 0);
        flee.normalize();
        s.mesh.position.addScaledVector(flee, s.speed * 1.6 * dt);
        s.mesh.position.y = clamp(s.mesh.position.y, floorY(s.mesh.position.x, s.mesh.position.z) + 2, CEILING_Y - 2);
        s.mesh.rotation.y = Math.atan2(flee.x, flee.z) - Math.PI / 2;
        s.mesh.userData.tail.rotation.y = Math.sin(t * 22) * 0.6; // frantic tail
        continue;
      }

      const canSeePlayer = !hidden && state.invulnerable <= 0 && toPlayer < 32;
      if (canSeePlayer) s.state = 'chase';
      else if (s.state === 'chase') { s.state = 'patrol'; s.target = pickPatrolTarget(s); }

      let target, speed;
      const mult = levelCfg(state.level).speedMult;
      if (s.state === 'chase') {
        anyChasing = true;
        target = player.position;
        speed = s.speed * mult * (state.speedBoost ? 1.15 : 1.25); // catchable, but the speed gem really helps
      } else {
        s.newTargetTimer -= dt;
        if (s.mesh.position.distanceTo(s.target) < 3 || s.newTargetTimer <= 0) {
          s.target = pickPatrolTarget(s);
          s.newTargetTimer = rand(4, 9);
        }
        target = s.target;
        speed = s.speed * mult * 0.55;
      }

      const dirToTarget = new THREE.Vector3().subVectors(target, s.mesh.position);
      const dist = dirToTarget.length();
      if (dist > 0.5) {
        dirToTarget.normalize();
        // sharks refuse to swim into coral hideouts — that's why hiding works!
        const nextPos = s.mesh.position.clone().addScaledVector(dirToTarget, speed * dt);
        if (nearestCoralDistance(nextPos) > 5.5) {
          s.mesh.position.copy(nextPos);
        } else {
          // slide sideways around the coral
          const side = new THREE.Vector3(-dirToTarget.z, 0, dirToTarget.x);
          s.mesh.position.addScaledVector(side, speed * dt);
        }
        s.mesh.position.y = clamp(s.mesh.position.y, floorY(s.mesh.position.x, s.mesh.position.z) + 2, CEILING_Y - 2);
        const targetYaw = Math.atan2(dirToTarget.x, dirToTarget.z) - Math.PI / 2;
        let dy = targetYaw - s.mesh.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        s.mesh.rotation.y += dy * Math.min(1, dt * 4);
      }
      s.mesh.userData.tail.rotation.y = Math.sin(t * (s.state === 'chase' ? 16 : 8)) * 0.5;

      if (toPlayer < 2.6 && !hidden) loseLife(s); // coral hideouts are always safe
    }
    dangerEl.style.opacity = anyChasing && state.invulnerable <= 0 ? 1 : 0;
  }

  // ---------- camera: smooth third-person follow ----------
  let dy = player.rotation.y - camYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  camYaw += dy * Math.min(1, dt * 3);
  const camOffset = new THREE.Vector3(-Math.cos(camYaw) * 9, 4.5, Math.sin(camYaw) * 9);
  camera.position.lerp(player.position.clone().add(camOffset), 0.12);
  camera.position.y = Math.max(camera.position.y, 2);
  camTarget.lerp(player.position, 0.2);
  camera.lookAt(camTarget);
  if (state.shake > 0) { // chomp!
    state.shake = Math.max(0, state.shake - dt);
    camera.position.x += (Math.random() - 0.5) * state.shake * 1.3;
    camera.position.y += (Math.random() - 0.5) * state.shake * 1.3;
  }

  renderer.render(scene, camera);
}

// every solid thing casts a shadow onto the sand (transparent effects don't)
applyShadows(scene);
scene.add(sun.target); // the sun tracks the player so shadows work everywhere

updateHud();
animate();

// tiny hook for automated testing / debugging in the console
window.__game = { state, player, sharks, gems, coralClusters, resetGame, chest, crown, playerParts, showLeaderboard, submitScore, localScores, dragon, bedazzled, FINAL_GEM_LEVEL };
