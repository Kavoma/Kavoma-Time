import { LineChart, BarChart3 } from 'lucide-react';

export function AnalyticsTabPlaceholder() {
  return (
    <div className="rounded-lg border border-divider bg-surface p-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-paper text-muted">
        <LineChart size={22} />
      </div>
      <h3 className="font-display text-2xl font-black tracking-tight">Auswertung folgt</h3>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        Umsatz, Ausgaben, Gewinn-/Verlust-Rechnung und Forecasting bekommen
        eigenen Platz, sobald genug Belege erfasst sind.
      </p>
      <p className="mx-auto mt-3 max-w-md text-[12px] leading-relaxed text-muted">
        Bis dahin findest du Umsatz- und Stunden-Statistiken in der Statistik-Ansicht.
      </p>
      <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-divider bg-paper px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
        <BarChart3 size={12} /> Phase 2
      </div>
    </div>
  );
}
