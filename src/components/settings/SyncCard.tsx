import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Cloud, CloudOff, Laptop, Loader2, RefreshCw, Trash2, Unlock } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import type { SyncStatus } from '../../sync/types';
import { SettingsCard } from './SettingsCard';
import { SyncSetupModal } from '../sync/SyncSetupModal';
import { FirstMergePreview } from '../sync/FirstMergePreview';
import { ApproveLinkModal, type LinkAnfrage } from '../sync/ApproveLinkModal';

type Geraet = { id: string; name: string; platform: string; created_at: string; last_seen_at: string };

const ZUSTAND_TEXT: Record<SyncStatus['state'], { text: string; ton: string }> = {
  off:     { text: 'Nicht eingerichtet', ton: 'text-muted' },
  locked:  { text: 'Gesperrt — Passphrase fehlt', ton: 'text-warning' },
  offline: { text: 'Keine Verbindung', ton: 'text-warning' },
  syncing: { text: 'Gleicht ab…', ton: 'text-accent' },
  synced:  { text: 'Abgeglichen', ton: 'text-success' },
  error:   { text: 'Fehler', ton: 'text-danger' },
};

function relativ(iso: string | number | null): string {
  if (!iso) return 'nie';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'gerade eben';
  if (ms < 3_600_000) return `vor ${Math.floor(ms / 60_000)} Min.`;
  if (ms < 86_400_000) return `vor ${Math.floor(ms / 3_600_000)} Std.`;
  return new Date(iso).toLocaleDateString('de-DE');
}

export function SyncCard() {
  const { state } = useAppState();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [geraete, setGeraete] = useState<Geraet[]>([]);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [erstabgleichOffen, setErstabgleichOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [offeneAnfragen, setOffeneAnfragen] = useState<LinkAnfrage[]>([]);
  const [gewaehlteAnfrage, setGewaehlteAnfrage] = useState<LinkAnfrage | null>(null);

  const geraeteLaden = useCallback(async () => {
    try { setGeraete((await window.api?.syncListDevices()) ?? []); }
    catch { setGeraete([]); }
  }, []);

  useEffect(() => {
    window.api?.syncGetStatus().then(setStatus).catch(() => setStatus(null));
    return window.api?.onSyncStatus?.(setStatus);
  }, []);

  useEffect(() => {
    if (status?.state === 'synced' || status?.state === 'syncing') void geraeteLaden();
  }, [status?.state, geraeteLaden]);

  // Netz für den Fall, dass die Realtime-Meldung nicht ankam — etwa weil die
  // App beim Stellen der Anfrage gerade zu war.
  useEffect(() => {
    if (status?.state !== 'synced') return;
    let abgebrochen = false;
    const laden = () => window.api?.syncListLinks?.()
      .then((l) => { if (!abgebrochen) setOffeneAnfragen(l ?? []); })
      .catch(() => {});
    laden();
    const t = setInterval(laden, 15_000);
    return () => { abgebrochen = true; clearInterval(t); };
  }, [status?.state]);

  // Ohne Electron gibt es keine Synchronisierung — die Karte dann gar nicht zeigen.
  if (!window.api?.syncGetStatus) return null;
  if (!state) return null;

  const zustand = ZUSTAND_TEXT[status?.state ?? 'off'];
  const eingerichtet = status && status.state !== 'off';
  const konflikte = state.syncConflicts ?? [];

  const jetztAbgleichen = async () => {
    setLaeuft(true);
    try { setStatus(await window.api!.syncNow()); } finally { setLaeuft(false); }
  };

  const abmelden = async () => {
    setLaeuft(true);
    try { setStatus(await window.api!.syncSignOut()); setGeraete([]); }
    finally { setLaeuft(false); }
  };

  const geraetAbmelden = async (id: string, name: string) => {
    if (!confirm(`„${name}" abmelden? Das Gerät gleicht dann nicht mehr ab.`)) return;
    await window.api!.syncRevokeDevice(id);
    await geraeteLaden();
  };

  return (
    <>
      <SettingsCard
        icon={eingerichtet ? Cloud : CloudOff}
        title="Geräte-Synchronisierung"
        headerAside={<span className={`text-[10px] font-bold uppercase tracking-wider ${zustand.ton}`}>{zustand.text}</span>}
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-muted">
            Zeiten, Kunden, Projekte und Rechnungen laufen auf allen deinen Geräten zusammen.
            Verschlüsselt wird <strong className="text-ink">vor</strong> dem Hochladen — der Server
            sieht nie Klartext, nur wer wann etwas geändert hat.
          </p>

          {!eingerichtet && (
            <button type="button" onClick={() => setDialogOffen(true)}
              className="flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-xs font-bold text-paper">
              <Cloud size={13} /> Einrichten
            </button>
          )}

          {status?.state === 'locked' && (
            <button type="button" onClick={() => setDialogOffen(true)}
              className="flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-xs font-bold text-paper">
              <Unlock size={13} /> Passphrase eingeben
            </button>
          )}

          {eingerichtet && (
            <>
              <dl className="grid grid-cols-3 gap-3 text-xs">
                <div><dt className="text-[10px] uppercase tracking-wider text-muted">Konto</dt>
                  <dd className="mt-0.5 truncate text-ink" title={status.account ?? ''}>{status.account ?? '—'}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wider text-muted">Letzter Abgleich</dt>
                  <dd className="mt-0.5 text-ink">{relativ(status.lastSyncAt)}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wider text-muted">Ausstehend</dt>
                  <dd className="mt-0.5 tabular-nums text-ink">{status.pendingOps}</dd></div>
              </dl>

              {status.error && (
                <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
                  {status.error}
                </p>
              )}

              {offeneAnfragen.length > 0 && (
                <div className="rounded-md border border-accent/40 bg-accent/[0.06] p-3">
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                    Wartet auf Bestätigung
                  </h4>
                  <ul className="space-y-1">
                    {offeneAnfragen.map((a) => (
                      <li key={a.id} className="flex items-center gap-2">
                        <span className="flex-1 truncate text-xs text-ink">{a.name}</span>
                        <button type="button" onClick={() => setGewaehlteAnfrage(a)}
                          className="rounded-md bg-ink px-3 py-1 text-xs font-bold text-paper">
                          Verbinden
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {geraete.length > 0 && (
                <div>
                  <h4 className="mb-2 kv-label">Angemeldete Geräte</h4>
                  <ul className="space-y-1">
                    {geraete.map((g) => {
                      const dieses = g.id === status.deviceId;
                      return (
                        <li key={g.id} className="flex items-center gap-2 rounded-md border border-divider bg-paper px-3 py-2">
                          <Laptop size={13} className="shrink-0 text-muted" />
                          <span className="flex-1 truncate text-xs text-ink">
                            {g.name}
                            {dieses && <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">dieses Gerät</span>}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted">{relativ(g.last_seen_at)}</span>
                          {!dieses && (
                            <button type="button" onClick={() => geraetAbmelden(g.id, g.name)}
                              className="shrink-0 text-muted transition-colors hover:text-danger" title="Gerät abmelden">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={jetztAbgleichen} disabled={laeuft}
                  className="flex h-9 items-center gap-2 rounded-md border border-divider px-3 text-xs font-bold text-muted transition-colors hover:text-ink disabled:opacity-40">
                  {laeuft ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Jetzt abgleichen
                </button>
                <button type="button" onClick={abmelden} disabled={laeuft}
                  className="flex h-9 items-center rounded-md border border-divider px-3 text-xs font-bold text-muted transition-colors hover:text-danger disabled:opacity-40">
                  Abmelden
                </button>
              </div>
            </>
          )}

          {konflikte.length > 0 && (
            <details className="rounded-md border border-divider bg-paper">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-muted">
                <AlertTriangle size={13} className="text-warning" />
                {konflikte.length} zusammengeführte Änderung{konflikte.length === 1 ? '' : 'en'}
              </summary>
              {/* Stillschweigend zusammenführen wäre bequem und intransparent —
                  wer wissen will, warum etwas anders aussieht, kann es nachlesen. */}
              <ul className="max-h-48 space-y-1 overflow-y-auto border-t border-divider px-3 py-2">
                {[...konflikte].reverse().slice(0, 30).map((k, i) => (
                  <li key={`${k.entityId}-${k.at}-${i}`} className="text-[11px] leading-relaxed text-muted">
                    <span className="text-ink">{k.label}</span> — neuere Fassung übernommen
                    <span className="ml-1 opacity-60">({new Date(k.at).toLocaleString('de-DE')})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </SettingsCard>

      <SyncSetupModal
        open={dialogOffen}
        onClose={() => setDialogOffen(false)}
        onDone={(s) => {
          setStatus(s);
          // Nach dem Entsperren läuft der Abgleich noch nicht — der Motor
          // wartet bewusst. Erst die Vorschau, dann `syncStart()`.
          if (s.state === 'offline') setErstabgleichOffen(true);
          else void geraeteLaden();
        }}
      />

      <ApproveLinkModal anfrage={gewaehlteAnfrage} onClose={() => { setGewaehlteAnfrage(null); void geraeteLaden(); }} />

      <FirstMergePreview
        open={erstabgleichOffen}
        onClose={() => setErstabgleichOffen(false)}
        onSettled={() => {
          window.api?.syncGetStatus().then(setStatus).catch(() => {});
          void geraeteLaden();
        }}
      />
    </>
  );
}
