import { contextBridge, ipcRenderer } from 'electron';
import type { KioskBridge, KioskBridgeConfig } from './bridge';

function readConfig(): KioskBridgeConfig | undefined {
  const arg = process.argv.find((a) => a.startsWith('--kiosk-config='));
  if (!arg) return undefined;
  try {
    const json = atob(arg.slice('--kiosk-config='.length));
    return JSON.parse(json) as KioskBridgeConfig;
  } catch {
    return undefined;
  }
}

const config = readConfig();

if (config) {
  const bridge: KioskBridge = {
    config,
    printReceipt: () => ipcRenderer.invoke('kiosk:print-receipt'),
  };
  // Minimal, explicit API surface — no Node/Electron objects leak into the renderer.
  contextBridge.exposeInMainWorld('kioskBridge', bridge);
}
