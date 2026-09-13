# AirVision Desktop — Roadmap

**Status**: Phase 0 deliverable. 20-phase execution checklist with per-phase acceptance criteria and Definition of Done.

---

## Phase 0 — Requirements Audit & Architecture (this phase)

**Deliverable**: `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/GESTURE_SPEC.md`, `docs/TEST_PLAN.md`, `docs/ROADMAP.md`.

**Acceptance**:
- [ ] All 5 docs written.
- [ ] Stack and architecture decisions locked.
- [ ] Risk register populated.
- [ ] Phase 1+ checklist defined.

---

## Phase 1 — Project Foundation

**Deliverable**: Scaffolded Electron + Vite + React + TS project with lint/format/test/build config and a minimal app shell.

**Acceptance**:
- [ ] `package.json` with locked versions, scripts: `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `package`.
- [ ] `tsconfig.json` strict; `tsconfig.web.json` + `tsconfig.node.json`.
- [ ] `electron.vite.config.ts` with main/preload/renderer build pipelines.
- [ ] ESLint 9 flat config + Prettier + typescript-eslint.
- [ ] Vitest configured with jsdom.
- [ ] React 18 mounts; renderer loads.
- [ ] `npm run dev` launches Electron; window opens to a styled "AirVision" landing.
- [ ] No console errors on launch.

---

## Phase 2 — Camera System

**Deliverable**: Fullscreen camera preview with permission states, device selection, mirror toggle, error UI.

**Acceptance**:
- [ ] `CameraService` exposes start/stop/switch/enumerate.
- [ ] Permission states: `prompt`, `granted`, `denied`, `unsupported`, `error`.
- [ ] Device enumeration works when multiple cameras exist.
- [ ] Stream tracks stopped on switch and on unmount.
- [ ] Mirror toggle flips preview.
- [ ] UI shows explicit denial/disconnect messages with retry.
- [ ] Unit tests for state transitions.

---

## Phase 3 — Hand Tracking

**Deliverable**: HandLandmarker integration with debug overlay and FPS.

**Acceptance**:
- [ ] `HandTracker` lifecycle (init, detect loop, dispose).
- [ ] Inference throttled to ~30 Hz; preview runs independently.
- [ ] Up to 2 hands tracked; primary hand selected.
- [ ] Debug overlay (togglable) shows 21 landmarks + skeleton + FPS + confidence.
- [ ] No leaked MediaPipe graphs on stop.

---

## Phase 4 — Pointer Engine

**Deliverable**: Spatial cursor driven by index fingertip.

**Acceptance**:
- [ ] One Euro Filter applied per axis.
- [ ] Coordinate mapping: camera-space → screen-space with mirror correction.
- [ ] Lost-hand handling: cursor fades/hides per spec.
- [ ] Cursor visualization matches FSM state (idle/hover/pinch/dragging).
- [ ] Unit tests for One Euro + normalizer.

---

## Phase 5 — Pinch + Interaction FSM

**Deliverable**: Hysteresis-based pinch detector and FSM.

**Acceptance**:
- [ ] Pinch thresholds 0.35/0.55 normalized by palm size.
- [ ] 80 ms press dwell; 6 px drag activation.
- [ ] FSM transitions covered by unit tests with mock landmarks.
- [ ] Click and drag events emitted correctly.

---

## Phase 6 — Glass Spatial UI System

**Deliverable**: Glass design system primitives.

**Acceptance**:
- [ ] `GlassPanel`, `GlassButton`, `GlassWindow`, `SpatialCursor`, `DockItem`, `StatusPill`, `Modal`, `Toast` components.
- [ ] Design tokens (`tokens.css`): blur, opacity, radius, spacing, border, shadow, animation, typography, z-depth.
- [ ] Camera remains visible behind glass surfaces.
- [ ] Text readable over arbitrary camera backgrounds.
- [ ] Snapshot tests for primitives.

---

## Phase 7 — Window Manager

**Deliverable**: Internal window manager with floating glass windows.

**Acceptance**:
- [ ] `windowsStore`: open/close/focus/drag/resize/bounds/min-size.
- [ ] Multiple windows coexist; click brings to front.
- [ ] Bounds clamped; min size enforced.
- [ ] Gesture drag works (pinch on title area).
- [ ] Mouse fallback works (development).
- [ ] Layout persisted.

---

## Phase 8 — Dock / App Launcher

**Deliverable**: Floating dock at bottom-center.

**Acceptance**:
- [ ] Hover-reactive scaling + glow.
- [ ] Pinch activation launches app.
- [ ] Launch animation (Framer Motion).
- [ ] Running indicator dot/badge.
- [ ] Dock does not block pointer events when not hovered.

---

## Phase 9 — Notes App

**Deliverable**: Functional Notes app persisted via Dexie.

**Acceptance**:
- [ ] CRUD: create, rename, edit, delete.
- [ ] Autosave (debounced 1 s) on edit.
- [ ] Persisted across restart.
- [ ] Title search.

---

## Phase 10 — Spatial Drawing App

**Deliverable**: Canvas driven by pinch + cursor.

**Acceptance**:
- [ ] Draw with pinch + move.
- [ ] Brush size, color, eraser.
- [ ] Undo, clear, export PNG.
- [ ] Performance ≥ 30 FPS with moderate stroke count.

---

## Phase 11 — YouTube App

**Deliverable**: YouTube playback inside AirVision window.

**Acceptance**:
- [ ] URL parser handles watch/youtu.be/embed forms.
- [ ] Uses `youtube-nocookie.com/embed/{id}`.
- [ ] Window move/resize/close works.
- [ ] Invalid URL → readable inline error.
- [ ] Embed-blocked video → "Open in browser" fallback via `shell.openExternal`.

---

## Phase 12 — Settings + Calibration

**Deliverable**: Settings panel with all categories.

**Acceptance**:
- [ ] Camera, Tracking, Appearance, Accessibility, Developer, Calibration, Reset.
- [ ] All settings persist via electron-store.
- [ ] Changes take effect at runtime (not requiring restart).
- [ ] Calibration 4-corner wizard; bilinear interpolation; reset button.

---

## Phase 13 — Onboarding

**Deliverable**: First-run tutorial.

**Acceptance**:
- [ ] Cinematic intro.
- [ ] Gesture walkthrough: raise hand, point, pinch, drag, resize.
- [ ] Skip button.
- [ ] Replayable from Settings.

---

## Phase 14 — Two-Hand / Advanced Gestures (P2)

**Deliverable**: Optional two-hand gestures.

**Acceptance**:
- [ ] Two-hand resize via index-tip distance (opt-in).
- [ ] Reliability prioritized over gesture count.
- [ ] If reliability insufficient, defer to future release without breaking P0.

---

## Phase 15 — Performance Optimization

**Deliverable**: Profiled and tuned app.

**Acceptance**:
- [ ] FPS measured at 60/30/24 Hz tiers; bottlenecks identified and fixed.
- [ ] React renders per second profiled; high-frequency path does not re-render React tree.
- [ ] Memory leak tests pass (camera stop/start cycle, MediaPipe graph lifecycle).
- [ ] `backdrop-filter` usage capped.

---

## Phase 16 — Testing

**Deliverable**: Comprehensive test suites.

**Acceptance**:
- [ ] All gesture/window/YouTube/camera test cases from `TEST_PLAN.md` implemented.
- [ ] Coverage meets targets in `TEST_PLAN.md`.
- [ ] E2E Playwright smoke test green.
- [ ] `npm test` is fast (< 30 s).

---

## Phase 17 — UX Polish

**Deliverable**: Visually polished UI.

**Acceptance**:
- [ ] Spacing, hierarchy, animation consistency review.
- [ ] First-run experience lands cleanly.
- [ ] Cursor visibility and window depth reviewed.
- [ ] No "developer mode" UI leaks into normal user mode.

---

## Phase 18 — Release Build

**Deliverable**: Windows installer.

**Acceptance**:
- [ ] `electron-builder` configured for Windows.
- [ ] `npm run package` produces `.exe` (NSIS) in `dist/`.
- [ ] Installer installs and launches the app without errors.
- [ ] No claims of release success unless build actually succeeds.

---

## Phase 19 — README

**Deliverable**: Professional README.

**Acceptance**:
- [ ] Project overview + demo concept.
- [ ] Features list.
- [ ] Architecture summary.
- [ ] Tech stack.
- [ ] Gesture controls documented.
- [ ] Setup / development / testing / build instructions.
- [ ] Known limitations + future roadmap.
- [ ] "Engineering Challenges" section (CV/portfolio language).

---

## Phase 20 — Final Audit

**Deliverable**: Audited repository.

**Acceptance**:
- [ ] No broken imports.
- [ ] No dead code in user-facing paths.
- [ ] No major TODOs/placeholders.
- [ ] All error paths handled.
- [ ] No unused dependencies.
- [ ] No security mistakes (`nodeIntegration: false`, `contextIsolation: true`, CSP).
- [ ] TypeScript clean (`npm run typecheck` zero errors).
- [ ] Lint clean (`npm run lint` zero errors).
- [ ] All tests pass.
- [ ] Build succeeds.
- [ ] Camera + MediaPipe cleanup verified.

---

## Project-wide Definition of Done

The project is **done** when:

- [ ] Every P0 item in `PRODUCT_SPEC.md` is verifiable.
- [ ] Every test case in `TEST_PLAN.md` is implemented or has a documented deferral with reason.
- [ ] `npm run build` produces a Windows installer that installs and launches successfully.
- [ ] All automated checks pass (typecheck, lint, test, build).
- [ ] README is complete.
- [ ] A scripted manual demo (camera → hand → cursor → pinch → dock → Notes → YouTube → Drawing → Settings) succeeds without code edits during the demo.
