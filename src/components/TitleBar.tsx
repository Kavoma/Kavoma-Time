import React from 'react';

export const TitleBar: React.FC = () => {
  return (
    <header className="drag-region relative z-[10000] flex h-10 w-full items-center justify-between bg-paper px-6 select-none">
      <div className="flex items-center gap-3">
        {/* Subtle Logo Icon */}
        <div className="flex h-4 w-4 items-center justify-center rounded-[4px] bg-ink text-[8px] font-black text-paper leading-none">
          K
        </div>
        {/* App Title */}
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted/80">
          Kavoma Time
        </span>
      </div>

      {/* 
        Space for Windows Controls 
        (The bottom border is now handled by the content container 
        to ensure it spans the full width without clipping).
      */}
      <div className="no-drag h-full w-[140px]" />
    </header>
  );
};
