# AirVision Desktop — Architecture

**Status**: Phase 0 deliverable. Authoritative source for module layout, IPC, state ownership, security, and performance budgets.

---

## 1. High-level architecture

Three-process Electron model with strict boundaries:

```
┌──────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node)                                         │
│  • App lifecycle                                               │
│  • BrowserWindow factory + window state                       │
│  • Typed IPC handlers                                         │
│  • electron-store wrapper                                     │
│  • CSP + permission handler                                   │
└──────────────────────────────────────────────────────────────┘
                          ▲
                          │  IPC (typed, async)
                          ▼
┌──────────────────────────────────────────────────────────────�
│  PRELOAD (contextIsolation=true)                              │
│  • contextBridge API surface                                  │
│  • Minimal, fully typed                                       │
└──────────────────────────────────────────────────────────────┘
                          ▲
                          │  window.api.* (typed)
                          ▼
┌──────────────────────────────────────────────────────────────�
│  RENDERER (React + TS)                                        │
│  • Camera service                                             │
│  • Hand tracking (MediaPipe WASM)                             │
│  • Gesture engine (pure-TS FSM)                               │
│  • Interaction controllers                                    │
│  • Window manager store                                       │
│  • Apps                                                        │
│  • Glass UI components                                        │
└──────────────────────────────────────────────────────────────┘
```

The main process owns **nothing UI-related**. It only manages the window's native shell, IPC plumbing, and local persistence. All rendering, gesture recognition, and interaction happen in the renderer.

---

## 2. Folder structure (locked)

```
project-root/
├── docs/                       # this directory (Phase 0 deliverables)
├── resources/                  # icons, splash assets
├── build/                      # electron-builder output
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts            # app lifecycle entry
│   │   ├── windows/            # BrowserWindow factory
│   │   ├── ipc/                # typed IPC handlers
│   │   ├── persistence/        # electron-store wrapper
│   │   └── security/           # CSP, permission handler
│   ├── preload/
│   │   └── index.ts            # contextBridge surface
│   ├── shared/                 # types shared across processes
│   │   └── types/
│   └── renderer/
│       ├── index.html
│       ├── main.tsx            # React entry
│       ├── App.tsx             # top-level router/shell
│       ├── desktop/            # desktop shell, dock, window manager
│       │   ├── Desktop.tsx
│       │   ├── Dock/
│       │   └── WindowManager/
│       ├── windows/            # glass window primitives
│       │   ├── GlassWindow.tsx
│       │   ├── WindowChrome.tsx
│       │   └── ResizeHandle.tsx
│       ├── apps/
│       │   ├── YouTube/
│       │   ├── Notes/
│       │   ├── Drawing/
│       │   ├── Settings/
│       │   ├── Clock/
│       │   └── Gallery/
│       ├── camera/             # camera service + error UI
│       ├── hand-tracking/      # MediaPipe lifecycle, normalizer, debug overlay
│       ├── gestures/           # pure-TS gesture engine
│       │   ├── GestureEngine.ts
│       │   ├── PinchDetector.ts
│       │   ├── stateMachine.ts
│       │   ├── smoothing/
│       │   └── types.ts
│       ├── interaction/        # pointer, drag, hover controllers
│       ├── stores/             # Zustand stores
│       │   ├── windowsStore.ts
│       │   ├── settingsStore.ts
│       │   ├── trackingStore.ts
│       │   └── pointerStore.ts
│       ├── hooks/
│       ├── services/           # persistence service
│       ├── onboarding/
│       ├── components/         # Glass primitives
│       ├── styles/             # tokens, global, reset
│       └── types/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 3. Data flow

```
camera frame ──► HandTracker ──► landmark normalizer ──► One Euro Filter
                                                           │
                                                           ▼
                                                     GestureEngine FSM
                                                           │
                                                           ▼
                                              PointerController / DragController
                                                           │
                                                           ▼
                                                    windowManagerStore
                                                           │
                                                           ▼
                                                  React tree (throttled)
```

Critical rule: **the high-frequency path (camera → gesture) does not cause React re-renders.** Hand-tracking state lives in a ref-backed Zustand store. React subscribes only to throttled UI-relevant projections (e.g. cursor position at ≤ 30 Hz; window state on user action only).

---

## 4. Process responsibilities

### 4.1 Main process

- App lifecycle: `whenReady`, `window-all-closed`, `before-quit`.
- BrowserWindow creation with secure defaults:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true` (where compatible)
  - `webSecurity: true`
  - CSP via response header
- IPC handlers for:
  - `settings:get`, `settings:set`, `settings:reset`
  - `notes:read`, `notes:write`, `notes:delete`
  - `windows:layout:save`, `windows:layout:load`
  - `app:open-external` (validated URL, https-only)
  - `app:version`
- Permission handler: camera permission granted by default for our origin; deny arbitrary protocols.
- Window state persistence on close.

### 4.2 Preload

Exposes a typed `window.api` object via `contextBridge.exposeInMainWorld`:

```ts
interface AirVisionAPI {
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
    reset(): Promise<Settings>;
  };
  notes: {
    list(): Promise<Note[]>;
    save(note: Note): Promise<void>;
    delete(id: string): Promise<void>;
  };
  windows: {
    saveLayout(layout: WindowLayout): Promise<void>;
    loadLayout(): Promise<WindowLayout | null>;
  };
  shell: {
    openExternal(url: string): Promise<void>; // https-only
  };
  app: {
    version: string;
    platform: NodeJS.Platform;
  };
}
```

All IPC channels are namespaced and request/response typed via a shared schema.

### 4.3 Renderer

- Owns all UI.
- Owns the gesture engine (pure TS, no DOM access).
- Owns the window manager store.
- Talks to the main process only via `window.api`.

---

## 5. State management

**Zustand 4.5** with `subscribeWithSelector` and `shallow`. Stores:

| Store | Purpose | React subscription |
|---|---|---|
| `trackingStore` | High-frequency hand landmarks + pointer + gesture state | Refs only — **no React subscription**. Subscribers can opt-in via `useStore.subscribe()` for diagnostics. |
| `pointerStore` | Throttled cursor position, hover target | Subscribed by cursor component only |
| `windowsStore` | Open windows, z-index, focused id | Subscribed by WindowManager |
| `settingsStore` | Persistent user settings | Subscribed by Settings + components reading settings |
| `onboardingStore` | First-run state | Subscribed by Desktop root |

Why Zustand over Redux: minimal boilerplate, supports ref-backed state, supports selective subscription, plays well with non-React consumers (we can read state from gesture engine without React context).

---

## 6. Persistence strategy

| Data | Store | Why |
|---|---|---|
| Settings | `electron-store` | Simple, atomic JSON, survives crashes |
| Window layout | `electron-store` | Lightweight, infrequent writes |
| Notes | Dexie/IndexedDB | Indexed, queryable, larger payload |
| Drawings (saved) | Dexie/IndexedDB | Binary blobs; export also writes PNG via blob URL |

`electron-store` writes are debounced (250 ms) to avoid main-process thrash.

---

## 7. Security model

- **`contextIsolation: true`** — renderer cannot touch Node globals directly.
- **`nodeIntegration: false`** — no `require()` in renderer.
- **`sandbox: true`** where compatible.
- **CSP** — strict default-src 'self'; `frame-src` limited to `youtube-nocookie.com`; `script-src 'self'` (no `'unsafe-eval'`); `style-src 'self' 'unsafe-inline'` (required for CSS Modules generated styles).
- **No remote module**, no `webview` tag for user-supplied URLs.
- **External URLs** validated: `https://` only, no `javascript:` or `data:`.
- **Permissions**: `setPermissionRequestHandler` for camera granted; microphone denied unless future feature needs it.
- **No telemetry** by default.
- **No `unsafe-eval`** in production builds.

---

## 8. IPC contract

Typed channels in `src/shared/ipc/channels.ts`. All payloads validated with Zod or hand-written type guards. IPC surface is intentionally tiny:

```
settings.get            → Settings
settings.set            → Settings
settings.reset          → Settings
notes.list              → Note[]
notes.save              → Note
notes.delete            → void
windows.layout.save     → WindowLayout
windows.layout.load     → WindowLayout | null
shell.openExternal      → void (https-only)
app.version             → string
app.platform            → string
```

No raw `ipcRenderer` exposed; preload validates every channel.

---

## 9. Performance budget

| Metric | Target | Strategy |
|---|---|---|
| UI rendering FPS | ≥ 60 | React 18 concurrent; throttled cursor subscribes |
| Hand-tracking inference | ≥ 24 Hz | Downscale camera frame to 320×240 for inference; full-res for preview only |
| Pointer latency | ≤ 80 ms | One Euro Filter tuned; no per-frame React tree updates |
| Memory ceiling | ≤ 600 MB working set | Explicit MediaPipe graph close on camera stop; no leaked streams |
| `backdrop-filter` usage | Capped | Blur radius ≤ 24 px; ≤ 6 simultaneous blurred surfaces |
| React re-renders per second | ≤ 60 across tree | Throttled pointer; memoized window components |
| Time-to-first-frame | ≤ 2 s | Vite pre-bundles; no SSR; minimal initial bundle |

---

## 10. Module contracts (TypeScript interfaces)

Public types in `src/shared/types/` are importable by both main and renderer. Examples:

```ts
// src/shared/types/tracking.ts
export interface NormalizedLandmark { x: number; y: number; z: number; }
export interface HandFrame {
  hands: ReadonlyArray<{
    handedness: 'Left' | 'Right';
    score: number;
    landmarks: ReadonlyArray<NormalizedLandmark>; // 21 points
  }>;
  timestampMs: number;
}

// src/shared/types/gesture.ts
export type GestureState =
  | 'IDLE' | 'TRACKING' | 'HOVERING'
  | 'PINCH_STARTED' | 'PRESSING' | 'DRAGGING'
  | 'RELEASED' | 'LOST_TRACKING';

export interface GestureSnapshot {
  state: GestureState;
  pinchDistanceNorm: number;
  pointerScreen: { x: number; y: number };
  confidence: number;
}

// src/shared/types/window.ts
export interface WindowDescriptor {
  id: string;
  appType: AppType;
  title: string;
  x: number; y: number;
  width: number; height: number;
  minWidth: number; minHeight: number;
  zIndex: number;
  isActive: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
}
```

---

## 11. Gesture engine architecture

The gesture engine is a **pure TypeScript module** with no DOM dependency. It accepts `HandFrame[]` and emits `GestureSnapshot`. This makes it unit-testable with synthetic landmark fixtures and frees the engine from React lifecycle.

```
HandFrame[] (from HandTracker)
      │
      ▼
landmark normalizer (camera-space → screen-space, mirror-corrected)
      │
      ▼
One Euro Filter (per axis, per tracked landmark)
      │
      ▼
PinchDetector (normalized thumb-index distance, hysteresis)
      │
      ▼
GestureEngine FSM (state transitions based on detector + cursor delta)
      │
      ▼
GestureSnapshot (consumed by PointerController, DragController, DebugOverlay)
```

Controllers subscribe to snapshots and translate them to React/dispatch actions:

- **PointerController** updates `pointerStore` (throttled to UI rate).
- **DragController** translates cursor deltas while `GestureState === 'DRAGGING'`.
- **HoverController** hit-tests DOM via cached element rects.

---

## 12. Build, dev, test scripts

```jsonc
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "start": "electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "package": "electron-vite build && electron-builder --win"
  }
}
```

---

## 13. Testing strategy (summary)

- **Unit**: pure modules (gesture engine, pinch detector, One Euro, normalizer, URL parser, IPC validators).
- **Component**: glass primitives, window manager components with React Testing Library.
- **Integration**: persistence layer (electron-store + Dexie) against a temp directory; window manager store transitions.
- **Mock landmarks**: synthetic `HandFrame[]` fixtures for every gesture state, edge cases, multi-hand, lost-hand.
- **E2E (Playwright)**: smoke test — launch app, mock camera, mock landmarks, verify cursor moves on a known target.
- **Build verification**: `npm run package` must produce an installer in `dist/`.

See `TEST_PLAN.md` for the full test case catalog.

---

## 14. Future extension hooks

Architecture intentionally supports:
- Voice control (add `VoiceService` parallel to `HandTracker`; gesture engine becomes one of multiple input modalities).
- Custom gestures (gesture definitions as data + pluggable recognizer).
- AI assistant (IPC channel `assistant.*`; renderer-side UI).
- Head tracking / depth camera (alternate `HandTracker` implementations behind the same interface).
- WebXR / AR glasses (renderer can swap to WebGL canvas; gesture engine is unchanged).
- Plugin system (apps live in `src/renderer/apps/`; new apps register with the dock).
- Native OS integrations (main process IPC surface grows incrementally).

These are **not implemented** in v1.

---

## 15. Decision log (key choices)

| Choice | Picked over | Reason |
|---|---|---|
| `electron-vite` | `vite-plugin-electron` | First-class Electron + Vite + TS scaffolding; HMR works; widely used |
| React 18.3 | React 19 | Framer Motion + RTL ecosystem maturity on 18 |
| Zustand | Redux Toolkit | Minimal; supports ref-backed state and selective subscription |
| CSS Modules + tokens | Tailwind / CSS-in-JS | No runtime cost; explicit design system; better for `backdrop-filter` perf |
| MediaPipe Tasks Vision | `@mediapipe/hands` | Modern, maintained, faster |
| One Euro Filter | EMA / Kalman | Spec-preferred; configurable latency/jitter tradeoff |
| `youtube-nocookie.com` | `youtube.com/embed` | Higher embed success rate; privacy-friendly |
| Dexie | raw IndexedDB | Typed, queryable, small API |
| Vitest | Jest | Vite-native; faster; compatible API |
| electron-builder | electron-forge | Mature Windows installer output |
