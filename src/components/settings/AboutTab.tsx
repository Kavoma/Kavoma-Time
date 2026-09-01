import { useEffect, useState } from 'react';
import { RefreshCw, Power, Info, FileText } from 'lucide-react';
import { SettingsCard } from './SettingsCard';
import { Switch } from './Switch';
import { InfoTooltip } from './InfoTooltip';
import type { UpdateStatus } from '../../types';
import type { LegalDocument } from '../LegalModal';

interface AboutTabProps {
  onOpenLegal: (doc: LegalDocument) => void;
}

export function AboutTab({ onOpenLegal }: AboutTabProps) {
  const [appInfo, setAppInfo] = useState<{ os: string; arch: string; version: string } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(true);

  useEffect(() => {
    const appInfoP = window.api?.getAppInfo?.();
    if (appInfoP?.then) appInfoP.then(setAppInfo).catch(() => undefined);
    const updateStatusP = window.api?.getUpdateStatus?.();
    if (updateStatusP?.then) updateStatusP.then(setUpdateStatus).catch(() => undefined);
    const autoUpdateP = window.api?.getAutoUpdateEnabled?.();
    if (autoUpdateP?.then) autoUpdateP.then(setAutoUpdateEnabled).catch(() => undefined);
    const unsub = window.api?.onUpdateStatus?.(setUpdateStatus);
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);

  const toggleAutoUpdate = async (next: boolean) => {
    setAutoUpdateEnabled(next);
    try {
      await window.api?.setAutoUpdateEnabled?.(next);
    } catch (e) {
      console.error(e);
      setAutoUpdateEnabled(!next);
    }
  };

  const isChecking = updateStatus?.state === 'checking' || updateStatus?.state === 'downloading' || updateStatus?.state === 'available';

  return (
    <div className="flex flex-col gap-6">
      {/* Updates */}
      <SettingsCard icon={RefreshCw} title="Updates">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-ink">Update-Status</div>
            <div className="mt-0.5 text-xs text-muted">{updateStatus?.message ?? 'Bereit'}</div>
            {updateStatus?.error && (
              <div className="mt-1 text-[11px] text-danger">{updateStatus.error}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isChecking}
              onClick={() => window.api?.checkForUpdates?.()}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-divider bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-ink transition-all hover:border-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw size={13} className={isChecking ? 'animate-spin' : ''} />
              Prüfen
            </button>
            {updateStatus?.state === 'downloaded' && (
              <button
                type="button"
                onClick={() => window.api?.installDownloadedUpdate?.()}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-ink bg-ink px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-paper transition-all hover:bg-paper hover:text-ink"
              >
                <Power size={13} />
                Neustart
              </button>
            )}
          </div>
        </div>

        {typeof updateStatus?.progress === 'number' && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper">
            <div
              className="h-full rounded-full bg-ink transition-all"
              style={{ width: `${Math.min(100, Math.max(0, updateStatus.progress))}%` }}
            />
          </div>
        )}

        <div className="mt-4 border-t border-divider pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-bold text-ink">Beim Start automatisch nach Updates suchen</span>
              <InfoTooltip ariaLabel="Datenschutz-Hinweis zu Updates">
                <div className="font-bold mb-1">Was wird übertragen?</div>
                Beim Update-Check kontaktiert die App den GitHub-Release-Server. Dabei werden technisch
                zwangsläufig IP-Adresse, User-Agent (Anwendungs- und Plattform-Kennung) und die aktuelle
                App-Version übertragen — Daten, die GitHub eigenständig verarbeitet.
                {' '}<span className="font-bold">Wenn du diese Option ausschaltest</span>, kannst du Updates jederzeit
                manuell über „Prüfen" anstoßen.
              </InfoTooltip>
            </div>
            <Switch
              checked={autoUpdateEnabled}
              onChange={toggleAutoUpdate}
              ariaLabel="Beim Start automatisch nach Updates suchen"
            />
          </div>
        </div>
      </SettingsCard>

      {/* System */}
      <SettingsCard icon={Info} title="System-Informationen">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted">App-Version</div>
            <div className="text-sm font-bold text-accent tabular-nums">{appInfo?.version || '…'}</div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Betriebssystem</div>
            <div className="text-sm font-bold text-ink">{appInfo?.os || '…'}</div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Architektur</div>
            <div className="text-sm font-bold uppercase text-muted">{appInfo?.arch || '…'} Bit</div>
          </div>
        </div>
      </SettingsCard>

      {/* Rechtliches */}
      <SettingsCard icon={FileText} title="Rechtliches">
        <div className="flex gap-3">
          <button
            onClick={() => onOpenLegal('imprint')}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95"
          >
            <FileText size={14} /> Impressum
          </button>
          <button
            onClick={() => onOpenLegal('privacy')}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-divider bg-paper py-3 text-xs font-bold uppercase tracking-widest text-ink transition-all hover:border-ink hover:bg-surface active:scale-95"
          >
            <FileText size={14} /> Datenschutz
          </button>
        </div>
      </SettingsCard>
    </div>
  );
}
