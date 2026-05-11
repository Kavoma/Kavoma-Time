import { useState, useEffect, useRef } from 'react';
import { Settings, Keyboard, Clock, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import { Issuer } from '../types';
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

function FieldInput({ label, value, onChange, placeholder, type = 'text', isValid, error }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; isValid?: boolean; error?: string }) {
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
        className={`rounded-md border bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none transition-colors ${isValid === false ? 'border-red-500/50 focus:border-red-500' : 'border-divider focus:border-accent'
          }`}
      />
    </div>
  );
}

function FieldTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col">
      <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="resize-none rounded-md border border-divider bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-accent"
      />
    </div>
  );
}

export function SettingsView() {
  const { state, setState } = useAppState();
  const [listening, setListening] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Lokaler State für die Issuer-Felder, um Fokus-Verlust bei globalen Re-Renders zu vermeiden
  const [localIssuer, setLocalIssuer] = useState<Issuer | null>(null);

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

  const updateIssuer = (field: keyof Issuer, value: any) => {
    let formattedValue = value;

    // Formatierer anwenden
    if (field === 'iban') formattedValue = formatIban(value);
    if (field === 'bic') formattedValue = formatBic(value);
    if (field === 'phone') formattedValue = formatPhone(value);
    if (field === 'taxId') formattedValue = formatTaxId(value);

    let next = { ...localIssuer, [field]: formattedValue };

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

      {/* Wochenziel */}
      <div className="mb-6 rounded-lg border border-divider bg-surface">
        <div className="border-b border-divider px-4 py-3 flex items-center gap-2">
          <Clock size={14} className="text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Wochenziel</span>
        </div>
        <div className="flex items-center gap-3 p-4">
          <input
            type="number"
            min={1}
            max={168}
            value={state.weeklyTargetHours}
            onChange={e => updateTarget(Number(e.target.value))}
            className="w-24 rounded-md border border-divider bg-paper px-3 py-2 text-sm font-bold tabular-nums text-ink outline-none transition-colors focus:border-accent"
          />
          <span className="text-sm text-muted">Stunden pro Woche</span>
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
              <input
                type="number"
                min={1}
                value={state.nextInvoiceCounter}
                onChange={e => updateInvoiceCounter(Number(e.target.value))}
                className="w-full rounded-md border border-divider bg-paper px-3 py-2 text-sm font-bold tabular-nums text-ink outline-none transition-colors focus:border-accent"
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
          <div className="col-span-2">
            <FieldTextarea label="Adresse" value={localIssuer.address} onChange={v => updateIssuer('address', v)} placeholder="Musterstraße 1&#10;12345 Musterstadt" />
          </div>
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
              <input
                type="number"
                min={0}
                max={30}
                value={localIssuer.vatRate}
                onChange={e => updateIssuer('vatRate', Number(e.target.value))}
                className="w-20 rounded-md border border-divider bg-paper px-3 py-2 text-sm font-bold tabular-nums text-ink outline-none focus:border-accent"
              />
              <span className="text-sm text-muted">%</span>
            </div>
          )}
        </div>
      </div>

      {/* Shortcut */}
      <div className="rounded-lg border border-divider bg-surface">
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
        </div>
      </div>
    </>
  );
}
