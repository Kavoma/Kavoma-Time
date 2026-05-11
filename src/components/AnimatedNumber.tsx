import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

interface Props {
  value: number;
  className?: string;
  format?: 'currency' | 'number' | 'time';
}

export function AnimatedNumber({ value, className, format = 'currency' }: Props) {
  const spring = useSpring(value, {
    mass: 0.8,
    stiffness: 75,
    damping: 15,
  });

  const display = useTransform(spring, (val) => {
    const current = Math.max(0, val);
    if (format === 'currency') {
      return current.toLocaleString('de-DE', { 
        style: 'currency', 
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    if (format === 'time') {
      const h = Math.floor(current / 3600);
      const m = Math.floor((current % 3600) / 60);
      return `${h}:${String(m).padStart(2, '0')}`;
    }
    return current.toLocaleString('de-DE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  });

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span className={className}>{display}</motion.span>;
}
