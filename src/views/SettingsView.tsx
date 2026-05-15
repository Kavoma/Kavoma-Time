import { useState, useEffect, useRef } from 'react';
import { Settings, Keyboard, Clock, FileText, CheckCircle2, AlertCircle, Database, Download, Upload, Info, Monitor, RefreshCw, Power, Trash2 } from 'lucide-react';
import { ConfirmRestoreModal } from '../components/ConfirmRestoreModal';
import { ConfirmWipeModal } from '../components/ConfirmWipeModal';
import { LegalModal, type LegalDocument } from '../components/LegalModal';
import { useAppState } from '../state/AppStateContext';
import { NumberInput } from '../components/NumberInput';
import { Issuer, UpdateStatus } from '../types';
import { isValidIban, getBankName, isValidBic, formatIban, formatBic, formatPhone, formatTaxId } from '../utils/iban';

// Wandelt ein KeyboardEvent in einen Electron-Accelerator-String um
function eventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;

  let mapped = key;
  if (key === ' ') mapped = 'Space';
  else if (key === 'Escape') mapped = 'Esc';
  else if (key === 'ArrowUp') mapped = 'Up';
  else if (key === 'ArrowDown') mapped = 'Down';
  else if (key === 'ArrowLeft') mapped = 'Left';
  else if (key === 'ArrowRight') mapped = 'Right';
  else if (key.length === 1) mapped = key.toUpperCase();

  parts.push(mapped);
  return parts.join('+');
}

// Schöner formatieren für die Anzeige
function prettyAccelerator(acc: string): string {
  return acc
    .replace(/CommandOrControl/g, 'Strg')
    .replace(/CmdOrCtrl/g, 'Strg')
    .replace(/Control/g, 'Strg')
    .replace(/Command/g, '⌘')
    .replace(/\+/g, ' + ');
}

function FieldInput({ label, value, onChange, placeholder, type = 'text', isValid, error: _error }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; isValid?: boolean; error?: string }) {
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{label}</label>
        {value && (
          <div className="flex items-center gap-1">
            {isValid === true && <CheckCircle2 size={10} className="text-green-500" />}
            {isValid === false && <AlertCircle size={10} className="text-red-500" />}
          </div>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full placeholder:text-muted ${isValid === false ? 'border-red-500 focus:border-red-500' : ''} ${type === 'tel' || label.includes('IBAN') || label.includes('BIC') ? 'tabular-nums' : ''}`}
      />
    </div>
  );
}

export function SettingsView() {
  const { state, setState, restoreBackup } = useAppState();
  const [listening, setListening] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [legalModal, setLegalModal] = useState<{ open: boolean; doc: LegalDocument }>({ open: false, doc: 'imprint' });
  const [pendingBackupData, setPendingBackupData] = useState<any>(null);
  const [appInfo, setAppInfo] = useState<{ os: string; arch: string; version: string } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(true);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportPortableJson = () => {
    if (!state) return;
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

  const exportData = async () => {
    if (!state) return;
    const plaintext = JSON.stringify(state);

    // Versuche zu verschlüsseln, falls Electron mit Key verfügbar; sonst Plain-Fallback
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
          // Verschlüsseltes Backup → mit App-Schlüssel entschlüsseln
          const decrypted = await window.api.decryptBackup(parsed);
          data = JSON.parse(decrypted);
        } else {
          // Klartext-Backup (Legacy)
          data = parsed;
        }

        if (!data.customers || !data.entries) throw new Error('Ungültiges Format');

        setPendingBackupData(data);
        setIsRestoreModalOpen(true);
      } catch (err) {
        console.error(err);
        alert('Fehler beim Importieren. Stelle sicher, dass die Datei von dieser Installation stammt (verschlüsselte Backups lassen sich nur am gleichen PC öffnen).');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Lokaler State für die Issuer-Felder, um Fokus-Verlust bei globalen Re-Renders zu vermeiden
  const [localIssuer, setLocalIssuer] = useState<Issuer | null>(null);

  useEffect(() => {
    window.api?.getAppInfo().then(setAppInfo);
    window.api?.getUpdateStatus?.().then(setUpdateStatus);
    window.api?.getAutoUpdateEnabled?.().then(setAutoUpdateEnabled);
    return window.api?.onUpdateStatus?.(setUpdateStatus);
  }, []);

  const toggleAutoUpdate = async (next: boolean) => {
    setAutoUpdateEnabled(next);
    try {
      await window.api?.setAutoUpdateEnabled?.(next);
    } catch (e) {
      console.error(e);
      setAutoUpdateEnabled(!next);
    }
  };

  useEffect(() => {
    if (state && !localIssuer) {
      setLocalIssuer(state.issuer);
    }
  }, [state]);

  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListening(false);
        return;
      }
      const acc = eventToAccelerator(e);
      if (!acc) return;
      setState(s => s ? { ...s, shortcuts: { ...s.shortcuts, startPause: acc } } : null);
      window.api?.setStartPauseShortcut(acc);
      setListening(false);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true } as any);
  }, [listening, setState]);

  if (!state || !localIssuer) return null;

  const updateTarget = (h: number) => {
    setState(s => s ? { ...s, weeklyTargetHours: h } : null);
  };

  const updateInvoiceCounter = (val: number) => {
    setState(s => s ? { ...s, nextInvoiceCounter: Math.max(1, val) } : null);
  };

  const updateInvoicePrefix = (val: string) => {
    setState(s => s ? { ...s, invoicePrefix: val } : null);
  };

  const updateTimerOverlayEnabled = (enabled: boolean) => {
    setState(s => s ? { ...s, timerOverlayEnabled: enabled } : null);
  };

  const updateAfkPauseEnabled = (enabled: boolean) => {
    setState(s => s ? { ...s, afkPauseEnabled: enabled } : null);
  };

  const updateAfkTimeoutMinutes = (minutes: number) => {
    const nextMinutes = Math.min(240, Math.max(1, minutes));
    setState(s => s ? { ...s, afkTimeoutMinutes: nextMinutes } : null);
  };

  const isCheckingForUpdate = updateStatus?.state === 'checking' || updateStatus?.state === 'downloading' || updateStatus?.state === 'available';

  const updateIssuer = (field: keyof Issuer, value: any) => {
    let formattedValue = value;

    // Formatierer anwenden
    if (field === 'iban') formattedValue = formatIban(value);
    if (field === 'bic') formattedValue = formatBic(value);
    if (field === 'phone') formattedValue = formatPhone(value);
    if (field === 'taxId') formattedValue = formatTaxId(value);

    const next = { ...localIssuer, [field]: formattedValue };

    // Auto-Bank-Erkennung (basiert auf dem neuen Wert)
    if (field === 'iban') {
      const bank = getBankName(formattedValue);
      if (bank && !next.bank) {
        next.bank = bank;
      }
    }

    setLocalIssuer(next);
    setState(s => s ? { ...s, issuer: next } : null);
  };

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight leading-none">Einstellungen</h2>
          <p className="mt-1.5 text-xs text-muted">Wochenziel & Tastenkürzel</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Settings size={18} className="text-muted" />
        </div>
      </div>

      {/* Updates */}
      <div className="mb-6 rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <RefreshCw size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Updates</span>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-ink">Automatische Updates</div>
              <div className="mt-0.5 text-xs text-muted">{updateStatus?.message ?? 'Bereit'}</div>
              {updateStatus?.error && (
                <div className="mt-1 text-[11px] text-red-400">{updateStatus.error}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isCheckingForUpdate}
                onClick={() => window.api?.checkForUpdates?.()}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-divider bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RefreshCw size={13} className={isCheckingForUpdate ? 'animate-spin' : ''} />
                Prüfen
              </button>
              {updateStatus?.state === 'downloaded' && (
                <button
                  type="button"
                  onClick={() => window.api?.installDownloadedUpdate?.()}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-ink bg-ink px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-paper transition-all hover:bg-paper hover:text-ink"
                >
                  <Power size={13} />
                  Neustart
                </button>
              )}
            </div>
          </div>
          {typeof updateStatus?.progress === 'number' && (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper">
              <div
                className="h-full rounded-full bg-ink transition-all"
                style={{ width: `${Math.min(100, Math.max(0, updateStatus.progress))}%` }}
              />
            </div>
          )}

          {/* Opt-out & Transparenz */}
          <div className="mt-4 border-t border-divider pt-4">
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink">Beim Start automatisch nach Updates suchen</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Beim Update-Check kontaktiert die App den GitHub-Release-Server.
                  Dabei werden technisch zwangsläufig die IP-Adresse, ein User-Agent
                  (Anwendungs- und Plattform-Kennung) sowie die aktuelle App-Version übertragen —
                  Daten, die GitHub eigenständig verarbeitet.
                  Wenn du diese Option ausschaltest, kannst du Updates jederzeit
                  manuell über „Prüfen" anstoßen.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoUpdateEnabled}
                onClick={() => toggleAutoUpdate(!autoUpdateEnabled)}
                className={`relative mt-1 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${autoUpdateEnabled ? 'bg-ink' : 'bg-divider'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${autoUpdateEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </label>
          </div>
        </div>
      </div>

      {/* Wochenziel */}
      <div className="mb-6 rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <Clock size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Wochenziel</span>
        </div>
        <div className="flex items-center gap-3 p-4">
          <NumberInput
            min={1}
            max={168}
            value={state.weeklyTargetHours}
            onChange={updateTarget}
            className="w-24"
          />
          <span className="text-sm text-muted">Stunden pro Woche</span>
        </div>
      </div>

      {/* AFK-Erkennung */}
      <div className="mb-6 rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <Clock size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">AFK-Erkennung</span>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-ink">Automatisch pausieren</div>
              <div className="mt-0.5 text-xs text-muted">Bei keiner Maus- oder Tastaturaktivität wird der Timer rückwirkend auf die letzte Aktivität pausiert.</div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={state.afkPauseEnabled !== false}
                onChange={e => updateAfkPauseEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <span className="h-6 w-11 rounded-full border border-divider bg-paper transition-colors peer-checked:bg-ink" />
              <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-muted transition-transform peer-checked:translate-x-5 peer-checked:bg-paper" />
            </label>
          </div>
          <div className={`mt-4 flex items-center gap-3 ${state.afkPauseEnabled === false ? 'opacity-45' : ''}`}>
            <NumberInput
              min={1}
              max={240}
              value={state.afkTimeoutMinutes ?? 10}
              onChange={updateAfkTimeoutMinutes}
              className="w-24"
            />
            <span className="text-sm text-muted">Minuten ohne Aktivität</span>
          </div>
        </div>
      </div>

      {/* Timer Overlay */}
      <div className="mb-6 rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <Monitor size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Timer Overlay</span>
        </div>
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <div className="text-sm font-bold text-ink">Desktop-Timer anzeigen</div>
            <div className="mt-0.5 text-xs text-muted">Erscheint im Hintergrund, lässt sich ziehen und snappt in die nächste Bildschirmecke.</div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={state.timerOverlayEnabled !== false}
              onChange={e => updateTimerOverlayEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <span className="h-6 w-11 rounded-full border border-divider bg-paper transition-colors peer-checked:bg-ink" />
            <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-muted transition-transform peer-checked:translate-x-5 peer-checked:bg-paper" />
          </label>
        </div>
      </div>

      {/* Rechnungs-Nummernkreis */}
      <div className="mb-6 rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <FileText size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Rechnungs-Nummernkreis</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-2 text-xs text-muted">Nächste Nummer</div>
              <NumberInput
                min={1}
                value={state.nextInvoiceCounter}
                onChange={updateInvoiceCounter}
                className="w-full"
              />
            </div>
            <div>
              <div className="mb-2 text-xs text-muted">Präfix (z. B. "RE-")</div>
              <input
                type="text"
                value={state.invoicePrefix}
                onChange={e => updateInvoicePrefix(e.target.value)}
                placeholder="YYYY-"
                className="w-full rounded-md border border-divider bg-paper px-3 py-2 text-sm font-bold text-ink outline-none transition-colors focus:border-accent"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded bg-paper/50 px-3 py-2">
            <span className="text-xs text-muted">Vorschau nächste Rechnung:</span>
            <span className="text-sm font-bold text-accent tabular-nums">
              {(state.invoicePrefix || 'YYYY-').replace('YYYY', String(new Date().getFullYear()))}
              {String(state.nextInvoiceCounter).padStart(3, '0')}
            </span>
          </div>
          <p className="mt-2 text-[10px] text-muted">Tipp: "YYYY" wird automatisch durch das aktuelle Jahr ersetzt.</p>
        </div>
      </div>

      {/* Issuer-Daten für Rechnungen */}
      <div className="mb-6 rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <FileText size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Rechnungs-Absender</span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">
          <FieldInput label="Name / Firma" value={localIssuer.name} onChange={v => updateIssuer('name', v)} placeholder="Max Mustermann" />
          <FieldInput label="E-Mail" value={localIssuer.email} onChange={v => updateIssuer('email', v)} placeholder="max@beispiel.de" type="email" />
          <div className="grid grid-cols-2 gap-3 col-span-2">
            <FieldInput label="Straße & Hausnummer" value={localIssuer.street ?? ''} onChange={v => updateIssuer('street', v)} placeholder="Musterstraße 1" />
            <FieldInput label="Adresszusatz (opt.)" value={localIssuer.address2 ?? ''} onChange={v => updateIssuer('address2', v)} placeholder="2. OG / c/o" />
          </div>
          <FieldInput label="PLZ" value={localIssuer.zip ?? ''} onChange={v => updateIssuer('zip', v)} placeholder="12345" />
          <FieldInput label="Stadt" value={localIssuer.city ?? ''} onChange={v => updateIssuer('city', v)} placeholder="Musterstadt" />
          <FieldInput label="Telefon" value={localIssuer.phone} onChange={v => updateIssuer('phone', v)} placeholder="+49 …" />
          <FieldInput label="Steuer-Nr. / USt-IdNr." value={localIssuer.taxId} onChange={v => updateIssuer('taxId', v)} placeholder="DE123456789" />
          <FieldInput label="IBAN" value={localIssuer.iban} onChange={v => updateIssuer('iban', v)} placeholder="DE89 …" isValid={isValidIban(localIssuer.iban)} />
          <FieldInput label="BIC" value={localIssuer.bic} onChange={v => updateIssuer('bic', v)} placeholder="GENODEF1…" isValid={isValidBic(localIssuer.bic)} />
          <div className="col-span-2">
            <FieldInput label="Bank" value={localIssuer.bank} onChange={v => updateIssuer('bank', v)} placeholder="Sparkasse Musterstadt" />
          </div>
          <label className="col-span-2 flex cursor-pointer items-center gap-3 rounded-md border border-divider bg-paper px-3 py-2.5">
            <input
              type="checkbox"
              checked={localIssuer.smallBusiness}
              onChange={e => {
                const next = { ...localIssuer, smallBusiness: e.target.checked, vatRate: e.target.checked ? 0 : 19 };
                setLocalIssuer(next);
                setState(s => s ? { ...s, issuer: next } : null);
              }}
              className="accent-ink"
            />
            <div className="flex-1">
              <div className="text-sm font-bold text-ink">Kleinunternehmer (§19 UStG)</div>
              <div className="text-[11px] text-muted">Keine Umsatzsteuer ausweisen.</div>
            </div>
          </label>
          {!localIssuer.smallBusiness && (
            <div className="col-span-2 flex items-center gap-3">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">USt-Satz</label>
              <NumberInput
                min={0}
                max={30}
                value={localIssuer.vatRate}
                onChange={v => updateIssuer('vatRate', v)}
                className="w-24"
              />
              <span className="text-sm text-muted">%</span>
            </div>
          )}
        </div>
      </div>

      {/* Shortcut */}
      <div className="mb-6 rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <Keyboard size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Tastenkürzel</span>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-ink">Start / Pause</div>
              <div className="mt-0.5 text-xs text-muted">Global aktiv, auch im Hintergrund.</div>
            </div>
            <button
              ref={buttonRef}
              onClick={() => setListening(l => !l)}
              className={`min-w-44 cursor-pointer rounded-md border px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors ${listening
                ? 'border-accent bg-paper text-accent animate-pulse'
                : 'border-divider bg-paper text-ink hover:border-ink'
                }`}
            >
              {listening ? 'Taste drücken…' : prettyAccelerator(state.shortcuts.startPause)}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Esc bricht die Aufnahme ab.
          </p>
          
          <div className="mt-6 border-t border-divider pt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-3">Navigation (Schnellzugriff)</div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              {[
                { key: 'Strg/⌘ + 1', label: 'Tracker' },
                { key: 'Strg/⌘ + 2', label: 'Projekte' },
                { key: 'Strg/⌘ + 3', label: 'Kunden' },
                { key: 'Strg/⌘ + 4', label: 'Statistik' },
                { key: 'Strg/⌘ + 5', label: 'Export' },
                { key: 'Strg/⌘ + 6', label: 'Einstellungen' },
              ].map(shortcut => (
                <div key={shortcut.key} className="flex items-center justify-between">
                  <span className="text-xs text-ink">{shortcut.label}</span>
                  <kbd className="rounded border border-divider bg-paper px-1.5 py-0.5 text-[10px] font-bold text-muted shadow-sm">{shortcut.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Datenverwaltung */}
      <div className="rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <Database size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Datenverwaltung & Backup</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={exportData}
              className="flex items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95"
            >
              <Download size={14} /> Backup exportieren
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95"
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
          <p className="mt-3 text-[10px] text-muted">
            Exportiere deine gesamte Datenbank (Kunden, Projekte, Zeiten, Rechnungen) als verschlüsselte KVBAK-Datei.
            Diese Datei kann jederzeit wieder eingespielt werden.
          </p>

          <div className="mt-4 border-t border-divider pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-ink">Datenübertragbarkeit (DSGVO Art. 20)</div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted">
                  Lade deine Daten als unverschlüsselte, strukturierte JSON-Datei
                  herunter — geeignet zur Übergabe an andere Software.
                  Die Datei ist offen lesbar; bewahre sie sicher auf.
                </p>
              </div>
              <button
                onClick={exportPortableJson}
                className="flex shrink-0 items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-200 transition-all hover:border-amber-400 hover:bg-amber-500/20 active:scale-95"
              >
                <Download size={13} /> JSON-Export
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmRestoreModal
        open={isRestoreModalOpen}
        onCancel={() => {
          setIsRestoreModalOpen(false);
          setPendingBackupData(null);
        }}
        onConfirm={async () => {
          if (pendingBackupData) {
            setIsRestoreModalOpen(false);
            await restoreBackup(pendingBackupData);
            setPendingBackupData(null);
          }
        }}
      />

      <ConfirmWipeModal
        open={isWipeModalOpen}
        onCancel={() => setIsWipeModalOpen(false)}
        onConfirm={async () => {
          try {
            await window.api?.wipeAllData?.();
          } catch (e) {
            console.error(e);
            alert('Daten konnten nicht vollständig gelöscht werden. Bitte App manuell deinstallieren oder den AppData-Ordner entfernen.');
            setIsWipeModalOpen(false);
          }
        }}
      />

      <LegalModal
        open={legalModal.open}
        initial={legalModal.doc}
        onClose={() => setLegalModal((prev) => ({ ...prev, open: false }))}
      />

      {/* Rechtliches: Impressum & Datenschutz */}
      <div className="mt-8 rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <FileText size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Rechtliches</span>
        </div>
        <div className="flex gap-3 p-4">
          <button
            onClick={() => setLegalModal({ open: true, doc: 'imprint' })}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95"
          >
            <FileText size={14} /> Impressum
          </button>
          <button
            onClick={() => setLegalModal({ open: true, doc: 'privacy' })}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95"
          >
            <FileText size={14} /> Datenschutz
          </button>
        </div>
      </div>

      {/* Danger-Zone: Recht auf Löschung (DSGVO Art. 17) */}
      <div className="mt-8 rounded-lg border border-red-500/30 bg-red-500/[0.04]">
        <div className="border-b border-red-500/20 px-4 py-3 flex items-center gap-2">
          <Trash2 size={14} className="text-red-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300">Daten unwiderruflich löschen</span>
        </div>
        <div className="p-4">
          <p className="text-[12px] leading-relaxed text-muted">
            Entfernt sämtliche in dieser App gespeicherten Daten (Zeiteinträge, Kunden, Projekte, Rechnungen)
            sowie den lokalen Verschlüsselungsschlüssel. Anschließend startet die App neu wie nach einer Neuinstallation.
            Erstelle vorher ggf. ein Backup über „Backup exportieren".
          </p>
          <button
            onClick={() => setIsWipeModalOpen(true)}
            className="mt-3 flex items-center justify-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-red-300 transition-all hover:border-red-400 hover:bg-red-500 hover:text-white active:scale-95"
          >
            <Trash2 size={14} /> Alle Daten löschen
          </button>
        </div>
      </div>

      {/* System Information */}
      <div className="mt-8 rounded-lg border border-divider bg-surface overflow-hidden">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <Info size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">System-Informationen</span>
        </div>
        <div className="p-4 bg-paper/30">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted">App Version</div>
              <div className="text-sm font-bold text-accent">{appInfo?.version || '...'}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Betriebssystem</div>
              <div className="text-sm font-bold text-ink">{appInfo?.os || '...'}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Architektur</div>
              <div className="text-sm font-bold text-muted uppercase">{appInfo?.arch || '...'} Bit</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
