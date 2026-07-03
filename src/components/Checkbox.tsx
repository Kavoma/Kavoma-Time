import React from 'react';
import { motion } from 'framer-motion';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
}) => {
  return (
    <label className={`flex cursor-pointer select-none items-center gap-3 text-[12px] leading-relaxed text-muted ${disabled ? 'cursor-not-allowed opacity-40' : ''} ${className}`}>
      <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {/* Hidden native input for standard form/keyboard/screen-reader behavior */}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="peer sr-only"
        />
        
        {/* Visible custom checkbox container */}
        <motion.div
          animate={{
            backgroundColor: checked ? 'var(--color-ink)' : 'var(--color-paper)',
            borderColor: checked ? 'var(--color-ink)' : 'var(--color-divider)',
          }}
          transition={{ duration: 0.15 }}
          className="flex h-5 w-5 items-center justify-center rounded-[4px] border-2 border-divider transition-shadow duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface peer-hover:border-ink/60"
        >
          {/* Animated SVG Checkmark */}
          {checked && (
            <svg
              className="h-3 w-3 text-paper"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                d="M2.5 6L5 8.5L9.5 3.5"
              />
            </svg>
          )}
        </motion.div>
      </div>
      {label && <span className="text-ink">{label}</span>}
    </label>
  );
};
