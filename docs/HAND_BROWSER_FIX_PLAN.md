# Kế hoạch: Trình duyệt điều khiển bằng tay

## Vấn đề gốc (audit)

Sau khi rà soát code, phát hiện **3 lỗi nghiêm trọng** ngăn tay điều khiển trang web bên trong WebContentsView:

### 1. `InputRouter` chưa bao giờ được feed dữ liệu

`InputRouter.updateWindowHitZones()` (`src/renderer/src/interaction/InputRouter.ts:49`) và `updateDockBounds()` (line 54) **được định nghĩa nhưng không nơi nào gọi**. Hệ quả: `determineOwner()` luôn trả `DESKTOP_UI`, `WebContentInputDispatcher.getActiveTarget()` luôn `null`, không bao giờ gửi event nào vào WebContentsView.

`grep` xác nhận: chỉ `WebContentInputDispatcher` dùng `getInputRouter()`, và chỉ InputRouter tự tham chiếu các hàm cập nhật. Không có nơi nào `updateWindowHitZones` hay `updateDockBounds` được gọi.

### 2. `HandInputEvent` không khớp giữa renderer và main

- Renderer (`WebContentInputDispatcher.ts:17-25`) khai báo `mouseDragMove`/`mouseDragEnd`
- Main (`WebContentManager.ts:25-30`) không khai báo 2 variant này
- IPC (`src/main/ipc/index.ts:65-72`) ép kiểu `as unknown as Parameters<typeof manager.injectInput>[1]` rồi gọi `view.webContents.sendInputEvent(...)`. Electron `MouseInputEvent` không hỗ trợ `mouseDragMove`/`mouseDragEnd` → sự kiện bị bỏ qua âm thầm.

### 3. `ZOOM_*` bị drop hoàn toàn

`WebContentInputDispatcher.ts:79-82` cố tình return ngay khi gặp `ZOOM_START/UPDATE/END`. Kết quả: cú chụm 2 ngón thu/giãn **không bao giờ** tạo `mouseWheel` để cuộn/phóng trang web.

Ngoài ra:
- Không có pointer capture lock → gesture bị ngắt khi ngón tay run ra khỏi content rect.
- `InteractionDispatcher` và `WebContentInputDispatcher` chạy song song không phối hợp.
- Throttle 30Hz cho mouseMove → drag giật.

## Kế hoạch thực thi

### Bước 1 — Tạo `HitZoneManager` (renderer, file mới)
- Subscribe `useWindowStore` (`windows`, `order`).
- Tính hit zones cho mỗi window: `titleBar` (cao 38px), `resizeHandle` (18×18 ở góc dưới phải), `contentArea` (phần còn lại).
- Tính toán cho native content apps (Browser, YouTube) trừ thêm URL bar (38px cho Browser) để contentArea khớp với WebContentsView rect.
- Gọi `inputRouter.updateWindowHitZones(zones)` mỗi khi windows thay đổi.

### Bước 2 — Feed dock bounds
- Trong `Dock.tsx`, dùng `useEffect` + `ResizeObserver` lấy DOM rect → `inputRouter.updateDockBounds(rect)`.

### Bước 3 — Sửa `HandInputEvent` (renderer + main + IPC)
- Renderer (`WebContentInputDispatcher.ts`): bỏ `mouseDragMove`/`mouseDragEnd`. Dùng `mouseMove` với `buttons: ['left']` để mô tả "đang giữ chuột trái".
- Main (`WebContentManager.ts`): giữ nguyên union chuẩn của Electron, không có 2 variant lạ.
- IPC (`src/main/ipc/index.ts`): validate `event.type` thuộc union chuẩn trước khi gọi injectInput.

### Bước 4 — `WebContentInputDispatcher` viết lại
File `src/renderer/src/interaction/WebContentInputDispatcher.ts`:

1. **Pointer capture lock**:
   - Trên `PINCH_START`: nếu owner là `NATIVE_WEB_CONTENT`, lưu `lockedWindowId`.
   - Mọi event tiếp theo (`CLICK`, `DRAG_*`, `HOLD_DRAG_*`, `ZOOM_*`) dùng locked windowId, không hỏi router lại.
   - Trên `DRAG_END` / `HOLD_DRAG_END` / `ZOOM_END` / `LOST`: clear lock.

2. **CLICK**: gửi `mouseDown` rồi `mouseUp` (giữ logic hiện tại, đã ổn).

3. **DRAG_START**: gửi `mouseDown`.
4. **DRAG_MOVE**: gửi `mouseMove` với `buttons: ['left']` ở 60Hz (bỏ throttle 30Hz).
5. **DRAG_END**: gửi `mouseUp`.
6. **HOLD_DRAG_MOVE**: gửi `mouseMove` với `buttons: ['left']` ở 60Hz.
7. **HOLD_DRAG_END**: gửi `mouseUp`.
8. **ZOOM_UPDATE**: chuyển `scaleFactor` thành `mouseWheel { deltaY }`.
   - `deltaY = -log2(scaleFactor / prevScale) * WHEEL_SENSITIVITY`
   - Sensitivity mặc định ~3 tick per 2x scale.
   - Gửi kèm `deltaX: 0` và `x, y` hiện tại.
9. **ZOOM_START/END**: không gửi gì (chỉ đánh dấu state).
10. **Hover stream 60Hz** thay vì 30Hz.

### Bước 5 — `InteractionDispatcher` viết lại
File `src/renderer/src/interaction/InteractionDispatcher.ts`:

1. Trên `PINCH_START`: kiểm tra owner qua `getInputRouter().determineOwner()`. Nếu là `NATIVE_WEB_CONTENT` thì **không lock DOM element** (để WebContentInputDispatcher xử lý).
2. Ngược lại (owner là React DOM): lock DOM element như cũ.
3. Trên `CLICK`: nếu đã skip ở bước 1 (web content) thì skip luôn.
4. Trên `ZOOM_*`: giữ nguyên (đã skip).

### Bước 6 — `BrowserAppNative` & `YouTubeAppNative`
- Bỏ việc tính contentBounds riêng (hiện không được dùng tới).
- Để HitZoneManager tính contentArea khớp với WebContentsView (trừ title bar + URL bar + borders).

### Bước 7 — Tests
- Cập nhật `tests/inputRouter.test.ts` (đã có, chạy lại).
- Thêm `tests/webContentInputDispatcher.test.ts`:
  - Pointer capture lock hoạt động đúng.
  - DRAG_START → DRAG_MOVE* → DRAG_END sinh ra mouseDown + N×mouseMove(buttons=['left']) + mouseUp.
  - ZOOM_UPDATE → mouseWheel với deltaY đúng dấu.
  - Hover stream throttle đúng 60Hz.

### Bước 8 — Build & verify
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Cấu trúc file thay đổi

| File | Hành động |
|---|---|
| `src/renderer/src/interaction/HitZoneManager.ts` | Tạo mới |
| `src/renderer/src/interaction/WebContentInputDispatcher.ts` | Viết lại |
| `src/renderer/src/interaction/InteractionDispatcher.ts` | Sửa logic lock |
| `src/renderer/src/interaction/InputRouter.ts` | Thêm helper expose để tiện test |
| `src/main/webview/WebContentManager.ts` | Sửa type HandInputEvent (bỏ mouseDragMove/End), validate input |
| `src/main/ipc/index.ts` | Sửa handler validate type |
| `src/preload/index.ts` | Không đổi (đã `unknown`) |
| `src/renderer/src/apps/Browser/BrowserAppNative.tsx` | Bỏ tính contentBounds (HitZoneManager lo) |
| `src/renderer/src/apps/YouTube/YouTubeAppNative.tsx` | Bỏ tính contentBounds |
| `src/renderer/src/desktop/Dock.tsx` | Feed bounds cho InputRouter |
| `src/renderer/src/interaction/InteractionBridge.tsx` | Start HitZoneManager |
| `tests/webContentInputDispatcher.test.ts` | Tạo mới |
| `tests/hitZoneManager.test.ts` | Tạo mới |

## Tiêu chí hoàn thành

- [x] Di ngón trỏ trên trang web → cursor chạy trong web (mouseMove liên tục).
- [x] Dwell ~0.8s → click chuột trái (mouseDown + mouseUp).
- [x] Chụm + kéo ngón trong trang web → kéo thả (mouseDown → mouseMove* → mouseUp).
- [x] Chụm + zoom (2 ngón ra vào) → cuộn/phóng trang web (mouseWheel).
- [x] Không bị drop giữa chừng khi tay run.
- [x] Click trong React (Dock, URL bar) vẫn hoạt động như cũ.
- [x] Drag title bar cửa sổ React vẫn hoạt động như cũ.
