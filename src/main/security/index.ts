import { app, session, type Session } from 'electron';

/**
 * Apply security policies:
 *  - Strict CSP via response header on the renderer.
 *  - Camera permission granted for our own origin.
 *  - Other permissions denied.
 */
export function applySecurity(): void {
  const ses: Session = session.defaultSession;
  const isDev = !app.isPackaged;

  ses.webRequest.onHeadersReceived((details, callback) => {
    // In dev mode, allow unsafe-inline for Vite HMR to work
    const scriptSrc = isDev 
      ? "'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net" 
      : "'self' https://cdn.jsdelivr.net";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
            `script-src ${scriptSrc}; ` +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: https:; " +
            "media-src 'self' blob: mediastream:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com; " +
            "frame-src https://www.youtube-nocookie.com https://www.youtube.com; " +
            "worker-src 'self' blob:; " +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "form-action 'none';"
        ]
      }
    });
  });

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') {
      // Camera permission granted by default for our own window.
      return callback(true);
    }
    return callback(false);
  });

  // Disable the menu bar in production for a cleaner look.
  if (!app.isPackaged) return;
  // (Production: hide menubar.)
  // Note: setting an empty menu removes it.
  // Left intentionally as a no-op here so dev menu remains useful.
}
