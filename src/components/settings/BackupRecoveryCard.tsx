import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { BackupRecoveryStatus } from '../../types';
import { SettingsCard } from './SettingsCard';
import { InfoTooltip } from './InfoTooltip';

type Schritt = 'ruhe' | 'code-zeigen' | 'code-abtippen';

/**
 * Der Wiederherstellungscode für den Sicherungsschlüssel.
 *
 * Der Code wird **einmal** angezeigt und danach abgefragt. Das Abtippen ist
 * kein Ritual: Wer ihn nur wegklickt, merkt erst beim Rechnerwechsel, dass er
 * ihn nie hatte — und dann sind acht Jahre Belege weg. Wer ihn einmal
 * abgetippt hat, hat ihn irgendwo stehen.
 */
export function BackupRecoveryCard() {
  const [status, setStatus] = useState<BackupRecoveryStatus | null>(null);
  const [schritt, setSchritt] = useState<Schritt>('ruhe');
  const [code, setCode] = useState('');
  const [eingabe, setEingabe] = useState('');
  const [kopiert, setKopiert] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const ladeStatus = () => {
    window.api?.backupRecoveryStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(ladeStatus, []);

  if (!window.api) {
    return (
      <SettingsCard icon={KeyRound} title="Wiederherstellungscode">
        <p className="text-[12px] text-muted">
          Wiederherstellungscodes gibt es nur in der Desktop-App.
        </p>
      </SettingsCard>
    );
  }

  const erzeugen = async (ersetzen: boolean) => {
    if (ersetzen) {
      const sicher = window.confirm(
        'Der bisherige Code wird ungültig.\n\n' +
        'Sicherungen, die du BEREITS geschrieben hast, tragen ihren eigenen Umschlag bei sich — ' +
        'sie lassen sich weiterhin nur mit dem ALTEN Code öffnen. Wirf ihn also nicht weg, ' +
        'solange du diese Dateien noch brauchst.\n\nNeuen Code erzeugen?',
      );
      if (!sicher) return;
    }
    setLaeuft(true);
    setFehler(null);
    try {
      const { recoveryCode } = await window.api!.backupRecoveryCreate({ force: ersetzen });
      setCode(recoveryCode);
      setEingabe('');
      setKopiert(false);
      setSchritt('code-zeigen');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Der Code konnte nicht angelegt werden.');
    } finally {
      setLaeuft(false);
    }
  };

  const pruefen = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      const ok = await window.api!.backupRecoveryVerify(eingabe);
      if (!ok) {
        setFehler('Das stimmt nicht mit dem Code überein. Vergleiche noch einmal Zeichen für Zeichen.');
        return;
      }
      setCode('');
      setEingabe('');
      setSchritt('ruhe');
      ladeStatus();
    } finally {
      setLaeuft(false);
    }
  };

  // Angelegt genügt nicht — erst das Abtippen belegt, dass der Code angekommen
  // ist. Wer den Ablauf auf halbem Weg verlässt, bekommt weiter die Warnung.
  const eingerichtet = Boolean(status?.hasEnvelope && status?.confirmed);
  const halbFertig = Boolean(status?.hasEnvelope && !status?.confirmed);

  return (
    <SettingsCard
      icon={KeyRound}
      title="Wiederherstellungscode"
      headerAside={(
        <InfoTooltip ariaLabel="Hinweise zum Wiederherstellungscode">
          <div className="mb-1 font-bold">Wozu dient der Code?</div>
          Der Schlüssel, mit dem Sicherungen und Belege verschlüsselt werden, hängt am
          Schlüsselbund dieses Rechners. Ohne einen zweiten Weg ließe sich eine Sicherung
          nur dort öffnen, wo sie entstanden ist — nach einem Rechnerwechsel oder einer
          Systemneuinstallation wäre sie wertlos.
          <div className="mt-2">
            Der Code ist dieser zweite Weg. Er wandert in jede Sicherung mit, die du ab
            jetzt schreibst: <span className="font-bold text-ink">Code plus Datei genügt</span>,
            auf jedem Rechner. Auf diesem Gerät wird nie danach gefragt.
          </div>
        </InfoTooltip>
      )}
    >
      {schritt === 'ruhe' && (
        <div className="flex flex-col gap-3">
          {status?.keyAvailable === false && (
            <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[12px] text-danger">
              Auf diesem Rechner ist keine Verschlüsselung verfügbar. Solange das so ist,
              lässt sich kein Wiederherstellungscode anlegen.
            </p>
          )}

          {eingerichtet ? (
            <>
              <div className="flex items-start gap-2 rounded-md border border-success-line/40 bg-success-soft px-3 py-2.5">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" />
                <div className="text-[12px] leading-relaxed text-muted">
                  <span className="font-bold text-ink">Eingerichtet.</span>{' '}
                  Deine Sicherungen lassen sich mit dem Code auf jedem Rechner öffnen.
                  {status?.createdAt && (
                    <div className="mt-0.5 text-[11px]">
                      Angelegt am {new Date(status.createdAt).toLocaleDateString('de-DE')}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => erzeugen(true)}
                disabled={laeuft || status?.keyAvailable === false}
                className="kv-btn kv-btn-quiet self-start"
              >
                <RefreshCw size={13} /> Neuen Code erzeugen
              </button>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                <div className="text-[12px] leading-relaxed text-muted">
                  {halbFertig ? (
                    <>
                      <span className="font-bold text-warning">Angelegt, aber nicht bestätigt.</span>{' '}
                      Der Code wurde erzeugt, aber nie abgetippt. Wenn du ihn nicht notiert
                      hast, nützt er nichts — erzeuge einen neuen und schreibe ihn auf.
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-warning">Noch kein Code angelegt.</span>{' '}
                      Deine Sicherungen lassen sich zurzeit nur auf diesem Rechner öffnen.
                      Geht er verloren, sind sie es auch — samt der Belege, die du acht Jahre
                      aufbewahren musst.
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => erzeugen(halbFertig)}
                disabled={laeuft || status?.keyAvailable === false}
                className="kv-btn kv-btn-primary self-start"
              >
                {laeuft ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                {halbFertig ? 'Neuen Code erzeugen' : 'Wiederherstellungscode erzeugen'}
              </button>
            </>
          )}
        </div>
      )}

      {schritt === 'code-zeigen' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-warning-line bg-warning-soft p-3">
            <div className="mb-1 flex items-center gap-2 text-warning">
              <AlertTriangle size={13} />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                Einmalig. Bitte aufschreiben.
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-muted">
              Dieser Code erscheint nur jetzt. Er liegt nirgends gespeichert — gespeichert
              ist nur, was er verschließt. Bewahre ihn getrennt von deinen Sicherungen auf:
              zusammen in einem Ordner nützen sie einem Dieb beide.
            </p>
          </div>

          <div className="kv-raised p-3">
            <code className="block break-all font-mono text-sm font-bold leading-relaxed tracking-wider text-ink">
              {code}
            </code>
          </div>

          <button
            type="button"
            className="kv-btn kv-btn-outline"
            onClick={() => { navigator.clipboard?.writeText(code); setKopiert(true); }}
          >
            {kopiert ? <Check size={13} /> : <Copy size={13} />}
            {kopiert ? 'Kopiert' : 'In die Zwischenablage'}
          </button>

          <button
            type="button"
            className="kv-btn kv-btn-primary"
            onClick={() => setSchritt('code-abtippen')}
          >
            Weiter
          </button>
        </div>
      )}

      {schritt === 'code-abtippen' && (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] leading-relaxed text-muted">
            Tippe den Code einmal ab. Das ist die Probe darauf, dass du ihn wirklich
            notiert hast — und nicht nur weggeklickt. Groß- und Kleinschreibung sowie
            Bindestriche sind egal.
          </p>
          <input
            className="kv-input font-mono"
            type="text"
            autoFocus
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            value={eingabe}
            onChange={(e) => { setEingabe(e.target.value); setFehler(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && eingabe.trim()) void pruefen(); }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="kv-btn kv-btn-primary"
              onClick={() => void pruefen()}
              disabled={laeuft || !eingabe.trim()}
            >
              {laeuft ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Bestätigen
            </button>
            <button
              type="button"
              className="kv-btn kv-btn-quiet"
              onClick={() => setSchritt('code-zeigen')}
            >
              Code noch einmal zeigen
            </button>
          </div>
        </div>
      )}

      {fehler && (
        <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {fehler}
        </p>
      )}
    </SettingsCard>
  );
}
