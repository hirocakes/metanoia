// Enemies (the Regrets), their AI, and the shards they drop.

import * as THREE from 'three';
import { game, registerKill, addShards, healPlayer, saveGame } from './state.js';
import { groundAt } from './world.js';
import { audio } from './audio.js';

const TYPES = {
  wisp: {
    hp: 46, speed: 4.4, dmg: 9, xp: 24, aggro: 17, range: 2.3, windup: 0.5,
    radius: 0.7, body: '#6b3fd4', eye: '#f2e9ff', bob: 1.0, scale: 1
  },
  hulk: {
    hp: 125, speed: 2.6, dmg: 17, xp: 48, aggro: 15, range: 2.8, windup: 0.78,
    radius: 1.1, body: '#33264f', eye: '#ff5f6d', bob: 0.4, scale: 1.5
  }
};

let idSeq = 1;

function buildBody(cfg) {
  const group = new THREE.Group();
  const mats = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: cfg.body, roughness: 0.55, emissive: cfg.body, emissiveIntensity: 0.35
  });
  mats.push(bodyMat);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), bodyMat);
  body.scale.set(1, 1.25, 1);
  body.castShadow = true;
  group.add(body);

  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 5), bodyMat);
  crown.position.y = 0.85;
  crown.rotation.y = 0.4;
  crown.castShadow = true;
  group.add(crown);

  const eyeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: cfg.eye, emissiveIntensity: 3 });
  mats.push(eyeMat);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), eyeMat);
    eye.position.set(side * 0.24, 0.2, 0.5);
    group.add(eye);
  }

  const clawMat = new THREE.MeshStandardMaterial({ color: '#1d1730', roughness: 0.9 });
  for (const side of [-1, 1]) {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 5), clawMat);
    claw.position.set(side * 0.6, -0.1, 0.1);
    claw.rotation.set(Math.PI * 0.5, 0, side * 0.5);
    claw.castShadow = true;
    group.add(claw);
  }

  return { group, mats, bodyMat, eyeMat };
}

export function createEnemies(ctx) {
  const list = [];
  const pickups = [];
  const tmp = new THREE.Vector3();
  const shardGeo = new THREE.OctahedronGeometry(0.3, 0);
  const shardMat = new THREE.MeshStandardMaterial({
    color: '#8ef0ff', emissive: '#3fd0f0', emissiveIntensity: 2, roughness: 0.25
  });

  function spawn(type, x, z) {
    const cfg = TYPES[type];
    const { group, mats, bodyMat, eyeMat } = buildBody(cfg);
    const root = new THREE.Group();
    root.add(group);
    root.scale.setScalar(cfg.scale);
    ctx.scene.add(root);

    const enemy = {
      id: idSeq++,
      type, cfg,
      root, group, mats, bodyMat, eyeMat,
      hp: cfg.hp, maxHp: cfg.hp,
      radius: cfg.radius,
      vel: new THREE.Vector3(),
      state: 'idle',
      t: 0,
      flash: 0,
      dead: false,
      deadT: 0,
      home: new THREE.Vector3(x, 0, z),
      wander: new THREE.Vector3(x, 0, z),
      wanderT: Math.random() * 3,
      bar: ctx.ui.createBar(type === 'hulk' ? '#ff6f7d' : '#b98cff'),
      phase: Math.random() * Math.PI * 2
    };
    root.position.set(x, groundAt(x, z), z);
    list.push(enemy);
    return enemy;
  }

  function damage(e, amount, dir, force) {
    if (e.dead) return;
    e.hp -= amount;
    e.flash = 0.14;
    if (dir) e.vel.addScaledVector(dir, force);
    if (e.state !== 'windup' && e.state !== 'recover') e.state = 'stagger', e.t = 0;
    if (e.hp <= 0) kill(e);
  }

  function kill(e) {
    e.dead = true;
    e.state = 'dead';
    e.t = 0;
    audio.death();
    ctx.fx.burst(e.root.position.clone().setY(e.root.position.y + 0.6), '#c9a0ff', 14, 4);
    registerKill(e.cfg.xp);
    saveGame();
    const drops = e.type === 'hulk' ? 2 : 1;
    for (let i = 0; i < drops; i++) spawnPickup(e.root.position, i);
  }

  function spawnPickup(from, i) {
    const mesh = new THREE.Mesh(shardGeo, shardMat);
    const a = Math.random() * Math.PI * 2;
    mesh.position.copy(from).add(new THREE.Vector3(Math.cos(a) * 0.6, 0.7, Math.sin(a) * 0.6));
    ctx.scene.add(mesh);
    pickups.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * 2, 3.4, Math.sin(a) * 2), age: 0, i });
  }

  function spawnWave() {
    const layout = [
      ['wisp', 16, 6], ['wisp', -14, 10], ['wisp', 6, -17], ['wisp', -19, -8],
      ['wisp', 24, -4], ['wisp', -6, 23], ['wisp', 30, 15],
      ['hulk', -26, 16], ['hulk', 20, -24], ['hulk', -30, -18], ['hulk', 8, 32], ['hulk', 34, -14]
    ];
    for (const [type, x, z] of layout) spawn(type, x, z);
  }

  function clear() {
    for (const e of list) {
      ctx.scene.remove(e.root);
      if (e.bar) e.bar.remove();
      e.mats.forEach((m) => m.dispose());
    }
    list.length = 0;
    for (const p of pickups) ctx.scene.remove(p.mesh);
    pickups.length = 0;
  }

  function moveToward(e, tx, tz, speed, dt) {
    tmp.set(tx - e.root.position.x, 0, tz - e.root.position.z);
    const dist = tmp.length();
    if (dist < 0.05) return 0;
    tmp.multiplyScalar(1 / dist);
    e.vel.x += (tmp.x * speed - e.vel.x) * Math.min(1, dt * 6);
    e.vel.z += (tmp.z * speed - e.vel.z) * Math.min(1, dt * 6);
    // Face travel direction
    const target = Math.atan2(tmp.x, tmp.z);
    let d = target - e.group.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    e.group.rotation.y += d * Math.min(1, dt * 8);
    return dist;
  }

  function separate(e) {
    for (const o of list) {
      if (o === e || o.dead) continue;
      const dx = e.root.position.x - o.root.position.x;
      const dz = e.root.position.z - o.root.position.z;
      const d2 = dx * dx + dz * dz;
      const min = (e.radius + o.radius) * 1.15;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.vel.x += (dx / d) * (min - d) * 3;
        e.vel.z += (dz / d) * (min - d) * 3;
      }
    }
  }

  function update(dt) {
    const player = ctx.player;
    const pp = player.position;

    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      const cfg = e.cfg;
      e.t += dt;
      e.phase += dt * 2.4;

      // Flash on hit
      if (e.flash > 0) {
        e.flash -= dt;
        const on = e.flash > 0;
        e.bodyMat.emissiveIntensity = on ? 2.2 : 0.35;
        e.eyeMat.emissiveIntensity = on ? 6 : 3;
      }

      if (e.dead) {
        e.deadT += dt;
        e.group.position.y = -e.deadT * 1.4;
        e.group.rotation.z += dt * 1.6;
        const s = Math.max(0.01, 1 - e.deadT * 1.1);
        e.group.scale.setScalar(s);
        ctx.ui.placeBar(e.bar, e.root.position, 0, false);
        if (e.deadT > 1.1) {
          ctx.scene.remove(e.root);
          if (e.bar) e.bar.remove();
          e.mats.forEach((m) => m.dispose());
          list.splice(i, 1);
        }
        continue;
      }

      // Gravity / terrain follow
      const dx = pp.x - e.root.position.x;
      const dz = pp.z - e.root.position.z;
      const distToPlayer = Math.hypot(dx, dz);

      if (e.state !== 'dead') {
        if (e.state === 'idle') {
          e.wanderT -= dt;
          if (e.wanderT <= 0) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 7;
            e.wander.set(e.home.x + Math.cos(a) * r, 0, e.home.z + Math.sin(a) * r);
            e.wanderT = 2.5 + Math.random() * 3;
          }
          moveToward(e, e.wander.x, e.wander.z, cfg.speed * 0.35, dt);
          if (distToPlayer < cfg.aggro) {
            e.state = 'chase';
            e.t = 0;
            audio.pickup();
          }
        } else if (e.state === 'chase') {
          const d = moveToward(e, pp.x, pp.z, cfg.speed, dt);
          separate(e);
          if (d <= cfg.range) {
            e.state = 'windup';
            e.t = 0;
          }
        } else if (e.state === 'windup') {
          // Telegraph: swell and brighten, still turning toward the player.
          e.vel.x *= 0.8; e.vel.z *= 0.8;
          const target = Math.atan2(dx, dz);
          let d = target - e.group.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          e.group.rotation.y += d * Math.min(1, dt * 10);
          const pulse = 1 + Math.sin(e.t * 22) * 0.06 * (e.t / cfg.windup);
          e.group.scale.setScalar(pulse);
          e.bodyMat.emissiveIntensity = 0.35 + (e.t / cfg.windup) * 1.8;

          if (e.t >= cfg.windup) {
            e.state = 'recover';
            e.t = 0;
            e.group.scale.setScalar(1);
            e.bodyMat.emissiveIntensity = 0.35;
            const now = Math.hypot(pp.x - e.root.position.x, pp.z - e.root.position.z);
            if (now <= cfg.range + 0.9) {
              player.takeDamage(cfg.dmg, e.root.position);
            }
          }
        } else if (e.state === 'recover') {
          e.vel.x *= 0.86; e.vel.z *= 0.86;
          if (e.t > 0.65) { e.state = 'chase'; e.t = 0; }
        } else if (e.state === 'stagger') {
          e.vel.x *= 0.9; e.vel.z *= 0.9;
          if (e.t > 0.18) { e.state = 'chase'; e.t = 0; }
        }
      }

      // Apply velocity + terrain follow
      e.root.position.x += e.vel.x * dt;
      e.root.position.z += e.vel.z * dt;
      e.vel.multiplyScalar(1 - Math.min(1, dt * 4.5));

      const float = cfg.bob * (0.9 + Math.sin(e.phase) * 0.28);
      const ground = groundAt(e.root.position.x, e.root.position.z);
      e.root.position.y += (ground + float - e.root.position.y) * Math.min(1, dt * 8);

      // Health bar
      ctx.ui.placeBar(e.bar, e.root.position, e.hp / e.maxHp, distToPlayer < 26);
    }

    // --- Shard pickups ---
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.age += dt;
      p.mesh.rotation.y += dt * 3;
      p.mesh.rotation.x += dt * 1.6;
      p.vel.y -= 11 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const g = groundAt(p.mesh.position.x, p.mesh.position.z) + 0.45;
      if (p.mesh.position.y < g) { p.mesh.position.y = g; p.vel.set(p.vel.x * 0.6, 0, p.vel.z * 0.6); }

      const dx = pp.x - p.mesh.position.x;
      const dy = (pp.y + 0.9) - p.mesh.position.y;
      const dz = pp.z - p.mesh.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (p.age > 0.5 && d < 7) {
        const pull = Math.min(26, 12 / Math.max(0.4, d));
        p.vel.x += (dx / d) * pull * dt * 8;
        p.vel.y += (dy / d) * pull * dt * 8;
        p.vel.z += (dz / d) * pull * dt * 8;
      }
      if (d < 1.2 && p.age > 0.4) {
        addShards(5);
        const healed = healPlayer(8);
        ctx.ui.damageNumber(pp, healed > 0 ? `+${healed}` : '+5', 'heal');
        audio.pickup();
        ctx.scene.remove(p.mesh);
        pickups.splice(i, 1);
        saveGame();
      }
    }
  }

  return { list, pickups, spawn, spawnWave, clear, damage, update };
}
