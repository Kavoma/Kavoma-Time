import { Search, X } from 'lucide-react';

interface SearchFieldProps {
  value: string;
  onChange: (next: string) => void;
  /**
   * Nennt den Bereich, den die Suche filtert — „Kunden durchsuchen", nicht
   * „Suchen". Die Suche ist immer lokal: Sie filtert die sichtbare
   * Sammlung, nie den ganzen Datenbestand.
   */
  placeholder: string;
  /** Zugänglicher Name, falls der Platzhalter allein nicht reicht. */
  ariaLabel?: string;
}

/**
 * Lokale Suche einer Sammlung.
 *
 * Ersetzt das fünffach kopierte Muster aus absolut positionierter Lupe und
 * `!pl-9` am Eingabefeld. Die Suche ist in allen Listen die häufigste
 * Handlung und bekommt deshalb den freien Platz in der Werkzeugleiste.
 */
export function SearchField({ value, onChange, placeholder, ariaLabel }: SearchFieldProps) {
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="kv-input !pl-9 pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Suche zurücksetzen"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-divider hover:text-ink"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
