import { marginFor, maxSegment } from './margin';
import { pack } from './solver';
import type { Board, Piece, PlanResult, Room, Settings } from './types';

/** Shortest part we'll leave when a wall has to be joined. */
const MIN_PART = 300;

function equalSplit(length: number, parts: number): number[] {
  const base = Math.floor(length / parts);
  const extra = length - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Ways to divide a wall into parts that each fit a board with their margin.
 * The first option always has the fewest joins.
 */
export function splitOptions(length: number, stocks: number[], s: Settings): number[][] {
  const desc = [...stocks].sort((a, b) => b - a);
  const biggest = desc[0];
  if (length + marginFor(length, s) <= biggest) return [[length]];

  const rBig = maxSegment(biggest, s);
  if (rBig <= 0) return [];
  const opts: number[][] = [equalSplit(length, Math.ceil(length / rBig))];

  for (const stock of desc) {
    const r = maxSegment(stock, s);
    if (r < MIN_PART) continue;
    // Equal parts sized to fit this board length.
    opts.push(equalSplit(length, Math.ceil(length / r)));
    // As many full parts for this board length as needed, then the remainder.
    let q = 1;
    while (length - q * r > rBig) q++;
    const rem = length - q * r;
    if (rem >= MIN_PART) opts.push([...Array<number>(q).fill(r), rem]);
    else opts.push([...Array<number>(q - 1).fill(r), ...equalSplit(r + rem, 2)]);
  }

  const seen = new Set<string>();
  return opts
    .map((o) => [...o].sort((a, b) => b - a))
    .filter((o) => {
      const key = o.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

interface WallRef {
  room: Room;
  wall: Room['walls'][number];
  options: number[][];
}

export function plan(rooms: Room[], s: Settings, budgetMs = 2500): PlanResult {
  const errors: string[] = [];
  const stocks = [...new Set(s.stock.filter((l) => l > 0))];
  const empty: PlanResult = {
    boards: [],
    pieces: [],
    order: [],
    totalStock: 0,
    totalWall: 0,
    totalMargin: 0,
    joins: 0,
    optimal: true,
    errors,
  };
  if (stocks.length === 0) {
    errors.push('Add a board length to order.');
    return empty;
  }

  const walls: WallRef[] = [];
  for (const room of rooms) {
    for (const wall of room.walls) {
      if (!(wall.length > 0)) continue;
      const options = splitOptions(Math.round(wall.length), stocks, s);
      if (options.length === 0) {
        errors.push(`${room.name || 'Room'} · ${wall.name || 'wall'}: margin is too large for the selected board lengths.`);
        continue;
      }
      walls.push({ room, wall, options });
    }
  }
  if (walls.length === 0) return empty;

  const buildPieces = (choice: number[]): Piece[] =>
    walls.flatMap(({ room, wall, options }, wi) => {
      const parts = options[choice[wi]];
      return parts.map((len, pi) => {
        const margin = marginFor(len, s);
        return {
          id: `${wall.id}:${pi}`,
          roomId: room.id,
          roomName: room.name,
          wallId: wall.id,
          wallName: wall.name,
          part: pi + 1,
          parts: parts.length,
          length: len,
          margin,
          cut: len + margin,
        };
      });
    });

  type Eval = { key: [number, number]; pieces: Piece[]; res: NonNullable<ReturnType<typeof pack>> };
  const evaluate = (choice: number[], ms: number): Eval | null => {
    const pieces = buildPieces(choice);
    const res = pack({
      sizes: pieces.map((p) => p.cut),
      stocks,
      goal: s.goal,
      deadline: performance.now() + ms,
    });
    if (!res) return null;
    // Tie-break equal packings on fewer joins.
    return { key: [res.score, pieces.length], pieces, res };
  };
  const better = (a: Eval | null, b: Eval | null) =>
    !!a && (!b || a.key[0] < b.key[0] || (a.key[0] === b.key[0] && a.key[1] < b.key[1]));

  const multi = walls.map((w, i) => (w.options.length > 1 ? i : -1)).filter((i) => i >= 0);
  const combos = multi.reduce((n, i) => n * walls[i].options.length, 1);
  let choice = walls.map(() => 0);
  let best: Eval | null = null;
  let allOptimal = true;

  if (combos <= 36) {
    const per = Math.max(25, budgetMs / combos);
    for (let c = 0; c < combos; c++) {
      let rest = c;
      const ch = walls.map(() => 0);
      for (const i of multi) {
        ch[i] = rest % walls[i].options.length;
        rest = Math.floor(rest / walls[i].options.length);
      }
      const e = evaluate(ch, per);
      if (e && !e.res.optimal) allOptimal = false;
      if (better(e, best)) {
        best = e;
        choice = ch;
      }
    }
  } else {
    // Too many combinations: improve one wall's split at a time.
    const evals = 1 + multi.reduce((n, i) => n + walls[i].options.length - 1, 0);
    const per = Math.max(25, budgetMs / evals);
    best = evaluate(choice, per);
    allOptimal = false;
    for (const i of multi) {
      for (let o = 1; o < walls[i].options.length; o++) {
        const ch = choice.slice();
        ch[i] = o;
        const e = evaluate(ch, per);
        if (better(e, best)) {
          best = e;
          choice = ch;
        }
      }
    }
  }

  if (!best) {
    errors.push('Could not find a cutting plan for these measurements.');
    return empty;
  }

  const boards: Board[] = best.res.bins
    .map((b) => {
      const pieces = b.items.map((i) => best!.pieces[i]).sort((x, y) => y.cut - x.cut);
      const used = pieces.reduce((t, p) => t + p.cut, 0);
      return { stock: b.stock, pieces, used, offcut: b.stock - used };
    })
    .sort((x, y) => y.stock - x.stock || x.offcut - y.offcut);

  const orderMap = new Map<number, number>();
  for (const b of boards) orderMap.set(b.stock, (orderMap.get(b.stock) ?? 0) + 1);

  const pieces = best.pieces;
  return {
    boards,
    pieces,
    order: [...orderMap].map(([length, count]) => ({ length, count })).sort((a, b) => b.length - a.length),
    totalStock: boards.reduce((t, b) => t + b.stock, 0),
    totalWall: pieces.reduce((t, p) => t + p.length, 0),
    totalMargin: pieces.reduce((t, p) => t + p.margin, 0),
    joins: pieces.length - walls.length,
    optimal: allOptimal && best.res.optimal,
    errors,
  };
}
