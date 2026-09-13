import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CameraService } from '@renderer/camera/CameraService.js';
import type { CameraState } from '@renderer/camera/types.js';

function createMockStream(deviceId = 'dev-1'): MediaStream {
  const track = new EventTarget() as unknown as MediaStreamTrack;
  Object.defineProperty(track, 'stop', { value: vi.fn() });
  Object.defineProperty(track, 'getSettings', {
    value: () => ({ deviceId })
  });
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track]
  } as unknown as MediaStream;
}

function installMediaDevices(opts: {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
} = {}): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: opts.getUserMedia ?? ((constraints: MediaStreamConstraints) => {
        // Honor the requested deviceId in constraints so switch() can be tested.
        let requestedId = 'dev-1';
        const v = (constraints.video ?? {}) as MediaTrackConstraints & {
          deviceId?: { exact?: string };
        };
        if (v && typeof v === 'object' && v.deviceId && v.deviceId.exact) {
          requestedId = v.deviceId.exact;
        }
        return Promise.resolve(createMockStream(requestedId));
      }),
      enumerateDevices:
        opts.enumerateDevices ??
        (() =>
          Promise.resolve([
            { deviceId: 'dev-1', kind: 'videoinput', label: 'Front Camera', groupId: 'g1' },
            { deviceId: 'dev-2', kind: 'videoinput', label: 'Back Camera', groupId: 'g2' }
          ] as MediaDeviceInfo[]))
    }
  });
}

describe('CameraService', () => {
  beforeEach(() => {
    // @ts-expect-error test reset
    delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
  });

  it('reports unsupported when mediaDevices is missing', () => {
    const svc = new CameraService();
    expect(svc.isSupported()).toBe(false);
    const states: CameraState[] = [];
    svc.subscribe((s) => states.push(s));
    return svc.start().then(() => {
      expect(states.some((s) => s.status === 'unsupported')).toBe(true);
    });
  });

  it('starts streaming on permission grant', async () => {
    installMediaDevices();
    const svc = new CameraService();
    await svc.start({ mirror: true });
    expect(svc.getState().status).toBe('streaming');
    expect(svc.getState().stream).toBeTruthy();
    expect(svc.getState().mirror).toBe(true);
  });

  it('transitions to denied on permission error', async () => {
    installMediaDevices({
      getUserMedia: () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    });
    const svc = new CameraService();
    await svc.start();
    const s = svc.getState();
    expect(s.status).toBe('denied');
    expect(s.error?.code).toBe('permission');
  });

  it('transitions to unsupported on no-camera error', async () => {
    installMediaDevices({
      getUserMedia: () => Promise.reject(Object.assign(new Error('nope'), { name: 'NotFoundError' }))
    });
    const svc = new CameraService();
    await svc.start();
    const s = svc.getState();
    expect(s.status).toBe('unsupported');
    expect(s.error?.code).toBe('not-found');
  });

  it('stops tracks and clears stream on stop()', async () => {
    installMediaDevices();
    const svc = new CameraService();
    await svc.start();
    const tracks = svc.getState().stream!.getTracks();
    svc.stop();
    expect(svc.getState().status).toBe('idle');
    expect(svc.getState().stream).toBeNull();
    tracks.forEach((t) => expect((t as unknown as { stop: () => void }).stop).toHaveBeenCalled());
  });

  it('enumerate() populates devices', async () => {
    installMediaDevices();
    const svc = new CameraService();
    await svc.enumerate();
    const s = svc.getState();
    expect(s.devices.length).toBe(2);
    expect(s.devices[0].deviceId).toBe('dev-1');
  });

  it('switch() starts with new device id', async () => {
    installMediaDevices();
    const svc = new CameraService();
    await svc.start();
    await svc.switch('dev-2');
    expect(svc.getState().status).toBe('streaming');
    expect(svc.getState().currentDeviceId).toBe('dev-2');
  });

  it('setMirror updates state immediately', () => {
    const svc = new CameraService();
    svc.setMirror(false);
    expect(svc.getState().mirror).toBe(false);
  });

  it('subscribers receive state on subscribe', () => {
    const svc = new CameraService();
    const cb = vi.fn();
    svc.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    svc.setMirror(false);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});