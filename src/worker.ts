import { plan } from './plan';
import type { Room, Settings } from './types';

self.onmessage = (e: MessageEvent<{ id: number; rooms: Room[]; settings: Settings }>) => {
  const { id, rooms, settings } = e.data;
  self.postMessage({ id, result: plan(rooms, settings) });
};
