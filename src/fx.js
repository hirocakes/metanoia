// Short-lived combat effects: slashes, bursts and expanding rings.
// Each effect is one mesh animated to death, so nothing accumulates in the scene.

import * as THREE from 'three';

export function createFx(ctx) {
  const active = [];
  const slashGeo = new THREE.TorusGeometry(1.7, 0.075, 6, 28, Math.PI * 1.15);
  const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
  const sparkGeo = new THREE.OctahedronGeometry(0.16, 0);

  function push(mesh, life, tick) {
    mesh.renderOrder = 5;
    ctx.scene.add(mesh);
    active.push({ mesh, life, age: 0, tick });
  }

  return {
    /** Arc of light along a sword swing. */
    slash(pos, yaw, color = '#9ff0ff') {
      const m = new THREE.Mesh(slashGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      m.position.copy(pos);
      m.rotation.set(Math.PI / 2 + 0.5, yaw + Math.PI / 2, Math.PI * 0.15);
      push(m, 0.26, (e, k) => {
        e.mesh.material.opacity = 0.95 * (1 - k);
        e.mesh.scale.setScalar(0.85 + k * 0.7);
      });
    },

    /** Expanding shockwave on the ground. */
    ring(pos, color = '#a98bff', maxScale = 6) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      m.position.copy(pos);
      m.position.y += 0.12;
      m.rotation.x = -Math.PI / 2;
      push(m, 0.55, (e, k) => {
        e.mesh.scale.setScalar(1 + k * maxScale);
        e.mesh.material.opacity = 0.9 * (1 - k) * (1 - k * 0.4);
      });
    },

    /** Small radial spark burst. */
    burst(pos, color = '#ffd479', count = 10, spread = 3.4) {
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending
        }));
        m.position.copy(pos);
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const up = 1.5 + Math.random() * 2.4;
        const vel = new THREE.Vector3(Math.cos(a) * spread * (0.5 + Math.random() * 0.5), up, Math.sin(a) * spread * (0.5 + Math.random() * 0.5));
        push(m, 0.55 + Math.random() * 0.3, (e, k, dt) => {
          e.mesh.position.addScaledVector(vel, dt);
          vel.y -= 9 * dt;
          e.mesh.material.opacity = 1 - k;
          e.mesh.scale.setScalar(1 - k * 0.6);
        });
      }
    },

    update(dt) {
      for (let i = active.length - 1; i >= 0; i--) {
        const e = active[i];
        e.age += dt;
        const k = Math.min(1, e.age / e.life);
        e.tick(e, k, dt);
        if (k >= 1) {
          ctx.scene.remove(e.mesh);
          e.mesh.material.dispose();
          active.splice(i, 1);
        }
      }
    },

    clear() {
      for (const e of active) { ctx.scene.remove(e.mesh); e.mesh.material.dispose(); }
      active.length = 0;
    }
  };
}
