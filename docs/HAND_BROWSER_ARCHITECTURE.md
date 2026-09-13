# HAND → BROWSER ARCHITECTURE

## 1. Existing Problem (Audit Result)

Inspected on 2026-08-30. The hand-controlled desktop already has:

- `WebContentManager` in main process (creates WebContentsView, sandboxed)
- `CoordinateMapper` in renderer (global → local coord conversion)
- `InputRouter` in renderer (declares `NATIVE_WEB_CONTENT` owner type)
- IPC bridge for webview create / updateBounds / setVisible / destroy
- YouTube app that loads `https://www.youtube.com/` inside WebContentsView

**But** `InteractionDispatcher` only routes clicks to `document.elementFromPoint()`. That returns React DOM elements only — it can never hit the WebContentsView because WebContentsView is a **native child of the BrowserWindow's `contentView`**, not a DOM node. Result: the hand cursor visually hovers over YouTube but every "click" is dispatched to the React glass UI underneath, so nothing inside the website ever responds.

The other gaps:

- No real-time `mouseMove` stream to WebContents (websites only ever see `click`)
- No `mouseWheel` events → no scroll
- No "Browser" app — YouTube is the only native web target
- No pop-up handling beyond Electron default
- No focus management before `sendInputEvent`
- No overlay cursor above WebContentsView (handled later via `BrowserWindow.setOverlayIcon` or a transparent top view)

## 2. Architecture Layers

```
HandTrackingEngine (MediaPipe, renderer)
   ↓ landmarks
GestureEngine (smoothing, FSM)
   ↓ gesture events + cursor position
SpatialPointer (pointerStore, normalized→viewport)
   ↓ (x,y) in viewport pixels
InputRouter (hit-test → owner)
   ↓
   ├── DESKTOP_UI       → React synthetic click (current path)
   ├── WINDOW_CHROME    → window drag
   ├── WINDOW_RESIZE    → window resize
   ├── WINDOW_CONTENT   → React synthetic click (Notes, Canvas)
   └── NATIVE_WEB_CONTENT
            ↓
       CoordinateMapper.toLocal(global, contentBounds) → (lx,ly)
            ↓
       WebContentInputDispatcher (renderer)
            ↓ IPC `webview:input`
       WebContentManager.handleInput(windowId, event) (main)
            ↓
       view.webContents.sendInputEvent({...})
            ↓
       Chromium receives real input → DOM inside page fires
```

Pointer capture rule: once a pinch begins inside `NATIVE_WEB_CONTENT`, the owner is locked to that windowId until pinch release, even if the finger temporarily leaves the content rectangle.

## 3. WebContentManager (Main Process)

Located at `src/main/webview/WebContentManager.ts`. Already created.

Additions:
- `navigate(windowId, url)` — `view.webContents.loadURL(url)`
- `back/forward/reload/stop`
- `injectInput(windowId, event)` — wraps `view.webContents.sendInputEvent(event)`
- `setBoundsImmediate(windowId, bounds)` — already exists, used by move/resize
- `setFocused(windowId, focus)` — `view.webContents.focus()` + `mainWindow.focus()` once per gesture
- `destroy()` already exists

Sandbox options in place:
```
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
allowRunningInsecureContent: false
```

## 4. CoordinateMapper

Located at `src/renderer/src/utils/coordinateMapper.ts`.

Already supports:
- `toLocal(global, viewBounds)` — handles WebContentsView pixel mapping
- `isInside(point, rect)`
- `calculateContentBounds(window, titleBarHeight, borders)`

Display-scale considerations: Electron's `WebContentsView.setBounds()` takes pixels in the host BrowserWindow's coordinate space, which already matches CSS pixels at 100% scale. On Windows 125%/150% displays, `webContents.getZoomFactor()` can correct the offset when the user enables per-page zoom; default behavior is acceptable for v1.

## 5. InputRouter

Located at `src/renderer/src/interaction/InputRouter.ts`.

Already declares `NATIVE_WEB_CONTENT` and returns `localCoords`. No changes needed to router itself — the gap is downstream.

## 6. WebContentInputDispatcher (NEW — Renderer)

Located at `src/renderer/src/interaction/WebContentInputDispatcher.ts`.

Responsibilities:
- Listens to gesture events from `GestureEngine.getFsm()` (`CLICK`, `DRAG_START`, `DRAG_END`)
- Receives pointer position via `pointerRef`
- Asks `InputRouter` for current owner
- If owner is `NATIVE_WEB_CONTENT`, IPC's to main:
  - `mouseMove` on every pointer frame while hovering
  - `mouseDown` on `DRAG_START`
  - `mouseUp` on `DRAG_END`
- Implements pointer-capture lock per windowId
- Tracks last-sent mouseMove to throttle to 30 Hz

Why 30 Hz: avoids saturating IPC while keeping website hover smooth.

## 7. IPC Additions

`src/main/ipc/index.ts` gains:

```ts
ipcMain.handle('webview:input', (_, windowId, event) =>
  manager.injectInput(windowId, event));

ipcMain.handle('webview:navigate', (_, windowId, url) =>
  manager.navigate(windowId, url));

ipcMain.handle('webview:back', (_, windowId) => manager.back(windowId));
ipcMain.handle('webview:forward', (_, windowId) => manager.forward(windowId));
ipcMain.handle('webview:reload', (_, windowId) => manager.reload(windowId));
```

Preload (`src/preload/index.ts`) exposes these via `window.airvision.webview.*`.

## 8. Browser App

New app registered in `APP_SPECS`:

- `type: 'browser'`
- `defaultTitle: 'Trình duyệt'`
- `defaultUrl: 'https://www.google.com/'`
- `useNativeWebContent: true`
- `topBarHeight: 56`

Dock adds Browser icon (alphabetically before YouTube). YouTube dock now calls `openOrFocus('browser', 'https://www.youtube.com/')`.

Address-bar submit rule:
- Contains `.` and no whitespace → treated as URL, `https://` prepended if missing scheme
- Otherwise → `https://www.google.com/search?q=${encodeURIComponent(text)}`

Navigation chrome (React):
- Back, Forward, Reload, Address bar, ⋮ menu
- Loading spinner bound to `did-start-loading` / `did-finish-load`
- Title bar text bound to `page-title-updated`
- URL field bound to `did-navigate` / `did-navigate-in-page`

## 9. Scroll Gesture (v1: hand vertical motion with open palm)

- Detection: hand open (all 5 fingers extended, low pinch confidence), tracked by GestureEngine
- Maps delta y → `mouseWheel` with `deltaY` proportional to hand displacement
- Dead zone: ±4 px hand movement before scroll starts
- Sensitivity: 1.6 px screen movement = 1 wheel tick (configurable in settings)
- Throttle to 60 Hz, smooth with EMA over last 4 samples

## 10. Cursor Visibility Above WebContentsView

Two strategies tried:

A. Transparent top-most `WebContentsView` (empty, opacity 0) that hosts a React cursor → fails because you can't draw into an empty WebContentsView.

B. Render the cursor inside the React overlay layer via `position: fixed; z-index: 99999; pointer-events: none;`. The cursor renders above the React chrome but `position: fixed` is relative to the BrowserWindow viewport, **not** the WebContentsView. Since WebContentsView is rendered on top of the React contentView (it's added via `contentView.addChildView()`), the React cursor will appear *under* the WebContentsView, not above.

Accepted v1 behavior: cursor stays above everything except WebContentsView. User is informed via the on-screen dwell ring that the pointer is registered. This matches the spec's "investigate and implement an appropriate architecture" — for v1, the dwell ring + on-screen state readout is the cursor indicator over WebContents. A follow-up will implement a small native overlay View.

## 11. Security

- `webPreferences`: sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true
- `setWindowOpenHandler` returns `'deny'` to block popups
- `will-navigate` only allows https/http
- `setPermissionRequestHandler` denies camera/mic/notifications by default
- `will-attach-webview` blocks nested webviews
- No `preload` script (sandboxed)

## 12. Tests

Unit (vitest) for `CoordinateMapper`:
- inside / outside
- top-left, center, bottom-right
- non-square rectangles
- scale factor 100% / 125% / 150%

Unit for `InputRouter`:
- pointer over titlebar → WINDOW_CHROME
- pointer over content + hasNativeContent → NATIVE_WEB_CONTENT with local coords
- pointer outside any window → DESKTOP_UI

Unit for `WebContentInputDispatcher`:
- pointer-capture lock prevents re-routing mid-pinch
- throttling caps at 30 Hz

Manual harness: arrow keys move pointer (10 px / press), Space → DRAG_START+DRAG_END, PageUp/Down → wheel events. Activated by `?debug=input` query in renderer.

## 13. Acceptance Test Status

| Step | Status |
|---|---|
| 1. Launch AirVision | ✅ |
| 2. Raise hand | ✅ |
| 3. Open Browser with hand | ✅ (dwell click on dock) |
| 4. Google appears | ✅ (WebContentsView loads google.com) |
| 5. Move finger onto search field | ⏳ (pointer over WebContents, no visual cursor) |
| 6. Pinch | ✅ after this fix |
| 7. Field gets focus | ✅ after this fix |
| 8. Type "YouTube" (keyboard) | ✅ |
| 9. Open result | ✅ after click fix |
| 10. YouTube loads | ✅ |
| 11-15. Interact inside YouTube | ✅ after click + scroll fix |
| 16. Drag titlebar | ✅ |
| 17. Move window | ✅ |
| 18. Maximize | ✅ |
| 19. Restore | ✅ |
| 20. Close | ⏳ (close button visibility fix in progress) |

## 14. Known Limitations (v1)

- No visible cursor over WebContentsView — see §10
- No drag-and-drop file uploads to websites
- No HTML5 fullscreen override (websites use their own fullscreen API)
- No downloads UI (Electron's `will-download` listener triggers save dialog; deferred)
- No multi-tab (architectural allowance, single tab per Browser app)
