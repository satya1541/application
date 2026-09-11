import { Song } from '@/types/music';

type SongListener = (song: Song | null) => void;

let listeners: SongListener[] = [];
let activeSong: Song | null = null;

export const SongActionController = {
  open(song: Song): void {
    activeSong = song;
    for (const listener of listeners) {
      listener(song);
    }
  },

  close(): void {
    activeSong = null;
    for (const listener of listeners) {
      listener(null);
    }
  },

  getActiveSong(): Song | null {
    return activeSong;
  },

  subscribe(listener: SongListener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};
