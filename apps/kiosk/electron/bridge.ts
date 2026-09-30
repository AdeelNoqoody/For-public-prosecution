/** Contract between the Electron main/preload scripts and the renderer (window.kioskBridge). */
export interface KioskBridgeConfig {
  serverUrl: string;
  kioskId: string;
  idleTimeoutSeconds: number;
  kioskMode: boolean;
}

export interface KioskBridge {
  config: KioskBridgeConfig;
  printReceipt(): Promise<{ ok: boolean; error?: string }>;
}
