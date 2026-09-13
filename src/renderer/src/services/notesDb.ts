import Dexie, { type Table } from 'dexie';
import type { Note } from '@shared/types/index.js';

class NotesDatabase extends Dexie {
  notes!: Table<Note, string>;

  constructor() {
    super('airvision-notes');
    this.version(1).stores({
      notes: 'id, updatedAt, title'
    });
  }
}

let _db: NotesDatabase | null = null;

export function getNotesDb(): NotesDatabase {
  if (!_db) _db = new NotesDatabase();
  return _db;
}

export async function listNotes(): Promise<Note[]> {
  const all = await getNotesDb().notes.orderBy('updatedAt').reverse().toArray();
  return all;
}

export async function getNote(id: string): Promise<Note | undefined> {
  return getNotesDb().notes.get(id);
}

export async function saveNote(note: Note): Promise<void> {
  await getNotesDb().notes.put(note);
}

export async function deleteNote(id: string): Promise<void> {
  await getNotesDb().notes.delete(id);
}

export function newNote(): Note {
  const now = Date.now();
  return {
    id: `note-${now}-${Math.floor(Math.random() * 9999)}`,
    title: 'Untitled',
    body: '',
    createdAt: now,
    updatedAt: now
  };
}