import { describe, expect, it } from 'vitest';
import { pack } from './solver';
import { plan, splitOptions } from './plan';
import { marginFor, maxSegment } from './margin';
import type { Room, Settings } from './types';

const far = () => performance.now() + 2000;

const settings = (over: Partial<Settings> = {}): Settings => ({
  marginPct: 5,
  marginMin: 30,
  marginMax: 100,
  goal: 'length',
  stock: [
    { length: 3050, selected: true },
    { length: 4200, selected: true },
  ],
  ...over,
});

describe('margin', () => {
  it('clamps the percentage between min and max', () => {
    const s = settings();
    expect(marginFor(200, s)).toBe(30);
    expect(marginFor(1000, s)).toBe(50);
    expect(marginFor(4000, s)).toBe(100);
  });
  it('finds the longest segment that fits a board', () => {
    const s = settings();
    expect(maxSegment(4200, s)).toBe(4100);
    expect(maxSegment(3050, s)).toBe(2950);
  });
});

describe('pack', () => {
  it('packs exact fits onto the fewest boards', () => {
    const r = pack({ sizes: [2000, 2000, 1000, 1000], stocks: [3000], goal: 'length', deadline: far() })!;
    expect(r.bins.length).toBe(2);
    expect(r.optimal).toBe(true);
  });

  it('mixes board lengths to minimise total length', () => {
    // 4100 needs a 4200; 2900 fits a 3050 — cheaper than two 4200s.
    const r = pack({ sizes: [4100, 2900], stocks: [3050, 4200], goal: 'length', deadline: far() })!;
    expect(r.bins.map((b) => b.stock).sort()).toEqual([3050, 4200]);
  });

  it('never overfills a board and uses every item once', () => {
    const sizes = [1234, 876, 2310, 540, 1990, 3001, 777, 1500, 1500, 420, 2600, 950];
    const r = pack({ sizes, stocks: [2400, 3050, 4200], goal: 'length', deadline: far() })!;
    const used = r.bins.flatMap((b) => b.items).sort((a, b) => a - b);
    expect(used).toEqual(sizes.map((_, i) => i));
    for (const b of r.bins) {
      const total = b.items.reduce((t, i) => t + sizes[i], 0);
      expect(total).toBeLessThanOrEqual(b.stock);
    }
  });

  it('returns null when a piece is longer than every board', () => {
    expect(pack({ sizes: [5000], stocks: [4200], goal: 'length', deadline: far() })).toBeNull();
  });
});

describe('plan', () => {
  it('joins walls longer than the longest board', () => {
    const opts = splitOptions(7000, [3050, 4200], settings());
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect(o.reduce((a, b) => a + b, 0)).toBe(7000);
    expect(opts[0].length).toBe(2);
  });

  it('produces a full plan', () => {
    const rooms: Room[] = [
      {
        id: 'r',
        name: 'Lounge',
        walls: [
          { id: 'a', name: 'North', length: 5200 },
          { id: 'b', name: 'East', length: 3800 },
          { id: 'c', name: 'South', length: 2100 },
          { id: 'd', name: 'West', length: 900 },
        ],
      },
    ];
    const p = plan(rooms, settings(), 500);
    expect(p.errors).toEqual([]);
    expect(p.totalWall).toBe(12000);
    expect(p.joins).toBe(1);
    for (const b of p.boards) expect(b.used).toBeLessThanOrEqual(b.stock);
    expect(p.boards.reduce((t, b) => t + b.pieces.length, 0)).toBe(p.pieces.length);
  });

  it('reports when no board length is selected', () => {
    const p = plan([], settings({ stock: [{ length: 3050, selected: false }] }));
    expect(p.errors.length).toBe(1);
  });
});

describe('large inputs', () => {
  it('returns a valid plan for a whole house within the time budget', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rooms: Room[] = Array.from({ length: 8 }, (_, r) => ({
      id: `r${r}`,
      name: `Room ${r}`,
      walls: Array.from({ length: 5 }, (_, w) => ({ id: `r${r}w${w}`, name: `W${w}`, length: Math.round(300 + rnd() * 6500) })),
    }));
    const t = performance.now();
    const p = plan(rooms, settings(), 1500);
    expect(performance.now() - t).toBeLessThan(4000);
    expect(p.errors).toEqual([]);
    expect(p.totalWall).toBe(rooms.flatMap((r) => r.walls).reduce((a, w) => a + w.length, 0));
    for (const b of p.boards) expect(b.used).toBeLessThanOrEqual(b.stock);
  });
});

describe('share links', () => {
  it('round-trips state through the URL encoding', async () => {
    const { encodeState, decodeState } = await import('./share');
    const { defaultState } = await import('./state');
    const state = defaultState();
    state.settings.stock.push({ length: 5000, selected: true, custom: true });
    state.settings.goal = 'boards';
    const code = await encodeState(state);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = (await decodeState(code))!;
    expect(back.rooms.map((r) => [r.name, r.walls.map((w) => [w.name, w.length])])).toEqual(
      state.rooms.map((r) => [r.name, r.walls.map((w) => [w.name, w.length])]),
    );
    expect(back.settings).toEqual(state.settings);
    expect(await decodeState('garbage')).toBeNull();
  });
});
