import type { AppState, Room, Settings } from './types';

const KEY = 'skirting:v1';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const defaultSettings = (): Settings => ({
  marginPct: 5,
  marginMin: 30,
  marginMax: 100,
  stock: [3050, 4200],
});

export const newRoom = (name: string, lengths: [string, number][] = [['Wall 1', 0]]): Room => ({
  id: uid(),
  name,
  walls: lengths.map(([n, length]) => ({ id: uid(), name: n, length })),
});

export const defaultState = (): AppState => ({
  rooms: [newRoom('Room 1')],
  settings: defaultSettings(),
});

/** Accepts current (number[]) and older ({ length, selected }[]) saved formats. */
function normaliseStock(stock: unknown): number[] {
  if (!Array.isArray(stock)) return defaultSettings().stock;
  return stock
    .map((o) => (typeof o === 'number' ? o : o && o.selected ? Number(o.length) : 0))
    .filter((l) => l > 0);
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.rooms) && parsed.settings) {
        const { marginPct, marginMin, marginMax, stock } = { ...defaultSettings(), ...parsed.settings };
        return { rooms: parsed.rooms, settings: { marginPct, marginMin, marginMax, stock: normaliseStock(stock) } };
      }
    }
  } catch {
    /* ignore unavailable or corrupt storage */
  }
  return defaultState();
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: state just won't persist */
  }
}
