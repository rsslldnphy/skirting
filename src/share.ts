import { uid } from './state';
import type { AppState, Goal } from './types';

/**
 * Compact, versioned encoding of the app state for share links:
 * JSON arrays → deflate → base64url, stored in the URL hash.
 */
type PackedRooms = [string, [string, number][]][];
type Packed =
  | [2, PackedRooms, [number, number, number, number[], Goal]]
  // v1 stored selected and custom board lengths separately.
  | [1, PackedRooms, [number, number, number, number[], number[], Goal]];

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeState(state: AppState): Promise<string> {
  const s = state.settings;
  const packed: Packed = [
    2,
    state.rooms.map((r) => [r.name, r.walls.map((w) => [w.name, w.length] as [string, number])]),
    [s.marginPct, s.marginMin, s.marginMax, s.stock, s.goal],
  ];
  const json = new TextEncoder().encode(JSON.stringify(packed));
  return toBase64Url(await transform(json, new CompressionStream('deflate-raw')));
}

export async function decodeState(code: string): Promise<AppState | null> {
  try {
    const json = await transform(fromBase64Url(code), new DecompressionStream('deflate-raw'));
    const packed = JSON.parse(new TextDecoder().decode(json)) as Packed;
    if (packed[0] !== 1 && packed[0] !== 2) return null;
    const [, rooms, settings] = packed;
    const [marginPct, marginMin, marginMax, stockList] = settings;
    const goal = settings[settings.length - 1];
    const stock = stockList.map(Number).filter((l) => l > 0);

    return {
      rooms: rooms.map(([name, walls]) => ({
        id: uid(),
        name: String(name),
        walls: walls.map(([n, length]) => ({ id: uid(), name: String(n), length: Number(length) || 0 })),
      })),
      settings: {
        marginPct: Number(marginPct) || 0,
        marginMin: Number(marginMin) || 0,
        marginMax: Number(marginMax) || 0,
        stock,
        goal: goal === 'boards' ? 'boards' : 'length',
      },
    };
  } catch {
    return null;
  }
}

export const SHARE_PARAM = 'd';

export async function shareUrl(state: AppState): Promise<string> {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = `${SHARE_PARAM}=${await encodeState(state)}`;
  return url.toString();
}

/** Reads shared state from the URL hash, if present. */
export async function readSharedState(): Promise<AppState | null> {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get(SHARE_PARAM);
  return code ? decodeState(code) : null;
}
