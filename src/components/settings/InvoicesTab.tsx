import { useEffect, useState } from 'react';
import { Hash, Bookmark, FileText, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { NumberInput } from '../NumberInput';
import { SettingsCard } from './SettingsCard';
import { InfoTooltip } from './InfoTooltip';
import type { Issuer } from '../../types';
import { isValidIban, getBankName, isValidBic, formatIban, formatBic, formatPhone, formatTaxId } from '../../utils/iban';

interface FieldInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  isValid?: boolean;
}

function FieldInput({ label, value, onChange, placeholder, type = 'text', isValid }: FieldInputProps) {
  const showValidity = isValid !== undefined && value.length > 0;
  const isTabular = type === 'tel' || label.includes('IBAN') || label.includes('BIC');
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{label}</label>
        {showValidity && (
          isValid
            ? <CheckCircle2 size={12} className="text-green-500" aria-label="gültig" />
            : <AlertCircle size={12} className="text-red-500" aria-label="ungültig" />
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={isValid === false}
        className={`w-full rounded-md border bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-accent ${
          isValid === false ? 'border-red-500/60 focus:border-red-500' : 'border-divider'
        } ${isTabular ? 'tabular-nums' : ''}`}
      />
    </div>
  );
}

interface InvoicesTabProps {
  onOpenTemplateModal: () => void;
}

export function InvoicesTab({ onOpenTemplateModal }: InvoicesTabProps) {
  const { state, setState } = useAppState();
  const [localIssuer, setLocalIssuer] = useState<Issuer | null>(null);

  // Lokaler Issuer-State verhindert Fokus-Verlust bei Re-Renders während des Tippens
  useEffect(() => {
    if (state && !localIssuer) setLocalIssuer(state.issuer);
  }, [state, localIssuer]);

  if (!state || !localIssuer) return null;

  const updateInvoiceCounter = (val: number) => {
    setState(s => s ? { ...s, nextInvoiceCounter: Math.max(1, val) } : null);
  };
  const updateInvoicePrefix = (val: string) => {
    setState(s => s ? { ...s, invoicePrefix: val } : null);
  };

  const updateIssuer = (field: keyof Issuer, value: any) => {
    let formatted = value;
    if (field === 'iban') formatted = formatIban(value);
    if (field === 'bic') formatted = formatBic(value);
    if (field === 'phone') formatted = formatPhone(value);
    if (field === 'taxId') formatted = formatTaxId(value);

    const next = { ...localIssuer, [field]: formatted };

    if (field === 'iban') {
      const bank = getBankName(formatted);
      if (bank && !next.bank) next.bank = bank;
    }

    setLocalIssuer(next);
    setState(s => s ? { ...s, issuer: next } : null);
  };

  const previewNumber = `${(state.invoicePrefix || 'YYYY-').replace('YYYY', String(new Date().getFullYear()))}${String(state.nextInvoiceCounter).padStart(3, '0')}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Nummernkreis */}
      <SettingsCard icon={Hash} title="Nummernkreis">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Nächste Nummer</div>
            <NumberInput min={1} value={state.nextInvoiceCounter} onChange={updateInvoiceCounter} className="w-full" />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Präfix</span>
              <InfoTooltip ariaLabel="Hinweis zum Präfix">
                <div className="font-bold mb-1">Platzhalter im Präfix</div>
                Der Platzhalter <span className="font-mono tabular-nums">YYYY</span> wird automatisch durch das aktuelle Jahr ersetzt.
                Beispiele: <span className="font-mono tabular-nums">YYYY-</span> → <span className="font-mono tabular-nums">2026-001</span>,
                {' '}<span className="font-mono tabular-nums">RE-</span> → <span className="font-mono tabular-nums">RE-001</span>.
              </InfoTooltip>
            </div>
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
          <span className="text-xs text-muted">Vorschau nächste Rechnung</span>
          <span className="text-sm font-bold text-accent tabular-nums">{previewNumber}</span>
        </div>
      </SettingsCard>

      {/* Vorlagen */}
      <SettingsCard icon={Bookmark} title="Vorlagen & Wiederkehrend" bare>
        <button
          onClick={onOpenTemplateModal}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors hover:bg-paper/40"
        >
          <div>
            <div className="text-sm font-bold">Vorlagen &amp; wiederkehrende Rechnungen verwalten</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {state.invoiceTemplates.length} Vorlage{state.invoiceTemplates.length === 1 ? '' : 'n'}
              {' · '}
              {state.recurringInvoices.length} wiederkehrend
              {' · '}
              {state.recurringInvoices.filter(r => r.active).length} aktiv
            </div>
          </div>
          <ChevronRight size={16} className="text-muted" />
        </button>
      </SettingsCard>

      {/* Absender */}
      <SettingsCard icon={FileText} title="Rechnungs-Absender">
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Name / Firma" value={localIssuer.name} onChange={v => updateIssuer('name', v)} placeholder="Max Mustermann" />
          <FieldInput label="E-Mail" value={localIssuer.email} onChange={v => updateIssuer('email', v)} placeholder="max@beispiel.de" type="email" />
          <div className="col-span-2 grid grid-cols-2 gap-3">
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
              <NumberInput min={0} max={30} value={localIssuer.vatRate} onChange={v => updateIssuer('vatRate', v)} className="w-24" />
              <span className="text-sm text-muted">%</span>
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
