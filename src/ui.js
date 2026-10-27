// DOM layer: HUD, floating combat text, enemy health bars and menus.
// Kept out of the render loop's way — it only ever touches styles and transforms.

import * as THREE from 'three';
import { game } from './state.js';
import { audio } from './audio.js';

const KIND_STYLE = {
  normal: { cls: 'f-normal', size: 26 },
  crit: { cls: 'f-crit', size: 40 },
  skill: { cls: 'f-skill', size: 34 },
  player: { cls: 'f-player', size: 30 },
  heal: { cls: 'f-heal', size: 24 }
};

export function createUi(ctx, handlers) {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'),
    title: $('title-screen'),
    pause: $('pause-screen'),
    end: $('end-screen'),
    hpFill: $('hp-fill'), hpText: $('hp-text'),
    xpFill: $('xp-fill'), xpText: $('xp-text'),
    level: $('level-num'),
    kills: $('kill-count'), killTarget: $('kill-target'),
    shards: $('shard-count'),
    floaterLayer: $('floaters'),
    barLayer: document.createElement('div'),
    banner: $('banner'),
    hint: $('hint'),
    vignette: $('damage-vignette'),
    cdDash: document.querySelector('#btn-dash .cd'),
    cdSkill: document.querySelector('#btn-skill .cd'),
    endTitle: $('end-title'), endText: $('end-text'), endStats: $('end-stats'),
    pauseStats: $('pause-stats'),
    btnContinue: $('btn-continue'),
    btnMute: $('mute-btn')
  };

  els.barLayer.id = 'enemy-bars';
  document.body.appendChild(els.barLayer);

  els.killTarget.textContent = String(game.questTarget);

  // ---------- Floating combat text ----------
  const floaters = [];
  const floaterPool = [];
  const proj = new THREE.Vector3();

  function project(pos) {
    proj.copy(pos);
    proj.y += 1.4;
    proj.project(ctx.camera);
    if (proj.z > 1 || proj.z < -1) return null;
    return {
      x: (proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-proj.y * 0.5 + 0.5) * window.innerHeight
    };
  }

  function damageNumber(worldPos, text, kind = 'normal') {
    const style = KIND_STYLE[kind] || KIND_STYLE.normal;
    let f = floaterPool.pop();
    if (!f) {
      f = document.createElement('div');
      els.floaterLayer.appendChild(f);
    }
    f.el.textContent = String(text);
    f.el.className = 'floater ' + style.cls;
    f.el.style.fontSize = style.size + 'px';
    f.el.style.opacity = '1';
    f.pos = worldPos.clone ? worldPos.clone() : new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    f.age = 0;
    f.life = kind === 'crit' || kind === 'skill' ? 1.15 : 0.9;
    f.drift = (Math.random() - 0.5) * 60;
    floaters.push(f);
  }

  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) {
        floaters.splice(i, 1);
        floaterPool.push(f);
        f.el.style.opacity = '0';
        f.el.style.transform = 'translate(-9999px,-9999px)';
        continue;
      }
      const p = project(f.pos);
      if (!p) { f.el.style.opacity = '0'; continue; }
      f.el.style.opacity = String(1 - k * k);
      f.el.style.transform =
        `translate(-50%,-50%) translate3d(${p.x + f.drift * k}px, ${p.y - k * 90}px, 0) scale(${1 + (1 - k) * 0.25})`;
    }
  }

  // ---------- Enemy health bars ----------
  function createBar(color) {
    const el = document.createElement('div');
    el.className = 'enemy-bar';
    el.innerHTML = '<i></i>';
    el.style.setProperty('--bar-color', color);
    el.style.opacity = '0';
    els.barLayer.appendChild(el);
    return el;
  }

  function placeBar(el, worldPos, ratio, visible) {
    if (!el) return;
    if (!visible) { el.style.opacity = '0'; return; }
    const p = project(worldPos);
    if (!p || p.y < -40 || p.y > window.innerHeight + 40) { el.style.opacity = '0'; return; }
    el.style.opacity = '1';
    el.style.transform = `translate(-50%,-50%) translate3d(${p.x}px, ${p.y - 6}px, 0)`;
    const fill = el.firstChild;
    if (fill) fill.style.width = Math.max(0, Math.min(100, ratio * 100)) + '%';
  }

  // ---------- Feedback ----------
  function damageFlash() {
    els.vignette.style.transition = 'none';
    els.vignette.style.opacity = '0.85';
    requestAnimationFrame(() => {
      els.vignette.style.transition = 'opacity 480ms ease-out';
      els.vignette.style.opacity = '0';
    });
  }

  let bannerTimer = 0;
  function banner(text, ms = 1400) {
    els.banner.textContent = text;
    els.banner.classList.remove('hidden');
    els.banner.classList.remove('pop');
    void els.banner.offsetWidth;
    els.banner.classList.add('pop');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => els.banner.classList.add('hidden'), ms);
  }

  let hintTimer = 0;
  function setHint(text, ms = 1800) {
    els.hint.textContent = text;
    els.hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => els.hint.classList.remove('show'), ms);
  }

  // ---------- HUD ----------
  const shown = { hp: -1, xp: -1, level: -1, shards: -1, kills: -1, dash: -1, skill: -1 };

  function updateHud() {
    if (shown.hp !== game.hp || shown.maxHp !== game.maxHp) {
      shown.hp = game.hp; shown.maxHp = game.maxHp;
      const pct = (game.hp / game.maxHp) * 100;
      els.hpFill.style.width = pct + '%';
      els.hpFill.classList.toggle('low', pct < 30);
      els.hpText.textContent = `${Math.ceil(game.hp)}/${game.maxHp}`;
    }
    if (shown.xp !== game.xp || shown.level !== game.level) {
      shown.xp = game.xp; shown.level = game.level;
      els.xpFill.style.width = (game.xp / game.xpNext) * 100 + '%';
      els.xpText.textContent = `${game.xp}/${game.xpNext}`;
      els.level.textContent = String(game.level);
    }
    if (shown.kills !== game.kills) {
      shown.kills = game.kills;
      els.kills.textContent = String(game.kills);
    }
    if (shown.shards !== game.shards) {
      shown.shards = game.shards;
      els.shards.textContent = String(game.shards);
    }
    const dash = Math.ceil(game.dashCd * 10) / 10;
    if (shown.dash !== dash) {
      shown.dash = dash;
      els.cdDash.style.background = game.dashCd > 0
        ? `conic-gradient(rgba(6,8,16,.7) ${(game.dashCd / game.dashMax) * 360}deg, transparent 0)`
        : 'transparent';
    }
    const skill = Math.ceil(game.skillCd * 10) / 10;
    if (shown.skill !== skill) {
      shown.skill = skill;
      els.cdSkill.style.background = game.skillCd > 0
        ? `conic-gradient(rgba(6,8,16,.7) ${(game.skillCd / game.skillMax) * 360}deg, transparent 0)`
        : 'transparent';
    }
  }

  // ---------- Screens ----------
  function showScreen(name) {
    els.title.classList.toggle('hidden', name !== 'title');
    els.pause.classList.toggle('hidden', name !== 'pause');
    els.end.classList.toggle('hidden', name !== 'end');
    els.hud.classList.toggle('hidden', name === 'title');
  }

  function statsHtml() {
    return `
      <div class="stat"><span>Level</span><b>${game.level}</b></div>
      <div class="stat"><span>Regrets dissolved</span><b>${game.kills}/${game.questTarget}</b></div>
      <div class="stat"><span>Shards</span><b>${game.shards}</b></div>
      <div class="stat"><span>Attack</span><b>${game.atk}</b></div>
      <div class="stat"><span>Time</span><b>${formatTime(game.elapsed)}</b></div>`;
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function showEnd(result) {
    els.endTitle.textContent = result === 'victory' ? 'METANOIA' : 'DISSOLVED';
    els.endText.textContent = result === 'victory'
      ? 'You faced what ran from you. The self you refused is finally still.'
      : 'The Regrets closed in. Rise again — remembering is the point.';
    els.endStats.innerHTML = statsHtml();
    showScreen('end');
  }

  function showPause() {
    els.pauseStats.innerHTML = statsHtml();
    showScreen('pause');
  }

  function refreshSaveState(hasSave) {
    els.btnContinue.classList.toggle('hidden', !hasSave);
  }

  // ---------- Wiring ----------
  handlers = handlers || {};
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); };
  on('btn-new', () => handlers.onNew && handlers.onNew());
  on('btn-continue', () => handlers.onContinue && handlers.onContinue());
  on('btn-resume', () => handlers.onResume && handlers.onResume());
  on('btn-restart', () => handlers.onRestart && handlers.onRestart());
  on('btn-again', () => handlers.onRestart && handlers.onRestart());
  on('btn-title', () => handlers.onTitle && handlers.onTitle());
  on('pause-btn', () => handlers.onPause && handlers.onPause());
  els.btnMute.addEventListener('click', () => {
    const muted = audio.toggle();
    els.btnMute.classList.toggle('off', muted);
    setHint(muted ? 'Sound off' : 'Sound on', 900);
  });

  return {
    els,
    damageNumber,
    updateFloaters,
    createBar,
    placeBar,
    damageFlash,
    banner,
    setHint,
    updateHud,
    showScreen,
    showEnd,
    showPause,
    refreshSaveState,
    formatTime
  };
}
