import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from '../Tooltip';

interface InfoTooltipProps {
  children: React.ReactNode;
  /** Position relativ zum Icon. Default 'top'. */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Optionales A11y-Label fürs Trigger-Icon. */
  ariaLabel?: string;
}

/**
 * Kleines (i)-Icon mit Rich-Tooltip — entkoppelt Erklärtexte vom Inline-Layout.
 * Hover öffnet, Click pinnt offen (bis Outside-Click oder Esc).
 */
export const InfoTooltip: React.FC<InfoTooltipProps> = ({ children, position = 'top', ariaLabel = 'Weitere Informationen' }) => {
  return (
    <Tooltip variant="rich" trigger="hover-click" position={position} content={children}>
      <button
        type="button"
        aria-label={ariaLabel}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      >
        <Info size={13} aria-hidden="true" />
      </button>
    </Tooltip>
  );
};
