/**
 * Tests for notes persistence logic. These test the pure data shape +
 * newNote() helper. Dexie-backed CRUD is validated manually and via a
 * Playwright E2E (Phase 16) — jsdom does not implement IndexedDB.
 */
import { describe, it, expect } from 'vitest';
import { newNote } from '@renderer/services/notesDb.js';

describe('newNote', () => {
  it('produces a unique id', () => {
    const a = newNote();
    const b = newNote();
    expect(a.id).not.toEqual(b.id);
  });

  it('has default fields', () => {
    const n = newNote();
    expect(n.title).toBe('Untitled');
    expect(n.body).toBe('');
    expect(typeof n.createdAt).toBe('number');
    expect(typeof n.updatedAt).toBe('number');
    expect(n.createdAt).toBe(n.updatedAt);
  });

  it('sets timestamps close to now', () => {
    const before = Date.now();
    const n = newNote();
    const after = Date.now();
    expect(n.createdAt).toBeGreaterThanOrEqual(before);
    expect(n.createdAt).toBeLessThanOrEqual(after);
  });
});