import type { KioskBridge } from '../../electron/bridge';

declare global {
  interface Window {
    kioskBridge?: KioskBridge;
  }
  const __KIOSK_DEFAULTS__: { serverUrl: string; kioskId: string; idleTimeoutSeconds: number };
}

const bridge = typeof window !== 'undefined' ? window.kioskBridge?.config : undefined;

/** Runtime settings: from Electron (env / kiosk.env) when available, else Vite build defaults. */
export const runtimeConfig = {
  serverUrl: (bridge?.serverUrl ?? __KIOSK_DEFAULTS__.serverUrl).replace(/\/+$/, ''),
  kioskId: bridge?.kioskId ?? __KIOSK_DEFAULTS__.kioskId,
  idleTimeoutSeconds: bridge?.idleTimeoutSeconds ?? __KIOSK_DEFAULTS__.idleTimeoutSeconds,
  /** Length of the "Are you still there?" countdown once idle. */
  idleWarningSeconds: 15,
  /** Result screen returns home automatically after this many seconds. */
  resultAutoReturnSeconds: 15,
  kioskMode: bridge?.kioskMode ?? false,
};

export const wsBaseUrl = runtimeConfig.serverUrl.replace(/^http/, 'ws');
