import { Clock, Package, Percent, Plus, Trash2, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import type { InvoiceItem, InvoiceItemKind } from '../types';
import { createBlankItem, recalcItemTotal } from '../utils/templates';

interface Props {
  items: InvoiceItem[];
  onChange: (next: InvoiceItem[]) => void;
  onPickTimeEntries: () => void;
}

const KIND_META: Record<InvoiceItemKind, { label: string; Icon: typeof Clock; className: string; chipClass: string }> = {
  time:     { label: 'Zeit',     Icon: Clock,   className: 'border-l-blue-400',   chipClass: 'bg-blue-500/15 text-blue-200' },
  flat:     { label: 'Pauschal', Icon: Package, className: 'border-l-violet-400', chipClass: 'bg-violet-500/15 text-violet-200' },
  discount: { label: 'Rabatt',   Icon: Percent, className: 'border-l-amber-400', chipClass: 'bg-amber-500/15 text-amber-200' },
};

const fmtEuro = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export function InvoiceItemsTable({ items, onChange, onPickTimeEntries }: Props) {
  const subtotal = items.reduce((s, it) => s + it.total, 0);

  const updateItem = (index: number, patch: Partial<InvoiceItem>) => {
    const next = items.map((it, i) => {
      if (i !== index) return it;
      const merged = { ...it, ...patch };
      // Sync für Prozent-Rabatt: quantity spiegelt Math.abs(unitPrice),
      // damit die Anzeige "Menge × Einheit" konsistent ist (z. B. unitPrice
      // = -50 → quantity 50, Einheit %). Greift sowohl beim Wechsel auf %
      // als auch bei Eingabe in unitPrice.
      if (merged.kind === 'discount' && merged.unit === '%') {
        merged.quantity = Math.abs(merged.unitPrice);
      }
      return merged;
    });

    // Total für die geänderte Zeile neu berechnen — Rabatte mit unit='%'
    // hängen vom Subtotal aller anderen Items ab, deshalb berechnen wir
    // alle Discounts danach noch einmal.
    const withRecalc = next.map((it, i) => {
      if (i === index && it.kind !== 'discount') {
        return { ...it, total: recalcItemTotal(it, 0) };
      }
      return it;
    });
    const baseSubtotal = withRecalc
      .filter((it) => it.kind !== 'discount')
      .reduce((s, it) => s + it.total, 0);
    const finalItems = withRecalc.map((it) =>
      it.kind === 'discount' ? { ...it, total: recalcItemTotal(it, baseSubtotal) } : it,
    );
    onChange(finalItems);
  };

  const addItem = (kind: InvoiceItemKind) => {
    if (kind === 'time') {
      onPickTimeEntries();
      return;
    }
    onChange([...items, createBlankItem(kind)]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          Positionen ({items.length})
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => addItem('time')}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-2.5 text-[10px] font-bold uppercase tracking-widest text-ink transition-all hover:border-blue-400 hover:bg-blue-500/5"
          >
            <Clock size={12} /> + Zeit
          </button>
          <button
            type="button"
            onClick={() => addItem('flat')}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-2.5 text-[10px] font-bold uppercase tracking-widest text-ink transition-all hover:border-violet-400 hover:bg-violet-500/5"
          >
            <Package size={12} /> + Pauschal
          </button>
          <button
            type="button"
            onClick={() => addItem('discount')}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-paper px-2.5 text-[10px] font-bold uppercase tracking-widest text-ink transition-all hover:border-amber-400 hover:bg-amber-500/5"
          >
            <Percent size={12} /> + Rabatt
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-divider bg-surface/50 p-6 text-center">
          <Plus size={20} className="text-muted/60" />
          <div className="text-[11px] text-muted">
            Noch keine Positionen — füge Zeit-Einträge, Pauschalposten oder Rabatte hinzu.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it, i) => {
            const kind: InvoiceItemKind = it.kind ?? (it.unit === 'h' ? 'time' : 'flat');
            const meta = KIND_META[kind];
            const Icon = meta.Icon;
            return (
              <div
                key={i}
                className={`group rounded-md border border-l-4 border-divider bg-paper/60 px-3 py-2.5 transition-colors hover:border-ink/30 ${meta.className}`}
              >
                {/* Zeile 1: Typ + Beschreibung + Aktionen */}
                <div className="mb-2 flex items-center gap-2">
                  <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${meta.chipClass}`}>
                    <Icon size={10} />
                    {meta.label}
                  </span>
                  <input
                    type="text"
                    value={it.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    placeholder="Beschreibung dieser Position"
                    className="h-8 min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 text-[13px] text-ink placeholder:text-muted/60 outline-none focus:border-divider focus:bg-paper"
                  />
                  <div className="flex flex-shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveItem(i, -1); }}
                      disabled={i === 0}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-divider hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                      title="Nach oben"
                      aria-label="Position nach oben"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveItem(i, 1); }}
                      disabled={i === items.length - 1}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-divider hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                      title="Nach unten"
                      aria-label="Position nach unten"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeItem(i); }}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-200"
                      title="Position entfernen"
                      aria-label="Position entfernen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Zeile 2: Menge — Einheit — €/Einheit — Gesamt */}
                {(() => {
                  const isDiscountPercent = kind === 'discount' && it.unit === '%';
                  const priceLabel = kind === 'discount' && it.unit === '%' ? 'Rabatt %' : '€ / Einheit';
                  return (
                    <div className="grid grid-cols-12 items-center gap-2">
                      <div className="col-span-3 flex flex-col">
                        <label className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-muted/70">
                          Menge {isDiscountPercent && <span className="text-muted/50">· auto</span>}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={it.quantity}
                          onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                          readOnly={isDiscountPercent}
                          title={isDiscountPercent ? 'Wird automatisch aus dem Prozentbetrag abgeleitet.' : undefined}
                          className={`h-9 w-full rounded border px-2 text-right text-[13px] outline-none tabular-nums ${
                            isDiscountPercent
                              ? 'cursor-not-allowed border-divider/40 bg-paper/30 text-muted'
                              : 'border-divider bg-paper text-ink focus:border-accent'
                          }`}
                        />
                      </div>
                      <div className="col-span-2 flex flex-col">
                        <label className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-muted/70">Einheit</label>
                        {kind === 'discount' ? (
                          <div className="flex h-9 w-full overflow-hidden rounded border border-divider bg-paper">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateItem(i, { unit: '%' }); }}
                              className={`flex flex-1 cursor-pointer items-center justify-center text-[13px] font-bold transition-colors ${
                                it.unit === '%' ? 'bg-ink text-paper' : 'text-muted hover:text-ink hover:bg-divider/40'
                              }`}
                              aria-label="Einheit Prozent"
                            >
                              %
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); updateItem(i, { unit: '€' }); }}
                              className={`flex flex-1 cursor-pointer items-center justify-center text-[13px] font-bold transition-colors ${
                                it.unit === '€' ? 'bg-ink text-paper' : 'text-muted hover:text-ink hover:bg-divider/40'
                              }`}
                              aria-label="Einheit Euro"
                            >
                              €
                            </button>
                          </div>
                        ) : (
                          <div className="flex h-9 items-center justify-center rounded border border-divider/40 bg-paper/40 px-2 text-[13px] text-muted">
                            {it.unit}
                          </div>
                        )}
                      </div>
                      <div className="col-span-3 flex flex-col">
                        <label className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-muted/70">{priceLabel}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={it.unitPrice}
                          onChange={(e) => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                          className="h-9 w-full rounded border border-divider bg-paper px-2 text-right text-[13px] text-ink outline-none focus:border-accent tabular-nums"
                          placeholder={isDiscountPercent ? '-5' : ''}
                        />
                      </div>
                      <div className="col-span-4 flex flex-col">
                        <label className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-muted/70">Gesamt</label>
                        <div className={`flex h-9 items-center justify-end rounded border border-divider bg-surface/60 px-3 text-[14px] font-bold tabular-nums ${it.total < 0 ? 'text-amber-300' : 'text-ink'}`}>
                          {fmtEuro(it.total)}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Zwischensumme-Footer */}
          <div className="mt-1 flex items-center justify-between rounded-md border border-divider bg-surface/60 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">
              <GripVertical size={11} className="opacity-40" />
              {items.length} Position{items.length === 1 ? '' : 'en'}
            </div>
            <div className="flex items-baseline gap-3 text-[11px] uppercase tracking-widest text-muted">
              <span>Zwischensumme</span>
              <span className="font-display text-base font-bold tabular-nums text-ink">{fmtEuro(subtotal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
