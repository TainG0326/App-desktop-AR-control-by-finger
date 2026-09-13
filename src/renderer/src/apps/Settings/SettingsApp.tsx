import { useEffect, useState } from 'react';
import { GlassPanel } from '@renderer/components/GlassPanel.js';
import { GlassButton } from '@renderer/components/GlassButton.js';
import { StatusPill } from '@renderer/components/StatusPill.js';
import { useSettingsStore } from '@renderer/stores/settingsStore.js';
import { getCameraService } from '@renderer/camera/useCamera.js';
import { CalibrationWizard } from './CalibrationWizard.js';
import styles from './SettingsApp.module.css';

type Section = 'camera' | 'tracking' | 'appearance' | 'developer' | 'calibration' | 'onboarding';

export function SettingsApp({ windowId: _windowId }: { windowId: string }): JSX.Element {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const camera = useSettingsStore((s) => s.camera);
  const tracking = useSettingsStore((s) => s.tracking);
  const appearance = useSettingsStore((s) => s.appearance);
  const calibration = useSettingsStore((s) => s.calibration);
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.resetAll);
  const [section, setSection] = useState<Section>('camera');
  const [showCalibration, setShowCalibration] = useState(false);
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);

  useEffect(() => {
    void getCameraService()
      .enumerate()
      .then((list) => setDevices(list.map((d) => ({ deviceId: d.deviceId, label: d.label }))));
  }, []);

  if (!hydrated) {
    return (
      <div className={styles.shell}>
        <StatusPill tone="idle" label="Loading settings…" />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h3 className={styles.title}>Settings</h3>
        <GlassButton size="sm" variant="ghost" onClick={() => void reset()}>
          Reset to defaults
        </GlassButton>
      </header>
      <nav className={styles.nav}>
        {(['camera', 'tracking', 'appearance', 'calibration', 'developer', 'onboarding'] as Section[]).map((s) => (
          <button
            key={s}
            className={`${styles.navBtn} ${section === s ? styles.navBtnActive : ''}`}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
      </nav>
      <GlassPanel padding="md" elevation={0} className={styles.body}>
        {section === 'camera' && (
          <Section title="Camera">
            <Row label="Device">
              <select
                className={styles.select}
                value={camera.deviceId ?? ''}
                onChange={async (e) => {
                  const id = e.target.value || null;
                  await update({ camera: { ...camera, deviceId: id } });
                  if (id) await getCameraService().switch(id);
                }}
              >
                <option value="">System default</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Row>
            <Toggle
              label="Mirror camera"
              checked={camera.mirror}
              onChange={async (v) => {
                await update({ camera: { ...camera, mirror: v } });
                getCameraService().setMirror(v);
              }}
            />
          </Section>
        )}

        {section === 'tracking' && (
          <Section title="Tracking">
            <Slider
              label="Smoothing"
              min={0}
              max={1}
              step={0.05}
              value={tracking.smoothing}
              onChange={(v) => update({ tracking: { ...tracking, smoothing: v } })}
            />
            <Slider
              label="Pinch sensitivity"
              min={0}
              max={1}
              step={0.05}
              value={tracking.pinchSensitivity}
              onChange={(v) => update({ tracking: { ...tracking, pinchSensitivity: v } })}
            />
            <Slider
              label="Cursor sensitivity"
              min={0.5}
              max={2.0}
              step={0.05}
              value={tracking.cursorSensitivity}
              onChange={(v) => update({ tracking: { ...tracking, cursorSensitivity: v } })}
            />
            <Slider
              label="Drag activation (px) — cursor movement to start drag"
              min={2}
              max={20}
              step={1}
              value={tracking.dragPx}
              onChange={(v) => update({ tracking: { ...tracking, dragPx: v } })}
            />
            <Slider
              label="Hold-drag timer (ms) — pinch hold to enter drag mode"
              min={1000}
              max={5000}
              step={250}
              value={tracking.holdDragMs}
              onChange={(v) => update({ tracking: { ...tracking, holdDragMs: v } })}
            />
            <Slider
              label="Zoom minimum (×)"
              min={0.3}
              max={0.7}
              step={0.05}
              value={tracking.zoomMin}
              onChange={(v) => update({ tracking: { ...tracking, zoomMin: v } })}
            />
            <Slider
              label="Zoom maximum (×)"
              min={1.5}
              max={3.5}
              step={0.1}
              value={tracking.zoomMax}
              onChange={(v) => update({ tracking: { ...tracking, zoomMax: v } })}
            />
            <Toggle
              label="Pinch zoom (pinch out to enlarge app)"
              checked={tracking.pinchZoomEnabled}
              onChange={(v) => update({ tracking: { ...tracking, pinchZoomEnabled: v } })}
            />
            <Toggle
              label="Show hand landmark overlay"
              checked={tracking.showDebug}
              onChange={(v) => update({ tracking: { ...tracking, showDebug: v } })}
            />
            <Toggle
              label="Mouse fallback (system cursor)"
              checked={tracking.mouseFallback}
              onChange={(v) => update({ tracking: { ...tracking, mouseFallback: v } })}
            />
            <Toggle
              label="Two-hand gestures"
              checked={tracking.twoHandGestures}
              onChange={(v) => update({ tracking: { ...tracking, twoHandGestures: v } })}
            />
          </Section>
        )}

        {section === 'appearance' && (
          <Section title="Appearance">
            <Slider
              label="UI scale"
              min={0.85}
              max={1.2}
              step={0.05}
              value={appearance.uiScale}
              onChange={(v) => update({ appearance: { ...appearance, uiScale: v } })}
            />
            <Slider
              label="Transparency"
              min={0.2}
              max={0.9}
              step={0.05}
              value={appearance.transparency}
              onChange={(v) => update({ appearance: { ...appearance, transparency: v } })}
            />
            <Slider
              label="Blur"
              min={6}
              max={32}
              step={2}
              value={appearance.blur}
              onChange={(v) => update({ appearance: { ...appearance, blur: v } })}
            />
            <Slider
              label="Animation intensity"
              min={0.5}
              max={1.5}
              step={0.05}
              value={appearance.animation}
              onChange={(v) => update({ appearance: { ...appearance, animation: v } })}
            />
          </Section>
        )}

        {section === 'calibration' && (
          <Section title="Calibration">
            <p className={styles.help}>
              Calibrate by pointing your index finger at each of the four corners in turn.
              Improves cursor alignment when the camera angle puts you off-center.
            </p>
            <GlassButton onClick={() => setShowCalibration(true)}>
              {calibration ? 'Recalibrate' : 'Start calibration'}
            </GlassButton>
            {calibration && (
              <GlassButton variant="ghost" onClick={() => update({ calibration: null })}>
                Reset calibration
              </GlassButton>
            )}
          </Section>
        )}

        {section === 'developer' && (
          <Section title="Developer">
            <p className={styles.help}>
              Diagnostic information for hand tracking and gesture state. Available during development.
            </p>
            <pre className={styles.devDump}>
              {JSON.stringify(
                {
                  camera,
                  tracking,
                  appearance,
                  calibrationPresent: !!calibration
                },
                null,
                2
              )}
            </pre>
          </Section>
        )}

        {section === 'onboarding' && (
          <Section title="Onboarding">
            <p className={styles.help}>
              Replay the first-run gesture tutorial.
            </p>
            <GlassButton onClick={() => update({ onboardingComplete: false })}>
              Replay onboarding
            </GlassButton>
          </Section>
        )}
      </GlassPanel>

      {showCalibration && (
        <CalibrationWizard
          onClose={() => setShowCalibration(false)}
          onComplete={async (data) => {
            await update({ calibration: data });
            setShowCalibration(false);
          }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className={styles.row}>
      <label className={styles.rowLabel}>{label}</label>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div className={styles.row}>
      <label className={styles.rowLabel}>{label}</label>
      <div className={styles.sliderRow}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={styles.slider}
        />
        <span className={styles.sliderValue}>{value.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <div className={styles.row}>
      <label className={styles.rowLabel}>{label}</label>
      <button
        className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span className={styles.toggleKnob} />
      </button>
    </div>
  );
}