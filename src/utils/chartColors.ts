// ============================================================
// Diagrammfarben aus der Tokenschicht
// ============================================================
// Recharts nimmt Farben als Prop entgegen, nicht als CSS-Klasse. Deshalb
// standen sie bisher als feste Hex-Werte im Quelltext — und wären beim
// Themenwechsel unlesbar geworden, ohne dass irgendetwas gemeldet hätte.
//
// Dieses Modul liest dieselben CSS-Variablen, aus denen auch der Rest der
// Oberfläche seine Farben bezieht. Damit gibt es weiterhin genau eine
// Stelle, an der eine Farbe festgelegt wird: `src/style.css`.

import { useEffect, useState } from 'react';

/** Liest eine CSS-Variable vom Wurzelelement. */
function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export interface ChartColors {
  /** Gitternetz und Achsenlinien. */
  grid: string;
  /** Achsenbeschriftung. */
  axis: string;
  /** Hauptserie — die Zahl, um die es geht. */
  primary: string;
  /** Vergleichsserie. */
  secondary: string;
  /** Fläche hinter Tooltip und Legende. */
  surface: string;
  /** Text im Tooltip. */
  ink: string;
  success: string;
  warning: string;
  danger: string;
  /** Sechs unterscheidbare Töne für kategoriale Aufteilungen. */
  categorical: readonly [string, string, string, string, string, string];
}

/** Einmalige Momentaufnahme — für Stellen ohne React-Kontext. */
export function getChartColors(): ChartColors {
  return {
    grid:      readToken('--color-divider', '#262626'),
    axis:      readToken('--color-muted', '#525252'),
    primary:   readToken('--color-ink', '#ffffff'),
    secondary: readToken('--color-accent', '#a3a3a3'),
    surface:   readToken('--color-overlay', '#171717'),
    ink:       readToken('--color-ink', '#ffffff'),
    success:   readToken('--color-success', '#4ade80'),
    warning:   readToken('--color-warning', '#fbbf24'),
    danger:    readToken('--color-danger', '#f87171'),
    categorical: [
      readToken('--kv-chart-1', '#60a5fa'),
      readToken('--kv-chart-2', '#a78bfa'),
      readToken('--kv-chart-3', '#fbbf24'),
      readToken('--kv-chart-4', '#34d399'),
      readToken('--kv-chart-5', '#f472b6'),
      readToken('--kv-chart-6', '#a3a3a3'),
    ],
  };
}

/**
 * Diagrammfarben, die dem Thema folgen.
 *
 * Beobachtet `data-theme` am `<html>` statt den AppState zu lesen: Das
 * Attribut ist die einzige Wahrheit darüber, welches Thema gerade WIRKT —
 * im Systemmodus entscheidet es das Betriebssystem, nicht die Einstellung.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(getChartColors);

  useEffect(() => {
    const refresh = () => setColors(getChartColors());
    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    // Im Systemmodus wechselt das Thema, ohne dass jemand etwas anklickt.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', refresh);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', refresh);
    };
  }, []);

  return colors;
}
