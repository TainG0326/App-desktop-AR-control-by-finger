import { useState } from 'react';
import { Modal } from '@renderer/components/Modal.js';
import { GlassButton } from '@renderer/components/GlassButton.js';
import { useSettingsStore } from '@renderer/stores/settingsStore.js';
import { useGestureState } from '@renderer/gestures/useGesture.js';
import styles from './OnboardingOverlay.module.css';

interface Step {
  title: string;
  description: string;
  glyph: string;
  /** Optional FSM state to gate "Next". */
  gate?: 'HOVERING' | 'DWELLING' | 'DRAGGING';
}

const STEPS: Step[] = [
  {
    title: 'Welcome to AirVision',
    description:
      'Your camera is the desktop. Raise your hand to begin.',
    glyph: '✋'
  },
  {
    title: 'Point with your index finger',
    description:
      'Move your index finger across the frame. The translucent cursor follows it.',
    glyph: '☝'
  },
  {
    title: 'Dwell to click',
    description:
      'Rest your finger over a button or link without pinching. An orange ring fills up — when it completes, the click fires.',
    glyph: '⊙',
    gate: 'DWELLING'
  },
  {
    title: 'Pinch and move to drag',
    description:
      'Pinch your fingers together and move to drag windows or draw on the canvas.',
    glyph: '⇲',
    gate: 'DRAGGING'
  },
  {
    title: 'Pinch a resize handle',
    description:
      'Each window has a small handle in the bottom-right corner. Pinch it and move to resize.',
    glyph: '�'
  },
  {
    title: 'Launch from the dock',
    description:
      'Pinch a dock icon (or hover with the system cursor) to open apps: YouTube, Notes, Drawing, Settings.',
    glyph: '⊞'
  }
];

export function OnboardingOverlay(): JSX.Element | null {
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);
  const updateSettings = useSettingsStore((s) => s.update);
  const [step, setStep] = useState(0);
  const fsmState = useGestureState();

  if (onboardingComplete) return null;
  // Wait until settings store has hydrated from the main process. Until
  // then we don't know whether onboarding is complete, so we render
  // nothing. This prevents a brief flash on every app start.
  if (!useSettingsStore.getState().hydrated) return null;

  const current = STEPS[step];
  void current;

  const next = (): void => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      void updateSettings({ onboardingComplete: true });
    }
  };

  const skip = (): void => {
    void updateSettings({ onboardingComplete: true });
  };

  return (
    <Modal
      open
      onClose={skip}
      title={`Hướng dẫn · ${step + 1}/${STEPS.length}`}
    >
      <div className={styles.shell}>
        <div className={styles.glyph} aria-hidden>
          {current.glyph}
        </div>
        <h3 className={styles.title}>{current.title}</h3>
        <p className={styles.description}>{current.description}</p>
        <div className={styles.gate}>
          {current.gate ? (
            <span className={styles.gateLabel}>
              Thử ngay · trạng thái hiện tại: <code>{fsmState}</code>
            </span>
          ) : (
            <span className={styles.gateLabel}>Đọc và tiếp tục</span>
          )}
        </div>
        <div className={styles.actions}>
          <GlassButton variant="ghost" onClick={skip}>
            Bỏ qua
          </GlassButton>
          <GlassButton variant="primary" onClick={next}>
            {step === STEPS.length - 1 ? 'Hoàn tất' : 'Tiếp theo'}
          </GlassButton>
        </div>
        <div className={styles.progress}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i <= step ? styles.dotDone : ''} ${i === step ? styles.dotActive : ''}`}
            />
          ))}
        </div>
        <p className={styles.hint}>Bạn có thể xem lại hướng dẫn này từ Cài đặt bất kỳ lúc nào.</p>
      </div>
    </Modal>
  );
}