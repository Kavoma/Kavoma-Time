import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface SettingsCardProps {
  icon: LucideIcon;
  title: string;
  /** Optional rechts neben Titel (z. B. Status-Badge, Counter). */
  headerAside?: React.ReactNode;
  /** Akzent-Variante für Danger-Zone. */
  tone?: 'default' | 'danger';
  children: React.ReactNode;
  /** Wenn true, wird kein Body-Padding gesetzt — der Aufrufer rendert direkt unter den Header (z. B. für ganz-Card-Buttons). */
  bare?: boolean;
}

/**
 * Gemeinsame Hülle für alle Settings-Sektionen. Ersetzt das 10× kopierte
 * div.rounded-lg.border.bg-surface { header + content }-Muster.
 */
export const SettingsCard: React.FC<SettingsCardProps> = ({
  icon: Icon,
  title,
  headerAside,
  tone = 'default',
  children,
  bare = false,
}) => {
  const isDanger = tone === 'danger';
  return (
    <section
      className={`rounded-lg border ${isDanger ? 'border-danger-line bg-danger-soft' : 'border-divider bg-surface'}`}
    >
      <header
        className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${isDanger ? 'border-danger-line' : 'border-divider'}`}
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className={isDanger ? 'text-danger' : 'text-muted'} aria-hidden="true" />
          <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDanger ? 'text-danger' : 'text-muted'}`}>
            {title}
          </span>
        </div>
        {headerAside}
      </header>
      <div className={bare ? '' : 'p-4'}>{children}</div>
    </section>
  );
};
