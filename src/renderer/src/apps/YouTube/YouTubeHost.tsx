import { WindowManager } from '@renderer/windows/WindowManager.js';
import { YouTubeAppNative } from './YouTubeAppNative.js';

export function YouTubeHost(): JSX.Element {
  return <WindowManager appType="youtube" render={(id) => <YouTubeAppNative windowId={id} />} />;
}