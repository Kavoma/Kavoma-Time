import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ children, content, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 400); // 400ms delay
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  // Hilfskonstante für die Animation (Gegenrichtung zur Position)
  const offset = 4;
  const initialX = position === 'left' ? offset : position === 'right' ? -offset : 0;
  const initialY = position === 'top' ? offset : position === 'bottom' ? -offset : 0;

  if (!content) return <>{children}</>;

  return (
    <div 
      className="relative inline-flex items-center"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ 
              opacity: 0, 
              scale: 0.9, 
              x: initialX,
              y: initialY,
              // Wir müssen die Transform-Werte von Tailwind berücksichtigen (translateX/translateY)
              // motion überschreibt transform, also nutzen wir x/y für die Feinjustierung
            }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              x: 0,
              y: 0 
            }}
            exit={{ 
              opacity: 0, 
              scale: 0.9 
            }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ position: 'absolute' }}
            className={`z-[10001] px-2.5 py-1.5 bg-paper/95 backdrop-blur-xl border border-divider text-[9px] font-black uppercase tracking-[0.15em] text-ink rounded-md shadow-[0_8px_30px_rgb(0,0,0,0.5)] pointer-events-none whitespace-nowrap ${positionClasses[position]}`}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
