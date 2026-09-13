import { useToolStore, type ToolMode } from '../stores/toolStore.js';
import styles from './SideToolbar.module.css';

interface ToolButton {
  id: Exclude<ToolMode, 'none'>;
  label: string;
  glyph: string;
  hotkey: string;
}

const TOOLS: ToolButton[] = [
  { id: 'paint',    label: 'Vẽ',       glyph: '✎', hotkey: 'P' },
  { id: 'keyboard', label: 'Bàn phím', glyph: '⌨', hotkey: 'K' },
  { id: 'browser',  label: 'Trình duyệt', glyph: '⊕', hotkey: 'B' }
];

/**
 * Vertical side toolbar docked to the right edge of the screen.
 *
 * Each button toggles a tool:
 *   - paint    → DrawingOverlay (full-screen canvas)
 *   - keyboard → VirtualKeyboard (bottom)
 *   - browser  → BrowserHelper (floating quick actions)
 *
 * Clicking the active tool closes it. Clicking another tool replaces the
 * current one. All tools can be closed by clicking again or pressing Esc.
 *
 * The toolbar uses standard React DOM events so the InteractionDispatcher
 * routes hand clicks correctly — buttons respond to dwell click.
 */
export function SideToolbar(): JSX.Element {
  const activeTool = useToolStore((s) => s.activeTool);
  const toggleTool = useToolStore((s) => s.toggleTool);

  return (
    <aside className={styles.toolbar} aria-label="Công cụ cử chỉ tay" data-interactive="true">
      <div className={styles.brand} aria-hidden>
        <span className={styles.brandDot} />
      </div>
      {TOOLS.map((tool) => {
        const active = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            className={`${styles.button} ${active ? styles.active : ''}`}
            onClick={() => toggleTool(tool.id)}
            aria-pressed={active}
            aria-label={`${tool.label} (${tool.hotkey})`}
            title={`${tool.label}  ·  Phím tắt: ${tool.hotkey}`}
            data-tool={tool.id}
          >
            <span className={styles.glyph} aria-hidden>{tool.glyph}</span>
            <span className={styles.label}>{tool.label}</span>
            <span className={styles.hotkey} aria-hidden>{tool.hotkey}</span>
          </button>
        );
      })}
    </aside>
  );
}
