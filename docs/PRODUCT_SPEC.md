# AirVision Desktop — Product Specification (Engineering Rewrite)

**Status**: Phase 0 deliverable. Authoritative source of truth for feature behavior and acceptance criteria.
**Scope**: Local desktop application; Windows-primary, macOS best-effort.

---

## 1. Product summary

AirVision Desktop (codename "AirVision OS") is an Electron + React + TypeScript desktop application that overlays a translucent "spatial glass" UI on top of the user's live webcam feed and accepts hand gestures as a first-class interaction method. The camera feed functions as the desktop background; finger gestures move a spatial cursor; pinch gestures select and drag; an internal window manager arranges apps (YouTube, Notes, Drawing, Settings, etc.) as floating glass panels.

The application is **local-first**. No cloud account, no remote backend, no paid APIs. Internet is used only for YouTube playback and generic web content.

---

## 2. Target user experience (demo path)

A person launches AirVision Desktop, sees their actual room through the camera, raises their hand, and immediately understands "my finger is controlling the computer interface floating in front of me." Then, without a mouse, they can:

1. Open Notes, drag it, write a note, close it.
2. Open YouTube, paste a URL, play a video, move and resize the window.
3. Open Drawing, sketch a smiley face with the finger, undo a stroke, export as PNG.
4. Open Settings, change smoothing, switch cameras, toggle the debug overlay.
5. Replay onboarding from settings.

If any of those steps requires code edits during the demo, the project is not done.

---

## 3. Non-functional requirements

- **Performance**: ≥ 60 FPS UI rendering where possible; ≥ 24 Hz hand-tracking inference; stable on a typical 2020+ laptop with integrated GPU.
- **Latency**: end-to-end gesture → cursor movement ≤ 80 ms at 30 Hz inference.
- **Stability**: no memory leaks on camera start/stop cycles; explicit lifecycle disposal.
- **Security**: `contextIsolation: true`, `nodeIntegration: false`, typed `contextBridge` preload, CSP headers, no remote code execution, no `unsafe-eval`.
- **Offline capability**: all core features except YouTube work without internet.
- **Persistence**: settings, window layout, notes, drawings persist across restarts.
- **Readability**: text remains readable over arbitrary camera backgrounds via adaptive surface tint/shadow.

---

## 4. Priority matrix

### P0 — MUST WORK (Definition of Done)

| Feature | Acceptance criteria |
|---|---|
| Desktop app launches | Electron starts; renderer mounts; no console errors; splash→desktop transition ≤ 2 s |
| Webcam fullscreen background | Live, mirrored-configurable, low-latency, aspect-preserved (cover-style), permission flow handled, restartable |
| Hand tracking (≥ 1 hand) | MediaPipe HandLandmarker running locally; landmark debug overlay optional; FPS meter visible in dev mode |
| Index-finger spatial cursor | Cursor tracks fingertip with smoothing; cursor hides on lost hand |
| Pinch click | Hysteresis-based pinch start/release; 80 ms dwell; rare accidental clicks |
| Gesture drag | Pinch + move drags windows/UI; release drops |
| Window manager | Multiple floating windows; bring-to-front; bounds; min size; move; resize; close |
| Dock / app launcher | Visible, hover-reactive, pinch launches app, running indicator |
| Glass UI system | Polished, readable, consistent design tokens, micro-animations |
| Notes app | Create, edit, save, delete, persistent across restart |
| YouTube app | Valid URL parses → playable embed; move/resize/close; graceful error on bad URL |
| Drawing app | Finger draw with pinch; brush size; clear; undo; export PNG |
| Settings app | Camera, tracking, appearance, accessibility, debug — all persistent |
| Onboarding | First-run tutorial; replayable from settings |
| Error handling | Every app has loading/empty/error states; no blank screens |
| Tests | Unit + integration tests pass; gesture FSM covered by mock-landmark tests |
| Build | `npm run build` produces a working Windows installer |
| README | Professional README with architecture, gestures, setup, challenges |

### P1 — SHOULD WORK

| Feature | Acceptance criteria |
|---|---|
| Calibration flow | 4-corner calibration; improves pointer alignment; skippable |
| Debug overlay toggle | Landmarks, skeleton, FPS, pinch distance, gesture state, all visible in dev/when toggled |
| Persistence layer | electron-store + IndexedDB; survives crash, restart |
| UX polish | Spacing, hierarchy, motion consistency, depth cues |

### P2 — ADVANCED (only after P1)

| Feature | Acceptance criteria |
|---|---|
| Two-hand resize | Distance between two control points scales window |
| Gesture shortcuts | Swipe, open-palm cancel, etc. |
| Audio feedback | Subtle interaction sounds; mute toggle |
| More apps | Gallery, Clock, Browser-like panel |
| Spatial parallax | Subtle camera-plane parallax on windows |
| Custom gesture editor | User-defined gestures |

### Out of scope (v1)

Cloud accounts, AI assistant, remote DB, multiplayer, voice assistant, custom browser engine, full Chrome clone, complex auth, mobile version. These are future-extension hooks only.

---

## 5. Per-feature behavior

### 5.1 Webcam environment

- Fullscreen background, `object-fit: cover`-style.
- Configurable mirror mode (default on, natural-feeling).
- Device selection when multiple cameras exist (Settings → Camera).
- Permission states: `prompt`, `granted`, `denied`, `unsupported`, `error`.
- Failure UI: explicit message + retry button; no blank screen.
- Stream disposal on app close, camera switch, and component unmount.

### 5.2 Hand tracking

- MediaPipe HandLandmarker (current-gen `@mediapipe/tasks-vision`), running on `<video>` frame snapshots.
- Tracks up to 2 hands; primary hand = first detected (configurable in Settings).
- Exposes normalized landmark coordinates [0..1] in camera space, plus world-space 3D landmarks.
- Confidence score surfaced via store; gating for low-confidence frames.
- Optional debug overlay with landmarks + skeleton + FPS + pinch distance.

### 5.3 Spatial cursor

- Index fingertip → screen coordinates.
- One Euro Filter smoothing (configurable `min-cutoff` and `beta`).
- Lost-hand handling: cursor fades out after 250 ms, hides after 2 s.
- Mirror correction: when camera is mirrored, x is flipped.
- Cursor visualization: translucent orb with state-driven styles (idle/hover/pinch-ready/pinching/dragging/lost).

### 5.4 Pinch + click

- Hysteresis: start when normalized thumb-index distance < 0.35; release when > 0.55.
- Normalization: divide by palm size (`distance(wrist, middle MCP)`) so gesture works at varying depths.
- Press dwell 80 ms prevents twitch clicks.
- Drag activation when hand moves > 6 px while pinched.

### 5.5 Drag and drop

- Pinch over a window title/grab area initiates drag.
- Move the hand to drag.
- Release pinch to drop.
- Bounds-clamped to viewport.
- Prevent accidental drag with the dwell + movement thresholds.

### 5.6 Window manager

- Per-window model: `id, appType, title, x, y, width, height, minSize, maxSize, zIndex, isActive, isMinimized, isMaximized`.
- Operations: open, close, focus, bring-to-front, drag, resize, minimize/restore, maximize/restore.
- zIndex is monotonically increasing per focus.
- Boundary constraints: window must keep ≥ 80 px visible in viewport.
- Minimum size enforced per app type (Notes: 320×240; YouTube: 480×270; Drawing: 480×360; Settings: 480×520).
- Layout state persisted to electron-store.

### 5.7 Window resizing (v1)

- Single-hand pinch on a corner/edge resize handle.
- Drag handle to resize; release to commit.
- Future: two-hand spatial resize (P2).

### 5.8 Dock / app launcher

- Visible floating dock at bottom-center.
- Apps: YouTube, Notes, Drawing, Settings, Clock, Gallery.
- Hover state: scale + glow.
- Pinch activation: app window opens with launch animation (Framer Motion).
- Running indicator: dot/badge on dock icon for open windows.
- Dock never blocks pointer events when the cursor is not over it.

### 5.9 YouTube app

- Accepts: `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`, with optional `?t=Ns`.
- Invalid URL → readable inline error.
- Uses `https://www.youtube-nocookie.com/embed/{ID}` iframe (improves embedding success).
- Window can move, resize, close.
- Playback controlled by YouTube's native UI inside iframe; gesture-controlled overlay for **play/pause** is a pointer-event-driven button on top of the iframe.
- Known limitation documented: a small set of videos block embedding; the UI offers an "Open in browser" external link button (handled by Electron `shell.openExternal`).

### 5.10 Notes app

- CRUD: create, rename, edit, delete.
- Auto-save on blur + 1 s debounced save while typing.
- Persistent via Dexie/IndexedDB.
- Search by title (lightweight).

### 5.11 Drawing app

- HTML Canvas with pointer events driven by the spatial cursor.
- Brush size, color, eraser mode.
- Undo (history stack), Redo, Clear, Export PNG (download via blob URL).
- Drawing is preserved while app is open; not auto-persisted unless user saves (P1: optional save).

### 5.12 Settings app

- **Camera**: device selection, mirror toggle, restart camera.
- **Tracking**: smoothing amount, pinch sensitivity, cursor sensitivity, debug overlay toggle.
- **Appearance**: UI scale, transparency intensity, blur intensity, animation intensity.
- **Accessibility**: mouse fallback toggle, dwell delay, reduced motion.
- **Developer**: FPS, hand confidence, landmark debug, pinch distance overlay, gesture state inspector.
- **Calibration**: 4-corner calibration wizard.
- **Onboarding**: replay tutorial.
- **Reset to defaults**.

### 5.13 Onboarding

- Cinematic intro animation.
- Step-by-step gestures: raise hand, point, pinch, pinch-and-drag, resize.
- Skip button; replayable from Settings.

### 5.14 Error states (universal)

Every app and the desktop shell expose explicit:
- **Loading state** — skeleton/spinner.
- **Empty state** — illustrated placeholder with guidance.
- **Error state** — readable message, retry CTA, optional help link.

---

## 6. Constraints and assumptions

- Windows-primary (10.0.26200+ confirmed). macOS best-effort, not blocking.
- WebGL/WebAssembly available in Chromium (true in Electron renderer).
- Browser-like generic iframe app is intentionally **not** a full browser clone.
- YouTube embed policy is respected — we do not attempt to bypass X-Frame-Options.

---

## 7. Out of scope (documented limits)

- No cloud account system.
- No multi-user profiles.
- No mobile/touch build.
- No custom browser engine (Chromium-only embedding).
- No head-tracking / depth camera / WebXR in v1 — architecture is forward-compatible.

---

## 8. Definition of Done (DoD)

The project is **not** done until every item below is verifiable:

1. App launches via `npm run dev` and `npm run start` without console errors.
2. Webcam starts and renders fullscreen.
3. Hand tracking detects at least one hand reliably.
4. Index finger controls the spatial cursor.
5. Pinch triggers click; pinch+move triggers drag.
6. Multiple floating windows can coexist; bring-to-front works.
7. Dock launches apps; running apps show indicators.
8. Notes: create, edit, delete, persistence survives restart.
9. Drawing: pinch-draw works; undo; clear; export.
10. YouTube: valid URL plays; bad URL shows error; window move/resize/close.
11. Settings: changes persist across restart.
12. Onboarding: runs on first launch; replayable from Settings.
13. All apps have loading/empty/error states.
14. Unit + integration tests pass.
15. `npm run build` produces a Windows installer.
16. README exists with setup, architecture, gestures, challenges, future work.
17. No major TODOs/placeholders left in the user-facing path.
18. A scripted manual demo runs end-to-end without code edits.
