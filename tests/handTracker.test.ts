import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HandTracker } from '@renderer/hand-tracking/HandTracker.js';
import type { HandFrame } from '@renderer/hand-tracking/types.js';

function buildMockLandmarker(): {
  detectForVideo: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    detectForVideo: vi.fn().mockReturnValue({
      landmarks: [Array(21).fill({ x: 0.5, y: 0.5, z: 0 })],
      handednesses: [[{ categoryName: 'Right', score: 0.92 }]],
      worldLandmarks: [Array(21).fill({ x: 0, y: 0, z: 0 })]
    }),
    close: vi.fn()
  };
}

/**
 * Build a tracker whose init() resolves to a freshly-mocked landmarker.
 * Each test gets its own mock so assertions on `close` are isolated.
 */
async function buildTestTracker(): Promise<{ tracker: HandTracker; landmarker: ReturnType<typeof buildMockLandmarker> }> {
  const landmarker = buildMockLandmarker();
  const tracker = new HandTracker();
  tracker.__setDependencies({
    factory: async () => landmarker as never
  });
  return { tracker, landmarker };
}

describe('HandTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    const tracker = new HandTracker();
    expect(tracker.getState().status).toBe('idle');
  });

  it('init() transitions to ready on success', async () => {
    const { tracker } = await buildTestTracker();
    await tracker.init();
    expect(tracker.getState().status).toBe('ready');
  });

  it('init() transitions to error on failure and throws', async () => {
    const tracker = new HandTracker();
    tracker.__setDependencies({
      factory: async () => {
        throw new Error('wasm load failed');
      }
    });
    await expect(tracker.init()).rejects.toThrow('wasm load failed');
    const s = tracker.getState();
    expect(s.status).toBe('error');
    expect(s.error).toContain('wasm');
  });

  it('start() without init() sets an error', async () => {
    const tracker = new HandTracker();
    tracker.start({} as HTMLVideoElement);
    expect(tracker.getState().status).toBe('error');
  });

  it('stop() cancels loop', async () => {
    const { tracker } = await buildTestTracker();
    await tracker.init();
    const video = { readyState: 4 } as HTMLVideoElement;
    tracker.start(video);
    expect(tracker.getState().status).toBe('running');
    tracker.stop();
    expect(tracker.getState().status).toBe('ready');
  });

  it('dispose() closes the graph', async () => {
    const { tracker, landmarker } = await buildTestTracker();
    await tracker.init();
    await tracker.dispose();
    expect(landmarker.close).toHaveBeenCalled();
    expect(tracker.getState().status).toBe('disposed');
  });

  it('subscribers can be attached and detached', async () => {
    const { tracker } = await buildTestTracker();
    await tracker.init();
    const received: HandFrame[] = [];
    const off = tracker.onFrame((f) => received.push(f));
    off();
    expect(received).toEqual([]);
  });
});