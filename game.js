// ---------------------------------------------------------------
//  Sophie's Shark & Fish Game
//  Designed by Sophie (age 6, almost 7!)
//  You are a little fish: collect 4 gems, hide behind coral,
//  and don't get eaten by the sharks. You have 3 lives!
// ---------------------------------------------------------------
import * as THREE from './lib/three.module.js';

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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2fb9dc); // bright tropical lagoon water
scene.fog = new THREE.Fog(0x2fb9dc, 30, 120);

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

// lights: bright sunny lagoon
scene.add(new THREE.HemisphereLight(0xe0fbff, 0x3e9db6, 1.25));
const sun = new THREE.DirectionalLight(0xfff3d6, 1.5);
sun.position.set(30, 60, 10);
scene.add(sun);

// ----------------------------- helpers -----------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
};

// ----------------------------- ocean floor & water -----------------------------
{
  const sandGeo = new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2, 60, 60);
  const pos = sandGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, Math.sin(pos.getX(i) * 0.15) * Math.cos(pos.getY(i) * 0.15) * 0.8);
  }
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, mat(0xf9e9b6, { roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = FLOOR_Y;
  scene.add(sand);

  // shimmering water surface above
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE * 3, WORLD_SIZE * 3),
    new THREE.MeshStandardMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.2 })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = CEILING_Y + 4;
  scene.add(surface);

  // scattered candy-colored pebbles and starfish for cuteness
  const pebbleColors = [0xffc6d9, 0xc5b3ff, 0xaee9ff, 0xffe3a3, 0xc8f7c5, 0xf6d4ff];
  for (let i = 0; i < 50; i++) {
    const pebble = new THREE.Mesh(
      new THREE.SphereGeometry(rand(0.3, 0.9), 8, 6),
      mat(pebbleColors[i % pebbleColors.length])
    );
    pebble.position.set(rand(-95, 95), 0.2, rand(-95, 95));
    pebble.scale.y = 0.5;
    scene.add(pebble);
  }
  for (let i = 0; i < 16; i++) {
    const star = new THREE.Group();
    const c = [0xff8fab, 0xffa94d, 0xff6b6b][i % 3];
    for (let a = 0; a < 5; a++) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 3, 6), mat(c));
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = (a / 5) * Math.PI * 2;
      arm.position.set(Math.cos((a / 5) * Math.PI * 2) * 0.4, 0, -Math.sin((a / 5) * Math.PI * 2) * 0.4);
      star.add(arm);
    }
    star.position.set(rand(-90, 90), 0.25, rand(-90, 90));
    scene.add(star);
  }
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
  // swaying seaweed
  for (let s = 0; s < 5; s++) {
    const h = rand(2.5, 5);
    const weed = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, h, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x35c26b, side: THREE.DoubleSide, roughness: 0.9 })
    );
    weed.position.set(rand(-4, 4), h / 2, rand(-4, 4));
    weed.rotation.y = rand(0, Math.PI);
    weed.userData.sway = rand(0, Math.PI * 2);
    group.add(weed);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  coralClusters.push({ group, x, z, hideRadius: 6.5 });
}

// a ring of coral hideouts around the world plus a few in the middle
[
  [-60, -60], [0, -70], [65, -55], [-75, 0], [70, 10],
  [-55, 60], [5, 72], [60, 62], [-25, -25], [30, 25], [-30, 30], [25, -35],
].forEach(([x, z]) => makeCoralCluster(x, z));

// small decorative reef patches everywhere (pretty, but too little to hide in —
// the big lush clusters above are the real hideouts)
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
    anemones.push({ tents, phase: rand(0, Math.PI * 2) });
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
  g.position.set(x, 0, z);
  scene.add(g);
}
for (let i = 0; i < 110; i++) {
  const x = rand(-92, 92), z = rand(-92, 92);
  // keep clear of hideout clusters and the start pool so the reef reads clearly
  if (coralClusters.some(cc => Math.hypot(x - cc.x, z - cc.z) < 10)) continue;
  if (Math.hypot(x - 0, z - 88) < 12) continue; // START_POS pool
  makeReefPatch(x, z);
}

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
const GEM_SPOTS = [
  [-60, 3.5, -60], [65, 4, -55], [-55, 3.5, 60], [70, 4.5, 10],
];
const gems = [];
GEM_SPOTS.forEach(([x, y, z], i) => {
  const colors = [0x59d4ff, 0xff6bd6, 0x7dff8a, 0xffd93d];
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: 0.55, roughness: 0.2 })
  );
  gem.position.set(x, y, z);
  const halo = new THREE.PointLight(colors[i], 20, 14);
  gem.add(halo);
  scene.add(gem);
  gems.push({ mesh: gem, collected: false, baseY: y });
});

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
  // sleepy "Zzz" label used during naps
  const zzz = makeTextSprite('💤');
  zzz.position.set(0, 2.4, 0);
  zzz.visible = false;
  g.add(zzz);
  g.userData.zzz = zzz;
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

// levels: more sharks, faster sharks, shorter naps
function levelCfg(l) {
  return {
    sharkCount: Math.min(2 + l, 6),
    speedMult: 1 + (l - 1) * 0.12,
    napDur: Math.max(3, 5 - (l - 1) * 0.5),
  };
}

function pickPatrolTarget(shark) {
  // wander near home but never inside a coral hideout (sharks don't like coral!)
  for (let tries = 0; tries < 12; tries++) {
    const t = new THREE.Vector3(
      clamp(shark.home.x + rand(-shark.range, shark.range), -92, 92),
      rand(2.5, 12),
      clamp(shark.home.z + rand(-shark.range, shark.range), -92, 92)
    );
    if (nearestCoralDistance(t) > 9) return t;
  }
  return shark.home.clone();
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
  const cx = x, cz = z, phase = rand(0, Math.PI * 2), speed = rand(0.08, 0.14);
  friends.push({
    group: g,
    update(t) {
      const a = t * speed + phase;
      g.position.x = cx + Math.cos(a) * radius;
      g.position.z = cz + Math.sin(a) * radius;
      g.rotation.y = -a - Math.PI / 2;
      for (let i = 0; i < flippers.length; i++) flippers[i].rotation.z = Math.sin(t * 3 + i) * 0.4;
    },
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
  friends.push({
    group: g,
    update(t) {
      const a = t * 0.045;
      g.position.set(Math.cos(a) * 58, 17 + Math.sin(t * 0.4) * 1.5, Math.sin(a) * 58);
      g.rotation.y = -a - Math.PI / 2;
      fluke.rotation.z = Math.sin(t * 1.2) * 0.25; // slow happy fluke flaps
    },
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
  const baseY = 2.2, phase = rand(0, Math.PI * 2);
  friends.push({
    group: g,
    update(t) {
      g.position.y = baseY + Math.sin(t * 1.3 + phase) * 0.7;
      g.rotation.y = Math.sin(t * 0.4 + phase) * 0.9;
    },
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
  g.position.set(x, 0, z);
  scene.add(g);
  const phase = rand(0, Math.PI * 2), range = rand(4, 8);
  friends.push({
    group: g,
    update(t) {
      g.position.z = z + Math.sin(t * 0.6 + phase) * range; // scuttle sideways!
      for (let i = 0; i < legs.length; i++) legs[i].rotation.z = Math.sin(t * 8 + i * 1.3) * 0.25;
    },
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
  const phase = rand(0, Math.PI * 2), r = rand(1.6, 2.4), speed = rand(0.8, 1.4);
  friends.push({
    group: nemo,
    update(t) {
      const a = t * speed + phase;
      nemo.position.set(spot.x + Math.cos(a) * r, 1.4 + Math.sin(t * 2 + phase) * 0.3, spot.z + Math.sin(a) * r);
      nemo.rotation.y = -a - Math.PI / 2;
    },
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
  friends.push({
    group: school,
    update(t) {
      const a = t * 0.18;
      school.position.set(Math.cos(a) * 45, 9 + Math.sin(t * 0.5) * 2, Math.sin(a) * 45);
      school.rotation.y = -a - Math.PI / 2;
      for (let i = 0; i < minis.length; i++) minis[i].position.y = Math.sin(t * 2 + i) * 0.4 + (i % 3) - 1;
    },
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
  fishName: 'Little Fish',
  gemsCollected: 0,
  speedBoost: false,     // 1st gem
  napTimer: 0,           // 2nd gem: sharks nap
  sparkles: false,       // 3rd gem
  invulnerable: 0,
  gameOver: false,
  shake: 0,              // camera shake after a chomp
  rollTimer: 0,          // happy barrel roll after a gem
  chestPhase: null,      // null | 'placed' | 'opening' | 'crown'
  chestTimer: 0,
};

function updateHud() {
  hudLives.textContent = '❤️'.repeat(state.lives) + '🖤'.repeat(3 - state.lives);
  hudLevel.textContent = '⭐ Level ' + state.level;
  gemSlots.forEach((slot, i) => slot.classList.toggle('got', i < state.gemsCollected));
}

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
    `<button id="msg-btn">${buttonText}</button>`;
  messageEl.classList.add('show');
  document.getElementById('msg-btn').addEventListener('click', onClick);
}

function resetGame(level = 1) {
  // iOS/Android only allow sound after a user gesture — the start tap is one
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* sound is optional */ }
  state.running = true;
  state.lives = 3;
  state.level = level;
  state.gemsCollected = 0;
  state.speedBoost = false;
  state.napTimer = 0;
  state.sparkles = false;
  state.invulnerable = 0;
  state.gameOver = false;
  state.shake = 0;
  state.rollTimer = 0;
  state.chestPhase = null;
  chest.visible = false;
  chest.userData.glow.intensity = 0;
  chestLid.rotation.x = 0;
  crown.visible = false;
  player.remove(crown);
  player.position.copy(START_POS);
  player.rotation.y = START_YAW;
  gems.forEach(g => { g.collected = false; g.mesh.visible = true; });
  const cfg = levelCfg(level);
  sharks.forEach((s, i) => {
    s.active = i < cfg.sharkCount;
    s.mesh.visible = s.active;
    s.state = 'patrol';
    s.spin = 0;
    s.mesh.rotation.x = 0;
    s.mesh.position.copy(s.home);
    s.target = pickPatrolTarget(s);
    s.mesh.userData.zzz.visible = false;
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
  updateHud();
  sfx.gem();
  sparkleBurst(gem.mesh.position, gem.mesh.material.color);
  state.rollTimer = 0.7; // happy barrel roll!

  if (state.gemsCollected === 1) {
    state.speedBoost = true;
    showPowerup('💎 First gem! ⚡ You can swim SUPER FAST now!');
  } else if (state.gemsCollected === 2) {
    const nap = levelCfg(state.level).napDur;
    state.napTimer = nap;
    sharks.forEach(s => { if (s.active) { s.state = 'nap'; s.mesh.userData.zzz.visible = true; } });
    sfx.nap();
    showPowerup(`💎 Second gem! 😴 The sharks fell asleep — ${Math.round(nap)} second head start!`);
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
  chest.position.x = clamp(chest.position.x, -85, 85);
  chest.position.z = clamp(chest.position.z, -85, 85);
  chest.position.y = 0;
  chest.rotation.y = Math.atan2(player.position.x - chest.position.x, player.position.z - chest.position.z);
  chest.visible = true;
  state.chestPhase = 'placed';
  showPowerup('💎 All 4 gems! A treasure chest appeared — follow the sparkles! ✨', 5000);
}

function winGame() {
  state.running = false;
  state.gameOver = true;
  sfx.win();
  showMessage(
    `🎉 LEVEL ${state.level} COMPLETE! 🎉`,
    [`${state.fishName} found the royal crown! 👑`,
     `All 4 gems collected — you are the best fish in the sea! 🐠`,
     `Ready for Level ${state.level + 1}? ${levelCfg(state.level + 1).sharkCount} sharks are waiting…`],
    `Level ${state.level + 1}! 🌊`,
    () => resetGame(state.level + 1)
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
    sfx.lose();
    showMessage(
      '🦈 Chomp! Game Over',
      [`The sharks got ${state.fishName} this time…`, 'But brave fish always try again!'],
      `Try Level ${state.level} Again! 💪`,
      () => resetGame(state.level)
    );
    return;
  }
  // whoosh back to the start with a safety bubble
  player.position.copy(START_POS);
  player.rotation.y = START_YAW;
  state.invulnerable = 3;
  sharks.forEach(s => { if (s.state === 'chase') { s.state = 'patrol'; s.target = pickPatrolTarget(s); } });
  showPowerup(state.lives === 2 ? '💔 Ouch! 2 lives left — hide behind the coral!' : '💔 Careful! Last life!');
}

// ----------------------------- main loop -----------------------------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
let camYaw = START_YAW; // follows the player's heading smoothly
let playerBank = 0;     // turn-banking, kept separate so barrel rolls can stack on top

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // ambient world animation (always on, even on menus — it's cute)
  for (const f of friends) f.update(t, dt);
  for (const b of bubbles) {
    b.position.y += b.userData.speed * dt;
    if (b.position.y > CEILING_Y + 2) b.position.y = 0;
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
    player.position.addScaledVector(dir, forward * baseSpeed * dt);
    player.position.y = clamp(player.position.y + vertical * baseSpeed * 0.7 * dt, 1.2, CEILING_Y);
    player.position.x = clamp(player.position.x, -95, 95);
    player.position.z = clamp(player.position.z, -95, 95);

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

    // ---------- treasure chest finale ----------
    if (state.chestPhase === 'placed') {
      if (player.position.distanceTo(chest.position) < 4.2) {
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
        winGame();
      }
    }

    // ---------- compass sparkles: point to the next goal ----------
    {
      let goal = null, goalColor = 0xffffff;
      if (state.chestPhase) {
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

    // ---------- sharks ----------
    if (state.napTimer > 0) {
      state.napTimer -= dt;
      if (state.napTimer <= 0) {
        sharks.forEach(s => {
          if (s.state === 'nap') { s.state = 'patrol'; s.target = pickPatrolTarget(s); s.mesh.userData.zzz.visible = false; }
        });
        showPowerup('😳 The sharks woke up!', 2000);
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

      if (s.state === 'nap') {
        // drift gently while snoozing
        s.mesh.position.y += Math.sin(t * 1.5) * dt * 0.4;
        s.mesh.userData.tail.rotation.y = Math.sin(t * 2) * 0.15;
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
        s.mesh.position.y = clamp(s.mesh.position.y, 2, CEILING_Y - 2);
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

updateHud();
animate();

// tiny hook for automated testing / debugging in the console
window.__game = { state, player, sharks, gems, coralClusters, resetGame, chest, crown, playerParts };
