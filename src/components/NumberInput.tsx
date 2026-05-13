import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  placeholder?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  className = '',
  placeholder,
}) => {
  // Use local state for the string representation to allow empty input during typing
  const [inputValue, setInputValue] = useState<string>(String(value));

  // Sync local state when external value changes (e.g., via chevron buttons or external reset)
  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleIncrement = () => {
    const nextValue = value + step;
    if (max !== undefined && nextValue > max) return;
    onChange(nextValue);
  };

  const handleDecrement = () => {
    const nextValue = value - step;
    if (min !== undefined && nextValue < min) return;
    onChange(nextValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow any numeric-like string or empty string
    if (val === '' || /^-?\d*[.,]?\d*$/.test(val)) {
      setInputValue(val);
      
      const parsed = parseFloat(val.replace(',', '.'));
      if (!isNaN(parsed)) {
        onChange(parsed);
      }
    }
  };

  const handleBlur = () => {
    // When leaving the field, if it's empty or invalid, reset to min or value
    const parsed = parseFloat(inputValue.replace(',', '.'));
    if (inputValue === '' || isNaN(parsed)) {
      const fallback = min !== undefined ? min : 0;
      onChange(fallback);
      setInputValue(String(fallback));
    } else {
      // Standardize the display value on blur
      setInputValue(String(parsed));
    }
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="text"
        inputMode="decimal"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full rounded-md border border-divider bg-paper pl-3 pr-10 py-2 text-sm font-bold tabular-nums text-ink outline-none transition-colors focus:border-accent"
      />
      <div className="absolute right-1 flex h-full flex-col justify-center gap-0.5 px-1 py-1">
        <button
          type="button"
          onClick={handleIncrement}
          className="flex flex-1 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-ink transition-colors px-1"
        >
          <ChevronUp size={12} strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={handleDecrement}
          className="flex flex-1 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-ink transition-colors px-1"
        >
          <ChevronDown size={12} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};
