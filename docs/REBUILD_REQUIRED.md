# ⚠️ Rebuild Required After Code Changes

## Vấn Đề

Khi bạn thay đổi code trong `src/`, **PHẢI rebuild** trước khi chạy `npm run dev`.

`npm run dev` chạy code từ folder `out/`, không phải `src/`.

---

## ✅ Quy Trình Đúng

### Sau mỗi lần sửa code:

```bash
npm run build
npm run dev
```

**HOẶC** dùng watch mode (tự động rebuild):

```bash
npm run dev
# Trong terminal khác:
npm run build -- --watch
```

---

## 🔍 Các Lỗi Thường Gặp

### 1. **App hiển thị màn hình đen**
**Nguyên nhân:** Build cũ hoặc chưa build.
**Giải pháp:**
```bash
npm run build
npm run dev
```

### 2. **`window.api` is undefined**
**Nguyên nhân:** Preload chưa được build.
**Giải pháp:**
```bash
npm run build
```

### 3. **YouTube không load**
**Nguyên nhân:** Main process code chưa được rebuild.
**Giải pháp:**
```bash
npm run build
```

---

## 📁 Build Output Structure

```
out/
├── main/
│   └── index.cjs          ← Electron main process
├── preload/
│   └── index.cjs          ← Preload bridge (window.api)
└── renderer/
    ├── index.html
    └── assets/
        ├── index-*.css    ← Compiled CSS
        └── index-*.js     ← Compiled React app
```

---

## 🛠️ Development Workflow

### Phát triển thường xuyên:
```bash
# Terminal 1: Watch mode (tự động rebuild khi code thay đổi)
npm run dev

# Terminal 2: Watch build (optional - chỉ dùng khi cần)
# npm run build -- --watch
```

### Trước khi test tính năng mới:
```bash
npm run build
npm run dev
```

### Trước khi commit:
```bash
npm run typecheck
npm run build
npm run dev  # Test thủ công
```

---

## ⚡ Tại Sao Cần Rebuild?

1. **TypeScript → JavaScript**
   - `src/*.ts` được compile thành `out/*.cjs`
   
2. **React/JSX → Browser JS**
   - `src/*.tsx` được compile + bundle bởi Vite
   
3. **Electron requires built code**
   - Electron chạy `out/main/index.cjs`, không phải `src/main/index.ts`
   
4. **Preload bridge**
   - `window.api` chỉ available sau khi `out/preload/index.cjs` được load

---

## 🚨 KHI NÀO CẦN REBUILD?

✅ **BẮT BUỘC rebuild khi thay đổi:**
- `src/main/**` (Electron main process)
- `src/preload/**` (window.api bridge)
- `src/renderer/**` (React UI)
- `src/shared/**` (Shared types)

❌ **KHÔNG cần rebuild:**
- `docs/**`
- `README.md`
- `.gitignore`
- Config files (chỉ cần restart dev server)

---

## 🔄 Quick Commands

```bash
# Full rebuild + run
npm run build && npm run dev

# Type check trước khi build
npm run typecheck && npm run build

# Clean build (nếu có vấn đề cache)
rm -rf out/ && npm run build

# Package for production
npm run build:win  # Windows
npm run build:mac  # macOS
```
