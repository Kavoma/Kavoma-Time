import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Kompakter KPI-Block für Drawer-Header. */
export function KpiBox({
  icon: Icon, label, value, tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: 'default' | 'warn' | 'good';
}) {
  const valueClass =
    tone === 'warn' ? 'text-warning' :
    tone === 'good' ? 'text-success' :
    'text-ink';
  const iconClass =
    tone === 'warn' ? 'text-warning' :
    tone === 'good' ? 'text-success' :
    'text-muted';
  return (
    <div className="rounded-md border border-divider bg-paper/40 px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{label}</span>
        <Icon size={11} className={iconClass} />
      </div>
      <div className={`text-sm font-bold tabular-nums leading-tight ${valueClass}`}>{value}</div>
    </div>
  );
}

/** Sektion mit kleiner Überschrift im Drawer-Body. */
export function DrawerSection({
  title, icon: Icon, children,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={11} className="text-muted" />}
        <h4 className="kv-label">{title}</h4>
      </div>
      {children}
    </div>
  );
}

/** Label-Value-Paar mit Icon, für Read-Mode Stammdaten. */
export function DrawerField({
  icon: Icon, label, children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-muted">
        <Icon size={9} />{label}
      </dt>
      <dd className="text-ink/90">{children}</dd>
    </div>
  );
}

/** Standard-Text-Input für Edit-Mode. */
export function DrawerInput({
  label, value, onChange, placeholder, type = 'text', tabular,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  tabular?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <label className="mb-2 kv-label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-10 rounded-md border border-divider bg-paper px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent ${tabular ? 'tabular-nums' : ''}`}
      />
    </div>
  );
}
