import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface CustomAutocompleteProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  options: string[];
  placeholder?: string;
  autoFocus?: boolean;
}

import { CustomInput } from './CustomInput';

export function CustomAutocomplete({ 
  id, 
  label, 
  value, 
  onChange, 
  onKeyDown, 
  options, 
  placeholder,
  autoFocus 
}: CustomAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = value.trim() === '' 
    ? options.slice(0, 5)
    : options
        .filter(opt => opt.toLowerCase().includes(value.toLowerCase()))
        .filter(opt => opt.toLowerCase() !== value.toLowerCase()) // Verstecke wenn exakter Match getippt wurde
        .slice(0, 5);

  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  return (
    <div className="relative flex flex-col" ref={containerRef}>
      <CustomInput
        id={id}
        label={label}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          if (!isOpen && options.length > 0) setIsOpen(true);
        }}
        onFocus={() => {
          if (options.length > 0) setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsOpen(false);
          
          if (isOpen && filteredOptions.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex(prev => (prev + 1) % filteredOptions.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
            } else if (e.key === 'Enter' && activeIndex >= 0) {
              e.preventDefault();
              onChange(filteredOptions[activeIndex]);
              setIsOpen(false);
              return;
            }
          }

          if (onKeyDown) onKeyDown(e);
        }}
        placeholder={placeholder}
        autoComplete="off"
      />

      <AnimatePresence>
        {isOpen && filteredOptions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-md border border-divider bg-surface p-1 shadow-2xl shadow-black/50"
          >
            {filteredOptions.map((option, index) => (
              <div
                key={index}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`cursor-pointer rounded-[4px] px-3 py-2 text-sm font-bold tracking-wide transition-colors outline-none ${
                  index === activeIndex ? 'bg-divider text-ink' : 'text-ink hover:bg-divider focus:bg-divider'
                }`}
                tabIndex={-1}
              >
                {option}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
