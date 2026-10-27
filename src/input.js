// Unified input: keyboard + mouse on desktop, virtual stick + touch-drag on mobile.
// Gameplay code only ever reads `input.move`, `input.look` and `input.actions`.

export const input = {
  move: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  zoom: 0,
  actions: { attack: false, dash: false, skill: false, jump: false },
  onPause: null,
  touch: false
};

const keys = new Set();
const joy = { active: false, x: 0, y: 0, id: null };
let dragging = null;
let lookStart = null;
let mouseDownAt = null;

const STICK_RADIUS = 56;

function press(name) { input.actions[name] = true; }

export function setupInput(canvas, els) {
  const { stickZone, stickKnob, stickBase } = els;

  const keyMap = {
    KeyJ: 'attack', KeyK: 'skill', Space: 'jump',
    ShiftLeft: 'dash', ShiftRight: 'dash'
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Escape' || e.code === 'KeyP') input.onPause && input.onPause();
    const action = keyMap[e.code];
    if (action) { press(action); e.preventDefault(); }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // --- Mouse / touch look: dragging on empty canvas orbits the camera ---
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse' && e.button === 0) mouseDownAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (e.pointerType !== 'mouse') input.touch = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || dragging.id !== e.pointerId) return;
    input.look.x += e.clientX - dragging.x;
    input.look.y += e.clientY - dragging.y;
    dragging.x = e.clientX;
    dragging.y = e.clientY;
  });
  const endDrag = (e) => {
    if (dragging && dragging.id === e.pointerId) dragging = null;
    if (mouseDownAt && e.pointerType === 'mouse') {
      const dist = Math.hypot(e.clientX - mouseDownAt.x, e.clientY - mouseDownAt.y);
      if (dist < 6 && performance.now() - mouseDownAt.t < 350) press('attack');
      mouseDownAt = null;
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => { input.zoom += e.deltaY * 0.004; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- Virtual stick ---
  const stickCenter = () => {
    const r = stickBase.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  stickZone.addEventListener('pointerdown', (e) => {
    input.touch = true;
    stickZone.setPointerCapture(e.pointerId);
    joy.active = true;
    joy.id = e.pointerId;
    updateStick(e);
    e.preventDefault();
  });
  stickZone.addEventListener('pointermove', (e) => {
    if (joy.active && joy.id === e.pointerId) updateStick(e);
  });
  const endStick = (e) => {
    if (joy.id !== e.pointerId) return;
    joy.active = false; joy.id = null; joy.x = 0; joy.y = 0;
    stickKnob.style.transform = 'translate(-50%, -50%)';
  };
  stickZone.addEventListener('pointerup', endStick);
  stickZone.addEventListener('pointercancel', endStick);

  function updateStick(e) {
    const c = stickCenter();
    let dx = e.clientX - c.x;
    let dy = e.clientY - c.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
    joy.x = dx / STICK_RADIUS;
    joy.y = -dy / STICK_RADIUS;
    stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  // --- Action buttons ---
  const bind = (el, action) => {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      input.touch = true;
      press(action);
    });
  };
  bind(els.btnAttack, 'attack');
  bind(els.btnDash, 'dash');
  bind(els.btnSkill, 'skill');
}

/** Called once per frame: collapses raw input into a normalized move vector. */
export function sampleInput() {
  let x = 0, y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  x += joy.x; y += joy.y;

  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  input.move.x = x;
  input.move.y = y;
}
