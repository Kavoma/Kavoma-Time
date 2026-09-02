import type { LucideIcon } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface SegmentOption<T extends string> {
  value: T;
  /** Sichtbare Beschriftung. Fehlt sie, trägt das Symbol allein. */
  label?: string;
  icon?: LucideIcon;
  /** Pflicht, wenn kein `label` gesetzt ist. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (next: T) => void;
  /** Benennt die Gruppe für Screenreader, z. B. „Ansicht". */
  ariaLabel: string;
}

/**
 * Eine Auswahl aus wenigen Möglichkeiten — der Ansichtsumschalter ist der
 * Hauptfall.
 *
 * Der Schalter als Ganzes ist `--kv-h-control` hoch und steht damit auf der
 * Linie der Werkzeugleiste. Ein einzelnes Segment ist bewusst kleiner: Es
 * ist keine freistehende Symbolschaltfläche, sondern ein Teil von einer.
 */
export function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="kv-segmented">
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = opt.value === value;
        const name = opt.ariaLabel ?? opt.label ?? opt.value;
        const button = (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.label ? undefined : name}
            onClick={() => onChange(opt.value)}
            className="kv-segment"
          >
            {Icon && <Icon size={13} aria-hidden="true" />}
            {opt.label}
          </button>
        );
        // Trägt das Symbol allein, braucht es einen sichtbaren Hinweis —
        // ein zugänglicher Name hilft nur, wer einen Screenreader nutzt.
        return opt.label
          ? button
          : <Tooltip key={opt.value} content={name}>{button}</Tooltip>;
      })}
    </div>
  );
}
