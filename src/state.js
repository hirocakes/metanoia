// Core game state, progression rules and persistence.
// All gameplay numbers live here so balance changes never touch render code.

const SAVE_KEY = 'metanoia.save.v1';

export const game = {
  mode: 'title', // title | play | pause | over
  level: 1,
  xp: 0,
  xpNext: 100,
  hp: 100,
  maxHp: 100,
  atk: 14,
  shards: 0,
  kills: 0,
  questTarget: 8,
  dashCd: 0,
  dashMax: 1.1,
  skillCd: 0,
  skillMax: 6,
  elapsed: 0,
  combo: 0,
  comboWindow: 0,
  result: null // 'victory' | 'defeat'
};

// Tiny event bus so state changes can drive UI/audio without import cycles.
const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(fn);
}
export function emit(event, payload) {
  const fns = listeners.get(event);
  if (fns) for (const fn of fns) fn(payload);
}

export function xpForLevel(level) {
  return Math.round(100 * Math.pow(level, 1.32));
}

/** Returns the number of levels gained. */
export function addXp(amount) {
  game.xp += amount;
  let gained = 0;
  while (game.xp >= game.xpNext) {
    game.xp -= game.xpNext;
    game.level += 1;
    game.xpNext = xpForLevel(game.level);
    game.maxHp += 18;
    game.atk += 5;
    game.hp = game.maxHp;
    gained += 1;
    emit('levelup', game.level);
  }
  return gained;
}

export function damagePlayer(amount) {
  if (game.mode !== 'play') return 0;
  game.hp = Math.max(0, game.hp - amount);
  if (game.hp === 0) {
    game.result = 'defeat';
    game.mode = 'over';
    emit('gameover', 'defeat');
  }
  return amount;
}

export function healPlayer(amount) {
  const before = game.hp;
  game.hp = Math.min(game.maxHp, game.hp + amount);
  return game.hp - before;
}

export function addShards(n) {
  game.shards += n;
}

export function registerKill(xp) {
  game.kills += 1;
  addXp(xp);
  emit('kill', game.kills);
  if (game.kills >= game.questTarget) {
    game.result = 'victory';
    game.mode = 'over';
    emit('gameover', 'victory');
  }
  saveGame();
}

export function tickCooldowns(dt) {
  if (game.dashCd > 0) game.dashCd = Math.max(0, game.dashCd - dt);
  if (game.skillCd > 0) game.skillCd = Math.max(0, game.skillCd - dt);
  if (game.comboWindow > 0) {
    game.comboWindow -= dt;
    if (game.comboWindow === 0) game.combo = 0;
  }
}

export function resetRun() {
  Object.assign(game, {
    mode: 'play',
    level: 1,
    xp: 0,
    xpNext: 100,
    hp: 100,
    maxHp: 100,
    atk: 14,
    shards: 0,
    kills: 0,
    dashCd: 0,
    skillCd: 0,
    elapsed: 0,
    combo: 0,
    comboWindow: 0,
    result: null
  });
}

export function saveGame() {
  try {
    const { level, xp, xpNext, hp, maxHp, atk, shards, kills, questTarget, elapsed, skillMax, dashMax } = game;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      level, xp, xpNext, hp, maxHp, atk, shards, kills, questTarget, elapsed, skillMax, dashMax
    }));
  } catch (_) { /* private mode / storage full — saving is best-effort */ }
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (_) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(game, data, { mode: 'play', dashCd: 0, skillCd: 0, combo: 0, comboWindow: 0, result: null });
    return true;
  } catch (_) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ }
}
