import './style.css';
import { marginFor } from './margin';
import { defaultSettings, defaultState, loadState, newRoom, saveState, uid } from './state';
import type { Board, Goal, PlanResult, Room } from './types';

const ROOM_COLORS = ['#3b82c4', '#d9822b', '#2f9e6e', '#b1498f', '#7a5cc7', '#c4a431', '#2aa3a8', '#d2555a'];

let state = loadState();

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const metres = (mm: number) => `${(mm / 1000).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const roomColor = (roomId: string) => {
  const i = state.rooms.findIndex((r) => r.id === roomId);
  return ROOM_COLORS[(i < 0 ? 0 : i) % ROOM_COLORS.length];
};

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="hero">
    <div class="hero-inner">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
          <rect x="3" y="15" width="34" height="15" rx="2.5" fill="var(--wood)"/>
          <rect x="3" y="15" width="34" height="4" rx="2" fill="var(--wood-light)"/>
          <path d="M14 11v23M26 11v23" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="2.5 2"/>
        </svg>
        <div>
          <h1>Skirting calculator</h1>
          <p>Measure your walls, pick your board lengths, and get a cutting plan that uses as little board as possible.</p>
        </div>
      </div>
    </div>
  </header>

  <main class="layout">
    <section class="card rooms-card" aria-labelledby="rooms-h">
      <div class="card-head">
        <h2 id="rooms-h"><span class="step">1</span> Rooms &amp; walls</h2>
        <button class="btn ghost small" data-action="reset" type="button">Reset example</button>
      </div>
      <p class="hint">Enter each run of skirting separately (for example, either side of a doorway), in millimetres. Press <kbd>Enter</kbd> in a length to add another wall.</p>
      <div id="rooms"></div>
      <button class="btn add-room" data-action="add-room" type="button">+ Add room</button>
    </section>

    <aside class="settings-col">
      <section class="card" aria-labelledby="margin-h">
        <h2 id="margin-h"><span class="step">2</span> Margin per piece</h2>
        <p class="hint">Extra length added to every piece for trimming, scribing and mitres: a percentage of its length, kept between a minimum and a maximum.</p>
        <div class="field-row three">
          <label class="field"><span>Percentage</span><div class="input-unit"><input id="marginPct" type="number" min="0" step="0.5" inputmode="decimal"><span>%</span></div></label>
          <label class="field"><span>Minimum</span><div class="input-unit"><input id="marginMin" type="number" min="0" step="5" inputmode="numeric"><span>mm</span></div></label>
          <label class="field"><span>Maximum</span><div class="input-unit"><input id="marginMax" type="number" min="0" step="5" inputmode="numeric"><span>mm</span></div></label>
        </div>
        <p class="example" id="margin-example"></p>
      </section>

      <section class="card" aria-labelledby="stock-h">
        <h2 id="stock-h"><span class="step">3</span> Board lengths to order</h2>
        <p class="hint">Choose the lengths you can buy. The planner mixes them to waste as little as possible.</p>
        <div id="stock" class="chips"></div>
        <form id="add-stock" class="add-stock">
          <div class="input-unit"><input id="new-stock" type="number" min="100" step="10" placeholder="Other length" inputmode="numeric" aria-label="Add a board length in mm"><span>mm</span></div>
          <button class="btn small" type="submit">Add</button>
        </form>
      </section>

      <section class="card" aria-labelledby="opts-h">
        <h2 id="opts-h"><span class="step">4</span> Options</h2>
        <div class="field-row two">
          <label class="field"><span>Saw blade width</span><div class="input-unit"><input id="kerf" type="number" min="0" step="0.5" inputmode="decimal"><span>mm</span></div></label>
          <div class="field">
            <span>Optimise for</span>
            <div class="segmented" role="radiogroup" aria-label="Optimise for">
              <label><input type="radio" name="goal" value="length"><span>Least board</span></label>
              <label><input type="radio" name="goal" value="boards"><span>Fewest boards</span></label>
            </div>
          </div>
        </div>
      </section>
    </aside>

    <section class="results" id="results" aria-live="polite"></section>
  </main>
  <footer class="foot">Everything runs in your browser, and your measurements are saved on this device.</footer>
`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const roomsEl = $('#rooms');
const stockEl = $('#stock');
const resultsEl = $('#results');

function persistAndSolve() {
  saveState(state);
  schedule();
}

// ---------- Rooms ----------

const roomTotal = (r: Room) => r.walls.reduce((t, w) => t + (w.length > 0 ? w.length : 0), 0);

function renderRooms() {
  roomsEl.innerHTML = state.rooms
    .map(
      (room) => `
    <div class="room" data-room="${room.id}" style="--c:${roomColor(room.id)}">
      <div class="room-head">
        <span class="swatch" aria-hidden="true"></span>
        <input class="room-name" data-field="room-name" value="${esc(room.name)}" aria-label="Room name" placeholder="Room name">
        <span class="room-total" data-total>${metres(roomTotal(room))}</span>
        <button class="icon-btn" data-action="remove-room" type="button" title="Remove room" aria-label="Remove ${esc(room.name)}">×</button>
      </div>
      <div class="walls">
        ${room.walls
          .map(
            (w) => `
          <div class="wall" data-wall="${w.id}">
            <input class="wall-name" data-field="wall-name" value="${esc(w.name)}" aria-label="Wall name" placeholder="Wall name">
            <div class="input-unit"><input class="wall-length" data-field="wall-length" type="number" min="0" step="1" inputmode="numeric" value="${w.length || ''}" placeholder="0" aria-label="Length in mm"><span>mm</span></div>
            <button class="icon-btn" data-action="remove-wall" type="button" title="Remove wall" aria-label="Remove wall">×</button>
          </div>`,
          )
          .join('')}
      </div>
      <button class="btn ghost small" data-action="add-wall" type="button">+ Add wall</button>
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
      t.closest('.room')!.querySelector('[data-total]')!.textContent = metres(roomTotal(room));
    }
  }
  persistAndSolve();
});

function addWall(room: Room, afterId?: string) {
  const wall = { id: uid(), name: `Wall ${room.walls.length + 1}`, length: 0 };
  const at = afterId ? room.walls.findIndex((w) => w.id === afterId) + 1 : room.walls.length;
  room.walls.splice(at, 0, wall);
  renderRooms();
  const input = roomsEl.querySelector<HTMLInputElement>(`[data-wall="${wall.id}"] .wall-name`);
  input?.focus();
  input?.select();
  persistAndSolve();
}

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
  if (action === 'add-room') {
    const room = newRoom(`Room ${state.rooms.length + 1}`);
    state.rooms.push(room);
    renderRooms();
    roomsEl.querySelector<HTMLInputElement>(`[data-room="${room.id}"] .room-name`)?.select();
    persistAndSolve();
  } else if (action === 'reset') {
    if (!confirm('Replace your rooms and settings with the example?')) return;
    state = defaultState();
    renderAll();
    persistAndSolve();
  } else if (action === 'print') {
    window.print();
  } else {
    const room = findRoom(btn);
    if (!room) return;
    if (action === 'add-wall') addWall(room);
    if (action === 'remove-room') {
      state.rooms = state.rooms.filter((r) => r !== room);
      renderRooms();
      persistAndSolve();
    }
    if (action === 'remove-wall') {
      room.walls = room.walls.filter((w) => w.id !== btn.closest<HTMLElement>('[data-wall]')?.dataset.wall);
      renderRooms();
      persistAndSolve();
    }
  }
});

// ---------- Settings ----------

const settingInputs = ['marginPct', 'marginMin', 'marginMax', 'kerf'] as const;

function renderSettings() {
  const s = state.settings;
  for (const k of settingInputs) $<HTMLInputElement>(`#${k}`).value = String(s[k]);
  app.querySelectorAll<HTMLInputElement>('input[name="goal"]').forEach((r) => (r.checked = r.value === s.goal));
  renderMarginExample();
  renderStock();
}

function renderMarginExample() {
  const s = state.settings;
  const ex = [300, 1500, 4000].map((l) => `${fmt(l)} → <b>+${fmt(marginFor(l, s))}</b>`).join('<span class="dot">·</span>');
  const warn = s.marginMin > s.marginMax ? '<span class="warn">Minimum is above maximum.</span> ' : '';
  $('#margin-example').innerHTML = `${warn}e.g. ${ex} mm`;
}

for (const k of settingInputs) {
  $<HTMLInputElement>(`#${k}`).addEventListener('input', (e) => {
    state.settings[k] = Math.max(0, num((e.target as HTMLInputElement).value));
    renderMarginExample();
    persistAndSolve();
  });
}
app.querySelectorAll<HTMLInputElement>('input[name="goal"]').forEach((r) =>
  r.addEventListener('change', () => {
    state.settings.goal = r.value as Goal;
    persistAndSolve();
  }),
);

function renderStock() {
  const stock = [...state.settings.stock].sort((a, b) => a.length - b.length);
  stockEl.innerHTML = stock
    .map(
      (o) => `
    <span class="chip ${o.selected ? 'on' : ''}">
      <button type="button" data-stock="${o.length}" aria-pressed="${o.selected}">
        <span class="tick" aria-hidden="true"></span>${fmt(o.length)} mm
      </button>
      ${o.custom ? `<button type="button" class="chip-x" data-stock-remove="${o.length}" aria-label="Remove ${o.length} mm">×</button>` : ''}
    </span>`,
    )
    .join('');
}

stockEl.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const rm = t.closest<HTMLElement>('[data-stock-remove]');
  if (rm) {
    state.settings.stock = state.settings.stock.filter((o) => o.length !== Number(rm.dataset.stockRemove));
  } else {
    const b = t.closest<HTMLElement>('[data-stock]');
    const o = b && state.settings.stock.find((x) => x.length === Number(b.dataset.stock));
    if (!o) return;
    o.selected = !o.selected;
  }
  renderStock();
  persistAndSolve();
});

$('#add-stock').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('#new-stock');
  const len = Math.round(num(input.value));
  if (len < 100) return;
  const existing = state.settings.stock.find((o) => o.length === len);
  if (existing) existing.selected = true;
  else state.settings.stock.push({ length: len, selected: true, custom: true });
  input.value = '';
  renderStock();
  persistAndSolve();
});

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
  if (p.errors.length && p.boards.length === 0) {
    resultsEl.innerHTML = `<div class="card empty"><h2>Cutting plan</h2>${p.errors.map((e) => `<p class="warn">${esc(e)}</p>`).join('')}</div>`;
    return;
  }
  if (p.boards.length === 0) {
    resultsEl.innerHTML = `<div class="card empty"><h2>Cutting plan</h2><p class="hint">Add some wall measurements to see how many boards you need.</p></div>`;
    return;
  }

  const offcut = p.totalStock - p.totalWall - p.totalMargin;
  const maxStock = Math.max(...p.boards.map((b) => b.stock));
  const pieceNo = new Map<string, number>();
  let n = 0;
  for (const b of p.boards) for (const pc of b.pieces) pieceNo.set(pc.id, ++n);

  resultsEl.innerHTML = `
    <div class="summary card">
      <div class="summary-main">
        <div class="big">
          <span class="big-num">${p.boards.length}</span>
          <span class="big-label">board${p.boards.length === 1 ? '' : 's'} to order</span>
        </div>
        <div class="order">
          ${p.order.map((o) => `<div class="order-line"><span class="qty">${o.count}×</span><span class="len">${fmt(o.length)} mm</span></div>`).join('')}
        </div>
      </div>
      <dl class="stats">
        <div><dt>Skirting needed</dt><dd>${metres(p.totalWall)}</dd></div>
        <div><dt>Board ordered</dt><dd>${metres(p.totalStock)}</dd></div>
        <div><dt>Margin allowed</dt><dd>${metres(p.totalMargin)}</dd></div>
        <div><dt>Offcuts &amp; saw cuts</dt><dd>${metres(offcut)} <small>${((offcut / p.totalStock) * 100).toFixed(1)}%</small></dd></div>
        <div><dt>Pieces to cut</dt><dd>${p.pieces.length}</dd></div>
        <div><dt>Joins</dt><dd>${p.joins}</dd></div>
      </dl>
      <div class="summary-foot">
        <span class="status ${p.optimal ? 'ok' : ''}">${p.optimal ? '✓ Best possible plan for these lengths' : 'Best plan found in the time available'}</span>
        <button class="btn ghost small" data-action="print" type="button">Print plan</button>
      </div>
      ${p.errors.map((e) => `<p class="warn">${esc(e)}</p>`).join('')}
    </div>

    <div class="legend">
      <span><i class="lg lg-wall"></i>Wall length</span>
      <span><i class="lg lg-margin"></i>Margin</span>
      <span><i class="lg lg-offcut"></i>Offcut</span>
      <span class="legend-note">Measurements above each board are taken from its left end.</span>
    </div>

    <div class="boards">
      ${p.boards.map((b, i) => renderBoard(b, i, maxStock, pieceNo, state.settings.kerf)).join('')}
    </div>
  `;
}

function renderBoard(b: Board, index: number, maxStock: number, pieceNo: Map<string, number>, kerf: number): string {
  const pct = (mm: number) => (mm / b.stock) * 100;
  const parts: string[] = [];
  const marks: { at: number; label: string }[] = [];
  let pos = 0;

  b.pieces.forEach((pc, i) => {
    if (i > 0) {
      parts.push(`<div class="kerf" style="width:${pct(kerf)}%"></div>`);
      pos += kerf;
    }
    pos += pc.cut;
    marks.push({ at: pos, label: fmt(pos) });
    parts.push(`
      <div class="seg${pct(pc.cut) < 4 ? ' narrow tiny' : pct(pc.cut) < 14 ? ' narrow' : ''}" style="width:${pct(pc.cut)}%;--c:${roomColor(pc.roomId)}" title="${esc(`${pc.roomName} · ${pc.wallName}: cut ${fmt(pc.cut)} mm`)}">
        <div class="seg-wall" style="flex:${pc.length}"><span class="seg-label"><b>${pieceNo.get(pc.id)}</b><span class="seg-len">${fmt(pc.cut)}</span></span></div>
        <div class="seg-margin" style="flex:${pc.margin}"></div>
      </div>`);
  });
  if (b.offcut > 0) {
    parts.push(`<div class="kerf" style="width:${pct(Math.min(kerf, b.offcut))}%"></div>`);
    const off = Math.max(0, b.stock - pos - kerf);
    if (off > 0) parts.push(`<div class="offcut" style="width:${pct(off)}%"><span>${fmt(off)}</span></div>`);
  }

  // Stagger dimension labels that would collide.
  let lastAt = -Infinity;
  let row = 0;
  const dims = marks
    .map((m) => {
      const x = pct(m.at);
      row = x - lastAt < 16 ? 1 - row : 0;
      lastAt = x;
      const edge = x > 94 ? 'right' : '';
      return `<span class="dim row${row} ${edge}" style="left:${x}%"><span>${m.label}</span></span>`;
    })
    .join('');

  return `
    <article class="board-card card">
      <header class="board-head">
        <span class="board-no">${index + 1}</span>
        <h3>${fmt(b.stock)} mm board</h3>
        <span class="board-meta">${b.pieces.length} piece${b.pieces.length === 1 ? '' : 's'} · ${b.offcut > 0 ? `${fmt(b.offcut)} mm left over` : 'no offcut'}</span>
      </header>
      <div class="board-scale">
        <div class="board-wrap" style="width:${(b.stock / maxStock) * 100}%">
          <div class="dims"><span class="dim row0 start" style="left:0"><span>0</span></span>${dims}</div>
          <div class="board">${parts.join('')}</div>
        </div>
      </div>
      <ol class="cut-list">
        ${b.pieces
          .map(
            (pc) => `
          <li style="--c:${roomColor(pc.roomId)}">
            <span class="badge">${pieceNo.get(pc.id)}</span>
            <span class="cut-what"><b>${esc(pc.roomName || 'Room')}</b> · ${esc(pc.wallName || 'Wall')}${pc.parts > 1 ? ` <span class="part">part ${pc.part} of ${pc.parts}</span>` : ''}</span>
            <span class="cut-len">Cut <b>${fmt(pc.cut)}</b> mm<small>${fmt(pc.length)} + ${fmt(pc.margin)} margin</small></span>
          </li>`,
          )
          .join('')}
      </ol>
    </article>`;
}

function renderAll() {
  renderRooms();
  renderSettings();
}

// Keep defaults for any settings added since the user's data was saved.
state.settings = { ...defaultSettings(), ...state.settings };
renderAll();
schedule();
