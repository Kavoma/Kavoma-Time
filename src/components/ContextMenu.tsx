import { ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type ContextMenuItem = 
  | { label: string; icon: ReactNode; onClick: () => void; danger?: boolean; type?: never }
  | { type: 'separator' };

interface ContextMenuProps {
  position: { x: number; y: number } | null;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    if (!position) return;
    const close = () => onClose();
    document.addEventListener('click', close);
    document.addEventListener('contextmenu', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
    };
  }, [position, onClose]);

  return (
    <AnimatePresence mode="wait">
      {position && (
        <motion.div
          key={`ctx-${position.x}-${position.y}`}
          className="fixed z-50 min-w-[160px] kv-overlay p-1.5"
          style={{
            top:  Math.min(position.y, window.innerHeight - items.length * 36 - 16),
            left: Math.min(position.x, window.innerWidth  - 180),
          }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.1, ease: 'easeOut' }}
        >
          {items.map((item, i) => (
            'type' in item && item.type === 'separator' ? (
              <div key={i} className="my-1.5 h-[1px] bg-divider mx-1.5" />
            ) : (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); (item as any).onClick(); onClose(); }}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-divider ${ (item as any).danger ? 'text-danger' : 'text-ink' }`}
              >
                {(item as any).icon}
                {(item as any).label}
              </button>
            )
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
