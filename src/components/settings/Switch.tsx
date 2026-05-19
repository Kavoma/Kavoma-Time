import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** A11y-Label (sr-only). Pflicht, wenn kein visueller Label-Kontext. */
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * A11y-konformer Toggle-Switch. Ersetzt die zwei Varianten in der SettingsView:
 *  - <button role="switch">… (war Auto-Update)
 *  - <input type="checkbox"> + peer-Tailwind (war AFK, Overlay)
 */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, ariaLabel, disabled = false }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-45 ${
        checked ? 'bg-ink' : 'bg-divider'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
};
