export type AppType = 'youtube' | 'browser' | 'notes' | 'drawing' | 'settings' | 'clock' | 'gallery';

export interface CameraSettings {
  deviceId: string | null;
  mirror: boolean;
  autoStart: boolean;
}

export interface TrackingSettings {
  /** Enable/disable AR hand control */
  enabled: boolean;
  /** 0..1; mapped to One Euro minCutoff/beta */
  smoothing: number;
  /** 0..1; symmetrically adjusts pinch thresholds */
  pinchSensitivity: number;
  /** 0.5..2 multiplier on cursor delta */
  cursorSensitivity: number;
  showDebug: boolean;
  mouseFallback: boolean;
  /** ms the cursor must rest over a target to fire a CLICK (dwell click). Default 800. */
  dwellMs: number;
  /** px of cursor drift allowed during dwell before the timer resets. Default 4. */
  dwellJitterPx: number;
  /** px of cursor movement required to activate drag while pressing */
  dragPx: number;
  /** ms pinch must be held (without moving) to enter HOLD_DRAG mode */
  holdDragMs: number;
  /** px of cursor movement required to start HOLD_DRAGGING after hold mode armed */
  holdDragSensitivityPx: number;
  /** minimum scale for pinch-zoom (0.3..0.7) */
  zoomMin: number;
  /** maximum scale for pinch-zoom (1.5..3.5) */
  zoomMax: number;
  /** enabled toggle for pinch-zoom */
  pinchZoomEnabled: boolean;
  /** two-hand gestures placeholder (not yet implemented) */
  twoHandGestures: boolean;
}

export interface AppearanceSettings {
  uiScale: number;
  /** 0..1 surface opacity */
  transparency: number;
  /** px backdrop-filter blur */
  blur: number;
  /** 0..1 animation intensity multiplier */
  animation: number;
}

export interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
}

export interface CalibrationPoint {
  /** camera-space [0..1] */
  camX: number;
  camY: number;
  /** viewport pixels */
  screenX: number;
  screenY: number;
}

export interface CalibrationData {
  topLeft: CalibrationPoint;
  topRight: CalibrationPoint;
  bottomRight: CalibrationPoint;
  bottomLeft: CalibrationPoint;
}

export interface Settings {
  camera: CameraSettings;
  tracking: TrackingSettings;
  appearance: AppearanceSettings;
  accessibility: AccessibilitySettings;
  calibration: CalibrationData | null;
  onboardingComplete: boolean;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface WindowDescriptor {
  id: string;
  appType: AppType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  zIndex: number;
  isActive: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  previousBounds: { x: number; y: number; width: number; height: number } | null;
  hasNativeContent: boolean;
  /** Pinch-zoom scale factor (1.0 = identity). Range clamped to settings zoomMin/zoomMax. */
  scale: number;
}

export interface WindowLayout {
  windows: WindowDescriptor[];
  focusedId: string | null;
}
