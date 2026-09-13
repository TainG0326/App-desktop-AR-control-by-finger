# 🐛 Hướng Dẫn Debug Màn Hình Đen

## ✅ Đã Sửa

1. **Import động → Import tĩnh**
   - Sửa `require('./ipc/index.js')` → `import` ở đầu file
   
2. **Error handling cho Settings**
   - Thêm kiểm tra `window.api` trước khi gọi
   - Catch errors khi hydrate settings

---

## 🔍 Kiểm Tra Tiếp

### Bước 1: Mở DevTools trong Electron

Khi app Electron màu đen xuất hiện:

```
Bấm: Ctrl + Shift + I
```

### Bước 2: Kiểm tra Console

Trong tab **Console**, tìm:

#### ❌ Lỗi màu đỏ:
```
Uncaught TypeError: ...
FATAL: window.api is undefined
Settings hydration failed: ...
```

#### ✅ Kiểm tra window.api:
Gõ vào Console:
```javascript
window.api
```

**Kết quả mong đợi:**
```javascript
{
  settings: {get: ƒ, set: ƒ, reset: ƒ},
  windows: {saveLayout: ƒ, loadLayout: ƒ},
  webview: {create: ƒ, updateBounds: ƒ, ...},
  shell: {openExternal: ƒ},
  app: {getVersion: ƒ, getPlatform: ƒ}
}
```

**Nếu thấy `undefined`:**
→ Preload bridge chưa load

---

## 🔧 Các Lỗi Thường Gặp

### 1. Màn hình đen hoàn toàn

**Nguyên nhân:**
- React app crash do uncaught error
- CSS không load
- `window.api` undefined

**Kiểm tra:**
```javascript
// Trong DevTools Console:
document.querySelector('#root')  // Phải có element
window.api  // Phải là object, không phải undefined
```

### 2. Camera không hiển thị

**Nguyên nhân:**
- Permission bị từ chối
- Camera đang được dùng bởi app khác
- MediaStream error

**Kiểm tra:**
```javascript
navigator.mediaDevices.getUserMedia({video: true})
  .then(() => console.log('Camera OK'))
  .catch(err => console.error('Camera error:', err))
```

### 3. Hand tracking không chạy

**Nguyên nhân:**
- MediaPipe model chưa tải
- WebGL không available
- Camera stream chưa ready

**Kiểm tra Console output:**
```
Graph successfully started running  ← OK
vision_wasm_internal.js errors     ← NOT OK
```

---

## 📊 Debug Checklist

```
□ npm run build → thành công
□ npm run dev → dev server chạy ở localhost:5174
□ Electron window mở
□ Ctrl+Shift+I mở được DevTools
□ Console không có lỗi màu đỏ
□ window.api !== undefined
□ Camera background hiển thị
□ Hand tracking status pill hiển thị
□ Onboarding popup hiển thị
□ Có thể đóng popup
□ Hand tracking nhận diện tay
□ Con trỏ di chuyển theo ngón trỏ
```

---

## 🚨 Nếu Vẫn Lỗi

### Xóa cache và rebuild:

```powershell
# Xóa build cache
Remove-Item -Recurse -Force out\

# Xóa node_modules cache (nếu cần)
Remove-Item -Recurse -Force node_modules\.vite

# Rebuild
npm run build

# Chạy lại
npm run dev
```

### Kiểm tra preload path:

```javascript
// Trong main process (src/main/index.ts)
preload: join(__dirname, '../preload/index.js')

// Build output phải có:
out/
├── main/index.cjs
├── preload/index.cjs    ← Phải tồn tại!
└── renderer/
```

---

## 📸 Screenshot Cần Gửi

Nếu vẫn lỗi, gửi cho tôi:

1. **DevTools Console** (Ctrl+Shift+I)
   - Tab Console với tất cả lỗi màu đỏ
   
2. **Kết quả lệnh:**
   ```javascript
   window.api
   ```
   
3. **Network tab**
   - Kiểm tra có file nào 404 không

4. **Terminal output**
   - Output của `npm run dev`

---

## ⚡ Quick Fix Commands

```powershell
# Rebuild + restart
cd "d:\App desktop AR control by finger"
npm run build
npm run dev

# Nếu vẫn lỗi - hard reset:
Remove-Item -Recurse -Force out\
npm run build
npm run dev
```
