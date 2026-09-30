import { existsSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, screen } from 'electron';
import { config as loadDotenv } from 'dotenv';
import { startEmbeddedBackend, type EmbeddedBackend } from './backend';
import type { KioskBridgeConfig } from './bridge';

/* ─── Configuration ────────────────────────────────────────────── */

/** Where kiosk.env is looked up (first match wins). */
function envCandidates(): string[] {
  if (app.isPackaged) {
    return [
      path.join(path.dirname(app.getPath('exe')), 'kiosk.env'),
      path.join(app.getPath('userData'), 'kiosk.env'),
    ];
  }
  return [path.resolve(app.getAppPath(), '../../.env'), path.resolve(process.cwd(), '.env')];
}

function loadEnvironment(): void {
  const file = envCandidates().find((candidate) => existsSync(candidate));
  if (file) loadDotenv({ path: file, quiet: true });
}
loadEnvironment();

const devServerUrl = process.argv
  .find((arg) => arg.startsWith('--dev-server-url='))
  ?.slice('--dev-server-url='.length);

/**
 * Embedded backend: the installed app runs the server (and mock POS) inside itself.
 * Default on when packaged; in development opt in with --embedded (used by `npm run demo`).
 * Set KIOSK_EMBEDDED=false to use an external server at KIOSK_SERVER_URL instead.
 */
const embedded = app.isPackaged
  ? process.env.KIOSK_EMBEDDED !== 'false'
  : process.argv.includes('--embedded') || process.env.KIOSK_EMBEDDED === 'true';

/**
 * KIOSK_WINDOW_MODE=window (default): normal resizable window with minimize/maximize/close.
 * KIOSK_WINDOW_MODE=kiosk: locked fullscreen for the real kiosk device (auto-start, no exit
 * except Ctrl+Shift+Alt+Q). KIOSK_MODE=true is kept as a legacy alias for kiosk.
 */
const kioskMode = process.env.KIOSK_WINDOW_MODE === 'kiosk' || process.env.KIOSK_MODE === 'true';

let backend: EmbeddedBackend | null = null;
let mainWindow: BrowserWindow | null = null;
let allowQuit = !kioskMode;

function bridgeConfig(serverUrl: string): KioskBridgeConfig {
  return {
    serverUrl,
    kioskId: process.env.KIOSK_ID || 'KIOSK-001',
    idleTimeoutSeconds: Number(process.env.IDLE_TIMEOUT_SECONDS || 60),
    kioskMode,
  };
}

/* ─── Window ───────────────────────────────────────────────────── */

function isBlockedShortcut(input: Electron.Input): boolean {
  const key = input.key.toLowerCase();
  const ctrl = input.control || input.meta;
  if (key === 'f4' && input.alt) return true; // Alt+F4
  if (key === 'f11' || key === 'f12' || key === 'f5') return true;
  if (ctrl && input.shift && ['i', 'j', 'c'].includes(key)) return true; // devtools
  if (ctrl && ['r', 'w', 'q', 'p', 'n', 't', '+', '-', '=', '0'].includes(key)) return true;
  if (input.alt && key === 'alt') return true; // menu bar
  return false;
}

/** Hidden operator exit: Ctrl+Shift+Alt+Q. Replace with a PIN screen for production if needed. */
function isAdminExit(input: Electron.Input): boolean {
  return input.control && input.shift && input.alt && input.key.toLowerCase() === 'q';
}

function createWindow(serverUrl: string): void {
  const { workArea } = screen.getPrimaryDisplay();
  // Window mode: a 9:16 portrait window that fits the screen.
  const height = Math.min(1920, Math.round(workArea.height * 0.95));
  const width = Math.round((height * 9) / 16);

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 360,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b1320',
    kiosk: kioskMode,
    fullscreen: kioskMode,
    frame: !kioskMode,
    autoHideMenuBar: true,
    title: 'Self-Service Kiosk',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged && !kioskMode,
      spellcheck: false,
      // Keep timers, countdowns and animations running even when the window is not focused.
      backgroundThrottling: false,
      additionalArguments: [
        `--kiosk-config=${Buffer.from(JSON.stringify(bridgeConfig(serverUrl))).toString('base64')}`,
      ],
    },
  });
  mainWindow.removeMenu();
  // Keep the portrait proportions while resizing (no letterbox bars).
  if (!kioskMode) mainWindow.setAspectRatio(9 / 16);

  const contents = mainWindow.webContents;
  contents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    const allowed = devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });

  contents.on('before-input-event', (event, input) => {
    if (isAdminExit(input)) {
      allowQuit = true;
      app.quit();
      return;
    }
    if (kioskMode && isBlockedShortcut(input)) event.preventDefault();
  });

  mainWindow.on('close', (event) => {
    if (!allowQuit) event.preventDefault();
  });

  // Self-heal: reload if the renderer crashes or hangs.
  contents.on('render-process-gone', (_event, details) => {
    console.error('Renderer gone', details);
    setTimeout(() => mainWindow?.reload(), 1000);
  });
  mainWindow.on('unresponsive', () => mainWindow?.reload());

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

/* ─── IPC ──────────────────────────────────────────────────────── */

ipcMain.handle('kiosk:print-receipt', async () => {
  const contents = mainWindow?.webContents;
  if (!contents) return { ok: false, error: 'NO_WINDOW' };
  // TODO(printer): target the kiosk's receipt printer by name (deviceName) once known.
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    contents.print({ silent: kioskMode, printBackground: true }, (success, failureReason) =>
      resolve(success ? { ok: true } : { ok: false, error: failureReason }),
    );
  });
});

/* ─── Lifecycle ────────────────────────────────────────────────── */

async function start(): Promise<void> {
  let serverUrl = (process.env.KIOSK_SERVER_URL || 'http://localhost:4000').replace(/\/+$/, '');
  if (embedded) {
    try {
      backend = await startEmbeddedBackend(app.getPath('userData'));
      serverUrl = backend.serverUrl;
    } catch (error) {
      dialog.showErrorBox(
        'Self-Service Kiosk could not start',
        `The built-in service failed to start:\n\n${String(error)}\n\n` +
          'Another copy may already be running, or the port is in use (SERVER_PORT / MOCK_POS_PORT in kiosk.env).',
      );
      allowQuit = true;
      app.quit();
      return;
    }
  }

  // Auto-start and keep-awake only make sense on a dedicated kiosk device.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: kioskMode });
  if (kioskMode) powerSaveBlocker.start('prevent-display-sleep');
  createWindow(serverUrl);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  void app.whenReady().then(start);

  app.on('window-all-closed', () => {
    if (allowQuit) app.quit();
  });

  let stopping = false;
  app.on('before-quit', (event) => {
    if (!backend || stopping) return;
    // Shut the embedded server down cleanly (flushes the database) before exiting.
    event.preventDefault();
    stopping = true;
    void backend.stop().finally(() => app.quit());
  });
}
