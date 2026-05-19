import { useRef } from 'react';
import { Database, Download, Upload, Trash2, ShieldCheck } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { SettingsCard } from './SettingsCard';
import { InfoTooltip } from './InfoTooltip';

interface DataTabProps {
  /** Wird aufgerufen, wenn ein Backup eingespielt werden soll (öffnet ConfirmRestoreModal im Parent). */
  onRequestRestore: (data: unknown) => void;
  /** Wird aufgerufen, wenn der User die Wipe-Aktion starten will (öffnet ConfirmWipeModal im Parent). */
  onRequestWipe: () => void;
}

export function DataTab({ onRequestRestore, onRequestWipe }: DataTabProps) {
  const { state } = useAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!state) return null;

  const exportData = async () => {
    const plaintext = JSON.stringify(state);
    let output: string;
    let extension = 'json';
    try {
      if (window.api?.encryptBackup) {
        const payload = await window.api.encryptBackup(plaintext);
        if (payload?.encrypted) {
          output = JSON.stringify({ kavoma: 'backup', ...payload }, null, 2);
          extension = 'kvbak';
        } else {
          output = JSON.stringify(state, null, 2);
        }
      } else {
        output = JSON.stringify(state, null, 2);
      }
    } catch (err) {
      console.warn('Verschlüsselung fehlgeschlagen, exportiere Klartext:', err);
      output = JSON.stringify(state, null, 2);
    }

    const blob = new Blob([output], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kavoma-time-backup-${new Date().toISOString().split('T')[0]}.${extension}`;
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
