# YouTube Not Loading — Debug Guide

## Vấn đề

YouTube window mở nhưng chỉ thấy "Loading YouTube..." màu đen, không load được YouTube.com.

## Nguyên nhân có thể

1. **WebContentsView không hiển thị** — Bị che bởi React renderer
2. **Bounds không đúng** — WebView ở ngoài viewport
3. **URL load failed** — Network hoặc YouTube block
4. **Timing issue** — View chưa sẵn sàng khi set bounds

## Debug Steps

### 1. Check Console Logs

Mở DevTools (Ctrl+Shift+I) và tìm:

```
[YouTubeNative] Created WebContentsView for youtube-123...
[WebContentManager] Created view for youtube (youtube-123...)
[WebContentManager] Bounds: { x: ..., y: ..., width: ..., height: ... }
[WebContentManager] Loading: https://www.youtube.com/
[WebContentManager] youtube-123... loaded successfully
```

**Nếu không thấy "loaded successfully":**
- Kiểm tra có error "did-fail-load"
- Kiểm tra network connection

### 2. Check Bounds Values

Console sẽ log bounds. Verify:
- `x, y` không âm và trong viewport
- `width, height` > 0
- Ví dụ OK: `{ x: 260, y: 140, width: 1396, height: 756 }`

**Nếu bounds = 0 hoặc âm:**
- Window chưa được tạo đúng
- React window state có vấn đề

### 3. Manual Test in DevTools

Trong console, thử:

```javascript
// Check if API exists
window.api.webview

// Try manual create (replace with real bounds)
await window.api.webview.create('test-123', 'youtube', {
  x: 100, y: 100, width: 800, height: 600
})
```

### 4. Check Main Process Logs

Nếu chạy từ terminal:
- Tìm `[WebContentManager]` logs
- Check có exception không

## Quick Fixes

### Fix 1: Ensure View is Visible

Thêm vào `WebContentManager.ts` sau `addChildView`:

```typescript
view.setVisible(true);
```

### Fix 2: Force Repaint

Trong `YouTubeAppNative.tsx`, sau create:

```typescript
await window.api.webview.setVisible(windowId, false);
await window.api.webview.setVisible(windowId, true);
```

### Fix 3: Delay Bounds Sync

Bounds có thể được set quá sớm. Thử delay:

```typescript
setTimeout(() => {
  void window.api.webview.updateBounds(windowId, contentBounds);
}, 100);
```

### Fix 4: Alternative URL

Thử URL đơn giản hơn trước:

```typescript
// In WebContentManager getUrlForAppType
case 'youtube':
  return 'https://example.com/'; // Test với trang đơn giản
```

Nếu example.com hiển thị OK → YouTube bị block hoặc issue riêng.

## Known Issue: WebContentsView Z-Order

WebContentsView luôn render **TRÊN** BrowserWindow React content.

**Expected behavior:**
- React placeholder ("Loading YouTube...") nên bị che bởi WebContentsView
- Nếu vẫn thấy placeholder → WebView chưa được add hoặc không visible

## Test Commands

```bash
# Rebuild with debug logs
npm run build

# Run and watch console
npm run dev
```

## Next Debug Version

Tôi đã thêm extensive logging vào code:
- Bounds được log mỗi lần update
- Load success/failure được track
- Visibility changes được log

**Run `npm run dev` và post console output here.**

---

**Status:** Debug version ready  
**Next:** Run app và check console logs
