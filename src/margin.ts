import type { Settings } from './types';

type MarginSettings = Pick<Settings, 'marginPct' | 'marginMin' | 'marginMax'>;

/** Margin for a piece: a percentage of its length, clamped between min and max. */
export function marginFor(length: number, s: MarginSettings): number {
  const lo = Math.max(0, Math.min(s.marginMin, s.marginMax));
  const hi = Math.max(0, s.marginMin, s.marginMax);
  const pct = Math.max(0, s.marginPct);
  return Math.round(Math.min(hi, Math.max(lo, (length * pct) / 100)));
}

/**
 * Longest piece of wall (mm) that can be covered from one board of `stock`
 * once its own margin is added. Returns 0 if not even 1mm fits.
 */
export function maxSegment(stock: number, s: MarginSettings): number {
  let lo = 0;
  let hi = stock;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (mid + marginFor(mid, s) <= stock) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
