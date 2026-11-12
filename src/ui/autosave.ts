import { parseConfigText, serializeConfig, type ShedConfig } from '../core/config';
import { PRESETS } from '../core/presets';

const STORAGE_KEY = 'shed-builder.config';
// The last stored design the app could not use. It holds one design, the latest.
const BACKUP_KEY = 'shed-builder.config.backup';

/** The part of `localStorage` that autosave uses. */
export type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The browser's storage, or null when the browser blocks it. */
export function browserStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface Restored {
  config: ShedConfig;
  /** True when the browser held a design, readable or not. */
  hadDesign: boolean;
  /** Why the stored design did not load. The app then starts from the first preset. */
  errors: string[] | null;
}

/**
 * The stored design, or the first preset when there is none. A stored design that does not load
 * goes to the backup first, so the next autosave cannot overwrite it.
 */
export function restore(store: Store | null): Restored {
  const text = read(store, STORAGE_KEY);
  if (text === null) return { config: PRESETS[0], hadDesign: false, errors: null };
  const result = parseConfigText(text);
  if (result.ok) return { config: result.config, hadDesign: true, errors: null };
  write(store, BACKUP_KEY, text);
  return { config: PRESETS[0], hadDesign: true, errors: result.errors };
}

export const save = (store: Store | null, config: ShedConfig) => write(store, STORAGE_KEY, serializeConfig(config));

/** The stored design's text as it is, or null. */
export const savedDesign = (store: Store | null) => read(store, STORAGE_KEY);

/** The backup's text as it is, or null. */
export const backupDesign = (store: Store | null) => read(store, BACKUP_KEY);

/** Move the stored design to the backup, so the next start opens the first preset. */
export function setAside(store: Store | null) {
  const text = read(store, STORAGE_KEY);
  if (text === null) return;
  write(store, BACKUP_KEY, text);
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Storage is blocked.
  }
}

function read(store: Store | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null; // Storage is blocked.
  }
}

function write(store: Store | null, key: string, text: string) {
  try {
    store?.setItem(key, text);
  } catch {
    // Storage is blocked or full. Autosave is off.
  }
}
