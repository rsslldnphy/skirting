import '@fontsource-variable/fraunces';
import '@fontsource-variable/space-grotesk';
import './style.css';
import { loadState, newRoom, saveState, uid } from './state';
import { readSharedState, shareUrl } from './share';
import type { Board, PlanResult, Room } from './types';

const ROOM_COLORS = ['#3b76d4', '#e07b2f', '#1f9d6b', '#c2477f', '#7c5cd6', '#c29a1b', '#1d9aa6', '#d24b4b'];

let state = loadState();

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (v: string) => {
  const n = parseFloat(v.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const roomColor = (roomId: string) => {
  const i = state.rooms.findIndex((r) => r.id === roomId);
  return ROOM_COLORS[(i < 0 ? 0 : i) % ROOM_COLORS.length];
};

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="top">
    <h1>Skirting</h1>
    <div class="bar">
      <div class="bar-group">
        <span class="bar-label">Margin</span>
        <label class="inline"><input id="marginPct" type="number" min="0" step="0.5" inputmode="decimal" aria-label="Margin percent"><span>%</span></label>
        <label class="inline"><span>min</span><input id="marginMin" type="number" min="0" step="5" inputmode="numeric" aria-label="Minimum margin in mm"></label>
        <label class="inline"><span>max</span><input id="marginMax" type="number" min="0" step="5" inputmode="numeric" aria-label="Maximum margin in mm"><span>mm</span></label>
      </div>
      <div class="bar-group boards">
        <span class="bar-label">Boards</span>
        <div class="tags" id="stock">
          <input id="new-stock" type="text" inputmode="numeric" placeholder="Add…" aria-label="Add a board length in mm, then press Enter">
        </div>
      </div>
    </div>
    <button class="share" data-action="share" type="button">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L10 5m1.5 3.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1"/></svg>
      Share
    </button>
  </header>

  <main class="layout">
    <section class="walls-col">
      <div class="section-head">
        <h2>Walls</h2>
        <button class="link" data-action="clear" type="button">Clear</button>
      </div>
      <div id="rooms"></div>
      <button class="link add-room" data-action="add-room" type="button">+ Add room</button>
    </section>
    <section class="results" id="results" aria-live="polite"></section>
  </main>
  <div class="toast" id="toast" role="status"></div>
`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const roomsEl = $('#rooms');
const stockEl = $('#stock');
const stockInput = $<HTMLInputElement>('#new-stock');
const resultsEl = $('#results');

function persistAndSolve() {
  saveState(state);
  schedule();
}

let toastTimer: number | undefined;
function toast(message: string) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- Rooms ----------

const roomTotal = (r: Room) => r.walls.reduce((t, w) => t + (w.length > 0 ? w.length : 0), 0);

function renderRooms() {
  roomsEl.innerHTML = state.rooms
    .map(
      (room) => `
    <div class="room" data-room="${room.id}" style="--c:${roomColor(room.id)}">
      <div class="room-head">
        <i class="dot" aria-hidden="true"></i>
        <input class="room-name" data-field="room-name" value="${esc(room.name)}" aria-label="Room name" placeholder="Room name">
        <span class="room-total" data-total>${fmt(roomTotal(room))}</span>
        <button class="x" data-action="remove-room" type="button" aria-label="Remove ${esc(room.name)}">×</button>
      </div>
      ${room.walls
        .map(
          (w) => `
        <div class="wall" data-wall="${w.id}">
          <input data-field="wall-name" value="${esc(w.name)}" aria-label="Wall name" placeholder="Wall">
          <label class="len"><input data-field="wall-length" type="number" min="0" step="1" inputmode="numeric" value="${w.length || ''}" placeholder="0" aria-label="Length in mm"><span>mm</span></label>
          <button class="x" data-action="remove-wall" type="button" aria-label="Remove wall">×</button>
        </div>`,
        )
        .join('')}
      <button class="link add-wall" data-action="add-wall" type="button">+ Add wall</button>
    </div>`,
    )
    .join('');
}

const findRoom = (el: Element) => state.rooms.find((r) => r.id === el.closest<HTMLElement>('[data-room]')?.dataset.room);

roomsEl.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  const room = findRoom(t);
  if (!room) return;
  const field = t.dataset.field;
  if (field === 'room-name') room.name = t.value;
  else {
    const wall = room.walls.find((w) => w.id === t.closest<HTMLElement>('[data-wall]')?.dataset.wall);
    if (!wall) return;
    if (field === 'wall-name') wall.name = t.value;
    if (field === 'wall-length') {
      wall.length = Math.max(0, num(t.value));
      t.closest('.room')!.querySelector('[data-total]')!.textContent = fmt(roomTotal(room));
    }
  }
  persistAndSolve();
});

function addWall(room: Room, afterId?: string) {
  const wall = { id: uid(), name: `Wall ${room.walls.length + 1}`, length: 0 };
  const at = afterId ? room.walls.findIndex((w) => w.id === afterId) + 1 : room.walls.length;
  room.walls.splice(at, 0, wall);
  renderRooms();
  roomsEl.querySelector<HTMLInputElement>(`[data-wall="${wall.id}"] input`)?.select();
  persistAndSolve();
}

// Enter in a length field adds the next wall.
roomsEl.addEventListener('keydown', (e) => {
  const t = e.target as HTMLInputElement;
  if (e.key !== 'Enter' || t.dataset.field !== 'wall-length') return;
  e.preventDefault();
  const room = findRoom(t);
  if (room) addWall(room, t.closest<HTMLElement>('[data-wall]')?.dataset.wall);
});

app.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'share') share();
  else if (action === 'print') window.print();
  else if (action === 'add-room') {
    const room = newRoom(`Room ${state.rooms.length + 1}`);
    state.rooms.push(room);
    renderRooms();
    roomsEl.querySelector<HTMLInputElement>(`[data-room="${room.id}"] .room-name`)?.select();
    persistAndSolve();
  } else if (action === 'clear') {
    if (!confirm('Clear all rooms and walls?')) return;
    state.rooms = [newRoom('Room 1')];
    renderRooms();
    persistAndSolve();
  } else {
    const room = findRoom(btn);
    if (!room) return;
    if (action === 'add-wall') return addWall(room);
    if (action === 'remove-room') state.rooms = state.rooms.filter((r) => r !== room);
    if (action === 'remove-wall')
      room.walls = room.walls.filter((w) => w.id !== btn.closest<HTMLElement>('[data-wall]')?.dataset.wall);
    renderRooms();
    persistAndSolve();
  }
});

// ---------- Settings ----------

const marginInputs = ['marginPct', 'marginMin', 'marginMax'] as const;

function renderSettings() {
  const s = state.settings;
  for (const k of marginInputs) $<HTMLInputElement>(`#${k}`).value = String(s[k]);
  renderStock();
}

for (const k of marginInputs) {
  $<HTMLInputElement>(`#${k}`).addEventListener('input', (e) => {
    state.settings[k] = Math.max(0, num((e.target as HTMLInputElement).value));
    persistAndSolve();
  });
}

function renderStock() {
  stockEl.querySelectorAll('.tag').forEach((t) => t.remove());
  const tags = [...state.settings.stock]
    .sort((a, b) => a - b)
    .map(
      (l) =>
        `<span class="tag">${fmt(l)}<button type="button" data-stock-remove="${l}" aria-label="Remove ${fmt(l)} mm">×</button></span>`,
    )
    .join('');
  stockInput.insertAdjacentHTML('beforebegin', tags);
}

function commitStock(): boolean {
  const len = Math.round(num(stockInput.value));
  if (!stockInput.value.trim()) return false;
  if (len < 100 || len > 20000) {
    stockEl.classList.add('invalid');
    return false;
  }
  if (!state.settings.stock.includes(len)) state.settings.stock.push(len);
  stockInput.value = '';
  renderStock();
  persistAndSolve();
  return true;
}

stockInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
    e.preventDefault();
    commitStock();
  } else if (e.key === 'Backspace' && !stockInput.value && state.settings.stock.length) {
    const sorted = [...state.settings.stock].sort((a, b) => a - b);
    state.settings.stock = state.settings.stock.filter((l) => l !== sorted[sorted.length - 1]);
    renderStock();
    persistAndSolve();
  }
});
stockInput.addEventListener('input', () => stockEl.classList.remove('invalid'));
stockInput.addEventListener('blur', () => {
  if (!commitStock()) {
    stockInput.value = '';
    stockEl.classList.remove('invalid');
  }
});
stockEl.addEventListener('click', (e) => {
  const rm = (e.target as HTMLElement).closest<HTMLElement>('[data-stock-remove]');
  if (rm) {
    state.settings.stock = state.settings.stock.filter((l) => l !== Number(rm.dataset.stockRemove));
    renderStock();
    persistAndSolve();
  }
  stockInput.focus();
});

// ---------- Sharing ----------

async function share() {
  const url = await shareUrl(state);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: 'Skirting calculator', url });
      return;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    prompt('Copy this link:', url);
  }
}

// ---------- Solving ----------

let worker: Worker | null = null;
let busy = false;
let reqId = 0;
let timer: number | undefined;

function schedule() {
  clearTimeout(timer);
  resultsEl.classList.add('is-computing');
  timer = window.setTimeout(solve, 250);
}

function solve() {
  // Abandon an in-flight search: its answer is already out of date.
  if (busy && worker) {
    worker.terminate();
    worker = null;
  }
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: PlanResult }>) => {
      if (e.data.id !== reqId) return;
      busy = false;
      resultsEl.classList.remove('is-computing');
      renderResults(e.data.result);
    };
  }
  busy = true;
  worker.postMessage({ id: ++reqId, rooms: state.rooms, settings: state.settings });
}

// ---------- Results ----------

function renderResults(p: PlanResult) {
  if (p.boards.length === 0) {
    resultsEl.innerHTML = `<div class="empty">${
      p.errors.length ? p.errors.map((e) => `<p class="warn">${esc(e)}</p>`).join('') : '<p>Add wall lengths to see what to order.</p>'
    }</div>`;
    return;
  }

  const maxStock = Math.max(...p.boards.map((b) => b.stock));
  resultsEl.innerHTML = `
    <div class="order">
      ${p.order.map((o) => `<div class="order-line"><b>${o.count}</b><span>× ${fmt(o.length)} mm</span></div>`).join('')}
    </div>
    ${p.errors.map((e) => `<p class="warn">${esc(e)}</p>`).join('')}
    <div class="section-head guide-head">
      <h2>Cutting guide</h2>
      <button class="link" data-action="print" type="button">Print</button>
    </div>
    <div class="guide">${p.boards.map((b, i) => renderBoard(b, i, maxStock)).join('')}</div>
    <p class="hint">Lengths in mm, each including its margin (the faded end).</p>
  `;
}

function renderBoard(b: Board, index: number, maxStock: number): string {
  const pct = (mm: number) => (mm / b.stock) * 100;
  const segs = b.pieces.map((pc) => {
    const label = `${pc.roomName || 'Room'} · ${pc.wallName || 'Wall'}${pc.parts > 1 ? ` ${pc.part}/${pc.parts}` : ''}`;
    return `
      <div class="seg" style="width:${pct(pc.cut)}%;--c:${roomColor(pc.roomId)}" title="${esc(`${label}\nCut ${fmt(pc.cut)} (${fmt(pc.length)} + ${fmt(pc.margin)} margin)`)}">
        <span class="seg-len">${fmt(pc.cut)}</span>
        <span class="seg-line"><i style="flex:${pc.length}"></i><i class="m" style="flex:${pc.margin}"></i></span>
        <span class="seg-name">${esc(label)}</span>
      </div>`;
  });
  if (b.offcut > 0) {
    segs.push(`
      <div class="seg off" style="width:${pct(b.offcut)}%" title="Offcut ${fmt(b.offcut)} mm">
        <span class="seg-len">${fmt(b.offcut)}</span>
        <span class="seg-line"></span>
        <span class="seg-name">offcut</span>
      </div>`);
  }
  return `
    <div class="board">
      <div class="board-meta"><span class="idx">${String(index + 1).padStart(2, '0')}</span>${fmt(b.stock)}</div>
      <div class="track" style="width:${(b.stock / maxStock) * 100}%">${segs.join('')}</div>
    </div>`;
}

// ---------- Start ----------

async function start() {
  const shared = await readSharedState();
  if (shared) {
    state = shared;
    saveState(state);
    history.replaceState(null, '', location.pathname + location.search);
    toast('Loaded shared measurements');
  }
  renderRooms();
  renderSettings();
  schedule();
}

start();
