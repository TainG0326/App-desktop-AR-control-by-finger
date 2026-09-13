import { WindowManager } from '@renderer/windows/WindowManager.js';
import { BrowserAppNative } from './BrowserAppNative.js';

export function BrowserHost(): JSX.Element {
  return <WindowManager appType="browser" render={(id) => <BrowserAppNative windowId={id} />} />;
}
