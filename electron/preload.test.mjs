import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hier = path.dirname(fileURLToPath(import.meta.url));
const preload = readFileSync(path.join(hier, 'preload.cjs'), 'utf8');

/**
 * Preload-Skripte laufen im Sandbox — seit Electron 20 die Voreinstellung,
 * solange `nodeIntegration` aus ist. Dort kennt `require` nur eine Handvoll
 * eingebauter Module.
 *
 * Ein `require('./irgendwas.cjs')` wirft, das Skript stirbt daran, und
 * `contextBridge.exposeInMainWorld` läuft nie. Das Ergebnis ist heimtückisch:
 * `window.api` bleibt undefiniert, die App fällt still auf ihre Browser-Pfade
 * zurück — leerer Datenstand bei jedem Start, Onboarding immer wieder, keine
 * Backups, keine Synchronisierung. Und keine einzige Fehlermeldung im Terminal.
 *
 * Genau das ist einmal passiert. Deshalb dieser Test.
 */
const IM_SANDBOX_ERLAUBT = ['electron', 'events', 'timers', 'url'];

describe('preload.cjs', () => {
  it('lädt nur Module, die es im Sandbox auch gibt', () => {
    const gefunden = [...preload.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(gefunden.length).toBeGreaterThan(0);   // Absicherung gegen ein kaputtes Suchmuster

    const verboten = gefunden.filter((m) => !IM_SANDBOX_ERLAUBT.includes(m));
    expect(verboten, `Im Sandbox nicht ladbar: ${verboten.join(', ')}`).toEqual([]);
  });

  it('reicht die Brücke an den Renderer durch', () => {
    expect(preload).toMatch(/contextBridge\.exposeInMainWorld\(\s*['"]api['"]/);
  });

  it('holt den Serverstandort über IPC statt per require', () => {
    expect(preload).toContain("ipcRenderer.invoke('sync-get-region')");
  });
});
