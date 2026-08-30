import React from 'react';

// Die Fenstersteuerung liegt je nach System auf einer anderen Seite:
// macOS zeichnet die Ampel-Buttons links (Position in main.cjs via
// trafficLightPosition), Windows die Minimieren/Maximieren/Schließen-Gruppe
// rechts (titleBarOverlay). Entsprechend muss die Titelleiste auf der jeweils
// belegten Seite Platz frei lassen.
const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin';

export const TitleBar: React.FC = () => {
  return (
    <header
      className={`drag-region relative z-[10000] flex h-10 w-full items-center justify-between bg-paper select-none ${
        isMac ? 'pl-[84px] pr-6' : 'px-6'
      }`}
    >
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
        Platz für die Windows-Fenstersteuerung.
        (Der untere Rand kommt vom Content-Container, damit er über die volle
        Breite läuft, ohne abgeschnitten zu werden.)
        Unter macOS sitzen die Buttons links — hier wird kein Platz gebraucht.
      */}
      {!isMac && <div className="no-drag h-full w-[140px]" />}
    </header>
  );
};
