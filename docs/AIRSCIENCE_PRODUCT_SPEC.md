# AirScience — Product Spec

## 1. Tên sản phẩm
**AirScience** — phụ đề: *Interactive Science World Controlled by Your Hands*.

## 2. Khái niệm cốt lõi
- Ứng dụng học khoa học tương tác bằng cử chỉ tay cho trẻ em tiểu học Việt Nam (7–10 tuổi).
- Camera làm nền. Khoa học nổi lên trên môi trường thật của trẻ.
- Trẻ KHÔNG đọc đoạn văn rồi trả lời trắc nghiệm — trẻ CHẠM, DI CHUYỂN, PHÓNG TO, QUAN SÁT, NHẬN PHẢN HỒI.

## 3. Triết lý học
```
DISCOVER → INTERACT → OBSERVE → LEARN → TRY → FEEDBACK → EXPLORE MORE
```
Bàn tay là trung tâm. Camera có mục đích giáo dục rõ ràng.

## 4. Đối tượng
- Chính: trẻ em 7–10 tuổi, nói tiếng Việt.
- Phụ: phụ huynh / giáo viên — cài đặt + theo dõi tiến trình.

## 5. Nguyên tắc thiết kế
- Chữ to, ngắn, dễ đọc.
- Hướng dẫn trước khi tương tác tối đa 1 câu.
- Feedback tích cực (hạt, glow, sao, +XP). KHÔNG có chữ "SAI!" đỏ.
- Không có bài quiz dạng luyện ghi nhớ máy móc.
- Hiệu ứng "wow" phải có trong 5 giây đầu tiên.

## 6. Cấu trúc sản phẩm
3 thế giới ban đầu:
1. **VŨ TRỤ** (Space World) — vertical slice đầu tiên.
2. **ĐỘNG VẬT** (Animal World).
3. **CƠ THỂ NGƯỜI** (Human Body World).

Mỗi thế giới có 2 chế độ:
- **MISSION MODE** — thử thách có mục tiêu.
- **EXPLORE MODE** — tự do khám phá.

## 7. Tương tác (mapping cố định, KHÔNG đổi)
| Cử chỉ       | Hành động                       |
|--------------|---------------------------------|
| Di chuyển    | Di chuyển spatial cursor        |
| CLICK / PINCH| Chọn đối tượng / kích hoạt nút |
| DRAG         | Kéo đối tượng                   |
| ZOOM IN      | Phóng to đối tượng              |
| ZOOM OUT     | Thu nhỏ đối tượng               |

## 8. Hệ thống tiến trình
- XP: +100 XP / mission hoàn thành, +20 XP / đối tượng mới phát hiện.
- Stars: 0–3 sao / mission (dựa trên lần thử).
- Discoveries: danh sách đối tượng đã khám phá.
- Science Journal: lưu các khám phá đã mở khoá.

## 9. Lưu trữ cục bộ
- XP tổng.
- Mission progress theo `(worldId, missionId)`.
- Discoveries theo `worldId → objectId[]`.
- Settings: âm thanh, narration, camera, gesture sensitivity.

## 10. Phạm vi phiên này (Vertical Slice)
P0 (phiên này):
- Camera preserved.
- Click/Drag/Zoom preserved.
- AirScience Home.
- Mission Engine + Content Engine.
- Space World với 3 missions:
  1. Xây dựng Hệ Mặt Trời.
  2. Trái Đất và Mặt Trăng.
  3. Ngày và Đêm.
- Space Explore Mode.
- Progress store (in-memory + localStorage).

P1 (sau):
- Science Journal UI.
- Animals World.
- Human Body World.
- Audio narration.
- UX polish.

P2 (xa):
- AR objects bám camera thật (plane detection).
- AI tutor.
- Voice interaction.

## 11. Loại bỏ khỏi main UI
- BrowserHost, YouTubeHost — KHÔNG mount trong App.tsx chính (code vẫn giữ để rollback nhưng không hiển thị).
- Dock cũ 5 app (YouTube/Browser/Notes/Drawing/Settings) — thay bằng **World Portals** + **Home Button**.
- Welcome panel desktop — bỏ.

## 12. Bảo toàn
Các hệ thống sau KHÔNG được sửa core:
- `camera/CameraLayer.tsx`, `CameraService.ts`, `useCamera.ts`.
- `hand-tracking/*` (MediaPipe bridge).
- `gestures/GestureEngine.ts`, `stateMachine.ts`, `PinchDetector.ts`, `FiveFingerZoomDetector.ts`.
- `interaction/InteractionDispatcher.ts`, `InteractionBridge.tsx`, `PointerController.ts`, `InputRouter.ts`, `HitZoneManager.ts`.
- `components/SpatialCursor.tsx`, `cursor-overlay/*`.

Các hệ thống trên được coi là **infra ổn định**. Lỗi của chúng fix riêng nếu có; KHÔNG refactor thay đổi hành vi.
