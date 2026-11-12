import { describe, expect, it } from 'vitest';
import additionsEditor from '../src/ui/AdditionsEditor.tsx?raw';
import designForm from '../src/ui/DesignForm.tsx?raw';
import openingsEditor from '../src/ui/OpeningsEditor.tsx?raw';
import rampsEditor from '../src/ui/RampsEditor.tsx?raw';
import { DESIGN_HELP } from '../src/ui/help/design';
import { EDITOR_HELP } from '../src/ui/help/editors';

const SOURCES = [designForm, openingsEditor, additionsEditor, rampsEditor].join('\n');

describe('setting help', () => {
  it.each(Object.entries({ ...DESIGN_HELP, ...EDITOR_HELP }))('%s has text, and a field shows it', (key, help) => {
    expect(help.about.trim()).not.toBe('');
    const options: Record<string, string> = 'options' in help ? help.options : {};
    expect(Object.entries(options).filter(([, text]) => text.trim() === '')).toEqual([]);
    expect(SOURCES).toContain(`HELP['${key}']`);
  });
});
