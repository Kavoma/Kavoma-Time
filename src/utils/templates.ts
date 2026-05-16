// Phase 1.5 — Pure Functions für Rechnungs-Vorlagen.
// Keine Side-Effects, kein Date.now()-Zugriff bei Pure-Helpers — der
// Aufrufer übergibt explizit das aktuelle now-Timestamp, damit die
// Funktionen testbar bleiben.

import type { Invoice, InvoiceTemplate, InvoiceItem, InvoiceItemKind } from '../types';

export interface TemplateDraft {
  customerId?: number;
  projectId?: number;
  items: InvoiceItem[];
  serviceType: string;
  notes: string;
  dueDays: number;
}

/**
 * Übersetzt eine Vorlage in das Formular-State-Shape eines neuen Rechnungs-
 * Entwurfs. Items werden geklont, damit nachträgliche Änderungen im Modal
 * nicht auf die Vorlage zurückwirken.
 */
export function applyTemplate(template: InvoiceTemplate): TemplateDraft {
  return {
    customerId: template.customerId,
    projectId: template.projectId,
    items: template.items.map((it) => ({ ...it })),
    serviceType: template.serviceType,
    notes: template.notes,
    dueDays: template.dueDays,
  };
}

/**
 * Speichert den aktuellen Modal-Stand als neue Vorlage. Bestehende IDs
 * aus dem Aufrufer werden nicht verwendet — wir generieren immer eine
 * neue String-ID (Date.now im Aufrufer), damit Templates frei kopierbar
 * bleiben.
 */
export function templateFromInvoice(params: {
  id: string;
  name: string;
  serviceType: string;
  notes: string;
  dueDays: number;
  items: InvoiceItem[];
  customerId?: number;
  projectId?: number;
  createdAt: number;
}): InvoiceTemplate {
  return {
    id: params.id,
    name: params.name.trim(),
    customerId: params.customerId,
    projectId: params.projectId,
    items: params.items.map((it) => ({ ...it })),
    serviceType: params.serviceType,
    notes: params.notes,
    dueDays: params.dueDays,
    createdAt: params.createdAt,
  };
}

/**
 * Hilfs-Factory für ein neues Item beim "+ Zeit/Pauschal/Rabatt"-Klick
 * in der Positions-Tabelle.
 */
export function createBlankItem(kind: InvoiceItemKind): InvoiceItem {
  if (kind === 'time') {
    return { description: '', quantity: 1, unit: 'h', unitPrice: 0, total: 0, kind: 'time' };
  }
  if (kind === 'discount') {
    // Bei Prozent-Rabatt spiegelt quantity den Betrag (Math.abs(unitPrice))
    // — siehe Sync-Logik in InvoiceItemsTable.updateItem.
    return { description: 'Rabatt', quantity: 5, unit: '%', unitPrice: -5, total: 0, kind: 'discount' };
  }
  return { description: '', quantity: 1, unit: 'Pauschal', unitPrice: 0, total: 0, kind: 'flat' };
}

/**
 * Erkennt den Mode einer Rechnung aus ihren Items. Nur 'time' → 'hourly',
 * nur 'flat' → 'fixed', sonst 'mixed'.
 */
export function inferInvoiceMode(items: InvoiceItem[]): Invoice['mode'] {
  const kinds = new Set(items.map((it) => it.kind ?? (it.unit === 'h' ? 'time' : 'flat')));
  if (kinds.size === 0) return 'fixed';
  if (kinds.size === 1) {
    const only = [...kinds][0];
    if (only === 'time') return 'hourly';
    if (only === 'flat') return 'fixed';
  }
  return 'mixed';
}

/**
 * Berechnet die Summen aus einer Liste freier Items. Rabatte (kind='discount')
 * werden im total bereits negativ erwartet, müssen aber bei der Subtotal-
 * Bildung korrekt subtrahiert werden — was hier automatisch passiert,
 * weil discount.total < 0.
 */
export function computeTotals(items: InvoiceItem[], vatRate: number) {
  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    vatAmount: Number(vatAmount.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

/**
 * Berechnet `total` aus quantity * unitPrice für ein einzelnes Item.
 * Bei Rabatt-Items mit unit='%' wird unitPrice als Prozentsatz auf das
 * angegebene `baseSubtotal` bezogen — der Aufrufer muss den Basiswert
 * übergeben, weil ein einzelnes Item ihn nicht kennt.
 */
export function recalcItemTotal(item: InvoiceItem, baseSubtotal: number): number {
  if (item.kind === 'discount' && item.unit === '%') {
    return Number((baseSubtotal * (item.unitPrice / 100)).toFixed(2));
  }
  return Number((item.quantity * item.unitPrice).toFixed(2));
}
