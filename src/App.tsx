import { useState } from 'react';
import { Settings, Clock, BarChart3, Users, FolderKanban, Download, Database } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { TrackerView } from './views/TrackerView';
import { CustomersView } from './views/CustomersView';
import { ProjectsView } from './views/ProjectsView';
import { SettingsView } from './views/SettingsView';
import { StatisticsView } from './views/StatisticsView';
import { ExportView } from './views/ExportView';
import { useAppState } from './state/AppStateContext';

function renderView(id: string) {
  switch (id) {
    case 'tracker':    return <TrackerView />;
    case 'customers':  return <CustomersView />;
    case 'projects':   return <ProjectsView />;
    case 'statistics': return <StatisticsView />;
    case 'export':     return <ExportView />;
    case 'settings':   return <SettingsView />;
    default:           return null;
  }
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
  const [activeView, setActiveView] = useState('tracker');
  const { state, isRestoring } = useAppState();

  const navItems = [
    { id: 'tracker', label: 'Tracker', icon: Clock },
    { id: 'projects', label: 'Projekte', icon: FolderKanban },
    { id: 'customers', label: 'Kunden', icon: Users },
    { id: 'statistics', label: 'Statistik', icon: BarChart3 },
    { id: 'export', label: 'Export', icon: Download },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
  ];

  // Wochenstunden berechnen
  const weekStart = startOfThisWeek();
  const weekSeconds = (state?.entries ?? [])
    .filter(e => e.startedAt >= weekStart)
    .reduce((sum, e) => sum + e.durationSeconds, 0);
  const weekHours = weekSeconds / 3600;
  const targetHours = state?.weeklyTargetHours ?? 40;

  return (
    <div className="app">
      <aside className="flex flex-col gap-8 border-r border-divider bg-paper p-8">
        <div className="text-xl font-bold uppercase tracking-tight leading-none">
          Kavoma Time
        </div>

        <nav className="flex flex-col gap-px">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Navigation
          </div>
          {navItems.map(item => {
            const isActive = activeView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-md px-4 py-3 text-left text-xs font-bold uppercase tracking-widest transition-colors ${isActive ? 'bg-surface text-ink' : 'text-muted hover:bg-surface hover:text-ink'
                  }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto pt-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Diese Woche
          </div>
          <div className="font-display text-3xl font-bold tabular-nums leading-none">
            {formatHM(weekSeconds)}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            von {targetHours} Std.
          </div>
          <progress max={targetHours} value={weekHours} className="mt-3 w-full"></progress>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto relative px-12 py-12 lg:px-24">
        <div className="mx-auto w-full max-w-6xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="view-section block"
            >
              {renderView(activeView) || (
                <>
                  <h2 className="mb-8 text-xl font-bold uppercase tracking-tight leading-none">
                    {navItems.find(i => i.id === activeView)?.label}
                  </h2>
                  <div className="text-sm text-muted">Hier entsteht bald diese Ansicht.</div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      
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
