// The world: terrain, sky, lighting, atmosphere and props.
// Everything procedural — zero asset downloads, so the build stays tiny and fast.

import * as THREE from 'three';

const SKY_TOP = new THREE.Color('#1b1636');
const SKY_HORIZON = new THREE.Color('#4a3f6b');
const FOG_COLOR = new THREE.Color('#2a2440');

function fract(n) { return n - Math.floor(n); }
function hash2(x, y) { return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123); }
function smoothstep(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = smoothstep(xf), v = smoothstep(yf);
  return (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v) * 2 - 1;
}

export const WORLD_RADIUS = 96;

/** Deterministic terrain height, shared by rendering and all movement code. */
export function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  const openness = smoothstep(Math.min(1, Math.max(0, (d - 16) / 34)));
  const h =
    vnoise(x * 0.016, z * 0.016) * 9 +
    vnoise(x * 0.05, z * 0.05) * 3 +
    vnoise(x * 0.14, z * 0.14) * 0.7;
  return h * openness;
}

/** Terrain height plus the raised spawn dais. Every actor stands on this. */
export function groundAt(x, z) {
  const h = terrainHeight(x, z);
  return Math.hypot(x, z) < 5.9 ? Math.max(h, 0.35) : h;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createWorld(ctx) {
  const scene = ctx.scene;
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0135);

  // --- Sky dome ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: SKY_TOP },
        horizon: { value: SKY_HORIZON },
        glow: { value: new THREE.Color('#c9a0ff') }
      },
      vertexShader: `
        varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 glow;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 col = mix(horizon, top, smoothstep(0.0, 0.55, h));
          col = mix(col, horizon * 0.55, smoothstep(0.0, -0.4, h));
          float band = exp(-pow((h - 0.06) * 7.0, 2.0));
          col += glow * band * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  // --- Lighting ---
  const hemi = new THREE.HemisphereLight(0x9db8ff, 0x241d33, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0dc, 2.1);
  sun.position.set(26, 38, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  const S = 34;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const rim = new THREE.DirectionalLight(0x8b6cff, 0.5);
  rim.position.set(-30, 16, -24);
  scene.add(rim);

  // --- Terrain ---
  const SIZE = 260, SEG = 110;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color('#2f5a3f');
  const cMid = new THREE.Color('#46604a');
  const cHigh = new THREE.Color('#6b6478');
  const cPath = new THREE.Color('#3d4450');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const t = Math.min(1, Math.max(0, (h + 3) / 12));
    tmp.copy(cLow).lerp(cMid, Math.min(1, t * 2)).lerp(cHigh, Math.max(0, t * 1.4 - 0.4));
    const variation = vnoise(x * 0.09, z * 0.09) * 0.06;
    tmp.offsetHSL(0, 0, variation);
    const flat = Math.min(1, Math.max(0, (Math.hypot(x, z) - 8) / 12));
    if (flat < 1) tmp.lerp(cPath, (1 - flat) * 0.65);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0.02
  }));
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Ritual circle where the player spawns ---
  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 5.6, 0.35, 40),
    new THREE.MeshStandardMaterial({ color: '#3a3550', roughness: 0.7, emissive: '#241c46', emissiveIntensity: 0.6 })
  );
  dais.position.y = 0.17;
  dais.receiveShadow = true;
  scene.add(dais);

  const rune = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 4.6, 48),
    new THREE.MeshBasicMaterial({ color: '#a98bff', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = 0.36;
  scene.add(rune);

  // --- Ruined pillars ---
  const rand = seeded(20261027);
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#57506a', roughness: 0.85 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.2;
    const r = 9.5 + rand() * 3.5;
    const h = 3 + rand() * 6;
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, h, 1.4), pillarMat);
    p.position.set(Math.cos(a) * r, h / 2 - rand() * 0.8, Math.sin(a) * r);
    p.rotation.set((rand() - 0.5) * 0.25, rand() * Math.PI, (rand() - 0.5) * 0.25);
    p.castShadow = true; p.receiveShadow = true;
    scene.add(p);
  }

  // --- Instanced scatter: monolith-trees and rocks ---
  const treeGeo = new THREE.ConeGeometry(1.35, 7, 5, 1);
  treeGeo.translate(0, 3.5, 0);
  const treeMat = new THREE.MeshStandardMaterial({ color: '#233a3d', roughness: 0.9, flatShading: true });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, 90);
  trees.castShadow = true; trees.receiveShadow = true;

  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#4d4960', roughness: 0.95, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 80);
  rocks.castShadow = true; rocks.receiveShadow = true;

  const shardGeo = new THREE.OctahedronGeometry(0.55, 0);
  const shardMat = new THREE.MeshStandardMaterial({
    color: '#7de5ff', emissive: '#39b8e8', emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.2
  });
  const crystals = new THREE.InstancedMesh(shardGeo, shardMat, 46);
  crystals.castShadow = true;

  const dummy = new THREE.Object3D();
  const place = (mesh, count, minR, maxR, scaleMin, scaleMax, sink) => {
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 40) {
      const a = rand() * Math.PI * 2;
      const r = minR + rand() * (maxR - minR);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      dummy.position.set(x, terrainHeight(x, z) - sink, z);
      dummy.rotation.set((rand() - 0.5) * 0.2, rand() * Math.PI * 2, (rand() - 0.5) * 0.2);
      const s = scaleMin + rand() * (scaleMax - scaleMin);
      dummy.scale.set(s, s * (0.75 + rand() * 0.7), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed++, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  };
  place(trees, 90, 22, 118, 0.7, 1.7, 0.2);
  place(rocks, 80, 14, 118, 0.5, 2.4, 0.45);
  place(crystals, 46, 18, 110, 0.6, 1.5, 0.15);

  // --- Memory barrier at the world edge ---
  const barrier = new THREE.Mesh(
    new THREE.CylinderGeometry(WORLD_RADIUS, WORLD_RADIUS, 40, 72, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#8f6cff', transparent: true, opacity: 0.13,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    })
  );
  barrier.position.y = 18;
  scene.add(barrier);

  // --- Drifting motes ---
  const MOTES = 420;
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * WORLD_RADIUS;
    motePos[i * 3] = Math.cos(a) * r;
    motePos[i * 3 + 1] = rand() * 22;
    motePos[i * 3 + 2] = Math.sin(a) * r;
    moteSeed[i] = rand() * Math.PI * 2;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: '#cbb7ff', size: 0.34, sizeAttenuation: true, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  motes.frustumCulled = false;
  scene.add(motes);

  let t = 0;

  return {
    sun,
    update(dt) {
      t += dt;
      // Keep the shadow volume centred on the player instead of the whole map.
      const p = ctx.player ? ctx.player.position : { x: 0, y: 0, z: 0 };
      sun.position.set(p.x + 26, 38, p.z + 18);
      sun.target.position.set(p.x, 0, p.z);
      sun.target.updateMatrixWorld();

      barrier.material.opacity = 0.1 + Math.sin(t * 1.4) * 0.035;
      rune.material.opacity = 0.38 + Math.sin(t * 1.8) * 0.16;

      const attr = moteGeo.attributes.position;
      for (let i = 0; i < MOTES; i++) {
        let y = attr.getY(i) + dt * (0.35 + (i % 5) * 0.06);
        if (y > 24) y = 0;
        attr.setY(i, y);
        attr.setX(i, attr.getX(i) + Math.sin(t * 0.6 + moteSeed[i]) * dt * 0.25);
      }
      attr.needsUpdate = true;
    }
  };
}
