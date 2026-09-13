# AirVision Desktop — Quick Start Guide

## 🚀 Launch

```bash
npm run dev
```

## ✨ What's New

### Massive Window Size Increase
YouTube window is now **1400×800** (was 720×480) — 193% larger!

### Real YouTube Website
No more embedded single videos. Full YouTube.com loads with:
- Homepage
- Search
- Browse videos
- Watch videos
- Recommendations

### Maximize Mode
Click □ button → window fills almost entire screen  
Click ❐ button → restore to normal size

### Single-Instance Apps
YouTube and Settings only allow one window at a time.  
Click dock icon again → focuses existing window.

## 🎮 Controls

### Dock (Bottom of Screen)
- **▶ YouTube** — Opens YouTube (real website)
- **✎ Notes** — Text editor
- **◌ Drawing** — Canvas
- **⚙ Settings** — App settings

### Window Controls
- **Drag title bar** — Move window
- **Drag bottom-right corner** — Resize
- **— Button** — Minimize
- **□ Button** — Maximize
- **❐ Button** — Restore from maximize
- **× Button** — Close

### Hand Gestures (Current)
- **Index finger** → Spatial cursor
- **Pinch (thumb + index)** → Click
- **Hold pinch + move** → Drag window

### Mouse (Fallback)
Everything works with mouse too for debugging.

## ⚠️ Current Limitations

### YouTube Login
Google restricts login in embedded views. You can still:
- ✅ Browse homepage
- ✅ Search videos
- ✅ Watch public videos
- ❌ Sign in (use external browser for this)

### Hand Gestures in YouTube
- ✅ Hand gestures work on window chrome (title bar, resize)
- ✅ Hand gestures work on dock
- ⏳ Hand gestures **don't yet control** YouTube content
  - Use **mouse** to click/scroll YouTube for now
  - Phase 4 will add full gesture support

## 🐛 Troubleshooting

### Black Screen Instead of YouTube
1. Check console (Ctrl+Shift+I) for errors
2. Close and reopen YouTube window
3. Check internet connection

### Window Doesn't Follow Content
Already fixed — WebContentsView syncs automatically.

### Duplicate YouTube Windows
Fixed — only one YouTube instance allowed.

### Camera Not Working
1. Grant camera permission
2. Check Settings → Camera
3. Select correct device

## 📊 What to Expect

**Immediate Experience:**
- Large, immersive YouTube window
- Smooth window management
- Professional spatial desktop feel

**Coming Soon (Phase 4-6):**
- Hand gestures control YouTube content
- Scrolling with hand movements
- Immersive video mode
- Visual polish and effects

## 🎯 Testing the New Features

1. Launch app: `npm run dev`
2. Click YouTube in dock
3. Observe: **MUCH LARGER** window appears
4. Observe: YouTube homepage loads (not just embed)
5. Click maximize (□) → fills screen
6. Move window → WebView follows smoothly
7. Click dock YouTube again → focuses existing window (no duplicate!)
8. Close and reopen → fresh instance

## 📝 For Developers

**Key Achievement:**
Replaced `<iframe src="youtube.com/embed/VIDEO">` with native Electron `WebContentsView` loading full `https://youtube.com/`.

**Architecture:**
```
React Component (YouTubeAppNative)
  ↓ IPC
Main Process (WebContentManager)
  ↓ Electron API
WebContentsView (YouTube.com)
```

**Next Step:**
Phase 4 — Route hand gestures to WebContentsView via `sendInputEvent()`.

---

**Status:** ✅ Phase 3 Complete  
**Ready to use:** Yes (with mouse for YouTube interaction)  
**Ready for Phase 4:** Yes
