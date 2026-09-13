import { useWindowStore } from '@renderer/stores/windowsStore.js';
import { WindowManager } from '@renderer/windows/WindowManager.js';
import { NotesApp } from './NotesApp.js';

export function NotesHost(): JSX.Element {
  const open = useWindowStore((s) => s.open);
  return (
    <>
      <button onClick={() => open({ type: 'notes' })} style={{ display: 'none' }} data-testid="open-notes" />
      <WindowManager appType="notes" render={(id) => <NotesApp windowId={id} />} />
    </>
  );
}

export { openNotes as openNotesAction };

function openNotes(): void {
  useWindowStore.getState().open({ type: 'notes' });
}