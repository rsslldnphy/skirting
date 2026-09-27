import type { Goal } from './types';

export interface PackInput {
  /** Lengths to cut (mm). */
  sizes: number[];
  /** Available board lengths (mm). */
  stocks: number[];
  goal: Goal;
  /** performance.now() timestamp after which the search returns its best so far. */
  deadline: number;
}

export interface PackedBin {
  stock: number;
  /** Indices into PackInput.sizes. */
  items: number[];
}

export interface PackResult {
  bins: PackedBin[];
  score: number;
  /** True when the search proved no better packing exists. */
  optimal: boolean;
}

/** Cap on candidate board fillings generated per search node. */
const CHILD_CAP = 120;

/**
 * Multi-length cutting-stock solver using bin completion (Korf): each level of
 * the search fills one whole board containing the largest remaining piece,
 * choosing among maximal fillings of every board length. Fillings that would
 * fit on a shorter board are skipped as dominated. Branch-and-bound on a
 * lower bound of total length / board count keeps it fast for household-sized
 * problems, and the deadline guarantees a best-so-far answer on bigger ones.
 */
export function pack(input: PackInput): PackResult | null {
  const { goal, deadline } = input;
  const stocks = [...new Set(input.stocks.filter((s) => s > 0))].sort((a, b) => a - b);
  const order = input.sizes.map((_, i) => i).sort((a, b) => input.sizes[b] - input.sizes[a]);

  const distinct: number[] = [];
  const counts: number[] = [];
  for (const i of order) {
    const s = input.sizes[i];
    if (distinct.length && distinct[distinct.length - 1] === s) counts[counts.length - 1]++;
    else {
      distinct.push(s);
      counts.push(1);
    }
  }
  if (distinct.length === 0) return { bins: [], score: 0, optimal: true };
  if (stocks.length === 0 || distinct[0] > stocks[stocks.length - 1]) return null;

  const n = distinct.length;
  const maxStock = stocks[stocks.length - 1];

  const score = (len: number, boards: number) =>
    goal === 'length' ? len * 1000 + boards : boards * 1e7 + len;
  const lowerBound = (len: number, boards: number, rem: number) =>
    score(len + rem, boards + Math.ceil(rem / maxStock));

  let best = Infinity;
  let bestBins: { stock: number; take: number[] }[] | null = null;
  const stack: { stock: number; take: number[] }[] = [];
  let aborted = false;
  let truncated = false;
  let nodes = 0;

  const dfs = (len: number, boards: number, rem: number): void => {
    if (rem === 0) {
      const sc = score(len, boards);
      if (sc < best) {
        best = sc;
        bestBins = stack.map((b) => ({ stock: b.stock, take: b.take.slice() }));
      }
      return;
    }
    if (aborted || lowerBound(len, boards, rem) >= best) return;
    if (bestBins && (++nodes & 31) === 0 && performance.now() > deadline) {
      aborted = true;
      return;
    }

    let a = 0;
    while (counts[a] === 0) a++;
    counts[a]--;

    type Child = { stock: number; take: number[]; raw: number };
    const children: Child[] = [];
    const take = new Array<number>(n).fill(0);

    for (let si = 0; si < stocks.length; si++) {
      const stock = stocks[si];
      if (stock < distinct[a]) continue;
      const smallerCap = si > 0 ? stocks[si - 1] : -Infinity;
      let generated = 0;

      const enumerate = (j: number, left: number, raw: number): boolean => {
        if (generated >= CHILD_CAP) {
          truncated = true;
          return false;
        }
        if (j === n) {
          // Only maximal fillings: nothing remaining could still be added.
          for (let k = n - 1; k >= a; k--) {
            if (counts[k] - take[k] > 0) {
              if (distinct[k] <= left) return true;
              break; // sizes are descending, so the smallest available is decisive
            }
          }
          // Dominated if the same pieces fit on a shorter board.
          if (stock - left <= smallerCap) return true;
          const t = take.slice();
          t[a]++;
          children.push({ stock, take: t, raw });
          generated++;
          return true;
        }
        const maxK = Math.min(counts[j], Math.floor(left / distinct[j]));
        for (let k = maxK; k >= 0; k--) {
          take[j] = k;
          const ok = enumerate(j + 1, left - k * distinct[j], raw + k * distinct[j]);
          take[j] = 0;
          if (!ok) return false;
        }
        return true;
      };
      enumerate(a, stock - distinct[a], distinct[a]);
    }

    children.sort((x, y) => x.stock - x.raw - (y.stock - y.raw) || y.stock - x.stock);

    for (const c of children) {
      for (let k = 0; k < n; k++) counts[k] -= c.take[k];
      counts[a]++; // c.take includes the anchor piece, already removed above
      stack.push({ stock: c.stock, take: c.take });
      dfs(len + c.stock, boards + 1, rem - c.raw);
      stack.pop();
      counts[a]--;
      for (let k = 0; k < n; k++) counts[k] += c.take[k];
      if (aborted) break;
    }
    counts[a]++;
  };

  const total = input.sizes.reduce((s, x) => s + x, 0);
  dfs(0, 0, total);

  if (!bestBins) return null;

  // Map size-class counts back onto original item indices.
  const pools = distinct.map(() => [] as number[]);
  let di = 0;
  for (const i of order) {
    while (input.sizes[i] !== distinct[di]) di++;
    pools[di].push(i);
  }
  const bins: PackedBin[] = (bestBins as { stock: number; take: number[] }[]).map((b) => {
    const items: number[] = [];
    b.take.forEach((k, j) => {
      for (let x = 0; x < k; x++) items.push(pools[j].pop()!);
    });
    return { stock: b.stock, items };
  });

  return { bins, score: best, optimal: !aborted && !truncated };
}
