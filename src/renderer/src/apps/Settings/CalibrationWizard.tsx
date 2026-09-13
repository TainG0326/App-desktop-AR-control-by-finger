import { useState } from 'react';
import { Modal } from '@renderer/components/Modal.js';
import { GlassButton } from '@renderer/components/GlassButton.js';
import { pointerRef } from '@renderer/stores/pointerStore.js';
import type { CalibrationData, CalibrationPoint } from '@shared/types/index.js';
import styles from './CalibrationWizard.module.css';

interface Props {
  onClose: () => void;
  onComplete: (data: CalibrationData) => void;
}

const CORNERS: Array<{ key: keyof Pick<CalibrationData, 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'>; label: string; camX: number; camY: number }> = [
  { key: 'topLeft', label: 'top-left', camX: 0.05, camY: 0.05 },
  { key: 'topRight', label: 'top-right', camX: 0.95, camY: 0.05 },
  { key: 'bottomRight', label: 'bottom-right', camX: 0.95, camY: 0.95 },
  { key: 'bottomLeft', label: 'bottom-bottom', camX: 0.05, camY: 0.95 }
];

const SAMPLE_MS = 1200;

export function CalibrationWizard({ onClose, onComplete }: Props): JSX.Element {
  const [step, setStep] = useState(0);
  const [samples, setSamples] = useState<Partial<Record<keyof CalibrationData, CalibrationPoint>>>({});

  const corner = CORNERS[step];
  const sample = (): void => {
    const screenX = pointerRef.position.x;
    const screenY = pointerRef.position.y;
    setSamples((prev) => ({
      ...prev,
      [corner.key]: { camX: corner.camX, camY: corner.camY, screenX, screenY }
    }));
    if (step < CORNERS.length - 1) {
      window.setTimeout(() => setStep((s) => s + 1), 350);
    } else {
      window.setTimeout(() => finish(), 350);
    }
    void SAMPLE_MS;
  };

  const finish = (): void => {
    const all = samples as CalibrationData;
    if (all.topLeft && all.topRight && all.bottomRight && all.bottomLeft) {
      onComplete(all);
    }
  };

  return (
    <Modal open onClose={onClose} title="Calibration wizard">
      <div className={styles.shell}>
        <p className={styles.intro}>
          Point your index finger at the highlighted corner of the screen, then press <strong>Sample</strong>.
          We'll record where the cursor is and which camera-space point it corresponds to.
        </p>
        <div className={styles.target} data-corner={corner?.key}>
          <span className={styles.targetInner} />
        </div>
        <p className={styles.label}>Corner: <strong>{corner?.label}</strong></p>
        <div className={styles.progress}>
          {CORNERS.map((c, i) => (
            <span
              key={c.key}
              className={`${styles.dot} ${i <= step ? styles.dotDone : ''} ${i === step ? styles.dotActive : ''}`}
            />
          ))}
        </div>
        <div className={styles.actions}>
          <GlassButton variant="ghost" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton variant="primary" onClick={sample}>
            Sample {step + 1}/{CORNERS.length}
          </GlassButton>
        </div>
      </div>
    </Modal>
  );
}