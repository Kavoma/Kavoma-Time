import React, { useState, useEffect, useRef } from 'react';

interface CurrencyInputProps {
  value: number | undefined;
  onChange: (val: number | undefined) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  suffix?: string; // e.g., "€" or "€/h"
  autoFocus?: boolean;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  label,
  placeholder,
  className = '',
  suffix = '€',
  autoFocus = false,
}) => {
  const [inputValue, setInputValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial value sync
  useEffect(() => {
    if (value === undefined) {
      setInputValue('');
    } else if (document.activeElement !== inputRef.current) {
      // Format with German locale for the display value
      setInputValue(value.toLocaleString('de-DE', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 2 
      }));
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    // Allow only digits, one comma or dot
    // Replace dots with commas for German preference, but parse as decimal
    val = val.replace(/[^0-9,.]/g, '');
    
    // Ensure only one decimal separator
    const parts = val.split(/[.,]/);
    if (parts.length > 2) return;

    setInputValue(val);

    const parsed = parseFloat(val.replace(',', '.'));
    if (!isNaN(parsed)) {
      onChange(parsed);
    } else if (val === '') {
      onChange(undefined);
    }
  };

  const handleBlur = () => {
    if (value !== undefined) {
      // Final formatting on blur: always 2 decimal places
      setInputValue(value.toLocaleString('de-DE', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      }));
    } else {
      setInputValue('');
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="w-full rounded-md border border-divider bg-paper pl-3 pr-12 py-2.5 text-sm font-bold tabular-nums text-ink outline-none transition-colors focus:border-accent"
        />
        <span className="absolute right-3 text-[11px] font-black uppercase tracking-wider text-muted/60 pointer-events-none">
          {suffix}
        </span>
      </div>
    </div>
  );
};
