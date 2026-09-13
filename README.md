# AirVision Desktop

> A spatial computing desktop driven by hand gestures and a live webcam feed.

AirVision Desktop overlays a translucent spatial UI on top of your webcam and lets you control floating glass windows with hand gestures captured through the same camera. The experience is intended to feel like AR glasses — but on a normal laptop monitor.

Built with **Electron + React + TypeScript + MediaPipe HandLandmarker (WASM)**, with no cloud dependency and no paid APIs. Notes, settings, and window layouts persist locally via `electron-store` and IndexedDB (Dexie).

![Status](https://img.shields.io/badge/status-v0.1.0-blue) ![Stack](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20TS-purple) ![Local--first](https://img.shields.io/badge/local--first-yes-green)

---

## Demo concept

1. Launch the app.
2. Allow camera access — your room becomes the desktop background.
3. Raise your hand. Your index fingertip becomes a spatial cursor.
4. Pinch thumb + index to click. Pinch + move to drag.
5. Pinch a dock icon to launch an app — YouTube, Notes, Drawing, Settings.
6. Drag windows by pinching their title bar; resize via the bottom-right handle.

Everything is real: the camera is live, hand landmarks are detected locally, pinch gestures register as clicks and drags, the window manager actually moves windows, Notes persists across restarts, YouTube plays in an embedded player.

---

## Features

| Area | Status |
|---|---|
| Live fullscreen camera background | ✅ |
| Real-time hand tracking (1–2 hands) | ✅ |
| One-Euro-Filter-smoothed spatial cursor | ✅ |
| Pinch click with hysteresis + dwell guard | ✅ |
| Drag-and-drop windows via pinch + move | ✅ |
| Floating glass window manager | ✅ |
| Floating dock with hover + launch animation | ✅ |
| Glass UI design system (panels, buttons, modal, toast, empty state) | ✅ |
| Notes app with Dexie/IndexedDB persistence | ✅ |
| Drawing app with finger-draw, undo, redo, clear, export PNG | ✅ |
| YouTube app (official `youtube-nocookie` embed + URL parser) | ✅ |
| Settings + 4-corner calibration wizard | ✅ |
| First-run onboarding + replayable | ✅ |
| Cinematic intro animation | ✅ |
| Hand-tracking debug overlay | ✅ |
| Mouse fallback for development | ✅ |
| Two-hand gestures / advanced | ⏳ P2 (deferred) |
| macOS best-effort | ✅ Configured, not the primary target |

---

## Architecture

Three-process Electron model with strict boundaries:

```
┌─────────────────────────┐
│  MAIN (Node)            │
│  • lifecycle            │
│  • window factory       │
│  • typed IPC handlers   │
│  • electron-store       │
│  • CSP + permissions    │
└─────────────────────────┘
            ▲
            │  IPC (typed)
            ▼
┌─────────────────────────┐
│  PRELOAD                │
│  • contextBridge        │
│  • contextIsolation=true│
└─────────────────────────┘
            ▲
            │  window.api
            ▼
┌─────────────────────────┐
│  RENDERER (React)       │
│  • camera service       │
│  • HandLandmarker       │
│  • gesture FSM          │
│  • window manager       │
│  • apps                 │
└─────────────────────────┘
```

Data flow:

```
camera frame
  → HandTracker (MediaPipe WASM)
    → landmark normalizer
      → One Euro Filter
        → GestureEngine FSM
          → PointerController / DragController
            → windowManagerStore (Zustand)
              → React tree (throttled to UI rate)
```

The high-frequency path (camera → gesture) lives in refs + a Zustand store **without** React subscription to avoid re-rendering the tree every frame. The visual cursor reads from a ref via `requestAnimationFrame`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

### Folder structure (locked)

```
src/
  main/          # Electron lifecycle, IPC, electron-store
  preload/       # contextBridge API surface
  shared/        # types shared across processes
  renderer/
    app/         # desktop shell + composition root
    camera/      # CameraService + permission states
    hand-tracking/  # MediaPipe lifecycle, normalizer, debug
    gestures/    # PinchDetector + GestureFSM (pure TS)
    interaction/ # PointerController, DragController
    stores/      # Zustand stores (windows, settings, tracking, pointer)
    windows/     # GlassWindow, WindowChrome, WindowManager
    desktop/     # Dock
    apps/        # YouTube, Notes, Drawing, Settings
    onboarding/  # Overlay + CinematicIntro
    components/  # GlassPanel, GlassButton, Modal, Toast, StatusPill, EmptyState, SpatialCursor
    styles/      # tokens, reset, global
```

---

## Tech stack

- **Electron 33** + **electron-vite** — secure native shell with first-class Vite HMR
- **React 18.3** + **TypeScript 5.6 strict**
- **Zustand 4.5** — lightweight state with ref-backed high-frequency support
- **`@mediapipe/tasks-vision`** HandLandmarker — current-gen WASM hand tracking
- **One Euro Filter** (custom ~60 LOC) — adaptive low-pass smoothing for the cursor
- **Framer Motion 11** — spatial animations
- **Dexie 4** — typed IndexedDB for notes and drawings
- **electron-store 8** — atomic JSON persistence for settings and window layout
- **Vitest 2** + **React Testing Library 16** — unit + component tests
- **electron-builder 25** — Windows installer packaging
- **ESLint 9 flat config** + **Prettier 3** + **typescript-eslint 8**

---

## Gesture controls

| Gesture | Effect |
|---|---|
| Raise hand | Spatial cursor appears at index fingertip |
| Move index finger | Cursor follows; One-Euro-smoothed |
| Pinch thumb + index (held ≥ 80 ms) | Click / press |
| Pinch + move ≥ 6 px | Drag |
| Pinch on title bar | Move window |
| Pinch on resize handle | Resize window |
| Pinch on dock icon | Launch app |
| Pinch + draw on canvas | Draw stroke |
| Quick pinch (released < 80 ms) | No click (dwell guard) |

Pinch uses palm-size-normalized thumb-to-index distance with hysteresis (start 0.35, release 0.55) so it works at varying depths.

See [`docs/GESTURE_SPEC.md`](docs/GESTURE_SPEC.md) for thresholds, FSM, and One Euro defaults.

---

## Setup

Requires **Node 20+** and **npm 10+**.

```sh
npm install
npm run dev         # launches Electron with HMR
```

---

## Development

| Script | Purpose |
|---|---|
| `npm run dev` | Electron + Vite dev with HMR |
| `npm run build` | Production build of main, preload, renderer |
| `npm run typecheck` | TypeScript validation (Node + Web targets) |
| `npm run lint` | ESLint flat config |
| `npm run format` | Prettier write |
| `npm test` | Vitest unit + component tests |
| `npm run test:watch` | Vitest watch mode |

---

## Build & packaging

```sh
npm run package           # builds + writes a Windows unpacked directory
npm run package:installer # builds + produces a Windows NSIS .exe installer
```

The Windows installer is written to `release/AirVision Desktop-0.1.0-x64.exe`.

> Code signing is intentionally skipped in this build; the installer is unsigned. For distribution, configure a code-signing certificate in `electron-builder.json`.

---

## Testing

```sh
npm test                  # vitest run
```

Test coverage:

- CameraService lifecycle and permission state transitions
- HandTracker lifecycle with mocked WASM loader
- `parseResult` MediaPipe result → typed `TrackedHand[]`
- One Euro Filter smoothing under noisy + fast signals
- Landmark normalizer (camera-space → screen-space + calibration)
- PinchDetector hysteresis
- GestureFSM full state table (idle, tracking, hover, pinch, drag, lost, recovery)
- PointerController frame handling + lost-hand handling
- Window manager store (open/close/focus/move/resize/minimize/restore/layout round-trip)
- YouTube URL parser (watch / shorts / youtu.be / start-time forms)
- Notes `newNote()` shape and uniqueness
- Glass primitives render and forward refs
- App shell mounts with brand, dock entries, footer

See [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) for the full catalog.

---

## Known limitations

- **Windows-first**: macOS and Linux are configured in `electron-builder.json` but not the primary target.
- **YouTube embed policy**: we use `youtube-nocookie.com` to maximize embed success; a small set of videos still block embedding. The UI offers an "Open externally" fallback.
- **Two-hand gestures** (resize via two-finger distance, swipe, etc.) are deferred to P2. The spec explicitly gates them behind reliable one-hand operation.
- **No code signing**: the installer is unsigned; Windows SmartScreen will warn on first launch.
- **Single-hand primary**: only the highest-confidence hand drives the cursor; second hand is detected but ignored.
- **Camera FPS**: hand-tracking inference is throttled to ~30 Hz. UI rendering remains at 60 Hz.

---

## Future roadmap

- Voice control (add a `VoiceService` parallel to `HandTracker`)
- Custom user-defined gestures
- AI assistant panel (IPC channel reserved)
- Head tracking and depth cameras
- WebXR / AR glasses mode
- Plugin system for community apps
- Native OS integrations (system tray, global shortcuts)
- Two-hand resize and zoom (P2)

---

## Engineering challenges

**Computer vision pipeline** — running MediaPipe HandLandmarker inside an Electron renderer process required careful lifecycle management: lazy module loading, explicit graph close on dispose, throttled inference to ~30 Hz to coexist with a smooth 60 Hz UI, and a test seam (`__setDependencies`) so the WASM module is fully mockable in jsdom without losing coverage.

**Gesture state machine** — distinguishing a deliberate click from accidental movement was solved with hysteresis on a palm-size-normalized thumb-to-index distance (start 0.35, release 0.55) plus an 80 ms press dwell. The FSM (`IDLE → TRACKING → HOVERING → PINCH_STARTED → PRESSING → DRAGGING → RELEASED → LOST_TRACKING`) is fully unit-tested against synthetic landmark fixtures.

**Noise filtering** — raw MediaPipe landmarks jitter at ~5–10 px even when the hand is stationary. The One Euro Filter (Casiez et al., 2012) reduces jitter adaptively: low cutoff at rest, raised cutoff during fast motion. The two parameters (`minCutoff`, `beta`) are exposed to the user via Settings.

**Spatial UI** — translucent glass panels over a live camera feed required careful layering, capped `backdrop-filter` blur (≤ 24 px), and adaptive surface tinting to keep text readable on arbitrary camera backgrounds. CSS Modules keep glass components composable without runtime cost.

**Electron architecture** — the renderer is fully sandboxed with `contextIsolation: true`, `nodeIntegration: false`, and a tiny typed `contextBridge` surface. The main process owns nothing UI-related; only lifecycle, IPC, persistence, and security policies. CSP is strict (`default-src 'self'`, only `youtube-nocookie.com` allowed in `frame-src`).

**Real-time interaction performance** — the high-frequency path lives in refs and Zustand with no React subscription; the visual cursor updates via `requestAnimationFrame` reading from a ref snapshot. This keeps React renders below 60 per second even with a 30 Hz gesture pipeline.

---

## Project structure

```
docs/                  # Phase 0 deliverables (PRODUCT_SPEC, ARCHITECTURE, GESTURE_SPEC, TEST_PLAN, ROADMAP)
src/                   # source code
  main/                # Electron main process
  preload/             # contextBridge API surface
  shared/              # types shared across processes
  renderer/            # React app
resources/             # build resources
electron-builder.json  # packaging configuration
electron.vite.config.ts # main/preload/renderer build pipelines
package.json
tsconfig*.json
eslint.config.js
vitest.config.ts
README.md
```

---

## License

MIT
