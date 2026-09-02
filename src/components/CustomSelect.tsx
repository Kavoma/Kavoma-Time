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
      <label htmlFor={id} className="mb-2 kv-label">
        {label}
      </label>
      <select 
        id={id}
        value={value}
        onChange={(e) => {
          // Über die Option zurücksuchen statt zu casten: `Number('0') || '0'`
          // ergab für die Option mit der id 0 den String '0' — die Auswahl
          // „Ohne Projekt" wäre damit nie als Zahl angekommen.
          const picked = options.find(o => String(o.id) === e.target.value);
          onChange(picked ? picked.id : e.target.value);
        }}
        className="kv-input font-semibold"
      >
        {options.map(opt => (
          <option key={opt.id} value={opt.id}>{opt.name}</option>
        ))}
      </select>
    </div>
  );
}
