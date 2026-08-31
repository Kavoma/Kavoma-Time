import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CloudOff, Loader2, Lock } from 'lucide-react';
import type { SyncStatus } from '../sync/types';

const ANZEIGE: Record<SyncStatus['state'], { Icon: typeof Check; ton: string; titel: string } | null> = {
  // Nicht eingerichtet heißt: kein Symbol. Ein durchgestrichenes Wölkchen für
  // jeden, der die Funktion nie nutzt, wäre eine Dauerermahnung.
  off:     null,
  locked:  { Icon: Lock,          ton: 'text-amber-400',   titel: 'Gesperrt — Passphrase fehlt' },
  offline: { Icon: CloudOff,      ton: 'text-muted',       titel: 'Keine Verbindung — Änderungen warten' },
  syncing: { Icon: Loader2,       ton: 'text-accent',      titel: 'Gleicht ab…' },
  synced:  { Icon: Check,         ton: 'text-emerald-400', titel: 'Abgeglichen' },
  error:   { Icon: AlertTriangle, ton: 'text-red-400',     titel: 'Abgleich fehlgeschlagen' },
};

/** Kleines Zeichen in der Titelleiste — sichtbar, ohne sich vorzudrängen. */
export function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    if (!window.api?.syncGetStatus) return;
    window.api.syncGetStatus().then(setStatus).catch(() => setStatus(null));
    return window.api.onSyncStatus?.(setStatus);
  }, []);

  const anzeige = status ? ANZEIGE[status.state] : null;
  if (!anzeige) return null;

  const { Icon, ton, titel } = anzeige;
  const wartend = status!.pendingOps;

  return (
    <div className="no-drag flex items-center gap-1.5" title={wartend > 0 ? `${titel} · ${wartend} ausstehend` : titel}>
      <Icon size={12} className={`${ton} ${status!.state === 'syncing' ? 'animate-spin' : ''}`} aria-hidden="true" />
      {wartend > 0 && (
        <span className="text-[9px] font-bold tabular-nums text-muted">{wartend}</span>
      )}
      <span className="sr-only">{titel}</span>
    </div>
  );
}
