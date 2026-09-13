import styles from './CameraErrorUI.module.css';
import type { CameraError, CameraStatus } from './types.js';

interface Props {
  status: CameraStatus;
  error: CameraError;
  /** Called when the user wants to retry the camera. */
  onRetry?: () => void;
  /** Called when the user wants to open settings. */
  onOpenSettings?: () => void;
}

const HEADLINES: Record<CameraStatus, string> = {
  idle: 'Camera đang khởi động…',
  requesting: 'Đang khởi động camera…',
  streaming: '',
  denied: 'Không có quyền truy cập camera',
  unsupported: 'Không tìm thấy camera',
  error: 'Lỗi camera',
  disconnected: 'Camera bị ngắt'
};

const SUGGESTIONS: Record<CameraError['code'], string> = {
  permission:
    'AirScience cần camera để nhận diện cử chỉ tay của em. Hãy cấp quyền camera cho ứng dụng trong Cài đặt quyền riêng tư của hệ điều hành, sau đó bấm Thử lại.',
  'not-found':
    'Không tìm thấy camera. Kết nối webcam và bấm Thử lại. AirScience cần camera để hoạt động.',
  'in-use':
    'Camera đang được ứng dụng khác sử dụng. Đóng các ứng dụng đó rồi bấm Thử lại.',
  overconstrained:
    'Hãy thử camera hoặc độ phân giải khác trong Cài đặt của hệ điều hành.',
  aborted: 'Camera bị gián đoạn. Bấm Thử lại.',
  unknown: 'Lỗi camera không xác định. Bấm Thử lại.'
};

/**
 * Blocking camera error UI.
 *
 * AirScience REQUIRES camera to function — hand gestures are the primary
 * interaction model, so we deliberately do NOT offer a "continue without
 * camera" escape hatch. The user must fix the underlying permission /
 * hardware issue and click Retry.
 */
export function CameraErrorUI({
  status,
  error,
  onRetry,
  onOpenSettings
}: Props): JSX.Element {
  const headline = HEADLINES[status] || error.message;
  const suggestion = SUGGESTIONS[error.code];

  return (
    <div className={styles.shell} role="alert">
      <div className={styles.card}>
        <div className={styles.ring} aria-hidden>
          <div className={styles.ringInner} />
        </div>
        <h2 className={styles.headline}>{headline}</h2>
        <p className={styles.detail}>{suggestion}</p>
        <p className={styles.code}>code: {error.code}</p>
        <div className={styles.actions}>
          {onRetry && (
            <button className={styles.primary} onClick={onRetry}>
              Thử lại
            </button>
          )}
          {onOpenSettings && (
            <button className={styles.secondary} onClick={onOpenSettings}>
              Cài đặt
            </button>
          )}
        </div>
        <p className={styles.hint}>
          AirScience hoạt động bằng cử chỉ tay qua camera — không thể dùng khi
          camera không khả dụng.
        </p>
      </div>
    </div>
  );
}