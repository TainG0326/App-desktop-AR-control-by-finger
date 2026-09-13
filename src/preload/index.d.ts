import type { AirVisionAPI } from './index.js';

declare global {
  interface Window {
    api: AirVisionAPI;
  }
}

export {};
