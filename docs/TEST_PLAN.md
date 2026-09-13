# AirVision Desktop — Test Plan

**Status**: Phase 0 deliverable. Defines test layers, mock strategy, per-phase gates, and the full test case catalog required by the spec.

---

## 1. Testing layers

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure modules — gesture engine, pinch detector, One Euro Filter, normalizer, URL parser, IPC validators, FSM transitions |
| Component | Vitest + React Testing Library | Glass primitives, window manager components, app shells (with mocked stores) |
| Integration | Vitest | Persistence layer (electron-store + Dexie against temp dirs), window manager store transitions, settings round-trip |
| E2E smoke | Playwright | Launch app, mock camera, mock landmarks, verify cursor hits a known target |
| Build verification | shell | `npm run typecheck`, `npm run lint`, `npm run build`, `npm run package` |

---

## 2. Mock strategy

### 2.1 Hand landmark fixtures

A `fixtures/` directory ships synthetic `HandFrame[]` recordings covering every gesture state and edge case. Each fixture is a function that yields a frame at a logical time `t`:

```ts
type FrameGenerator = (tMs: number) => HandFrame;
```

This lets tests express **scenarios** (e.g., "user pinches, holds, moves right, releases") as pure functions and feed them into the gesture engine.

### 2.2 Camera mocking

For renderer tests, `getUserMedia` is mocked to return a fake `MediaStream` backed by a canvas-generated `MediaStreamTrack`. Tests do not depend on a real webcam.

### 2.3 MediaPipe mocking

In tests, `HandLandmarker.detectForVideo` is mocked to return fixtures in sequence. The real MediaPipe integration is validated manually + via a Playwright smoke test that exercises the actual WASM.

### 2.4 Time control

Vitest's fake timers drive FSM timers (dwell, drag activation, lost-tracking windows).

---

## 3. Per-phase test gates

A phase is **not** complete until its gate passes. Gates are run via `npm test` and `npm run typecheck && npm run lint`.

| Phase | Gate |
|---|---|
| 1 Foundation | `typecheck`, `lint`, app launches via `npm run dev` |
| 2 Camera | CameraService unit tests, integration test for permission state transitions |
| 3 Hand tracking | HandTracker unit tests with mocked WASM, debug overlay component test |
| 4 Pointer | One Euro Filter unit tests, normalizer tests, cursor mapping tests |
| 5 Pinch + FSM | FSM state table coverage, dwell/dead-band tests |
| 6 Glass UI | Snapshot tests for GlassPanel, GlassButton, GlassWindow |
| 7 Window manager | windowsStore transitions, bounds clamping, z-index ordering, persistence round-trip |
| 8 Dock | Dock component test with mocked stores; hover and pinch launch flows |
| 9 Notes | CRUD integration test against temp Dexie DB |
| 10 Drawing | Drawing app component tests; canvas state round-trip |
| 11 YouTube | URL parser unit tests; YouTube component test with mocked iframe |
| 12 Settings + Calibration | Settings round-trip; calibration bilinear interpolation tests |
| 13 Onboarding | Onboarding flow component test; replayable from settings |
| 14 Advanced gestures (P2) | Two-hand resize FSM tests |
| 15 Performance | FPS benchmarks (informational, not gating) |
| 16 Tests | Coverage report; all previous gates still green |
| 17 UX polish | Manual review checklist |
| 18 Release build | `npm run package` produces a Windows installer |
| 19 README | Reviewed |
| 20 Final audit | Full repository audit; all gates green |

---

## 4. Gesture test cases (mandatory)

| ID | Scenario | Expected |
|---|---|---|
| G-01 | Finger stationary | Cursor stable; FSM in `TRACKING` |
| G-02 | Finger moving slowly | Cursor tracks smoothly; no overshoot |
| G-03 | Finger moving quickly | Cursor catches up; One Euro `beta` raises cutoff |
| G-04 | Hand leaves frame | FSM transitions to `LOST_TRACKING` within 250 ms |
| G-05 | Hand re-enters frame | FSM transitions back to `TRACKING` (or `HOVERING` if over target) |
| G-06 | Tracking confidence temporarily drops (<0.5) | Frame dropped; cursor retained from prior good frame |
| G-07 | Pinch starts (threshold crossing) | FSM `HOVERING → PINCH_STARTED` |
| G-08 | Pinch holds for 80 ms | FSM `PINCH_STARTED → PRESSING`; click armed |
| G-09 | Pinch releases after dwell | Click event fires |
| G-10 | Near-pinch (in dead-band [0.35, 0.55]) | No state change |
| G-11 | Rapid repeated pinches (tap-tap-tap) | Each press releases cleanly; no accidental drag |
| G-12 | Pinch + small movement (<6 px) | Stays in `PRESSING` (no drag) |
| G-13 | Pinch + movement >6 px | FSM `PRESSING → DRAGGING` |
| G-14 | Drag crosses screen edge | Cursor clamped; window bounds enforced |
| G-15 | Drag release | Drop event fires |
| G-16 | Two hands enter | Primary hand continues; secondary tracked but ignored |
| G-17 | Two hands leave | FSM `LOST_TRACKING → IDLE` |
| G-18 | Camera mirrored | `screen.x = viewportWidth − cameraX*viewportWidth`; cursor maps correctly |
| G-19 | Camera not mirrored | `screen.x = cameraX*viewportWidth` |
| G-20 | Calibration 4-corner applied | Bilinear interpolation produces expected screen coords |
| G-21 | Calibration skipped | Linear mapping used |
| G-22 | Hand at varying depths (closer/farther) | Pinch thresholds scale correctly (palm-normalized) |
| G-23 | Pinch + immediate release | **CLICK** fires — original click behavior (no hold timer) |
| G-24 | Pinch held ≥ `holdDragMs` (no movement) + release | **HOLD_DRAG_END** fires, no CLICK |
| G-25 | Pinch + cursor Δ ≥ `dragPx` (before `holdDragMs`) | **DRAG_START** fires; DRAG_MOVE / DRAG_END follow |
| G-26 | Pinch held ≥ `holdDragMs` + cursor Δ ≥ `holdDragSensitivityPx` | **HOLD_DRAG_MOVE** fires; cursor becomes grab icon at the threshold |
| G-27 | Pinch + dynamic distance (Δ ≥ 0.05) | **ZOOM_START / ZOOM_UPDATE** fires; window scale changes by `currentNorm / baselineNorm` |
| G-28 | Pinch-zoom above `zoomMax` | Scale clamped to `zoomMax` (no out-of-range growth) |
| G-29 | Pinch-zoom below `zoomMin` | Scale clamped to `zoomMin` |
| G-30 | Pinch-zoom targets topmost focused window only | Other windows remain at scale 1.0 |
| G-31 | Pinch-zoom disabled in settings | No ZOOM events; windows stay at 1.0× |
| G-32 | Pinch-zoom on `hasNativeContent` window (YouTube) | No ZOOM events; native web content not affected |
| G-33 | Hold-drag continuity | 60 consecutive frames produce 60 continuous `HOLD_DRAG_MOVE` events; per-frame delta bounded by `holdDragSensitivityPx` |

---

## 5. Window manager test cases

| ID | Scenario | Expected |
|---|---|---|
| W-01 | Open window | Window added with correct initial bounds; focused |
| W-02 | Close window | Window removed; layout persisted |
| W-03 | Focus window | z-index increases; becomes active |
| W-04 | Drag window to new position | Bounds clamped to viewport |
| W-05 | Resize window via handle | Width/height update; min size enforced |
| W-06 | Resize below min size | Rejected; size clamped to min |
| W-07 | Drag window partly off-screen | Visible portion ≥ 80 px enforced |
| W-08 | Multiple windows | All render; ordering by z-index |
| W-09 | Restore layout after restart | Same windows reopen at saved positions |
| W-10 | Minimize/restore | Window hides/shows; can re-focus |
| W-11 | Maximize/restore | Window fills viewport minus dock; restore returns to prior bounds |

---

## 6. YouTube test cases

| ID | Scenario | Expected |
|---|---|---|
| Y-01 | Valid `youtube.com/watch?v=ID` | Parses to embed URL; iframe loads |
| Y-02 | Valid `youtu.be/ID` | Parses to embed URL |
| Y-03 | Valid `youtube.com/embed/ID` | Parses and used as-is |
| Y-04 | Invalid URL | Inline error message |
| Y-05 | Empty URL | Inline "Enter a YouTube URL" empty state |
| Y-06 | Unsupported video (rare embed-block) | Inline error + "Open in browser" button |
| Y-07 | Network failure | Inline error + retry |
| Y-08 | Resize during playback | Video resizes with window |
| Y-09 | Close during playback | Stream stopped; window removed |
| Y-10 | Reopen after close | Fresh embed |

---

## 7. Camera test cases

| ID | Scenario | Expected |
|---|---|---|
| C-01 | Permission granted | CameraService starts; preview renders |
| C-02 | Permission denied | Explicit denial UI; "Open Settings" link |
| C-03 | No device | "No camera detected" empty state |
| C-04 | Multiple cameras | Device list shown in Settings |
| C-05 | Switch cameras | New stream replaces old; old track stopped |
| C-06 | Camera stopped externally | Disconnect state; "Reconnect" button |
| C-07 | Camera unavailable on platform | Clear unsupported message |
| C-08 | Stream cleanup on app close | All tracks stopped; no leaked MediaStream |
| C-09 | Stream cleanup on camera switch | Previous MediaStream tracks stopped |
| C-10 | Mirror toggle | Preview flips accordingly |

---

## 8. Notes app test cases

| ID | Scenario | Expected |
|---|---|---|
| N-01 | Create note | Note added to list; persisted |
| N-02 | Edit note | Title/body updated; saved |
| N-03 | Delete note | Note removed; persisted |
| N-04 | Persistence across restart | Notes reload from Dexie |
| N-05 | Autosave debounced | Save fires after typing pause |
| N-06 | Search by title | Filtered list returned |

---

## 9. Drawing app test cases

| ID | Scenario | Expected |
|---|---|---|
| D-01 | Pinch + move draws a stroke | Stroke added to canvas |
| D-02 | Clear canvas | All strokes removed |
| D-03 | Undo last stroke | Most recent stroke removed |
| D-04 | Brush size change | New stroke uses new size |
| D-05 | Eraser mode | Stroke removes existing pixels along path |
| D-06 | Export PNG | PNG downloaded; matches canvas |
| D-07 | Performance with many strokes | Maintains ≥ 30 FPS |

---

## 10. Settings + calibration test cases

| ID | Scenario | Expected |
|---|---|---|
| S-01 | Change smoothing | Stored; applied on next frame |
| S-02 | Change pinch sensitivity | Thresholds updated |
| S-03 | Toggle debug overlay | Overlay appears/disappears |
| S-04 | Switch camera device | Stream replaced |
| S-05 | Reset to defaults | All settings restored |
| S-06 | Persistence across restart | Settings reload |
| S-07 | Calibration 4-corner | Bilinear map computed and stored |
| S-08 | Calibration reset | Linear mapping restored |

---

## 11. Persistence test cases

| ID | Scenario | Expected |
|---|---|---|
| P-01 | electron-store write/read | Round-trip equality |
| P-02 | electron-store atomic write | Survives simulated crash mid-write |
| P-03 | Dexie schema migration | Existing data migrates |
| P-04 | Dexie bulk insert | All rows present |

---

## 12. E2E smoke (Playwright)

A single happy-path E2E:

1. Launch app.
2. Mock camera + mock landmark sequence (hand moving diagonally).
3. Verify cursor moves to expected screen position within tolerance.
4. Mock pinch sequence.
5. Verify dock item receives click event and opens Notes window.
6. Verify Notes window renders.

---

## 13. Build verification

Every PR / phase close must pass:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run package   # phase 18+
```

Build must complete without warnings beyond known acceptable noise. `npm run package` must produce a Windows installer in `dist/`.

---

## 14. Manual validation checklist

The following are validated manually because they are not automatable without real hardware:

- Camera works with default Windows webcam.
- Hand tracking works under typical indoor lighting.
- Pinch reliably registers a click in front of a varied camera background.
- Drag feels natural (not too snappy, not too laggy).
- YouTube actually plays a real video in the embedded iframe.
- Drawing produces visible strokes under the finger.
- Settings persist across an OS-level restart.

---

## 15. Coverage targets

- Gesture engine: **≥ 95%** line coverage.
- Pinch detector: **100%** branch coverage (hysteresis logic is critical).
- One Euro Filter: **100%** branch coverage.
- Window manager store: **≥ 90%** line coverage.
- Persistence: **100%** round-trip coverage on canonical fixtures.

Coverage is informational, not gating, but a phase is not "done" if a critical module drops below its target without an explicit exception.
