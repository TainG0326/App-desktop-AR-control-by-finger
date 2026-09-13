import { describe, it, expect } from 'vitest';

/**
 * Tests for VirtualKeyboard key routing logic.
 *
 * Verifies that key definitions produce the correct KeyboardEvent key/code
 * pairs with appropriate modifiers.
 */

type KeyDef =
  | { kind: 'char'; key: string; code: string; shift?: string }
  | { kind: 'space'; key: string; code: string }
  | { kind: 'enter'; key: string; code: string }
  | { kind: 'backspace'; key: string; code: string };

function resolveKey(def: KeyDef, shift: boolean): { key: string; code: string } {
  if (def.kind === 'char') {
    return {
      key: shift && def.shift ? def.shift : def.key,
      code: def.code
    };
  }
  if (def.kind === 'space') return { key: ' ', code: def.code };
  if (def.kind === 'enter') return { key: 'Enter', code: def.code };
  if (def.kind === 'backspace') return { key: 'Backspace', code: def.code };
  return { key: '?', code: '?' };
}

describe('VirtualKeyboard key routing', () => {
  it('lowercase letter → lowercase key', () => {
    const def: KeyDef = { kind: 'char', key: 'a', code: 'KeyA', shift: 'A' };
    const r = resolveKey(def, false);
    expect(r.key).toBe('a');
    expect(r.code).toBe('KeyA');
  });

  it('letter with shift → uppercase key (shift: A)', () => {
    const def: KeyDef = { kind: 'char', key: 'a', code: 'KeyA', shift: 'A' };
    const r = resolveKey(def, true);
    expect(r.key).toBe('A');
    expect(r.code).toBe('KeyA');
  });

  it('digit with shift → ! symbol', () => {
    const def: KeyDef = { kind: 'char', key: '1', code: 'Digit1', shift: '!' };
    expect(resolveKey(def, false).key).toBe('1');
    expect(resolveKey(def, true).key).toBe('!');
  });

  it('space key → key=" " (single space)', () => {
    const r = resolveKey({ kind: 'space', key: ' ', code: 'Space' }, false);
    expect(r.key).toBe(' ');
    expect(r.code).toBe('Space');
  });

  it('enter → Enter', () => {
    const r = resolveKey({ kind: 'enter', key: 'Enter', code: 'Enter' }, false);
    expect(r.key).toBe('Enter');
  });

  it('backspace → Backspace', () => {
    const r = resolveKey({ kind: 'backspace', key: 'Backspace', code: 'Backspace' }, false);
    expect(r.key).toBe('Backspace');
  });
});

describe('VirtualKeyboard modifier assembly', () => {
  function buildModifiers(shift: boolean, control: boolean, alt: boolean): string[] {
    const m: string[] = [];
    if (shift) m.push('shift');
    if (control) m.push('control');
    if (alt) m.push('alt');
    return m;
  }

  it('no modifiers → []', () => {
    expect(buildModifiers(false, false, false)).toEqual([]);
  });

  it('only shift → ["shift"]', () => {
    expect(buildModifiers(true, false, false)).toEqual(['shift']);
  });

  it('all three → ["shift", "control", "alt"] in expected order', () => {
    expect(buildModifiers(true, true, true)).toEqual(['shift', 'control', 'alt']);
  });
});
