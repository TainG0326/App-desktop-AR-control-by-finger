import { describe, it, expect, beforeEach } from 'vitest';
import { useWindowStore, APP_REGISTRY } from '@renderer/stores/windowsStore.js';

describe('windowsStore', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: {}, order: [], focusedId: null, nextZ: 1 });
  });

  it('opens a window with correct defaults', () => {
    const id = useWindowStore.getState().open({ type: 'notes' });
    const w = useWindowStore.getState().windows[id];
    expect(w.appType).toBe('notes');
    expect(w.title).toBe(APP_REGISTRY.notes.title);
    expect(w.width).toBe(APP_REGISTRY.notes.defaultWidth);
    expect(w.height).toBe(APP_REGISTRY.notes.defaultHeight);
    expect(useWindowStore.getState().focusedId).toBe(id);
  });

  it('opens multiple windows and stacks zIndex', () => {
    const id1 = useWindowStore.getState().open({ type: 'notes' });
    const id2 = useWindowStore.getState().open({ type: 'youtube' });
    const ids = useWindowStore.getState().order;
    expect(ids).toEqual([id1, id2]);
    expect(useWindowStore.getState().windows[id2].zIndex).toBeGreaterThan(
      useWindowStore.getState().windows[id1].zIndex
    );
  });

  it('closes a window and refocuss the previous', () => {
    const id1 = useWindowStore.getState().open({ type: 'notes' });
    const id2 = useWindowStore.getState().open({ type: 'youtube' });
    useWindowStore.getState().close(id2);
    const s = useWindowStore.getState();
    expect(s.windows[id2]).toBeUndefined();
    expect(s.focusedId).toBe(id1);
  });

  it('focus increments zIndex', () => {
    const id1 = useWindowStore.getState().open({ type: 'notes' });
    const id2 = useWindowStore.getState().open({ type: 'youtube' });
    useWindowStore.getState().focus(id1);
    expect(useWindowStore.getState().windows[id1].zIndex).toBeGreaterThan(
      useWindowStore.getState().windows[id2].zIndex
    );
  });

  it('move updates position and clamps to viewport', () => {
    const id = useWindowStore.getState().open({ type: 'notes' });
    useWindowStore.getState().move(id, 1000, 1000);
    const w = useWindowStore.getState().windows[id];
    expect(w.x).toBeLessThanOrEqual(window.innerWidth);
    expect(w.y).toBeLessThanOrEqual(window.innerHeight);
  });

  it('resize respects min size', () => {
    const id = useWindowStore.getState().open({ type: 'notes' });
    useWindowStore.getState().resize(id, 10, 10);
    const w = useWindowStore.getState().windows[id];
    expect(w.width).toBe(APP_REGISTRY.notes.minWidth);
    expect(w.height).toBe(APP_REGISTRY.notes.minHeight);
  });

  it('minimize/restore toggles isMinimized', () => {
    const id = useWindowStore.getState().open({ type: 'notes' });
    useWindowStore.getState().minimize(id);
    expect(useWindowStore.getState().windows[id].isMinimized).toBe(true);
    useWindowStore.getState().restore(id);
    expect(useWindowStore.getState().windows[id].isMinimized).toBe(false);
  });

  it('layout snapshot round-trip', () => {
    useWindowStore.getState().open({ type: 'notes' });
    useWindowStore.getState().open({ type: 'youtube' });
    const snap = useWindowStore.getState().layoutSnapshot();
    expect(snap.windows.length).toBe(2);
    useWindowStore.setState({ windows: {}, order: [], focusedId: null });
    useWindowStore.getState().restoreFromSnapshot(snap);
    expect(Object.keys(useWindowStore.getState().windows).length).toBe(2);
  });
});