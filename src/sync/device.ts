// ============================================================
// Kennung dieses Geräts
// ============================================================

export interface DeviceInfo {
  id: string;
  name: string;
  platform: string;
}

/** Fallback für die Browser-Vorschau (`pnpm dev` ohne Electron). */
const BROWSER_DEVICE_KEY = 'kavoma_sync_device_id';

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `browser-${Math.random().toString(36).slice(2)}`;
}

function browserDeviceInfo(): DeviceInfo {
  let id: string;
  try {
    const stored = localStorage.getItem(BROWSER_DEVICE_KEY);
    if (stored) {
      id = stored;
    } else {
      id = randomId();
      localStorage.setItem(BROWSER_DEVICE_KEY, id);
    }
  } catch {
    // localStorage gesperrt — dann eben eine flüchtige Kennung. Ohne Electron
    // wird ohnehin nichts synchronisiert.
    id = randomId();
  }
  return { id, name: 'Browser-Vorschau', platform: 'web' };
}

/**
 * Liefert die Kennung dieses Geräts. Der Main-Prozess legt sie beim ersten
 * Aufruf an und hält sie unter einem eigenen Store-Schlüssel — sie überlebt
 * damit ein eingespieltes Backup nicht, was genau richtig ist.
 */
export async function resolveDeviceInfo(): Promise<DeviceInfo> {
  const fromMain = await window.api?.syncGetDeviceInfo?.().catch(() => null);
  return fromMain ?? browserDeviceInfo();
}
