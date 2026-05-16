import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

export function EncryptionBanner() {
  const [encryptionActive, setEncryptionActive] = useState<boolean | null>(null);

  useEffect(() => {
    const fn = window.api?.getEncryptionStatus;
    if (typeof fn !== 'function') {
      setEncryptionActive(true);
      return;
    }
    fn()
      .then((status) => setEncryptionActive(Boolean(status?.active)))
      .catch(() => setEncryptionActive(true));
  }, []);

  if (encryptionActive !== false) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center gap-3 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-[12px] text-red-200"
    >
      <ShieldAlert size={14} className="shrink-0" />
      <div className="flex-1">
        <strong className="font-bold text-red-100">Verschlüsselung deaktiviert.</strong>{' '}
        Deine Daten werden in dieser Sitzung unverschlüsselt gespeichert. Wir empfehlen,
        die App zu beenden und das System auf verfügbare DPAPI / Schlüsselbund-Funktion
        zu prüfen, bevor du echte Kundendaten erfasst.
      </div>
    </div>
  );
}
