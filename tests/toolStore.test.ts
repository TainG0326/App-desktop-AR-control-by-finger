import { describe, it, expect, beforeEach } from 'vitest';
import { useToolStore, PAINT_COLORS } from '../src/renderer/src/stores/toolStore';

describe('toolStore', () => {
  beforeEach(() => {
    useToolStore.setState({
      activeTool: 'none',
      paintColor: PAINT_COLORS[3] as string,
      paintSize: 6,
      keyboardShift: false,
      keyboardSymbols: false,
      strokesVersion: 0
    });
  });

  it('starts with no tool active', () => {
    expect(useToolStore.getState().activeTool).toBe('none');
  });

  it('setTool switches to the specified tool', () => {
    useToolStore.getState().setTool('paint');
    expect(useToolStore.getState().activeTool).toBe('paint');
    useToolStore.getState().setTool('keyboard');
    expect(useToolStore.getState().activeTool).toBe('keyboard');
  });

  it('toggleTool enables the tool when none is active', () => {
    useToolStore.getState().toggleTool('paint');
    expect(useToolStore.getState().activeTool).toBe('paint');
  });

  it('toggleTool disables the tool when same tool is active', () => {
    useToolStore.getState().setTool('paint');
    useToolStore.getState().toggleTool('paint');
    expect(useToolStore.getState().activeTool).toBe('none');
  });

  it('toggleTool switches directly between tools', () => {
    useToolStore.getState().setTool('paint');
    useToolStore.getState().toggleTool('keyboard');
    expect(useToolStore.getState().activeTool).toBe('keyboard');
  });

  it('paint settings update independently', () => {
    useToolStore.getState().setPaintColor('#ff0000');
    useToolStore.getState().setPaintSize(20);
    expect(useToolStore.getState().paintColor).toBe('#ff0000');
    expect(useToolStore.getState().paintSize).toBe(20);
  });

  it('keyboard shift auto-resets when symbols is enabled', () => {
    useToolStore.getState().setKeyboardShift(true);
    useToolStore.getState().setKeyboardSymbols(true);
    expect(useToolStore.getState().keyboardSymbols).toBe(true);
    expect(useToolStore.getState().keyboardShift).toBe(false);
  });

  it('clearStrokes bumps strokesVersion', () => {
    const before = useToolStore.getState().strokesVersion;
    useToolStore.getState().clearStrokes();
    expect(useToolStore.getState().strokesVersion).toBe(before + 1);
  });

  it('bumpStrokeVersion bumps strokesVersion', () => {
    const before = useToolStore.getState().strokesVersion;
    useToolStore.getState().bumpStrokeVersion();
    expect(useToolStore.getState().strokesVersion).toBe(before + 1);
  });

  describe('PAINT_COLORS', () => {
    it('has at least 6 distinct colors', () => {
      expect(PAINT_COLORS.length).toBeGreaterThanOrEqual(6);
      const unique = new Set(PAINT_COLORS);
      expect(unique.size).toBe(PAINT_COLORS.length);
    });

    it('all colors are valid hex format', () => {
      for (const c of PAINT_COLORS) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });
});
