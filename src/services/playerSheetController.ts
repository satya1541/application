/**
 * High-performance, zero-latency event bridge for the Full Screen Player sheet.
 * Bypasses React reconciliation and context lag to immediately trigger
 * hardware-accelerated animations on the UI thread at frame 0 (0ms).
 */

type SheetListener = () => void;
type CollapseListener = (velocity?: number) => void;

let openListeners: SheetListener[] = [];
let closeListeners: CollapseListener[] = [];

export const registerPlayerSheetListeners = (
  onOpen: SheetListener,
  onClose: CollapseListener
): (() => void) => {
  openListeners.push(onOpen);
  closeListeners.push(onClose);
  return () => {
    openListeners = openListeners.filter((l) => l !== onOpen);
    closeListeners = closeListeners.filter((l) => l !== onClose);
  };
};

let isOpen = false;

export const getIsFullPlayerOpen = (): boolean => isOpen;

export const triggerOpenFullPlayer = (): void => {
  isOpen = true;
  for (const listener of openListeners) {
    listener();
  }
};

export const triggerCloseFullPlayer = (velocity?: number): void => {
  isOpen = false;
  for (const listener of closeListeners) {
    listener(velocity);
  }
};
