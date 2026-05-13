import React from 'react';

interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
}

export function CustomInput({ id, label, ...props }: CustomInputProps) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
        {label}
      </label>
      <input 
        id={id}
        type={props.type || 'text'}
        {...props}
        className={`h-11 w-full font-bold placeholder:text-muted ${props.className || ''}`}
      />
    </div>
  );
}
