import { describe, expect, it } from 'vitest';
import { record, redo, startHistory, undo } from '../src/ui/history';

describe('undo history', () => {
  const edited = record(record(startHistory('a'), 'b'), 'c');

  it('steps back and forward through the edits', () => {
    expect(undo(edited).present).toBe('b');
    expect(undo(undo(edited)).present).toBe('a');
    expect(redo(undo(undo(edited))).present).toBe('b');
  });

  it('stops at either end', () => {
    expect(undo(startHistory('a'))).toEqual(startHistory('a'));
    expect(redo(edited)).toBe(edited);
  });

  it('drops the redo steps on a new edit', () => {
    expect(record(undo(edited), 'd')).toEqual({ past: ['a', 'b'], present: 'd', future: [] });
  });

  it('keeps the last 100 steps', () => {
    const long = Array.from({ length: 150 }, (_, index) => index).reduce(record, startHistory(-1));
    expect(long.past).toHaveLength(100);
    expect(long.past[0]).toBe(49);
  });
});
