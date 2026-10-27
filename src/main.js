// Boot, game loop and screen flow.

import * as THREE from 'three';
import './style.css';
import { input, setupInput, sampleInput } from './input.js';
import { game, on, resetRun, loadGame, hasSave, clearSave, saveGame } from './state.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createEnemies } from './enemies.js';
import { createFx } from './fx.js';
import { createUi } from './ui.js';
import { audio } from './audio.js';

const canvas = document.getElementById('game');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 600);

const ctx = { scene, camera, renderer, ui: null, player: null, enemies: null, fx: null, world: null };

// --- UI first: every other module reports into it ---
const ui = createUi(ctx, {
  onNew() { startRun(false); },
  onContinue() { startRun(true); },
  onResume() { resume(); },
  onRestart() { startRun(false); },
  onTitle() { toTitle(); },
  onPause() { togglePause(); }
});
ctx.ui = ui;

const world = createWorld(ctx);
ctx.world = world;

const fx = createFx(ctx);
ctx.fx = fx;

const player = createPlayer(ctx);
ctx.player = player;

const enemies = createEnemies(ctx);
ctx.enemies = enemies;

setupInput(canvas, {
  stickZone: document.getElementById('stick-zone'),
  stickBase: document.getElementById('stick-base'),
  stickKnob: document.getElementById('stick-knob'),
  btnAttack: document.getElementById('btn-attack'),
  btnDash: document.getElementById('btn-dash'),
  btnSkill: document.getElementById('btn-skill')
});

input.onPause = () => togglePause();

// --- Game flow ---
function startRun(fromSave) {
  audio.unlock();
  if (!fromSave) clearSave();
  resetRun();
  enemies.clear();
  fx.clear();
  if (fromSave) loadGame();
  player.spawn();
  player.resetSwing();
  enemies.spawnWave();
  ui.showScreen(null);
  ui.banner(fromSave ? 'The memory returns' : 'Find the Regrets', 1800);
  ui.setHint('Clear 8 Regrets to achieve metanoia', 3200);
}

function togglePause() {
  if (game.mode === 'play') {
    game.mode = 'pause';
    ui.showPause();
  } else if (game.mode === 'pause') {
    resume();
  }
}

function resume() {
  if (game.mode !== 'pause') return;
  game.mode = 'play';
  ui.showScreen(null);
}

function toTitle() {
  game.mode = 'title';
  saveGame();
  ui.refreshSaveState(hasSave());
  ui.showScreen('title');
}

on('levelup', (level) => {
  ui.banner(`LEVEL ${level}`, 1500);
  fx.ring(player.position.clone(), '#ffe08a', 5);
  fx.burst(player.position.clone().setY(player.position.y + 1.2), '#ffe08a', 14, 4.5);
  audio.levelup();
  ui.els.hud.classList.remove('shake');
  void ui.els.hud.offsetWidth;
  ui.els.hud.classList.add('shake');
});

on('gameover', (result) => {
  audio[result === 'victory' ? 'victory' : 'defeat']();
  setTimeout(() => {
    if (result === 'victory') clearSave();
    ui.showEnd(result);
    ui.els.hud.classList.add('hidden');
  }, 900);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'play') togglePause();
});
window.addEventListener('contextmenu', (e) => {
  if (e.target === canvas) e.preventDefault();
});

// --- Loop ---
let last = performance.now();
let hudAccum = 0;
let saveTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  world.update(dt);

  if (game.mode === 'play') {
    game.elapsed += dt;
    sampleInput();
    player.update(dt);
    enemies.update(dt);
    hudAccum += dt;
    if (hudAccum > 0.08) { hudAccum = 0; ui.updateHud(); }
    saveTimer += dt;
    if (saveTimer > 6) { saveTimer = 0; saveGame(); }
  } else {
    input.look.x = 0; input.look.y = 0; input.zoom = 0;
    input.actions.attack = input.actions.dash = input.actions.skill = input.actions.jump = false;
  }

  fx.update(dt);
  ui.updateFloaters(dt);
  renderer.render(scene, camera);
}

ui.refreshSaveState(hasSave());
ui.showScreen('title');
ui.els.hud.classList.add('hidden');
requestAnimationFrame(frame);

// Expose a tiny surface for automated smoke tests / debugging.
window.__METANOIA__ = { ctx, game, startRun, renderer };
