import Store from 'electron-store';
import type { WindowLayout } from '@shared/types/index.js';

export class LayoutService {
  private store: Store<{ layout: WindowLayout | null }>;

  constructor() {
    this.store = new Store<{ layout: WindowLayout | null }>({
      name: 'window-layout',
      defaults: { layout: null }
    });
  }

  save(layout: WindowLayout): void {
    this.store.set('layout', layout);
  }

  load(): WindowLayout | null {
    return this.store.get('layout') ?? null;
  }
}
