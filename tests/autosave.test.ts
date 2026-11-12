import { describe, expect, it } from 'vitest';
import { serializeConfig } from '../src/core/config';
import { PRESETS } from '../src/core/presets';
import { backupDesign, restore, save, savedDesign, setAside, type Store } from '../src/ui/autosave';

const memoryStore = (entries: Record<string, string> = {}): Store & { entries: Record<string, string> } => ({
  entries,
  getItem: (key) => entries[key] ?? null,
  setItem: (key, value) => {
    entries[key] = value;
  },
  removeItem: (key) => {
    delete entries[key];
  },
});

const blocked: Store = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const design = PRESETS[1];

describe('autosave', () => {
  it('opens the stored design', () => {
    const store = memoryStore();
    save(store, design);
    expect(restore(store)).toEqual({ config: design, hadDesign: true, errors: null });
  });

  it('opens the first preset when nothing is stored, or storage is blocked or missing', () => {
    for (const store of [memoryStore(), blocked, null]) {
      expect(restore(store)).toEqual({ config: PRESETS[0], hadDesign: false, errors: null });
    }
    expect(() => save(blocked, design)).not.toThrow();
    expect(() => setAside(blocked)).not.toThrow();
  });

  it('keeps a stored design that does not load in the backup, with the reasons', () => {
    const text = serializeConfig(design).replace('"floor": {', '"floor": { "joists": 1,');
    const store = memoryStore({ 'shed-builder.config': text });
    const restored = restore(store);
    expect(restored.config).toBe(PRESETS[0]);
    expect(restored.hadDesign).toBe(true);
    expect(restored.errors?.join()).toContain('floor');
    expect(backupDesign(store)).toBe(text);
    // The first autosave replaces the stored design; the backup keeps the text.
    save(store, restored.config);
    expect(backupDesign(store)).toBe(text);
  });

  it('sets the stored design aside, so the next start opens the first preset', () => {
    const store = memoryStore();
    save(store, design);
    const text = savedDesign(store);
    setAside(store);
    expect(savedDesign(store)).toBeNull();
    expect(backupDesign(store)).toBe(text);
    expect(restore(store).config).toBe(PRESETS[0]);
  });
});
