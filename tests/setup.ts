import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// ResizeObserver mock for jsdom (not available in jsdom by default).
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver;

// Provide a typed mock of window.api for renderer tests.
// This is set up before any module imports the ambient `window.api` declaration.
Object.defineProperty(window, 'api', {
  value: {
    settings: {
      get: vi.fn().mockResolvedValue({} as never),
      set: vi.fn().mockResolvedValue({} as never),
      reset: vi.fn().mockResolvedValue({} as never)
    },
    windows: {
      saveLayout: vi.fn().mockResolvedValue(undefined),
      loadLayout: vi.fn().mockResolvedValue(null)
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined)
    },
    app: {
      getVersion: vi.fn().mockResolvedValue('0.1.0'),
      getPlatform: vi.fn().mockResolvedValue('win32' as NodeJS.Platform)
    }
  },
  writable: true,
  configurable: true
});