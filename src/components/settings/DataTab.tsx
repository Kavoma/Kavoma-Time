import { useEffect, useId, useRef, useState } from 'react';
import { Database, Download, Upload, Trash2, ShieldCheck, Clock, FolderOpen } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import type { AutoBackupConfig } from '../../types';
import { SettingsCard } from './SettingsCard';
import { InfoTooltip } from './InfoTooltip';
import { Checkbox } from '../Checkbox';
import { NumberInput } from '../NumberInput';

interface DataTabProps {
  /** Wird aufgerufen, wenn ein Backup eingespielt werden soll (öffnet ConfirmRestoreModal im Parent). */
  onRequestRestore: (data: unknown) => void;
  /** Wird aufgerufen, wenn der User die Wipe-Aktion starten will (öffnet ConfirmWipeModal im Parent). */
  onRequestWipe: () => void;
}

export function DataTab({ onRequestRestore, onRequestWipe }: DataTabProps) {
  const { state } = useAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalId = useId();

  // Auto-Backup-Konfiguration lebt im Main-Prozess, nicht im AppState
  const [autoBackup, setAutoBackup] = useState<AutoBackupConfig | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    window.api?.autoBackupGetConfig().then(setAutoBackup).catch(() => setAutoBackup(null));
  }, []);

  const patchAutoBackup = async (patch: Partial<AutoBackupConfig>) => {
    const next = await window.api?.autoBackupSetConfig(patch);
    if (next) setAutoBackup(next);
  };

  /** `enableAfterwards` schaltet das Backup direkt ein, wenn ein Ordner gewählt wurde. */
  const chooseDirectory = async (enableAfterwards: boolean) => {
    const dir = await window.api?.autoBackupChooseDirectory();
    if (!dir) return;
    await patchAutoBackup(enableAfterwards ? { enabled: true } : {});
  };

  const runBackupNow = async () => {
    setIsBackingUp(true);
    setBackupMessage(null);
    try {
      const result = await window.api?.autoBackupRunNow();
      if (result?.ok) {
        setBackupMessage({ ok: true, text: `Backup geschrieben: ${result.file}` });
        const next = await window.api?.autoBackupGetConfig();
        if (next) setAutoBackup(next);
      } else {
        setBackupMessage({ ok: false, text: `Backup fehlgeschlagen: ${result?.error ?? 'Unbekannter Fehler'}` });
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  if (!state) return null;

  /**
   * Verschlüsseltes Backup. Schlägt bewusst hart fehl, statt auf Klartext
   * zurückzufallen — ein unerwartet unverschlüsseltes Backup wäre ein
   * stiller Datenschutzverstoß. Wer eine Klartext-Datei braucht, nimmt den
   * ausdrücklichen portablen Export darunter.
   */
  const exportData = async () => {
    if (!window.api?.encryptBackup) {
      window.alert(
        'Verschlüsselte Backups sind hier nicht verfügbar (App läuft ohne Electron-Schicht).\n\n' +
        'Nutze stattdessen den portablen JSON-Export — der schreibt bewusst unverschlüsselt.',
      );
      return;
    }

    let output: string;
    try {
      const payload = await window.api.encryptBackup(JSON.stringify(state));
      if (!payload?.encrypted) {
        throw new Error('Die Verschlüsselung lieferte kein verschlüsseltes Ergebnis zurück.');
      }
      output = JSON.stringify({ kavoma: 'backup', ...payload }, null, 2);
    } catch (err) {
      console.error('Backup-Verschlüsselung fehlgeschlagen:', err);
      window.alert(
        'Das Backup wurde ABGEBROCHEN, weil die Verschlüsselung fehlgeschlagen ist.\n\n' +
        'Es wurde keine Datei geschrieben — deine Daten landen nicht im Klartext auf der Platte.\n\n' +
        'Prüfe die Verschlüsselungs-Warnung oben in der App.',
      );
      return;
    }

    const blob = new Blob([output], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kavoma-time-backup-${new Date().toISOString().split('T')[0]}.kvbak`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPortableJson = () => {
    const confirmed = window.confirm(
      'Die Datei wird UNVERSCHLÜSSELT geschrieben und ist für jeden lesbar, der Zugriff auf die Datei hat.\n\n' +
      'Diese Funktion erfüllt das Recht auf Datenübertragbarkeit (DSGVO Art. 20). ' +
      'Bewahre die Datei sicher auf oder lösche sie nach der Übertragung.\n\nFortfahren?',
    );
    if (!confirmed) return;
    const payload = {
      kavoma: 'portable-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kavoma-time-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);

        let data: any;
        if (parsed?.encrypted && parsed?.data && window.api?.decryptBackup) {
          const decrypted = await window.api.decryptBackup(parsed);
          data = JSON.parse(decrypted);
        } else if (parsed?.kavoma === 'portable-export' && parsed?.data) {
          data = parsed.data;
        } else {
          data = parsed;
        }

        if (!data || !Array.isArray(data.customers) || !Array.isArray(data.entries)) {
          throw new Error('Ungültiges Format');
        }

        onRequestRestore(data);
      } catch (err) {
        console.error(err);
        alert(
          'Fehler beim Importieren.\n\n' +
          '• Verschlüsselte Backups (.kvbak) lassen sich nur in der Installation öffnen, in der sie erstellt wurden.\n' +
          '  Nach „Alle Daten löschen" wurde der Schlüssel ersetzt — alte .kvbak-Dateien sind dann nicht mehr entschlüsselbar.\n' +
          '• Klartext-Exporte (.json) sollten sich immer einspielen lassen. Falls hier ein Fehler kommt, ist die Datei evtl. defekt oder hat ein anderes Format.',
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Backup */}
      <SettingsCard
        icon={Database}
        title="Backup"
        headerAside={(
          <InfoTooltip ariaLabel="Hinweise zum Backup">
            <div className="font-bold mb-1">Was wird gesichert?</div>
            Die komplette Datenbank (Kunden, Projekte, Zeiten, Rechnungen, Vorlagen, Einstellungen) wird als
            verschlüsselte <span className="font-mono">.kvbak</span>-Datei exportiert.
            Sie kann jederzeit wieder eingespielt werden, aber nur auf derselben Installation, weil der
            Verschlüsselungsschlüssel lokal gewrappt ist (Windows DPAPI).
          </InfoTooltip>
        )}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={exportData}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95"
          >
            <Download size={14} /> Backup exportieren
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95"
          >
            <Upload size={14} /> Backup einspielen
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={importData}
            accept=".json,.kvbak"
            className="hidden"
          />
        </div>
      </SettingsCard>

      {/* Automatisches Backup */}
      <SettingsCard
        icon={Clock}
        title="Automatisches Backup"
        headerAside={(
          <InfoTooltip ariaLabel="Hinweise zum automatischen Backup">
            <div className="font-bold mb-1">Wie funktioniert das?</div>
            Die App legt im gewählten Ordner regelmäßig ein verschlüsseltes
            <span className="font-mono"> .kvbak</span> ab und behält die neuesten davon.
            Der Zeitpunkt wird beim Start und danach alle fünf Minuten geprüft — die App muss
            also laufen (Tray genügt). Ohne verfügbare Verschlüsselung wird abgebrochen,
            nie im Klartext geschrieben.
          </InfoTooltip>
        )}
      >
        {!window.api ? (
          <p className="text-[12px] text-muted">
            Automatische Backups sind nur in der Desktop-App verfügbar.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <Checkbox
              checked={Boolean(autoBackup?.enabled)}
              onChange={(val) => {
                if (val && !autoBackup?.directory) {
                  chooseDirectory(true);
                  return;
                }
                void patchAutoBackup({ enabled: val });
              }}
              className="w-full rounded-md border border-divider bg-paper px-3 py-2.5 hover:border-ink/60"
              label={
                <div className="flex-1">
                  <div className="text-sm font-bold text-ink">Regelmäßig automatisch sichern</div>
                  <div className="text-[11px] text-muted">
                    {autoBackup?.lastRunAt
                      ? `Zuletzt: ${new Date(autoBackup.lastRunAt).toLocaleString('de-DE')}`
                      : 'Noch kein automatisches Backup erstellt.'}
                  </div>
                </div>
              }
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col">
                <label htmlFor={intervalId} className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Intervall
                </label>
                <select
                  id={intervalId}
                  value={autoBackup?.intervalHours ?? 24}
                  onChange={(e) => void patchAutoBackup({ intervalHours: Number(e.target.value) })}
                  className="h-10 rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none focus:border-accent"
                >
                  <option value={6}>Alle 6 Stunden</option>
                  <option value={12}>Alle 12 Stunden</option>
                  <option value={24}>Täglich</option>
                  <option value={72}>Alle 3 Tage</option>
                  <option value={168}>Wöchentlich</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Backups behalten
                </label>
                <NumberInput
                  min={1}
                  max={100}
                  value={autoBackup?.keep ?? 10}
                  onChange={(v) => void patchAutoBackup({ keep: v })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 rounded-md border border-divider bg-paper px-3 py-2 text-[11px]">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Zielordner</div>
                <div className="truncate font-mono text-ink" title={autoBackup?.directory ?? ''}>
                  {autoBackup?.directory || '— noch nicht gewählt —'}
                </div>
              </div>
              <button
                onClick={() => chooseDirectory(false)}
                className="shrink-0 cursor-pointer rounded-md border border-divider bg-paper px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95"
              >
                <FolderOpen size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={runBackupNow}
                disabled={!autoBackup?.directory || isBackingUp}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-divider bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download size={13} /> {isBackingUp ? 'Sichere …' : 'Jetzt sichern'}
              </button>
              <button
                onClick={() => window.api?.autoBackupOpenDirectory()}
                disabled={!autoBackup?.directory}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-divider bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-muted transition-all hover:border-ink hover:text-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderOpen size={13} /> Ordner öffnen
              </button>
            </div>

            {(backupMessage || autoBackup?.lastError) && (
              <div className={`rounded-md border px-3 py-2 text-[11px] break-all ${
                backupMessage?.ok
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-300'
              }`}>
                {backupMessage?.text ?? `Letztes automatisches Backup fehlgeschlagen: ${autoBackup?.lastError}`}
              </div>
            )}
          </div>
        )}
      </SettingsCard>

      {/* DSGVO Art. 20 */}
      <SettingsCard icon={ShieldCheck} title="Datenübertragbarkeit (DSGVO Art. 20)">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-bold text-ink">Unverschlüsselter JSON-Export</span>
            <InfoTooltip ariaLabel="Hinweise zum JSON-Export">
              <div className="font-bold mb-1">Wann brauche ich das?</div>
              Strukturierte, offen lesbare JSON-Datei für die Übergabe an andere Software.
              Die Datei ist <span className="font-bold text-amber-300">nicht verschlüsselt</span> — bewahre sie
              sicher auf und lösche sie nach der Übertragung.
            </InfoTooltip>
          </div>
          <button
            onClick={exportPortableJson}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-200 transition-all hover:border-amber-400 hover:bg-amber-500/20 active:scale-95"
          >
            <Download size={13} /> JSON-Export
          </button>
        </div>
      </SettingsCard>

      {/* Danger-Zone */}
      <SettingsCard icon={Trash2} title="Daten unwiderruflich löschen" tone="danger">
        <p className="text-[12px] leading-relaxed text-muted">
          Entfernt sämtliche in dieser App gespeicherten Daten (Zeiteinträge, Kunden, Projekte, Rechnungen)
          sowie den lokalen Verschlüsselungsschlüssel. Anschließend startet die App neu wie nach einer Neuinstallation.
          Erstelle vorher ggf. ein Backup über „Backup exportieren".
        </p>
        <button
          onClick={onRequestWipe}
          className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-red-300 transition-all hover:border-red-400 hover:bg-red-500 hover:text-white active:scale-95"
        >
          <Trash2 size={14} /> Alle Daten löschen
        </button>
      </SettingsCard>
    </div>
  );
}
