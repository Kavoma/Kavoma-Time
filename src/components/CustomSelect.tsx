import React from 'react';

interface Option {
  id: number | string;
  name: string;
}

interface CustomSelectProps {
  id: string;
  label: string;
  value: number | string;
  options: Option[];
  onChange: (value: number | string) => void;
}

export function CustomSelect({ id, label, value, options, onChange }: CustomSelectProps) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
        {label}
      </label>
      <select 
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || e.target.value)}
        className="h-11 w-full rounded-md border border-divider bg-paper px-3 text-sm font-bold text-ink outline-none transition-colors focus:border-accent"
      >
        {options.map(opt => (
          <option key={opt.id} value={opt.id}>{opt.name}</option>
        ))}
      </select>
    </div>
  );
}
