import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { registerIpcHandlers, initializeWebContentManager } from './ipc/index.js';
import { applySecurity } from './security/index.js';
import { getWebContentManager } from './webview/WebContentManager.js';
import { createCursorOverlay } from './overlay/CursorOverlay.js';

const isDev = !app.isPackaged;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#05070d',
    title: 'AirVision Desktop',
    // Launch fullscreen on first start; user can toggle with F11
    fullscreen: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // F11 toggles fullscreen (matches UX convention for frameless apps)
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  // External links open in the OS browser, never inside AirVision.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  applySecurity();
  
  mainWindow = createMainWindow();
  
  // Register IPC handlers and initialize WebContentManager AFTER window creation
  registerIpcHandlers();
  initializeWebContentManager(mainWindow);
  // Create the cursor overlay window — renders on top of WebContentsView native views.
  createCursorOverlay(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      initializeWebContentManager(mainWindow);
      createCursorOverlay(mainWindow);
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// CRITICAL: destroy all WebContentsViews before the app exits. If a
// WebContentsView's webContents is still loading or has pending tasks when
// the BrowserWindow is closed, it can keep the main process alive and cause
// the app to hang on close. We force-clean up here so quit() always succeeds.
app.on('before-quit', () => {
  try {
    getWebContentManager().destroyAll();
  } catch (err) {
    console.error('[Main] destroyAll on before-quit failed:', err);
  }
});

// Belt-and-braces: when the last BrowserWindow is closing, kill any leftover
// WebContentsViews. window-all-closed then triggers app.quit() above.
app.on('will-quit', () => {
  try {
    getWebContentManager().destroyAll();
  } catch (err) {
    console.error('[Main] destroyAll on will-quit failed:', err);
  }
});

// Also clean up when a window is being closed (covers macOS where windows
// stay open after app close).
app.on('browser-window-created', (_e, win) => {
  win.on('close', () => {
    try {
      getWebContentManager().destroyAll();
    } catch (err) {
      console.error('[Main] destroyAll on window close failed:', err);
    }
  });
});

// Harden: deny new webContents creation by default.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const allowedDev = isDev && process.env['ELECTRON_RENDERER_URL'];
    if (allowedDev && url.startsWith(allowedDev)) return;
    event.preventDefault();
  });
});
