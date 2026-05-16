import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DatePickerProps {
  value: string; // ISO Date YYYY-MM-DD
  onChange: (date: string) => void;
  label?: string;
  className?: string;
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function DatePicker({ value, onChange, label, className = '' }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Internal state for navigating the calendar (independent of selected value)
  const [viewDate, setViewDate] = useState(() => {
    if (!value) return new Date();
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  });
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset calendar view to selected date when opening
  useEffect(() => {
    if (isOpen && value) {
      const [year, month, day] = value.split('-').map(Number);
      setViewDate(new Date(year, month - 1, day));
    }
  }, [isOpen, value]);

  const selectedDate = value ? (() => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  })() : null;
  
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Adjust for Monday start
  };

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleDateClick = (day: number) => {
    const date = new Date(currentYear, currentMonth, day);
    const isoString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    onChange(isoString);
    setIsOpen(false);
  };

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
  };

  const isSelected = (day: number) => {
    return selectedDate?.getDate() === day && selectedDate?.getMonth() === currentMonth && selectedDate?.getFullYear() === currentYear;
  };

  // Generate calendar grid
  const days = [];
  const firstDay = firstDayOfMonth(currentYear, currentMonth);
  const totalDays = daysInMonth(currentYear, currentMonth);

  // Padding for previous month
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
  }

  // Days of current month
  for (let i = 1; i <= totalDays; i++) {
    days.push(
      <button
        key={i}
        type="button"
        onClick={() => handleDateClick(i)}
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[11px] font-bold transition-all
          ${isSelected(i) 
            ? 'bg-accent text-paper shadow-lg shadow-accent/20' 
            : isToday(i) 
              ? 'bg-accent/10 text-accent ring-1 ring-accent/30' 
              : 'text-ink hover:bg-divider'
          }`}
      >
        {i}
      </button>
    );
  }

  return (
    <div className={`flex flex-col ${className}`} ref={containerRef}>
      {label && <label className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{label}</label>}
      
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-11 w-full items-center justify-between rounded-md border border-divider bg-paper px-3 text-sm font-bold text-ink outline-none transition-colors focus:border-accent"
        >
          <span className="tabular-nums">
            {selectedDate ? selectedDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Datum wählen'}
          </span>
          <CalendarIcon size={14} className="text-muted" />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.1 }}
              className="absolute left-0 top-[calc(100%+8px)] z-[100] w-[260px] rounded-lg border border-divider bg-surface p-3 shadow-2xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <button 
                  type="button" 
                  onClick={handlePrevMonth}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-paper text-muted hover:text-ink border border-divider"
                >
                  <ChevronLeft size={14} />
                </button>
                <div className="text-[11px] font-black uppercase tracking-wider text-ink">
                  {MONTHS[currentMonth]} {currentYear}
                </div>
                <button 
                  type="button" 
                  onClick={handleNextMonth}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-paper text-muted hover:text-ink border border-divider"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS_SHORT.map(d => (
                  <div key={d} className="flex h-6 w-8 items-center justify-center text-[9px] font-bold uppercase text-muted/60">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days}
              </div>

              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  onChange(iso);
                  setIsOpen(false);
                }}
                className="mt-3 w-full rounded-md bg-paper py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted hover:text-ink border border-divider transition-colors"
              >
                Heute
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
