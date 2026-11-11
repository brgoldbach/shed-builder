/** A value with the values before and after it, for undo and redo. */
export interface UndoHistory<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

const LIMIT = 100; // undo steps kept

export const startHistory = <T>(present: T): UndoHistory<T> => ({ past: [], present, future: [] });

/** `next` becomes the present. The redo steps go. */
export function record<T>({ past, present }: UndoHistory<T>, next: T): UndoHistory<T> {
  return { past: [...past, present].slice(-LIMIT), present: next, future: [] };
}

export function undo<T>(history: UndoHistory<T>): UndoHistory<T> {
  const { past, present, future } = history;
  if (past.length === 0) return history;
  return { past: past.slice(0, -1), present: past[past.length - 1], future: [present, ...future] };
}

export function redo<T>(history: UndoHistory<T>): UndoHistory<T> {
  const { past, present, future } = history;
  if (future.length === 0) return history;
  return { past: [...past, present], present: future[0], future: future.slice(1) };
}
