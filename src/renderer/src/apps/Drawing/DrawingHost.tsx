import { WindowManager } from '@renderer/windows/WindowManager.js';
import { DrawingApp } from './DrawingApp.js';

export function DrawingHost(): JSX.Element {
  return <WindowManager appType="drawing" render={(id) => <DrawingApp windowId={id} />} />;
}