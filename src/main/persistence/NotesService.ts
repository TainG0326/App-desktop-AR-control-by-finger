/**
 * Notes service placeholder.
 *
 * In v1, notes are persisted in the renderer process via Dexie/IndexedDB,
 * which is faster and avoids an IPC round-trip per keystroke.
 *
 * This file is kept to mark the architectural intent: notes live in the
 * renderer. If we later need cross-process sync (e.g., multi-window edits),
 * this is the seam where the renderer-side service would be promoted to
 * a main-process service.
 */
export {};
