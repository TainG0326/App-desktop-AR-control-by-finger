# AirScience — Architecture

## Nguyên tắc thiết kế
1. **Gesture engine là infra** — KHÔNG sửa.
2. **Science logic tách khỏi React UI** — engine thuần TypeScript, UI là renderer.
3. **Missions là data, không phải component** — mỗi mission là một JSON có schema rõ ràng.
4. **Worlds pluggable** — thêm world = thêm folder + đăng ký vào registry.
5. **AirScience renderer KHÔNG phụ thuộc Browser/YouTube/Desktop chrome** — World portals mở World, World chứa Mission.

## Layer stack

```
┌─────────────────────────────────────────────────────────┐
│ React UI Layer                                          │
│   Home → WorldPortals → WorldShell                      │
│              └─ MissionRunner (renders mission)         │
│                       └─ ExploreView                    │
└────────────────────────┬────────────────────────────────┘
                         │ uses
┌────────────────────────▼────────────────────────────────┐
│ Science Engines (pure TS, no React)                     │
│   MissionEngine — load mission by id, validate answer  │
│   ContentEngine — fetch fact by id, with sources       │
│   ObjectAdapter — bridge drag/zoom target ↔ gesture    │
│   ProgressStore — XP, stars, discoveries (zustand)     │
└────────────────────────┬────────────────────────────────┘
                         │ uses
┌────────────────────────▼────────────────────────────────┐
│ Stable Gesture Infra (DO NOT TOUCH)                     │
│   SpatialCursor, PointerController, InteractionBridge,  │
│   InputRouter, HitZoneManager, GestureEngine            │
└────────────────────────┬────────────────────────────────┘
                         │ uses
┌────────────────────────▼────────────────────────────────┐
│ Camera + MediaPipe Hand Tracking                        │
└─────────────────────────────────────────────────────────┘
```

## Folder structure (sau khi pivot)

```
src/renderer/src/
├── airscience/                      ← module AirScience mới
│   ├── Home/                        ← camera-first home với 3 portal
│   │   ├── Home.tsx
│   │   └── Home.module.css
│   ├── worlds/
│   │   ├── space/
│   │   │   ├── SpaceWorld.tsx
│   │   │   ├── SpaceWorld.module.css
│   │   │   ├── missions/
│   │   │   │   ├── solarSystem.ts
│   │   │   │   ├── earthMoon.ts
│   │   │   │   ├── dayNight.ts
│   │   │   │   └── explore.ts
│   │   │   ├── components/
│   │   │   │   ├── Planet.tsx       ← visual đại diện 1 hành tinh
│   │   │   │   ├── Orbit.tsx        ← quỹ đạo SVG
│   │   │   │   └── Sun.tsx
│   │   │   └── data/
│   │   │       └── planets.ts       ← facts + geometry
│   │   └── registry.ts
│   ├── engines/
│   │   ├── missionEngine.ts        ← load mission, validate, completion
│   │   ├── contentEngine.ts        ← fact lookup
│   │   └── objectAdapter.ts        ← adapter DragTarget → ScienceObject
│   ├── stores/
│   │   └── progressStore.ts        ← XP / stars / discoveries
│   ├── components/
│   │   ├── WorldShell.tsx          ← khung world: title bar, back button, mode toggle
│   │   ├── MissionRunner.tsx       ← render mission UI từ mission data
│   │   ├── FactCard.tsx            ← card khoa học (Tiếng Việt)
│   │   ├── MissionIntro.tsx        ← overlay hướng dẫn nhiệm vụ
│   │   ├── XPPopup.tsx             ← +XP animation
│   │   ├── ScienceJournal.tsx
│   │   └── ModeToggle.tsx
│   ├── types.ts
│   └── AIRSCIENCE_THEME.css
├── worldBridge.tsx                  ← routing giữa Home ↔ World (global state)
```

## App.tsx sau pivot

```tsx
<TopProviders>
  <CameraLayer />
  <CinematicIntro />
  <SpatialCursor />
  <Home />
  <WorldBridge />     ← render world khi activeWorldId được set
  <HandTrackingBridge />
  <PointerBridge />
  <GestureBridge />
  <InteractionBridge />
</TopProviders>
```

KHÔNG mount: BrowserHost, YouTubeHost, Dock cũ, SideToolbar, DrawingOverlay, VirtualKeyboard, BrowserHelper, WindowControls (sẽ chuyển Settings vào trong Home), welcome panel desktop.

## Mission data shape

```ts
type Mission = {
  id: string;
  worldId: 'space' | 'animals' | 'human-body';
  mode: 'mission';
  title: string;                 // "Xây dựng Hệ Mặt Trời"
  description: string;           // "Các hành tinh bị lạc..."
  ageRange: [7, 10];
  difficulty: 'easy' | 'medium' | 'hard';
  instructions: string[];        // mỗi bước 1 câu ngắn
  scene: SceneDescriptor;        // render hint cho MissionRunner
  successCondition: {
    type: 'all-placed' | 'specific-placed' | 'order-correct';
    expectedPlacements: Placement[];
  };
  hint: string;
  completionExplanation: string; // fact khi hoàn thành
  factId?: string;               // reference vào ContentEngine
  xpReward: number;
};
```

## Object placement

```ts
type Placement = {
  objectId: string;              // 'earth', 'moon', etc.
  targetSlot: string;            // 'orbit-3', 'near-earth', etc.
};
```

## Đối tượng tương tác

Một `ScienceObject` chỉ cần:
- `id`
- `transform` (position world-space trong world container)
- `draggable: boolean`
- `zoomable: boolean`
- `selectable: boolean`
- `missionRole?` (nếu tham gia mission)
- `contentId?` (để hiển thị fact khi select ở Explore)

KHÔNG tự gắn gesture — nhận drag/zoom qua `ObjectAdapter`.

## Routing giữa Home ↔ World

Dùng `worldBridge.tsx` (zustand local):
- `activeScreen: 'home' | 'space' | 'animals' | 'human-body'`
- `activeMode: 'mission' | 'explore'`
- `activeMissionId: string | null`

`MissionRunner` đọc mission từ `missionEngine.load(id)`, render UI theo `scene` descriptor.

## Security / isolation

- KHÔNG inject Node, KHÔNG tắt contextIsolation.
- Camera vẫn là MediaStream thuần (không qua Electron).
- KHÔNG load YouTube / WebContentsView trong phiên này.

## Performance

- Space World dùng SVG cho orbit + CSS cho planet (procedural). Tránh 3D engine cho slice đầu.
- Planet animation bằng `requestAnimationFrame` driven bằng elapsed time (không re-render React mỗi frame).
- Pointer tracking vẫn qua infra cũ 60fps.
