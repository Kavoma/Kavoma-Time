import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';

interface Props {
  /** Springt in die Einstellungen, wo der Code angelegt wird. */
  onOpenSettings: () => void;
}

/**
 * Erinnert daran, dass es noch keinen Wiederherstellungscode gibt.
 *
 * Bewusst **nicht dauerhaft wegklickbar**: Wer ihn wegklickt, ist ihn bis zum
 * nächsten Start los, nicht für immer. Der Schaden, vor dem gewarnt wird, tritt
 * nicht heute ein, sondern in dem Moment, in dem der Rechner ausfällt — und
 * dann ist es zu spät, die Warnung nachzuholen. Eine Einstellung „nie wieder"
 * gibt es deshalb nicht.
 *
 * Angezeigt wird er auch, wenn ein Code zwar angelegt, aber nie abgetippt
 * wurde: Ein Code, den niemand notiert hat, ist keiner.
 */
export function BackupRecoveryBanner({ onOpenSettings }: Props) {
  const [fehlt, setFehlt] = useState(false);
  const [verborgen, setVerborgen] = useState(false);

  useEffect(() => {
    const fn = window.api?.backupRecoveryStatus;
    if (typeof fn !== 'function') return;
    fn()
      // Ohne verfügbare Verschlüsselung gibt es ohnehin nichts zu sichern —
      // dann warnt bereits der EncryptionBanner, und zwei Warnungen
      // übereinander liest niemand.
      .then((status) => setFehlt(status.keyAvailable && !(status.hasEnvelope && status.confirmed)))
      .catch(() => setFehlt(false));
  }, []);

  if (!fehlt || verborgen) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-warning-line bg-warning-soft px-4 py-2 text-[12px] text-warning"
    >
      <KeyRound size={14} className="shrink-0" />
      <div className="flex-1">
        <strong className="font-bold">Kein Wiederherstellungscode.</strong>{' '}
        Deine Sicherungen und Belege lassen sich zurzeit nur auf diesem Rechner öffnen.
        Geht er verloren, sind sie es auch.
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="kv-btn kv-btn-outline shrink-0"
      >
        Jetzt einrichten
      </button>
      <button
        type="button"
        onClick={() => setVerborgen(true)}
        aria-label="Hinweis bis zum nächsten Start ausblenden"
        title="Bis zum nächsten Start ausblenden"
        className="kv-icon-btn shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
