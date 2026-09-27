import type { AppState, Room, Settings, StockOption } from './types';

const KEY = 'skirting:v1';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_STOCK: StockOption[] = [
  { length: 2400, selected: false },
  { length: 3000, selected: false },
  { length: 3050, selected: true },
  { length: 3600, selected: false },
  { length: 4200, selected: true },
  { length: 4800, selected: false },
];

export const defaultSettings = (): Settings => ({
  marginPct: 5,
  marginMin: 30,
  marginMax: 100,
  kerf: 3,
  stock: DEFAULT_STOCK.map((s) => ({ ...s })),
  goal: 'length',
});

export const newRoom = (name: string, lengths: [string, number][] = [['Wall 1', 0]]): Room => ({
  id: uid(),
  name,
  walls: lengths.map(([n, length]) => ({ id: uid(), name: n, length })),
});

export const defaultState = (): AppState => ({
  rooms: [
    newRoom('Living room', [
      ['North wall', 4650],
      ['East wall', 3720],
      ['South wall (left of door)', 2380],
      ['South wall (right of door)', 1410],
      ['West wall', 3720],
    ]),
    newRoom('Hallway', [
      ['Long wall', 5320],
      ['Under stairs', 1180],
      ['By front door', 760],
    ]),
  ],
  settings: defaultSettings(),
});

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.rooms) && parsed.settings) {
        return { rooms: parsed.rooms, settings: { ...defaultSettings(), ...parsed.settings } };
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
