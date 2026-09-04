import { useEffect, useId, useState } from 'react';
import { Database, Download, Upload, Trash2, ShieldCheck, Clock, FolderOpen, KeyRound, Loader2 } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import type { AutoBackupConfig, BackupImportResult } from '../../types';
import { SettingsCard } from './SettingsCard';
import { InfoTooltip } from './InfoTooltip';
import { Checkbox } from '../Checkbox';
import { NumberInput } from '../NumberInput';
import { SyncCard } from './SyncCard';
import { BackupRecoveryCard } from './BackupRecoveryCard';

interface DataTabProps {
  /** Wird aufgerufen, wenn ein Backup eingespielt werden soll (öffnet ConfirmRestoreModal im Parent). */
  onRequestRestore: (data: unknown) => void;
  /** Wird aufgerufen, wenn der User die Wipe-Aktion starten will (öffnet ConfirmWipeModal im Parent). */
  onRequestWipe: () => void;
}

export function DataTab({ onRequestRestore, onRequestWipe }: DataTabProps) {
  const { state } = useAppState();
  const intervalId = useId();

  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  /** Eine geöffnete, aber noch verschlossene Sicherung von einem anderen Rechner. */
  const [fremdeSicherung, setFremdeSicherung] = useState<BackupImportResult | null>(null);
  const [codeEingabe, setCodeEingabe] = useState('');
  const [codeFehler, setCodeFehler] = useState<string | null>(null);
  const [entsperrt, setEntsperrt] = useState(false);

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
   * Verschlüsselte Sicherung. Geschrieben wird im Main-Prozess — dort liegen
   * Schlüssel und Belege, und eine Sicherung mit Belegen ist zu gross, um sie
   * durch den Renderer zu schieben.
   *
   * Schlägt bewusst hart fehl, statt auf Klartext zurückzufallen: Eine
   * unerwartet unverschlüsselte Sicherung wäre ein stiller Datenschutzverstoß.
   * Wer eine Klartext-Datei braucht, nimmt den ausdrücklichen portablen Export
   * darunter.
   */
  const exportData = async () => {
    if (!window.api?.backupExport) {
      window.alert(
        'Verschlüsselte Sicherungen sind hier nicht verfügbar (App läuft ohne Electron-Schicht).\n\n' +
        'Nutze stattdessen den portablen JSON-Export — der schreibt bewusst unverschlüsselt.',
      );
      return;
    }
    setIsExporting(true);
    setExportMessage(null);
    try {
      const res = await window.api.backupExport({ mode: 'dialog' });
      if (res.canceled) return;
      if (!res.ok) {
        setExportMessage({
          ok: false,
          text: `Die Sicherung wurde ABGEBROCHEN: ${res.error ?? 'Unbekannter Fehler'}. `
            + 'Es wurde keine Datei geschrieben — deine Daten landen nicht im Klartext auf der Platte.',
        });
        return;
      }
      // Was fehlt, muss dabeistehen. Eine Sicherung, die man für vollständig
      // hält, ist schlimmer als eine, von der man weiß, was ihr fehlt.
      const teile = [`${res.attachmentCount ?? 0} Belege gesichert`];
      if (!res.hasRecovery) {
        teile.push('OHNE Wiederherstellungscode — diese Datei öffnet nur dieser Rechner');
      }
      if (res.skippedAttachments?.length) {
        teile.push(`${res.skippedAttachments.length} Belege liegen nicht auf diesem Gerät und fehlen`);
      }
      setExportMessage({
        ok: res.hasRecovery !== false && !res.skippedAttachments?.length,
        text: `Sicherung geschrieben: ${res.file} — ${teile.join('; ')}.`,
      });
    } finally {
      setIsExporting(false);
    }
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

  /** Gemeinsamer Abschluss: JSON prüfen und die Rückfrage im Parent öffnen. */
  const uebergeben = (stateJson: string) => {
    const data = JSON.parse(stateJson);
    if (!data || !Array.isArray(data.customers) || !Array.isArray(data.entries)) {
      throw new Error('Die Datei enthält keinen gültigen Datenbestand.');
    }
    onRequestRestore(data);
  };

  /**
   * Sicherung einspielen. Der Dateidialog liegt im Main-Prozess, weil die Datei
   * dort auch gelesen wird — der Renderer bekommt nur den Datenbestand.
   *
   * Auf dem eigenen Rechner öffnet der lokale Schlüssel die Datei und es wird
   * nie nach einem Code gefragt. Erst wenn er nicht passt — die Sicherung kommt
   * von woanders, oder der Schlüsselbund ist weg — kommt der
   * Wiederherstellungscode ins Spiel.
   */
  const importData = async () => {
    if (!window.api?.backupImportPick) {
      window.alert('Sicherungen einspielen geht nur in der Desktop-App.');
      return;
    }
    setCodeFehler(null);
    const res = await window.api.backupImportPick();
    if (res.canceled) return;

    if (res.error) {
      window.alert(`Die Datei konnte nicht gelesen werden.\n\n${res.error}`);
      return;
    }

    if (res.needsCode) {
      if (!res.hasRecovery) {
        window.alert(
          'Diese Sicherung lässt sich hier nicht öffnen.\n\n' +
          'Sie wurde auf einem anderen Rechner geschrieben und trägt keinen ' +
          'Wiederherstellungscode bei sich — das ist der Mangel, den neuere ' +
          'Sicherungen nicht mehr haben. Öffnen kann sie nur der Rechner, auf ' +
          'dem sie entstanden ist.',
        );
        await window.api.backupImportCancel();
        return;
      }
      setCodeEingabe('');
      setFremdeSicherung(res);
      return;
    }

    try {
      uebergeben(res.state!);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Die Datei hat ein unbekanntes Format.');
      await window.api.backupImportCancel();
    }
  };

  /** Zweiter Anlauf für eine fremde Sicherung. */
  const mitCodeOeffnen = async () => {
    setEntsperrt(true);
    setCodeFehler(null);
    try {
      const res = await window.api!.backupImportUnlock(codeEingabe);
      if (!res.ok || !res.state) {
        setCodeFehler(res.error ?? 'Der Code wurde nicht angenommen.');
        return;
      }
      uebergeben(res.state);
      setFremdeSicherung(null);
    } catch (e) {
      setCodeFehler(e instanceof Error ? e.message : 'Die Sicherung ließ sich nicht öffnen.');
    } finally {
      setEntsperrt(false);
    }
  };

  const importAbbrechen = async () => {
    setFremdeSicherung(null);
    setCodeEingabe('');
    setCodeFehler(null);
    await window.api?.backupImportCancel();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Backup */}
      <SyncCard />

      <BackupRecoveryCard />

      <SettingsCard
        icon={Database}
        title="Sicherung"
        headerAside={(
          <InfoTooltip ariaLabel="Hinweise zur Sicherung">
            <div className="font-bold mb-1">Was wird gesichert?</div>
            Die komplette Datenbank (Kunden, Projekte, Zeiten, Rechnungen, Vorlagen,
            Einstellungen) <span className="font-bold text-ink">und die PDF-Belege</span> —
            Eingangsrechnungen und Verträge — als eine verschlüsselte
            <span className="font-mono"> .kvbak</span>-Datei.
            <div className="mt-2">
              Mit einem Wiederherstellungscode lässt sie sich auf jedem Rechner
              einspielen. Ohne ihn nur auf diesem, weil der Schlüssel dann am
              Schlüsselbund dieses Geräts hängt.
            </div>
          </InfoTooltip>
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={exportData}
              disabled={isExporting}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold text-ink transition-colors hover:border-ink hover:bg-surface disabled:opacity-40"
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {isExporting ? 'Sichere …' : 'Sicherung exportieren'}
            </button>
            <button
              onClick={importData}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold text-ink transition-colors hover:border-ink hover:bg-surface"
            >
              <Upload size={14} /> Sicherung einspielen
            </button>
          </div>

          {exportMessage && (
            <div className={`rounded-md border px-3 py-2 text-[11px] break-all ${
              exportMessage.ok
                ? 'border-success-line/40 bg-success-soft text-success'
                : 'border-warning-line bg-warning-soft text-warning'
            }`}>
              {exportMessage.text}
            </div>
          )}
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
            Belege sind voreingestellt dabei — das macht die Dateien deutlich grösser,
            aber ohne sie sichert die Automatik die aufbewahrungspflichtigen Rechnungen
            nicht mit.
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
                <label htmlFor={intervalId} className="mb-2 kv-label">
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
                <label className="mb-2 kv-label">
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

            <Checkbox
              checked={autoBackup?.includeAttachments !== false}
              onChange={(val) => void patchAutoBackup({ includeAttachments: val })}
              className="w-full rounded-md border border-divider bg-paper px-3 py-2.5 hover:border-ink/60"
              label={
                <div className="flex-1">
                  <div className="text-sm font-bold text-ink">PDF-Belege mitsichern</div>
                  <div className="text-[11px] text-muted">
                    Eingangsrechnungen und Verträge. Ohne sie ist die Sicherung klein,
                    sichert aber nur die Datenbank.
                  </div>
                </div>
              }
            />

            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 rounded-md border border-divider bg-paper px-3 py-2 text-[11px]">
                <div className="kv-label">Zielordner</div>
                <div className="truncate font-mono text-ink" title={autoBackup?.directory ?? ''}>
                  {autoBackup?.directory || '— noch nicht gewählt —'}
                </div>
              </div>
              <button
                onClick={() => chooseDirectory(false)}
                className="kv-btn kv-btn-outline shrink-0"
              >
                <FolderOpen size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={runBackupNow}
                disabled={!autoBackup?.directory || isBackingUp}
                className="kv-btn kv-btn-outline"
              >
                <Download size={13} /> {isBackingUp ? 'Sichere …' : 'Jetzt sichern'}
              </button>
              <button
                onClick={() => window.api?.autoBackupOpenDirectory()}
                disabled={!autoBackup?.directory}
                className="kv-btn kv-btn-outline"
              >
                <FolderOpen size={13} /> Ordner öffnen
              </button>
            </div>

            {(backupMessage || autoBackup?.lastError) && (
              <div className={`rounded-md border px-3 py-2 text-[11px] break-all ${
                backupMessage?.ok
                  ? 'border-success-line/40 bg-success-soft text-success'
                  : 'border-danger-line bg-danger-soft text-danger'
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
              Die Datei ist <span className="font-bold text-warning">nicht verschlüsselt</span> — bewahre sie
              sicher auf und lösche sie nach der Übertragung.
            </InfoTooltip>
          </div>
          <button
            onClick={exportPortableJson}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-xs font-bold text-warning transition-colors hover:border-warning-line hover:bg-warning-soft"
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
          Erstelle vorher ggf. eine Sicherung über „Sicherung exportieren" — und lege
          dir den Wiederherstellungscode zurecht: Der hier gelöschte Schlüssel ist
          danach fort, und alte Sicherungen öffnet dann nur noch der Code.
        </p>
        <button
          onClick={onRequestWipe}
          className="kv-btn kv-btn-danger mt-3"
        >
          <Trash2 size={14} /> Alle Daten löschen
        </button>
      </SettingsCard>
      {/*
        Fremde Sicherung: Der Schlüssel dieses Rechners passt nicht. Das ist der
        Fall, für den es den Wiederherstellungscode gibt — neuer Rechner,
        Systemneuinstallation, verlorener Schlüsselbund.
      */}
      {fremdeSicherung && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 kv-scrim" onClick={entsperrt ? undefined : importAbbrechen} />
          <div className="relative z-10 mx-4 w-full max-w-md kv-overlay text-ink">
            <header className="flex items-center gap-2 border-b border-divider px-5 py-4">
              <KeyRound size={16} className="text-accent" />
              <h2 className="text-sm font-bold uppercase tracking-[0.2em]">
                Sicherung entsperren
              </h2>
            </header>

            <div className="space-y-4 px-5 py-5">
              <p className="text-xs leading-relaxed text-muted">
                Diese Sicherung stammt nicht von diesem Rechner. Gib den
                Wiederherstellungscode ein, der beim Anlegen angezeigt wurde.
                Groß- und Kleinschreibung sowie Bindestriche sind egal.
              </p>

              <div className="kv-raised px-3 py-2 text-[11px] text-muted">
                <div className="font-mono text-ink">{fremdeSicherung.file}</div>
                {fremdeSicherung.createdAt && (
                  <div className="mt-0.5">
                    Geschrieben am {new Date(fremdeSicherung.createdAt).toLocaleString('de-DE')}
                    {fremdeSicherung.appVersion && ` mit Version ${fremdeSicherung.appVersion}`}
                  </div>
                )}
                <div>
                  {fremdeSicherung.attachmentCount
                    ? `${fremdeSicherung.attachmentCount} Belege enthalten`
                    : 'Keine Belege enthalten'}
                </div>
              </div>

              <input
                className="kv-input font-mono"
                type="text"
                autoFocus
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                value={codeEingabe}
                onChange={(e) => { setCodeEingabe(e.target.value); setCodeFehler(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && codeEingabe.trim()) void mitCodeOeffnen(); }}
              />

              {codeFehler && (
                <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
                  {codeFehler}
                </p>
              )}
            </div>

            <footer className="flex justify-end gap-2 border-t border-divider px-5 py-4">
              <button type="button" className="kv-btn kv-btn-quiet" onClick={importAbbrechen} disabled={entsperrt}>
                Abbrechen
              </button>
              <button
                type="button"
                className="kv-btn kv-btn-primary"
                onClick={() => void mitCodeOeffnen()}
                disabled={entsperrt || !codeEingabe.trim()}
              >
                {entsperrt ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                Entsperren
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
