# Spatial Desktop Upgrade — Architecture & Migration Plan

## Executive Summary

Transform AirVision Desktop from "small embedded YouTube iframe inside translucent modal" into a **genuine spatial virtual desktop** with real YouTube web content controlled by hand gestures.

---

## Current Architecture Analysis

### What Works ✅

1. **Camera Layer** — Fullscreen webcam background via MediaPipe
2. **Hand Tracking** — MediaPipe hand detection with landmarks
3. **Gesture Engine** — FSM converting pinch/movement → CLICK/DRAG events
4. **Spatial Pointer** — Visual cursor following index finger
5. **InteractionDispatcher** — Synthetic DOM events from gestures
6. **Window Manager (Basic)** — React-based virtual windows with drag/resize
7. **Notes & Drawing** — Functional React applications
8. **Settings** — Calibration, tracking config

### Current Problems ❌

#### 1. YouTube Implementation is Insufficient

**Current:**
```
YouTubeApp.tsx
  ↓
<iframe src="https://youtube.com/embed/{videoId}" />
```

**Problems:**
- User must paste individual video URLs
- No browsing, no homepage
- No search
- No navigation
- Feels like "embedded video player" not "YouTube app"

#### 2. Window Sizes Are Too Small

**Current defaults:**
```typescript
youtube: { defaultWidth: 720, defaultHeight: 480 }
```

**Problem:**
- Only ~37% of 1920×1080 screen
- Unusable for real browsing
- Doesn't feel like AR desktop window

#### 3. No Maximize/Immersive Mode

Windows have minimize but not maximize.

#### 4. No Input Routing to Native Web Content

Current interaction only works with React DOM elements.

#### 5. Glass UI Too Heavy

Current visual design uses excessive translucent blur over content areas.

#### 6. Dock Allows Duplicate Windows

Multiple YouTube windows can open simultaneously.

---

## Target Architecture

### Conceptual Hierarchy

```
┌─────────────────────────────────────────────┐
│         Electron Main Process               │
│  ┌──────────────────────────────────────┐   │
│  │ BrowserWindow (React Renderer)       │   │
│  │  • Camera Layer                      │   │
│  │  • Spatial Desktop UI                │   │
│  │  • Hand Tracker → Gesture Engine     │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ WebContentsView Manager              │   │
│  │  • YouTube WebContentsView           │   │
│  │    https://www.youtube.com/          │   │
│  │  • Future: Browser, Gallery, etc     │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Data Flow

```
MediaPipe Hand Landmarks
  ↓
Gesture Engine (FSM)
  ↓
Spatial Pointer State
  ↓
Input Router ← decides ownership
  ↓
┌──────────────┬──────────────────────┐
│ React UI     │ WebContentsView      │
│ (Dock, Title)│ (YouTube Site)       │
└──────────────┴──────────────────────┘
```

---

## Key Architectural Changes

### 1. Electron WebContentsView for YouTube

**Why WebContentsView?**
- Modern Electron API (BrowserView deprecated)
- Loads full website: `https://www.youtube.com/`
- Native rendering performance
- Separate process isolation
- Real DOM + JS execution

**Security Configuration:**
```typescript
const view = new WebContentsView({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false
  }
});
view.webContents.loadURL('https://www.youtube.com/');
```

**Positioning:**
```typescript
// Sync with React window bounds
view.setBounds({
  x: windowX + borderLeft,
  y: windowY + titleBarHeight,
  width: windowWidth - borders,
  height: windowHeight - titleBarHeight - borders
});
```

### 2. Input Routing Layer

**Architecture:**

```typescript
class InputRouter {
  determineOwner(pointerX, pointerY): InputOwner {
    // Hit test priority:
    // 1. Window title bar → WINDOW_CHROME
    // 2. Resize handle → WINDOW_CHROME
    // 3. Dock → DESKTOP_UI
    // 4. YouTube content rect → YOUTUBE_VIEW
    // 5. Notes window body → NOTES_APP
    // etc.
  }
}
```

**Gesture → Web Input Mapping:**

```typescript
class WebContentInputBridge {
  routeGesture(gesture: GestureEvent, view: WebContentsView) {
    const local = this.toLocalCoords(pointerRef.position, view.getBounds());
    
    switch (gesture.type) {
      case 'CLICK':
        view.webContents.sendInputEvent({
          type: 'mouseDown',
          x: local.x,
          y: local.y,
          button: 'left',
          clickCount: 1
        });
        view.webContents.sendInputEvent({
          type: 'mouseUp',
          x: local.x,
          y: local.y,
          button: 'left'
        });
        break;
        
      case 'MOVE':
        view.webContents.sendInputEvent({
          type: 'mouseMove',
          x: local.x,
          y: local.y
        });
        break;
        
      case 'SCROLL':
        view.webContents.sendInputEvent({
          type: 'mouseWheel',
          x: local.x,
          y: local.y,
          deltaY: gesture.deltaY
        });
        break;
    }
  }
}
```

### 3. WebContents Lifecycle Management

**Requirements:**
- Create view when YouTube window opens
- Update bounds when window moves/resizes
- Hide when minimized
- Show when restored
- Destroy when closed
- **No memory leaks**

**Implementation:**

```typescript
class WebContentManager {
  private views = new Map<string, WebContentsView>();
  
  create(windowId: string, appType: AppType): WebContentsView {
    const view = new WebContentsView({ webPreferences: {...} });
    
    if (appType === 'youtube') {
      view.webContents.loadURL('https://www.youtube.com/');
    }
    
    this.views.set(windowId, view);
    mainWindow.contentView.addChildView(view);
    return view;
  }
  
  updateBounds(windowId: string, rect: Rectangle) {
    const view = this.views.get(windowId);
    if (view) view.setBounds(rect);
  }
  
  destroy(windowId: string) {
    const view = this.views.get(windowId);
    if (view) {
      mainWindow.contentView.removeChildView(view);
      (view.webContents as any).destroy(); // Electron cleanup
      this.views.delete(windowId);
    }
  }
}
```

**IPC Bridge:**

```typescript
// Main process
ipcMain.handle('webview:create', (_, windowId, appType, bounds) => {
  return webContentManager.create(windowId, appType, bounds);
});

// Renderer
await window.api.webview.create(windowId, 'youtube', bounds);
```

### 4. Window Manager Upgrade

**Add to WindowDescriptor:**

```typescript
interface WindowDescriptor {
  // existing...
  isMaximized: boolean;
  previousBounds: { x, y, width, height } | null; // for restore
  hasNativeContent: boolean; // if WebContentsView
}
```

**Add methods:**

```typescript
interface WindowStore {
  maximize(id: string): void;
  unmaximize(id: string): void;
  toggleMaximize(id: string): void;
}
```

**Maximize behavior:**

```typescript
maximize(id) {
  const w = windows[id];
  const prev = { x: w.x, y: w.y, width: w.width, height: w.height };
  const maxBounds = {
    x: 20,
    y: 20,
    width: window.innerWidth - 40,
    height: window.innerHeight - 100 // leave dock space
  };
  windows[id] = { ...w, ...maxBounds, isMaximized: true, previousBounds: prev };
}
```

### 5. Single-Instance App Management

**Dock behavior:**

```typescript
onLaunch() {
  const existing = findWindow(appType);
  if (existing && SINGLE_INSTANCE_APPS.includes(appType)) {
    focus(existing.id);
    if (existing.isMinimized) restore(existing.id);
  } else {
    open({ type: appType });
  }
}
```

### 6. Window Visual Redesign

**Defaults (70-80% viewport):**

```typescript
const APP_SPECS = {
  youtube: { 
    defaultWidth: Math.floor(window.innerWidth * 0.75),
    defaultHeight: Math.floor(window.innerHeight * 0.75),
    minWidth: 800,
    minHeight: 500
  }
};
```

**Glass UI refinement:**

- Title bar: translucent glass
- Content area: **NO BLUR**, clear and readable
- For WebContentsView: transparent overlay

### 7. Scrolling Gesture

**Option A: Pinch + Vertical Movement**

```typescript
if (state === 'PRESSING' && overWebContent) {
  const deltaY = currentY - lastY;
  if (Math.abs(deltaY) > threshold) {
    emit({ type: 'SCROLL', deltaY });
  }
}
```

**Option B: Open Palm Gesture** (future)

Requires additional gesture recognition.

---

## Migration Plan

### Phase 1: Foundation (Week 1)

1. ✅ Document current architecture
2. Create `WebContentManager` main process service
3. Add IPC handlers for webview lifecycle
4. Create `InputRouter` in renderer
5. Add `CoordinateMapper` utility
6. Add tests for coordinate mapping

### Phase 2: Window Manager Upgrade (Week 1)

1. Add `maximize/unmaximize` to windowsStore
2. Add `previousBounds` to WindowDescriptor
3. Update WindowChrome with maximize button
4. Implement single-instance app detection
5. Update default window sizes (70-80% viewport)
6. Add tests for maximize/restore

### Phase 3: YouTube WebContentsView (Week 2)

1. Create YouTube WebContentsView on window open
2. Implement bounds synchronization
3. Implement lifecycle (hide/show/destroy)
4. Remove old iframe-based YouTubeApp
5. Add native web input routing
6. Test: open YouTube → see homepage

### Phase 4: Input Routing (Week 2)

1. Implement hit-testing logic
2. Route gestures to WebContentsView when over content
3. Prevent window drag when clicking YouTube
4. Implement scrolling gesture
5. Add tests for input ownership

### Phase 5: Visual Polish (Week 3)

1. Reduce glass opacity over content
2. Add depth visual cues (focus/blur)
3. Implement immersive video mode
4. Improve window placement (cascading)
5. Add launch animations

### Phase 6: Testing & Refinement (Week 3)

1. Manual acceptance test
2. Performance profiling
3. Memory leak detection
4. Fix interaction bugs
5. Documentation

---

## Security Considerations

### WebContentsView Isolation

**Must maintain:**
- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`

**Never:**
- Expose IPC to web content
- Execute arbitrary code from YouTube
- Disable webSecurity

### Content Security Policy

```typescript
view.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self' https://www.youtube.com;"]
    }
  });
});
```

### Authentication Limitation

Google may block OAuth in embedded views.

**Mitigation:**
- Document limitation
- Browsing/search/public videos work
- Provide "Open in external browser" for login flows

---

## Test Plan

### Unit Tests

**CoordinateMapper:**
```typescript
it('converts global to local coordinates', () => {
  const global = { x: 500, y: 300 };
  const viewBounds = { x: 100, y: 80, width: 800, height: 600 };
  const local = mapper.toLocal(global, viewBounds);
  expect(local).toEqual({ x: 400, y: 220 });
});
```

**WindowManager:**
```typescript
it('maximizes and restores window', () => {
  const id = store.open({ type: 'youtube' });
  const original = store.windows[id];
  store.maximize(id);
  expect(store.windows[id].isMaximized).toBe(true);
  store.unmaximize(id);
  expect(store.windows[id]).toMatchObject({
    x: original.x,
    y: original.y,
    width: original.width,
    height: original.height
  });
});
```

**InputRouter:**
```typescript
it('routes to YOUTUBE_VIEW when over content', () => {
  const owner = router.determineOwner(500, 400);
  expect(owner.type).toBe('YOUTUBE_VIEW');
  expect(owner.viewId).toBe('youtube-123');
});
```

### Integration Tests

**WebContentManager:**
```typescript
it('creates and destroys view', async () => {
  const view = await manager.create('win-1', 'youtube', bounds);
  expect(view).toBeDefined();
  expect(manager.getView('win-1')).toBe(view);
  await manager.destroy('win-1');
  expect(manager.getView('win-1')).toBeUndefined();
});
```

### Manual Acceptance Test

**Required flow:**

1. ✅ Launch AirVision → camera appears
2. ✅ Open YouTube from dock
3. ✅ Window is 70-80% viewport
4. ✅ YouTube homepage loads (real site)
5. ✅ Search bar visible and accessible
6. ✅ Hand cursor moves over YouTube
7. ✅ Pinch video thumbnail → navigates
8. ✅ Video plays
9. ✅ Scroll recommendations (gesture)
10. ✅ Grab title bar → moves window
11. ✅ Grab resize corner → resizes
12. ✅ Maximize button → fills viewport
13. ✅ Restore → returns to original size
14. ✅ Minimize → hides window
15. ✅ Dock click → restores
16. ✅ Close → destroys view
17. ✅ Reopen → new instance, no duplicate

---

## Performance Considerations

**Concerns:**
- Camera 30fps
- MediaPipe inference ~30ms
- React rendering
- WebContentsView compositing
- YouTube video decoding

**Optimizations:**
- Throttle gesture updates to WebContentsView (avoid flooding)
- Use `requestAnimationFrame` for smooth updates
- Profile with Chrome DevTools
- Monitor memory with Electron DevTools
- Target stable 30fps over high camera resolution

**Memory Leak Prevention:**
- Track all WebContentsView instances
- Destroy on window close
- Remove IPC listeners
- Clear RAF handles

---

## Known Limitations

### YouTube Authentication

Google restricts OAuth in embedded webviews.

**Workaround:**
- Public browsing/search works
- For login: "Open in external browser" button

### Scrolling Gesture

Initial implementation may feel clunky.

**Iteration needed:**
- Test different gestures
- Gather user feedback
- Refine sensitivity

### Cross-Platform

Focus on Windows first. macOS/Linux may need adjustments.

---

## Success Criteria

### Functional

- ✅ Real YouTube website loads
- ✅ Browsing, search, navigation work
- ✅ Hand gestures control YouTube
- ✅ Windows are usably large (70-80%)
- ✅ Maximize mode works
- ✅ Single-instance apps
- ✅ No duplicate windows
- ✅ Window lifecycle correct (no leaks)

### Visual

- ✅ Feels like "spatial desktop"
- ✅ Content is clear and readable
- ✅ Glass UI enhances, doesn't obscure
- ✅ Depth cues work
- ✅ Animations smooth

### Performance

- ✅ No significant lag
- ✅ Hand tracking remains stable
- ✅ Video playback smooth
- ✅ No memory leaks over 30min session

---

## Next Steps

1. Review this document with stakeholders
2. Begin Phase 1 implementation
3. Create feature branch: `feat/spatial-desktop-youtube-webview`
4. Incremental commits with tests
5. Daily manual testing
6. Iterate based on feedback

---

**Document Version:** 1.0  
**Date:** 2026-08-30  
**Author:** AirVision Architecture Team
