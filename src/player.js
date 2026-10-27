// Third-person hero: movement, camera, melee combo, dash and the Metanoia burst.

import * as THREE from 'three';
import { input } from './input.js';
import { game, damagePlayer, tickCooldowns, saveGame } from './state.js';
import { groundAt, WORLD_RADIUS } from './world.js';
import { audio } from './audio.js';

const CAM_OFFSET_UP = 1.75;

const COMBOS = [
  { dur: 0.34, mul: 1.0, range: 3.1, arc: 105, axis: 'y', from: -1.5, to: 1.5 },
  { dur: 0.36, mul: 1.15, range: 3.1, arc: 105, axis: 'y', from: 1.5, to: -1.5 },
  { dur: 0.5, mul: 1.7, range: 3.6, arc: 130, axis: 'x', from: -2.3, to: 0.85 }
];

export function createPlayer(ctx) {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);
  ctx.scene.add(root);

  // --- Model (built from primitives: no assets to download) ---
  const cloth = new THREE.MeshStandardMaterial({ color: '#eae7f7', roughness: 0.72 });
  const cloak = new THREE.MeshStandardMaterial({ color: '#5b4fa8', roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d9b25c', roughness: 0.3, metalness: 0.75 });
  const steel = new THREE.MeshStandardMaterial({ color: '#cfd6e6', roughness: 0.25, metalness: 0.85, emissive: '#1d3f66', emissiveIntensity: 0.35 });

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), cloak);
    leg.position.set(side * 0.17, 0.4, 0);
    leg.castShadow = true;
    visual.add(leg);
    legs.push(leg);
  }

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.7, 4, 14), cloth);
  torso.position.y = 1.18;
  torso.castShadow = true;
  visual.add(torso);

  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.34), gold);
    pad.position.set(side * 0.42, 1.5, 0);
    pad.castShadow = true;
    visual.add(pad);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), cloth);
  head.position.y = 1.82;
  head.castShadow = true;
  visual.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.09, 0.1),
    new THREE.MeshStandardMaterial({ color: '#6fe3ff', emissive: '#39c6ff', emissiveIntensity: 2.4 })
  );
  visor.position.set(0, 1.82, 0.24);
  visual.add(visor);

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 12, 1, true), cloak);
  hood.position.y = 2.0;
  hood.castShadow = true;
  visual.add(hood);

  // Weapon pivot sits at the right shoulder; the blade points up at rest.
  const weapon = new THREE.Group();
  weapon.position.set(0.46, 1.42, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), cloth);
  arm.position.y = -0.2;
  arm.castShadow = true;
  weapon.add(arm);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.22), steel);
  blade.position.y = 0.75;
  blade.castShadow = true;
  weapon.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.3), gold);
  guard.position.y = 0.02;
  weapon.add(guard);
  weapon.rotation.set(-0.35, -0.55, 0);
  visual.add(weapon);

  // --- Runtime state ---
  const vel = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  const facing = new THREE.Vector3(0, 0, 1);
  let vy = 0;
  let grounded = true;
  let angle = Math.PI;
  let dashT = 0;
  let iframes = 0;
  let swing = null; // { t, index, hitDone }
  let lunge = 0;
  let stepPhase = 0;
  let hurtT = 0;

  const cam = { yaw: Math.PI, pitch: 0.32, dist: 8.2, cur: new THREE.Vector3(0, 4, 10) };
  const tmp = new THREE.Vector3();
  const desired = new THREE.Vector3();

  function spawn() {
    root.position.set(0, groundAt(0, 0), 0);
    vel.set(0, 0, 0);
    vy = 0;
    angle = Math.PI;
    cam.yaw = Math.PI;
    cam.pitch = 0.32;
    dashT = 0; iframes = 0; swing = null; lunge = 0; hurtT = 0;
    weapon.rotation.set(-0.35, -0.55, 0);
  }
  spawn();

  function hitEnemies(range, arcDeg, dmg, force) {
    const enemies = ctx.enemies;
    if (!enemies) return;
    const arc = (arcDeg * Math.PI) / 180;
    for (const e of enemies.list) {
      if (e.dead) continue;
      tmp.copy(e.root.position).sub(root.position);
      tmp.y = 0;
      const dist = tmp.length();
      if (dist > range + e.radius) continue;
      tmp.normalize();
      const dot = tmp.x * facing.x + tmp.z * facing.z;
      if (Math.acos(THREE.MathUtils.clamp(dot, -1, 1)) > arc / 2) continue;

      const crit = Math.random() < 0.14;
      const amount = Math.round(dmg * (crit ? 2 : 1));
      const dir = tmp.clone();
      enemies.damage(e, amount, dir, force);
      ctx.ui.damageNumber(e.root.position, amount, crit ? 'crit' : 'normal');
      audio.hit();
      ctx.fx.burst(e.root.position.clone().setY(e.root.position.y + 0.8), crit ? '#ffd479' : '#9ff0ff', crit ? 8 : 4, 2.6);
    }
  }

  function startSwing() {
    if (swing) return;
    const index = game.comboWindow > 0 ? (game.combo + 1) % 3 : 0;
    game.combo = index;
    game.comboWindow = 0.85;
    swing = { t: 0, index, hitDone: false };
    lunge = 3.4;
    audio.swing();
  }

  function dash() {
    if (game.dashCd > 0 || dashT > 0) return;
    game.dashCd = game.dashMax;
    dashT = 0.24;
    iframes = 0.36;
    audio.dash();
    ctx.fx.burst(root.position.clone().setY(root.position.y + 0.9), '#8ff0ff', 6, 2.2);
  }

  function castSkill() {
    if (game.skillCd > 0) return;
    game.skillCd = game.skillMax;
    audio.skill();
    const p = root.position;
    ctx.fx.ring(p, '#c9a0ff', 7);
    ctx.fx.burst(p.clone().setY(p.y + 1.1), '#e2cdff', 18, 5.5);
    ctx.ui.banner('METANOIA BURST', 700);
    const enemies = ctx.enemies;
    if (enemies) {
      for (const e of enemies.list) {
        if (e.dead) continue;
        const d = tmp.copy(e.root.position).sub(p).setY(0).length();
        if (d > 6.2 + e.radius) continue;
        const dir = tmp.normalize().clone();
        const amount = Math.round(game.atk * 2.6);
        enemies.damage(e, amount, dir, 11);
        ctx.ui.damageNumber(e.root.position, amount, 'skill');
      }
    }
    iframes = Math.max(iframes, 0.4);
  }

  function takeDamage(amount, fromPos) {
    if (iframes > 0 || game.mode !== 'play') return 0;
    const dealt = damagePlayer(amount);
    if (dealt <= 0) return 0;
    iframes = 0.7;
    hurtT = 0.3;
    audio.hurt();
    ctx.ui.damageFlash();
    ctx.ui.damageNumber(root.position, dealt, 'player');
    if (fromPos) {
      tmp.copy(root.position).sub(fromPos).setY(0).normalize();
      vel.addScaledVector(tmp, 5.5);
      vy = Math.max(vy, 2.5);
    }
    saveGame();
    if (game.mode === 'over') audio.defeat();
    return dealt;
  }

  function update(dt) {
    tickCooldowns(dt);
    iframes = Math.max(0, iframes - dt);
    hurtT = Math.max(0, hurtT - dt);
    if (dashT > 0) dashT = Math.max(0, dashT - dt);

    // --- Camera orbit input ---
    cam.yaw -= input.look.x * 0.0034;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + input.look.y * 0.0028, -0.18, 1.05);
    input.look.x = 0; input.look.y = 0;
    cam.dist = THREE.MathUtils.clamp(cam.dist + input.zoom * 3, 4.5, 13.5);
    input.zoom = 0;

    // --- Movement, camera-relative ---
    const speed = dashT > 0 ? 15.5 : 6.4;
    moveDir.set(input.move.x, 0, input.move.y);
    if (moveDir.lengthSq() > 0.0001) {
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      const fwdX = -sy, fwdZ = -cy;
      const rightX = -fwdZ, rightZ = fwdX;
      const wx = fwdX * moveDir.z + rightX * moveDir.x;
      const wz = fwdZ * moveDir.z + rightZ * moveDir.x;
      const wl = Math.hypot(wx, wz);
      moveDir.set(wx / wl, 0, wz / wl);
      facing.copy(moveDir);
      angle = Math.atan2(moveDir.x, moveDir.z);
    }

    const control = dashT > 0 ? 0 : 1 - Math.exp(-dt * 14);
    if (dashT > 0) {
      vel.x = facing.x * speed;
      vel.z = facing.z * speed;
    } else {
      const targetX = moveDir.x * speed;
      const targetZ = moveDir.z * speed;
      vel.x += (targetX - vel.x) * control;
      vel.z += (targetZ - vel.z) * control;
    }

    if (lunge > 0) {
      const step = Math.min(lunge, 9 * dt);
      root.position.x += facing.x * step;
      root.position.z += facing.z * step;
      lunge -= step;
    }

    root.position.x += vel.x * dt;
    root.position.z += vel.z * dt;

    // World boundary
    const r = Math.hypot(root.position.x, root.position.z);
    if (r > WORLD_RADIUS - 2) {
      const k = (WORLD_RADIUS - 2) / r;
      root.position.x *= k;
      root.position.z *= k;
      ctx.ui.setHint('The memory barrier holds.', 1400);
    }

    // --- Jump / gravity ---
    if (input.actions.jump && grounded) {
      vy = 8.4;
      grounded = false;
      input.actions.jump = false;
    }
    input.actions.jump = false;

    const ground = groundAt(root.position.x, root.position.z);
    vy -= 23 * dt;
    root.position.y += vy * dt;
    if (root.position.y <= ground) {
      root.position.y = ground;
      vy = 0;
      grounded = true;
    } else {
      grounded = false;
    }

    // --- Actions ---
    if (input.actions.attack) { startSwing(); input.actions.attack = false; }
    if (input.actions.dash) { dash(); input.actions.dash = false; }
    if (input.actions.skill) { castSkill(); input.actions.skill = false; }

    // --- Swing resolution & animation ---
    if (swing) {
      const c = COMBOS[swing.index];
      swing.t += dt;
      const p = Math.min(1, swing.t / c.dur);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

      if (c.axis === 'y') {
        weapon.rotation.y = c.from + (c.to - c.from) * eased;
        weapon.rotation.x = -0.35 + Math.sin(p * Math.PI) * 0.4;
        visual.rotation.y = (c.from > 0 ? -1 : 1) * Math.sin(p * Math.PI) * 0.32;
      } else {
        weapon.rotation.x = c.from + (c.to - c.from) * eased;
        weapon.rotation.y = -0.2;
        visual.rotation.y = 0;
      }
      if (!swing.hitDone && p >= 0.34) {
        swing.hitDone = true;
        const dmg = game.atk * c.mul;
        hitEnemies(c.range, c.arc, dmg, 4.5);
        ctx.fx.slash(
          root.position.clone().setY(root.position.y + 1.2),
          angle,
          swing.index === 2 ? '#ffd479' : '#9ff0ff'
        );
      }
      if (p >= 1) {
        swing = null;
        visual.rotation.y = 0;
        weapon.rotation.set(-0.35, -0.55, 0);
      }
    } else {
      // Idle sway keeps the blade alive between swings.
      weapon.rotation.x += (-0.35 - weapon.rotation.x) * Math.min(1, dt * 12);
      weapon.rotation.y += (-0.55 - weapon.rotation.y) * Math.min(1, dt * 12);
      visual.rotation.y += (0 - visual.rotation.y) * Math.min(1, dt * 10);
    }

    // --- Facing & walk cycle ---
    root.rotation.y = lerpAngle(root.rotation.y, angle, 1 - Math.exp(-dt * 14));

    const planarSpeed = Math.hypot(vel.x, vel.z);
    if (grounded) {
      stepPhase += dt * planarSpeed * 1.7;
      const swingAmt = Math.min(1, planarSpeed / 6.4) * 0.7;
      legs[0].rotation.x = Math.sin(stepPhase) * swingAmt;
      legs[1].rotation.x = -Math.sin(stepPhase) * swingAmt;
      visual.position.y = Math.abs(Math.sin(stepPhase)) * 0.06 * swingAmt;
    } else {
      legs[0].rotation.x = -0.4;
      legs[1].rotation.x = 0.3;
      visual.position.y = 0;
    }

    // Hurt / dash visual feedback
    visual.scale.setScalar(dashT > 0 ? 1.04 : 1);
    visual.position.x = hurtT > 0 ? Math.sin(hurtT * 60) * 0.05 : 0;

    updateCamera(dt);
  }

  function updateCamera(dt) {
    const target = tmp.set(root.position.x, root.position.y + CAM_OFFSET_UP, root.position.z).clone();
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    desired.set(
      target.x + Math.sin(cam.yaw) * cp * cam.dist,
      target.y + sp * cam.dist,
      target.z + Math.cos(cam.yaw) * cp * cam.dist
    );
    const floor = groundAt(desired.x, desired.z) + 1.1;
    if (desired.y < floor) desired.y = floor;

    const k = 1 - Math.exp(-dt * 12);
    cam.cur.lerp(desired, k);
    ctx.camera.position.copy(cam.cur);
    ctx.camera.lookAt(target);

    const targetFov = dashT > 0 ? 74 : 66;
    if (Math.abs(ctx.camera.fov - targetFov) > 0.05) {
      ctx.camera.fov += (targetFov - ctx.camera.fov) * Math.min(1, dt * 10);
      ctx.camera.updateProjectionMatrix();
    }
  }

  function lerpAngle(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  return {
    root,
    weapon,
    get position() { return root.position; },
    get iframes() { return iframes; },
    spawn,
    update,
    takeDamage,
    resetSwing() { swing = null; weapon.rotation.set(-0.35, -0.55, 0); visual.rotation.y = 0; }
  };
}
