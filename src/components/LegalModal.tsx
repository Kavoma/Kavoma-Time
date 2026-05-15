import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, ShieldCheck } from 'lucide-react';

export type LegalDocument = 'imprint' | 'privacy';

interface LegalModalProps {
  open: boolean;
  initial: LegalDocument;
  onClose: () => void;
}

const REPO_URL = 'https://github.com/Kavoma/Kavoma-Time';

export function LegalModal({ open, initial, onClose }: LegalModalProps) {
  const [tab, setTab] = useState<LegalDocument>(initial);

  useEffect(() => {
    if (open) setTab(initial);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-divider bg-surface text-ink shadow-[0_25px_60px_-12px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={tab === 'imprint' ? 'Impressum' : 'Datenschutzerklärung'}
          >
            <div className="flex items-center justify-between border-b border-divider px-6 py-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setTab('imprint')}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all ${tab === 'imprint' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
                >
                  <FileText size={13} /> Impressum
                </button>
                <button
                  onClick={() => setTab('privacy')}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all ${tab === 'privacy' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
                >
                  <ShieldCheck size={13} /> Datenschutz
                </button>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-divider hover:text-ink"
                aria-label="Schließen"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 text-[13px] leading-relaxed">
              {tab === 'imprint' ? <ImprintContent /> : <PrivacyContent />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ImprintContent() {
  return (
    <div className="space-y-5 text-muted">
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">Angaben gemäß § 5 DDG</h3>
        <p className="text-ink">Artjom Kaufmann</p>
        <p>Wehinger Weg 10</p>
        <p>78583 Böttingen</p>
        <p>Deutschland</p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">Kontakt</h3>
        <p>
          E-Mail:{' '}
          <a href="mailto:info@kavoma.com" className="text-ink underline decoration-divider hover:decoration-ink">
            info@kavoma.com
          </a>
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">Quellcode</h3>
        <p>
          Repository:{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-divider hover:decoration-ink">
            {REPO_URL}
          </a>
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">Verantwortlich für den Inhalt</h3>
        <p>Artjom Kaufmann (Anschrift wie oben)</p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">Haftungsausschluss</h3>
        <p>
          Die Anwendung wird mit größtmöglicher Sorgfalt entwickelt. Für die Richtigkeit, Vollständigkeit und
          Aktualität der gespeicherten Daten sowie für etwaige Schäden, die durch die Nutzung der Software entstehen,
          wird keine Haftung übernommen, soweit dies gesetzlich zulässig ist.
        </p>
      </section>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-5 text-muted">
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">1. Verantwortlicher</h3>
        <p className="text-ink">Artjom Kaufmann</p>
        <p>Wehinger Weg 10, 78583 Böttingen, Deutschland</p>
        <p>
          E-Mail:{' '}
          <a href="mailto:info@kavoma.com" className="text-ink underline decoration-divider hover:decoration-ink">
            info@kavoma.com
          </a>
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">2. Verarbeitete Daten und Zwecke</h3>
        <p className="mb-2">
          <strong className="text-ink">Lokale Anwendungsdaten:</strong> Alle erfassten Zeiteinträge, Kunden,
          Projekte und Rechnungen werden ausschließlich lokal auf Ihrem Gerät gespeichert (Windows-Ordner
          „%APPDATA%\Kavoma\KavomaTime"). Die Daten werden mit AES-256-GCM verschlüsselt; der Schlüssel ist mit
          der Windows-Datenschutzfunktion DPAPI an Ihr Benutzerkonto gebunden. Es findet keine Übertragung an
          den Anbieter dieser Software statt.
        </p>
        <p className="mb-2">
          <strong className="text-ink">Update-Prüfung:</strong> Sofern aktiviert, prüft die App beim Start
          und auf manuelle Anforderung das öffentliche GitHub-Repository auf neue Versionen. Dabei werden
          technisch notwendig Ihre IP-Adresse, ein User-Agent (Anwendungs- und Plattform-Kennung) sowie die
          aktuelle App-Version an GitHub übertragen. Diese Verarbeitung können Sie in den Einstellungen
          jederzeit deaktivieren.
        </p>
        <p>
          <strong className="text-ink">Betriebssystem-Informationen:</strong> In der Einstellungs-Ansicht
          werden Betriebssystemversion, Architektur und App-Version angezeigt. Diese Werte verlassen das
          Gerät nicht.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">3. Rechtsgrundlagen</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Lokale Verarbeitung Ihrer Eingaben: Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Nutzungsverhältnisses).</li>
          <li>Update-Prüfung: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an Sicherheits- und Funktions-Updates); Widerspruchsmöglichkeit über den Schalter in den Einstellungen.</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">4. Empfänger</h3>
        <p>
          Im Rahmen der Update-Prüfung verarbeitet die GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco,
          CA 94107, USA Ihre Verbindungsdaten in eigener Verantwortung. GitHub ist nach dem EU-US Data Privacy
          Framework zertifiziert. Weitere Informationen:{' '}
          <a
            href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline decoration-divider hover:decoration-ink"
          >
            GitHub Privacy Statement
          </a>.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">5. Speicherdauer</h3>
        <p>
          Lokale Daten bleiben gespeichert, bis Sie sie selbst löschen — entweder einzeln innerhalb der App
          oder vollständig über die Funktion „Alle Daten löschen" in den Einstellungen.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">6. Ihre Rechte</h3>
        <p className="mb-2">Ihnen stehen die folgenden Rechte zu:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Auskunft (Art. 15 DSGVO)</li>
          <li>Berichtigung (Art. 16 DSGVO)</li>
          <li>Löschung (Art. 17 DSGVO) — direkt in der App über „Alle Daten löschen"</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO) — über die Backup-Export-Funktion</li>
          <li>Widerspruch (Art. 21 DSGVO)</li>
          <li>Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)</li>
        </ul>
        <p className="mt-2">
          Für die Wahrnehmung Ihrer Rechte gegenüber dem Verantwortlichen wenden Sie sich an{' '}
          <a href="mailto:info@kavoma.com" className="text-ink underline decoration-divider hover:decoration-ink">
            info@kavoma.com
          </a>.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">7. Zuständige Aufsichtsbehörde</h3>
        <p>
          Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg,
          Lautenschlagerstraße 20, 70173 Stuttgart.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-ink">8. Keine Telemetrie, keine Analyse</h3>
        <p>
          Die Anwendung enthält keine Tracking-, Analyse- oder Werbe-Drittanbieter. Es werden keine
          Crash-Reports oder Nutzungsstatistiken übermittelt.
        </p>
      </section>
    </div>
  );
}
