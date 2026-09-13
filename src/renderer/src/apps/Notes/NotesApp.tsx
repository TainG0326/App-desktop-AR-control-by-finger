import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassPanel } from '@renderer/components/GlassPanel.js';
import { GlassButton } from '@renderer/components/GlassButton.js';
import { EmptyState } from '@renderer/components/EmptyState.js';
import { newNote, listNotes, saveNote, deleteNote, getNote } from '@renderer/services/notesDb.js';
import type { Note } from '@shared/types/index.js';
import styles from './NotesApp.module.css';

export interface NotesAppProps {
  windowId: string;
}

export function NotesApp({ windowId }: NotesAppProps): JSX.Element {
  void windowId;
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<Note | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listNotes();
      setNotes(list);
      if (!activeId && list.length > 0) {
        setActiveId(list[0].id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeId) {
      setActive(null);
      return;
    }
    void getNote(activeId).then((n) => {
      if (n) setActive(n);
    });
  }, [activeId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  }, [notes, search]);

  const createNew = useCallback(async () => {
    const note = newNote();
    await saveNote(note);
    await refresh();
    setActiveId(note.id);
  }, [refresh]);

  const updateActive = useCallback(
    (patch: Partial<Pick<Note, 'title' | 'body'>>) => {
      if (!active) return;
      const next = { ...active, ...patch, updatedAt: Date.now() };
      setActive(next);
      setNotes((prev) => prev.map((n) => (n.id === next.id ? next : n)));
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void saveNote(next);
      }, 600);
    },
    [active]
  );

  const removeActive = useCallback(async () => {
    if (!active) return;
    await deleteNote(active.id);
    setActive(null);
    setActiveId(null);
    await refresh();
  }, [active, refresh]);

  if (loading) {
    return (
      <div className={styles.shell}>
        <EmptyState title="Loading notes…" description="Reading from local storage." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.shell}>
        <EmptyState
          title="Couldn't load notes"
          description={error}
          action={<GlassButton onClick={() => void refresh()}>Retry</GlassButton>}
        />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <GlassButton size="sm" variant="primary" onClick={() => void createNew()}>
          + New
        </GlassButton>
        <input
          className={styles.search}
          placeholder="Search notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {active && (
          <GlassButton size="sm" variant="danger" onClick={() => void removeActive()}>
            Delete
          </GlassButton>
        )}
      </header>

      <div className={styles.layout}>
        <aside className={styles.list}>
          {filtered.length === 0 ? (
            <p className={styles.empty}>No notes match.</p>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                className={`${styles.row} ${activeId === n.id ? styles.rowActive : ''}`}
                onClick={() => setActiveId(n.id)}
              >
                <span className={styles.rowTitle}>{n.title || 'Untitled'}</span>
                <span className={styles.rowMeta}>{new Date(n.updatedAt).toLocaleString()}</span>
              </button>
            ))
          )}
        </aside>

        <GlassPanel padding="sm" className={styles.editorPanel} elevation={0}>
          {active ? (
            <div className={styles.editor}>
              <input
                className={styles.titleInput}
                value={active.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                placeholder="Title"
              />
              <textarea
                className={styles.textarea}
                value={active.body}
                onChange={(e) => updateActive({ body: e.target.value })}
                placeholder="Start writing…"
              />
              <footer className={styles.editorFooter}>Autosaves locally · Dexie/IndexedDB</footer>
            </div>
          ) : (
            <EmptyState
              title="No note selected"
              description="Create a new note or pick one from the list."
              action={<GlassButton onClick={() => void createNew()}>+ New note</GlassButton>}
            />
          )}
        </GlassPanel>
      </div>
    </div>
  );
}