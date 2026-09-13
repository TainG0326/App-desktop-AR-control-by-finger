# AirScience — Roadmap

## PHASE 0 — Audit (đang thực hiện)
- [x] Audit camera + hand-tracking + gesture infra.
- [x] Audit existing WindowManager + Dock.
- [x] Viết 4 docs:
  - AIRSCIENCE_PRODUCT_SPEC.md
  - AIRSCIENCE_ARCHITECTURE.md
  - AIRSCIENCE_CONTENT_MODEL.md
  - AIRSCIENCE_ROADMAP.md (file này)

## PHASE 1 — Loại bỏ chrome cũ khỏi UI chính
- [ ] Vô hiệu hoá mount BrowserHost, YouTubeHost trong App.tsx.
- [ ] Vô hiệu hoá Dock cũ (Browser/YouTube/Notes/Drawing/Settings).
- [ ] Xoá Welcome panel desktop.
- [ ] SideToolbar, DrawingOverlay, VirtualKeyboard, BrowserHelper — đánh dấu deprecated.
- [ ] Verify CLICK/DRAG/ZOOM vẫn hoạt động (regression test).

## PHASE 2 — AirScience Home
- [ ] Tạo `airscience/Home/Home.tsx`.
- [ ] Camera vẫn fullscreen.
- [ ] Title "AirScience" + subtitle tiếng Việt.
- [ ] 3 World Portals: VŨ TRỤ, ĐỘNG VẬT, CƠ THỂ NGƯỜI.
- [ ] Mỗi portal clickable bằng gesture CLICK.
- [ ] Portal chưa implement → hiển thị "Sắp ra mắt".

## PHASE 3 — Engines & Stores
- [ ] `airscience/types.ts` — Mission, ScienceFact, WorldId.
- [ ] `airscience/engines/missionEngine.ts` — load mission by id.
- [ ] `airscience/engines/contentEngine.ts` — load fact by id, danh sách facts cho slice Space.
- [ ] `airscience/engines/objectAdapter.ts` — drag target ↔ science object.
- [ ] `airscience/stores/progressStore.ts` — XP, stars, discoveries (persist localStorage).

## PHASE 4 — Space World (vertical slice)
- [ ] `WorldShell` — back button, mode toggle (Mission/Explore), title.
- [ ] `MissionRunner` — render mission UI từ mission data.
- [ ] Mission 1: Xây dựng Hệ Mặt Trời
  - [ ] Sun ở giữa.
  - [ ] 6 orbit slots trống.
  - [ ] 6 hành tinh (Mercury → Saturn) đặt random ngoài.
  - [ ] Trẻ kéo từng hành tinh vào đúng orbit.
  - [ ] Đúng → snap vào orbit, glow, fact card.
  - [ ] Sai → nhẹ nhàng nhả về vị trí cũ.
- [ ] Mission 2: Trái Đất và Mặt Trăng
  - [ ] Sun, Earth, Moon hiển thị.
  - [ ] Moon bay lơ lửng — trẻ kéo Moon vào vị trí gần Earth.
  - [ ] Moon bắt đầu orbit animation sau khi đặt đúng.
  - [ ] Fact card: Mặt Trăng quay quanh Trái Đất.
- [ ] Mission 3: Ngày và Đêm
  - [ ] Sun + Earth (with half-and-half shading).
  - [ ] Earth rotation animation auto chạy.
  - [ ] Fact card: Trái Đất tự quay tạo ngày và đêm.
- [ ] Explore Mode
  - [ ] Tất cả hành tinh hiển thị tự do.
  - [ ] Click → focus + zoom + fact card.
  - [ ] Drag title bar vẫn move được.

## PHASE 5 — Manual Verification
- [ ] typecheck pass.
- [ ] App launches.
- [ ] Camera appears.
- [ ] Home → click VŨ TRỤ → opens.
- [ ] Mission 1 → kéo Trái Đất vào orbit 3 → snap → fact.
- [ ] Mission 2/3 tương tự.
- [ ] Explore → click Earth → fact.
- [ ] Back về Home.
- [ ] Click/Drag/Zoom regression test (Settings window nếu cần test).

## PHASE 6+ (ngoài phạm vi phiên này)
- Animals World.
- Human Body World.
- Audio narration.
- Science Journal UI.
- UX polish.

## Migration safety
- Browser/YouTube code KHÔNG xoá — chỉ unmount. Phase sau có thể cleanup.
- Gesture infra KHÔNG sửa.
- Camera KHÔNG sửa.
