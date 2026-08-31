import { useState, useEffect, useRef } from 'react';
import { Settings, Clock, BarChart3, Users, FolderKanban, Wallet, Database, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { TrackerView } from './views/TrackerView';
import { CustomersView } from './views/CustomersView';
import { ProjectsView } from './views/ProjectsView';
import { SettingsView } from './views/SettingsView';
import { StatisticsView } from './views/StatisticsView';
import { FinanceView, type FinanceNavIntent } from './views/FinanceView';
import { useAppState } from './state/AppStateContext';
import { Tooltip } from './components/Tooltip';
import { TitleBar } from './components/TitleBar';
import { EncryptionBanner } from './components/EncryptionBanner';
import { OnboardingModal } from './components/OnboardingModal';
import { LegalModal } from './components/LegalModal';
import { AfkPauseModal } from './components/AfkPauseModal';
import { LongRunModal } from './components/LongRunModal';
import { applyPause, runTimerCommand } from './utils/timerActions';
import { getLiveDurationSeconds } from './utils/trackerTimer';
import type { DetectedPause } from './types';
import { ApproveLinkModal, type LinkAnfrage } from './components/sync/ApproveLinkModal';

/** Ab dieser Laufzeit wird nachgefragt, ob das Stoppen vergessen wurde. */
const LONG_RUN_THRESHOLD_SECONDS = 12 * 3600;

/** Reihenfolge für Cmd+1…6 und das Drei-Finger-Wischen. */
const VIEW_ORDER: ViewKey[] = ['tracker', 'projects', 'customers', 'statistics', 'finance', 'settings'];

export type ViewKey = 'tracker' | 'customers' | 'projects' | 'statistics' | 'finance' | 'settings';

// Ephemere Navigations-Absicht für Cross-View-Sprünge (z. B. Vertrags-Chip
// in der Kundenliste → Finanzen-Tab → Verträge mit Kundenfilter, oder
// Rechnung im Kunden-Drawer → Finanzen → Rechnungs-Drawer).
// Bewusst NICHT im AppState, weil sie nicht persistiert werden darf.
export interface NavIntent {
  view: ViewKey;
  finance?: FinanceNavIntent;
  /** Öffnet beim Ankommen in CustomersView direkt den Detail-Drawer dieses Kunden. */
  customerId?: number;
  /** Öffnet beim Ankommen in ProjectsView direkt den Detail-Drawer dieses Projekts. */
  projectId?: number;
}

// Montag dieser Woche (00:00)
function startOfThisWeek(): number {
  const d = new Date();
  const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Mo
  d.setDate(d.getDate() - dayOfWeek);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatHM(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function App() {
  const [activeView, setActiveView] = useState<ViewKey>('tracker');
  const [navIntent, setNavIntent] = useState<NavIntent | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Sidebar / Hotkey-Navigation cleart immer den Intent, damit alte
  // Cross-View-Filter nicht versehentlich wieder triggern.
  const navigateTo = (view: ViewKey, intent?: NavIntent) => {
    setActiveView(view);
    setNavIntent(intent ?? null);
  };

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const fn = window.api?.getOnboardingCompleted;
    if (typeof fn !== 'function') {
      setNeedsOnboarding(true);
      return;
    }
    fn()
      .then((done) => setNeedsOnboarding(!done))
      .catch((err) => {
        console.error('getOnboardingCompleted failed:', err);
        setNeedsOnboarding(true);
      });
  }, []);

  // Keyboard shortcuts: Ctrl+1 to Ctrl+6 for view navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 6) {
          e.preventDefault();
          navigateTo(VIEW_ORDER[num - 1]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // macOS-Menu "Kavoma Time > Einstellungen..." (Cmd+,) springt in die Settings.
  useEffect(() => {
    return window.api?.onNavigateToView((view) => {
      navigateTo(view as ViewKey);
    });
  }, []);

  // Drei-Finger-Wischen blättert durch dieselbe Reihenfolge wie Cmd+1…6.
  // An den Enden passiert nichts — Umlaufen würde das Gefühl für die
  // Reihenfolge zerstören.
  useEffect(() => {
    return window.api?.onViewSwipe?.((direction) => {
      setActiveView(prev => {
        const index = VIEW_ORDER.indexOf(prev);
        const next = direction === 'left' ? index + 1 : index - 1;
        if (index < 0 || next < 0 || next >= VIEW_ORDER.length) return prev;
        return VIEW_ORDER[next];
      });
      setNavIntent(null);
    });
  }, []);

  const { state, setState, isRestoring, restoreNonce } = useAppState();

  // === Verbindungsanfrage eines anderen Geräts ===
  // Gehört bewusst hierher und nicht in die Einstellungen: Wer ein zweites
  // Gerät einrichtet, steht davor und wartet — er soll nicht erst im richtigen
  // Menü sein müssen.
  const [linkAnfrage, setLinkAnfrage] = useState<LinkAnfrage | null>(null);

  useEffect(() => {
    return window.api?.onSyncLinkRequest?.(setLinkAnfrage);
  }, []);

  // === Erkannte Abwesenheit ===
  const [pendingPause, setPendingPause] = useState<DetectedPause | null>(null);

  useEffect(() => {
    if (!window.api) return;
    // Beim Start nachfragen: Eine Pause kann erkannt worden sein, bevor der
    // Renderer überhaupt zuhören konnte.
    window.api.getPendingAfkPause?.().then(setPendingPause).catch(() => {});
    return window.api.onAfkPauseDetected?.(setPendingPause);
  }, []);

  const resolvePause = () => {
    setPendingPause(null);
    window.api?.resolveAfkPause?.().catch(() => {});
  };

  const handleSubtractPause = (continueRunning: boolean) => {
    if (pendingPause) {
      const pause = pendingPause;
      setState(s => s ? applyPause(s, pause, continueRunning) : null);
    }
    resolvePause();
  };

  // === Vergessen zu stoppen ===
  const [longRunSeconds, setLongRunSeconds] = useState<number | null>(null);
  // Pro Erfassung nur einmal nachfragen — sonst nervt es bei jedem Fensterwechsel.
  const dismissedLongRunRef = useRef<number | null>(null);
  // Der Prüf-Callback hängt an Timer und Fokus-Ereignissen und würde sonst den
  // Zustand des ersten Renders festhalten.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const check = () => {
      const s = stateRef.current;
      if (!s?.isRunning || !s.sessionStartedAt) {
        setLongRunSeconds(null);
        return;
      }
      if (dismissedLongRunRef.current === s.sessionStartedAt) return;
      const elapsed = getLiveDurationSeconds({
        isRunning: s.isRunning,
        startedAt: s.startedAt,
        elapsedBefore: s.elapsedBefore,
      });
      setLongRunSeconds(elapsed >= LONG_RUN_THRESHOLD_SECONDS ? elapsed : null);
    };

    check();
    // Beim Zurückkommen ans Fenster fällt es am ehesten auf — die Schwelle kann
    // aber auch reißen, während die App offen daneben steht.
    const interval = setInterval(check, 5 * 60 * 1000);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', check);
    };
  }, [state?.isRunning, state?.sessionStartedAt]);

  const dismissLongRun = () => {
    dismissedLongRunRef.current = stateRef.current?.sessionStartedAt ?? null;
    setLongRunSeconds(null);
  };

  const handleStopLongRun = () => {
    setState(s => s ? runTimerCommand(s, 'stop') : null);
    setLongRunSeconds(null);
  };

  const navItems: { id: ViewKey; label: string; icon: typeof Clock }[] = [
    { id: 'tracker', label: 'Tracker', icon: Clock },
    { id: 'projects', label: 'Projekte', icon: FolderKanban },
    { id: 'customers', label: 'Kunden', icon: Users },
    { id: 'statistics', label: 'Statistik', icon: BarChart3 },
    { id: 'finance', label: 'Finanzen', icon: Wallet },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
  ];

  // Wochenstunden berechnen
  const weekStart = startOfThisWeek();
  const weekSeconds = (state?.entries ?? [])
    .filter(e => e.startedAt >= weekStart)
    .reduce((sum, e) => sum + e.durationSeconds, 0);
  const weekHours = weekSeconds / 3600;
  const targetHours = state?.weeklyTargetHours ?? 40;

  // Zusätzliche Metriken für Usability
  const remainingSeconds = Math.max(0, (targetHours * 3600) - weekSeconds);
  const percentComplete = Math.min(100, Math.round((weekSeconds / (targetHours * 3600)) * 100));

  // Restliche Tage in der Woche (inkl. heute)
  const today = new Date().getDay(); // 0 = So, 1 = Mo, ..., 6 = Sa
  const remainingDaysInWeek = today === 0 ? 0 : 7 - (today - 1); // Sehr simple Schätzung
  const dailyTargetHours = remainingDaysInWeek > 0 ? (remainingSeconds / 3600) / remainingDaysInWeek : 0;

  return (
    <div className={`app ${isSidebarCollapsed ? 'collapsed' : ''}`}>
      <TitleBar />
      <EncryptionBanner />
      <OnboardingModal
        open={needsOnboarding}
        onComplete={() => setNeedsOnboarding(false)}
        onOpenPrivacy={() => setShowPrivacy(true)}
      />
      <LegalModal open={showPrivacy} initial="privacy" onClose={() => setShowPrivacy(false)} />
      <AfkPauseModal
        pause={pendingPause}
        onSubtract={handleSubtractPause}
        onKeep={resolvePause}
      />
      <ApproveLinkModal anfrage={linkAnfrage} onClose={() => setLinkAnfrage(null)} />
      <LongRunModal
        seconds={longRunSeconds}
        onStop={handleStopLongRun}
        onKeepRunning={dismissLongRun}
      />
      <div className="app-content">
        <aside className={`flex flex-col gap-8 border-r border-divider bg-paper p-8 transition-all duration-300 ${isSidebarCollapsed ? 'px-4' : 'p-8'}`}>
          <nav className="flex flex-col gap-px">
            <div className={`mb-3 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
              {!isSidebarCollapsed && (
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Navigation
                </div>
              )}
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="flex cursor-pointer items-center justify-center text-muted/60 hover:text-ink transition-all hover:scale-110 active:scale-95"
                aria-label={isSidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
                aria-expanded={!isSidebarCollapsed}
              >
                <Tooltip content={isSidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"} position="right">
                  <div className="flex items-center justify-center p-1">
                    {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                  </div>
                </Tooltip>
              </button>
            </div>
            {navItems.map(item => {
              const isActive = activeView === item.id;
              const Icon = item.icon;
              return (
                <Tooltip key={item.id} content={isSidebarCollapsed ? item.label : ''} position="right">
                  <button
                    onClick={() => navigateTo(item.id)}
                    tabIndex={0}
                    className={`group relative flex cursor-pointer items-center rounded-md px-4 py-3 text-left text-xs font-bold uppercase tracking-widest transition-all duration-300 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3'} ${isActive ? 'bg-surface text-ink' : 'text-muted hover:bg-surface hover:text-ink'
                      }`}
                  >
                    <div className={`flex items-center justify-center transition-transform duration-300 ${isSidebarCollapsed ? 'scale-110' : 'scale-100'}`}>
                      <Icon size={18} />
                    </div>

                    <AnimatePresence mode="popLayout">
                      {!isSidebarCollapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ duration: 0.2 }}
                          className="whitespace-nowrap overflow-hidden"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {/* Active Indicator Dot for Collapsed Mode */}
                    {isSidebarCollapsed && isActive && (
                      <motion.div
                        layoutId="active-dot"
                        className="absolute left-0 h-4 w-1 rounded-r-full bg-ink"
                      />
                    )}
                  </button>
                </Tooltip>
              )
            })}
          </nav>

          <div className={`mt-auto pt-4 transition-all duration-300 ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
            {!isSidebarCollapsed ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full"
              >
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted flex justify-between items-center">
                  <span>Diese Woche</span>
                  <span className="text-accent">{percentComplete}%</span>
                </div>
                <div className="font-display text-3xl font-bold tabular-nums leading-none">
                  {formatHM(weekSeconds)}
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted whitespace-nowrap">
                    von {targetHours} Std.
                  </div>
                </div>
                <progress max={targetHours} value={weekHours} className="mt-3 w-full"></progress>

                {dailyTargetHours > 0 && (
                  <div className="mt-4 rounded-lg bg-surface/50 p-3 text-[10px] font-bold uppercase tracking-[0.1em] text-muted leading-relaxed whitespace-nowrap overflow-hidden text-ellipsis">
                    Ziel: <span className="text-ink">{dailyTargetHours.toFixed(1)}h</span> / Tag
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="group relative flex flex-col items-center">
                <div className="h-20 w-1 bg-divider rounded-full overflow-hidden relative">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-ink transition-all duration-1000 ease-out"
                    style={{ height: `${percentComplete}%` }}
                  />
                </div>
                <div className="mt-4 text-[10px] font-black uppercase text-muted">
                  {percentComplete}%
                </div>

                {/* Tooltip-like info on hover */}
                <div
                  className="absolute left-12 bottom-0 z-50 hidden group-hover:block group-focus-within:block w-40 rounded-xl bg-surface border border-divider p-4 shadow-2xl"
                  tabIndex={0}
                  role="button"
                  aria-label="Show details"
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted mb-2">Details</div>
                  <div className="font-display text-lg font-bold">{formatHM(weekSeconds)}</div>
                  <div className="text-[10px] text-muted uppercase mt-1">von {targetHours}h</div>
                  <div className="mt-2 h-1 w-full bg-divider rounded-full overflow-hidden">
                    <div className="h-full bg-ink" style={{ width: `${percentComplete}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto overscroll-contain relative px-12 py-12 lg:px-24">
          <div className="mx-auto w-full max-w-6xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeView}-${restoreNonce}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="view-section block"
              >
                {activeView === 'tracker' && <TrackerView />}
                {activeView === 'customers' && (
                  <CustomersView
                    navigateTo={navigateTo}
                    intentCustomerId={navIntent?.view === 'customers' ? navIntent.customerId : undefined}
                    onIntentConsumed={() => setNavIntent(null)}
                  />
                )}
                {activeView === 'projects' && (
                  <ProjectsView
                    navigateTo={navigateTo}
                    intentProjectId={navIntent?.view === 'projects' ? navIntent.projectId : undefined}
                    onIntentConsumed={() => setNavIntent(null)}
                  />
                )}
                {activeView === 'statistics' && <StatisticsView />}
                {activeView === 'finance' && (
                  <FinanceView
                    intent={navIntent?.view === 'finance' ? navIntent.finance ?? null : null}
                    navigateTo={navigateTo}
                    onIntentConsumed={() => setNavIntent(null)}
                  />
                )}
                {activeView === 'settings' && <SettingsView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {isRestoring && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 20, stiffness: 100 }}
              className="flex flex-col items-center gap-8"
            >
              <div className="relative flex h-20 w-20 items-center justify-center">
                {/* Single Clean Ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 rounded-full border-2 border-divider border-t-accent"
                />
                {/* Icon */}
                <div className="relative z-10 text-accent">
                  <Database size={28} strokeWidth={1.5} />
                </div>
              </div>

              <div className="text-center">
                <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
                  Daten werden wiederhergestellt
                </h2>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Einen Moment bitte…
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
