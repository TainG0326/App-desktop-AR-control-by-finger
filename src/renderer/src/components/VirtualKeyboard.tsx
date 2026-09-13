import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToolStore } from '../stores/toolStore.js';
import { useWindowStore } from '../stores/windowsStore.js';
import styles from './VirtualKeyboard.module.css';

/**
 * Virtual keyboard for hand-cursor input. Activated from the side toolbar.
 *
 * Routes keys to:
 *   - The native web content (Browser, YouTube) via IPC `webview:key`.
 *   - A focused React DOM input (Notes app) via a synthetic KeyboardEvent.
 *
 * Layouts:
 *   - default: lowercase letters, digits on top row
 *   - shift:   uppercase letters
 *   - symbols: numbers & punctuation (toggle ?123)
 *
 * Each key fires keyDown + char + keyUp. Modifier keys (shift, ctrl, alt)
 * are tracked in component state and included with the next key event.
 */

type KeyDef =
  | { kind: 'char'; key: string; code: string; shift?: string; label?: string }
  | { kind: 'space'; key: string; code: string }
  | { kind: 'enter'; key: string; code: string }
  | { kind: 'backspace'; key: string; code: string }
  | { kind: 'tab'; key: string; code: string }
  | { kind: 'shift'; label: string }
  | { kind: 'symbols'; label: string }
  | { kind: 'abc'; label: string }
  | { kind: 'mod'; label: string; modifier: 'control' | 'alt' };

const LOWERCASE_ROW1: KeyDef[] = 'qwertyuiop'.split('').map(ch => ({
  kind: 'char', key: ch, code: `Key${ch.toUpperCase()}`, shift: ch.toUpperCase()
}));
const LOWERCASE_ROW2: KeyDef[] = 'asdfghjkl'.split('').map(ch => ({
  kind: 'char', key: ch, code: `Key${ch.toUpperCase()}`, shift: ch.toUpperCase()
}));
const LOWERCASE_ROW3: KeyDef[] = 'zxcvbnm'.split('').map(ch => ({
  kind: 'char', key: ch, code: `Key${ch.toUpperCase()}`, shift: ch.toUpperCase()
}));

const UPPERCASE_ROW1: KeyDef[] = 'QWERTYUIOP'.split('').map(ch => ({
  kind: 'char', key: ch, code: `Key${ch}`, shift: ch.toLowerCase()
}));
const UPPERCASE_ROW2: KeyDef[] = 'ASDFGHJKL'.split('').map(ch => ({
  kind: 'char', key: ch, code: `Key${ch}`, shift: ch.toLowerCase()
}));
const UPPERCASE_ROW3: KeyDef[] = 'ZXCVBNM'.split('').map(ch => ({
  kind: 'char', key: ch, code: `Key${ch}`, shift: ch.toLowerCase()
}));

const SYMBOLS_ROW1: KeyDef[] = [
  ['1', '!'], ['2', '@'], ['3', '#'], ['4', '$'], ['5', '%'],
  ['6', '^'], ['7', '&'], ['8', '*'], ['9', '('], ['0', ')']
].map(([ch, sh]) => ({
  kind: 'char', key: ch, code: `Digit${ch}`, shift: sh
}));
const SYMBOLS_ROW2: KeyDef[] = ['-','/',':',';','(',')','$','&','@','"'].map(ch => ({
  kind: 'char', key: ch, code: '', shift: '_'
}));
const SYMBOLS_ROW3: KeyDef[] = ['.',',','?','!',"'",'#','%','*','+','='].map(ch => ({
  kind: 'char', key: ch, code: '', shift: '<'
}));

interface ModifierState {
  shift: boolean;
  control: boolean;
  alt: boolean;
}

export function VirtualKeyboard(): JSX.Element | null {
  const activeTool = useToolStore((s) => s.activeTool);
  const symbols = useToolStore((s) => s.keyboardSymbols);
  const shift = useToolStore((s) => s.keyboardShift);
  const setShift = useToolStore((s) => s.setKeyboardShift);
  const setSymbols = useToolStore((s) => s.setKeyboardSymbols);

  const focusedId = useWindowStore((s) => s.focusedId);
  const windows = useWindowStore((s) => s.windows);
  const focusedWindow = focusedId ? windows[focusedId] : undefined;
  const isWebContent = !!focusedWindow?.hasNativeContent;

  const [mods, setMods] = useState<ModifierState>({ shift: false, control: false, alt: false });

  // Reset modifiers when keyboard closes.
  useEffect(() => {
    if (activeTool !== 'keyboard') {
      setMods({ shift: false, control: false, alt: false });
      useToolStore.setState({ keyboardShift: false, keyboardSymbols: false });
    }
  }, [activeTool]);

  const sendKey = useCallback(async (
    def: KeyDef,
    options: { uppercase?: boolean } = {}
  ): Promise<void> => {
    if (def.kind === 'shift' || def.kind === 'symbols' || def.kind === 'abc') return;
    if (def.kind === 'mod') return;

    let keyStr: string;
    let code: string | undefined;

    if (def.kind === 'char') {
      keyStr = (options.uppercase || mods.shift) ? (def.shift ?? def.key) : def.key;
      code = def.code;
    } else if (def.kind === 'space') {
      keyStr = ' ';
      code = def.code;
    } else if (def.kind === 'enter') {
      keyStr = 'Enter';
      code = def.code;
    } else if (def.kind === 'backspace') {
      keyStr = 'Backspace';
      code = def.code;
    } else if (def.kind === 'tab') {
      keyStr = 'Tab';
      code = def.code;
    } else {
      return;
    }

    const modifiers: ('shift' | 'control' | 'alt' | 'meta')[] = [];
    const effectiveShift = options.uppercase || mods.shift;
    if (effectiveShift) modifiers.push('shift');
    if (mods.control) modifiers.push('control');
    if (mods.alt) modifiers.push('alt');

    // Auto-release shift after one character (caps mode toggles instead).
    if (mods.shift && !options.uppercase && def.kind === 'char') {
      setMods((m) => ({ ...m, shift: false }));
      setShift(false);
    }

    // 1) Route to native web content via IPC.
    if (isWebContent && focusedId && window.api?.webview?.injectKey) {
      try {
        await window.api.webview.injectKey(focusedId, {
          type: 'keyDown',
          key: keyStr,
          code: code ?? '',
          modifiers
        });
        // For printable chars, also fire 'char' so the webview receives text input.
        if (def.kind === 'char' || def.kind === 'space') {
          await window.api.webview.injectKey(focusedId, {
            type: 'char',
            key: keyStr,
            code: code ?? '',
            modifiers
          });
        }
        await window.api.webview.injectKey(focusedId, {
          type: 'keyUp',
          key: keyStr,
          code: code ?? '',
          modifiers
        });
      } catch (err) {
        console.warn('[VirtualKeyboard] IPC key failed:', err);
      }
      return;
    }

    // 2) Route to focused DOM input via synthetic KeyboardEvent.
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) {
      const downEvt = new KeyboardEvent('keydown', {
        key: keyStr,
        code: code ?? '',
        shiftKey: modifiers.includes('shift'),
        ctrlKey: modifiers.includes('control'),
        altKey: modifiers.includes('alt'),
        metaKey: modifiers.includes('meta'),
        bubbles: true,
        cancelable: true
      });
      active.dispatchEvent(downEvt);

      // For printable chars, also fire 'input' event so the value updates.
      if (def.kind === 'char' || def.kind === 'space') {
        // Use InputEvent for proper text input handling.
        const inputEvt = new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: keyStr,
          bubbles: true,
          cancelable: true
        });
        active.dispatchEvent(inputEvt);

        // Fallback: directly mutate value for textareas/inputs if beforeinput
        // didn't change anything (e.g. plain <input>).
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          const start = active.selectionStart ?? active.value.length;
          const end = active.selectionEnd ?? active.value.length;
          const next = active.value.slice(0, start) + keyStr + active.value.slice(end);
          const nativeSetter = Object.getOwnPropertyDescriptor(
            active instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype,
            'value'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(active, next);
          } else {
            active.value = next;
          }
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.setSelectionRange(start + keyStr.length, start + keyStr.length);
        }
      }

      if (def.kind === 'backspace') {
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          const start = active.selectionStart ?? 0;
          const end = active.selectionEnd ?? 0;
          if (start === end && start > 0) {
            const next = active.value.slice(0, start - 1) + active.value.slice(end);
            const nativeSetter = Object.getOwnPropertyDescriptor(
              active instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype,
              'value'
            )?.set;
            if (nativeSetter) nativeSetter.call(active, next);
            else active.value = next;
            active.dispatchEvent(new Event('input', { bubbles: true }));
            active.setSelectionRange(start - 1, start - 1);
          }
        }
      }

      const upEvt = new KeyboardEvent('keyup', {
        key: keyStr,
        code: code ?? '',
        shiftKey: modifiers.includes('shift'),
        ctrlKey: modifiers.includes('control'),
        altKey: modifiers.includes('alt'),
        metaKey: modifiers.includes('meta'),
        bubbles: true
      });
      active.dispatchEvent(upEvt);
    }
  }, [focusedId, isWebContent, mods, setShift]);

  const handleKey = useCallback((def: KeyDef) => (): void => {
    if (def.kind === 'shift') {
      const next = !mods.shift;
      setMods((m) => ({ ...m, shift: next }));
      setShift(next);
      return;
    }
    if (def.kind === 'symbols') {
      setSymbols(true);
      setMods((m) => ({ ...m, shift: false }));
      setShift(false);
      return;
    }
    if (def.kind === 'abc') {
      setSymbols(false);
      return;
    }
    if (def.kind === 'mod') {
      const m = def.modifier;
      setMods((s) => ({ ...s, [m]: !s[m] }));
      return;
    }
    void sendKey(def);
  }, [mods, sendKey, setShift, setSymbols]);

  const rows = useMemo(() => {
    if (symbols) {
      return [
        SYMBOLS_ROW1,
        SYMBOLS_ROW2,
        [
          ...SYMBOLS_ROW3,
          { kind: 'backspace' as const, key: 'Backspace', code: 'Backspace' }
        ]
      ];
    }
    if (shift) {
      return [
        UPPERCASE_ROW1,
        UPPERCASE_ROW2,
        [
          { kind: 'shift' as const, label: '⇧' },
          ...UPPERCASE_ROW3,
          { kind: 'backspace' as const, key: 'Backspace', code: 'Backspace' }
        ]
      ];
    }
    return [
      LOWERCASE_ROW1,
      LOWERCASE_ROW2,
      [
        { kind: 'shift' as const, label: '⇧' },
        ...LOWERCASE_ROW3,
        { kind: 'backspace' as const, key: 'Backspace', code: 'Backspace' }
      ]
    ];
  }, [shift, symbols]);

  if (activeTool !== 'keyboard') return null;

  return (
    <div className={styles.keyboard} role="toolbar" aria-label="Bàn phím ảo">
      <div className={styles.targetInfo}>
        {focusedWindow
          ? <>Đang gõ vào <strong>{focusedWindow.title}</strong> {isWebContent ? '(trình duyệt)' : '(React)'}</>
          : 'Chưa chọn cửa sổ — bấm vào URL bar hoặc ô nhập để gõ.'}
      </div>
      <div className={styles.rows}>
        {rows.map((row, ri) => (
          <div key={ri} className={styles.row}>
            {row.map((def, ki) => (
              <KeyButton
                key={ki}
                def={def}
                shiftActive={mods.shift}
                onPress={handleKey(def)}
              />
            ))}
          </div>
        ))}
        <div className={styles.row}>
          <KeyButton
            def={{ kind: 'symbols', label: '?123' }}
            onPress={handleKey({ kind: 'symbols', label: '?123' })}
            className={styles.wide}
          />
          <KeyButton
            def={{ kind: 'mod', label: 'Ctrl', modifier: 'control' }}
            onPress={handleKey({ kind: 'mod', label: 'Ctrl', modifier: 'control' })}
            active={mods.control}
            className={styles.wide}
          />
          <KeyButton
            def={{ kind: 'space', key: ' ', code: 'Space' }}
            onPress={handleKey({ kind: 'space', key: ' ', code: 'Space' })}
            className={styles.extraWide}
          />
          <KeyButton
            def={{ kind: 'mod', label: 'Alt', modifier: 'alt' }}
            onPress={handleKey({ kind: 'mod', label: 'Alt', modifier: 'alt' })}
            active={mods.alt}
            className={styles.wide}
          />
          <KeyButton
            def={{ kind: 'enter', key: 'Enter', code: 'Enter' }}
            onPress={handleKey({ kind: 'enter', key: 'Enter', code: 'Enter' })}
            className={styles.wide}
            primary
          />
        </div>
      </div>
    </div>
  );
}

interface KeyButtonProps {
  def: KeyDef;
  onPress: () => void;
  shiftActive?: boolean;
  active?: boolean;
  className?: string;
  primary?: boolean;
}

function KeyButton({ def, onPress, shiftActive, active, className, primary }: KeyButtonProps): JSX.Element {
  let label: string;
  let ariaLabel: string;

  if (def.kind === 'char') {
    label = shiftActive && def.shift ? def.shift : def.key;
    ariaLabel = label;
  } else if (def.kind === 'space') {
    label = 'Phím cách';
    ariaLabel = 'Phím cách';
  } else if (def.kind === 'enter') {
    label = '⏎';
    ariaLabel = 'Enter';
  } else if (def.kind === 'backspace') {
    label = '⌫';
    ariaLabel = 'Backspace';
  } else if (def.kind === 'shift') {
    label = def.label;
    ariaLabel = 'Shift';
  } else if (def.kind === 'symbols') {
    label = def.label;
    ariaLabel = 'Biểu tượng';
  } else if (def.kind === 'abc') {
    label = def.label;
    ariaLabel = 'Chữ cái';
  } else if (def.kind === 'mod') {
    label = def.label;
    ariaLabel = def.label;
  } else {
    label = '?';
    ariaLabel = 'Unknown';
  }

  return (
    <button
      type="button"
      className={`${styles.key} ${active ? styles.keyActive : ''} ${primary ? styles.keyPrimary : ''} ${className ?? ''}`}
      onClick={onPress}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      data-key={def.kind === 'char' ? def.key : def.kind}
    >
      {label}
    </button>
  );
}
