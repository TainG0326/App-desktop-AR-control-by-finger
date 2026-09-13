import { WindowManager } from '@renderer/windows/WindowManager.js';
import { SettingsApp } from './SettingsApp.js';
import { SettingsHydrator } from './SettingsHydrator.js';

export function SettingsHost(): JSX.Element {
  return (
    <>
      <SettingsHydrator />
      <WindowManager appType="settings" render={(id) => <SettingsApp windowId={id} />} />
    </>
  );
}