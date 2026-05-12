# Kavoma Time — V2 Ideen

> Aktuelle App ist **V1** (Single-User Desktop, alle Daten lokal). V2 wird die Cloud/Team-Version.
> Beide Versionen sollen koexistieren — User wählt beim Start/Einrichten.

## 🌐 Online & Multi-User (Kern von V2)

- **Accounts mit E-Mail-Login** + OAuth (Google, Apple, GitHub für Devs)
- **Workspaces / Teams** — eine Firma = ein Workspace, viele Mitglieder
- **Rollen**: Owner, Admin, Member, Viewer
- **Mitarbeiter-Einladung** per E-Mail-Link mit Rollenwahl
- **Real-Time-Sync** — Tracker-Status, Einträge, Kunden, Projekte überall live
- **Konflikt-Auflösung** wenn zwei Devices offline waren

## 👥 Team-Features

- **Zeit-Approval** — Vorgesetzter genehmigt Einträge vor Abrechnung
- **Stundenzettel pro Mitarbeiter** mit Wochenfreigabe
- **Team-Statistik** — Auslastung, Top-Performer, Engpässe
- **Kapazitätsplanung** — wer hat wann frei, Urlaub-/Krankheits-Tracker
- **Projekt-Assignments** — wer arbeitet an welchem Projekt
- **Interner Stundensatz vs. Kundensatz** — Margen-Tracking pro Mitarbeiter
- **Time-Lock** — gesperrte Perioden nach Abrechnung (kein Backdating mehr möglich)

## 💼 Business-Funktionen

- **Multi-Mandanten-Fähigkeit** — mehrere Firmen unter einem Account
- **Genehmigungs-Workflows** für Spesen / Auslagen
- **Angebots-Modul** — Quote → Auftrag → Rechnung Flow
- **Vertrags-Verwaltung** mit Verträgen, NDAs, Auftragsbestätigungen
- **Kunden-Portal** — Kunde sieht eigene Rechnungen + Status, zahlt online
- **Online-Zahlung** via Stripe/Mollie/PayPal direkt aus Rechnung
- **CRM-Lite** — Kontakthistorie pro Kunde, Notizen, Aufgaben

## 🔗 Integrationen

- **Slack / Teams** — Bot zum Starten/Stoppen
- **Jira / Linear / GitHub Issues** — Issue als Projekt importieren
- **Kalender** (Google/Outlook/CalDAV) — Termine automatisch tracken
- **Buchhaltungs-APIs** — DATEV Connect Online, Lexoffice, sevDesk
- **Bank-API** — Zahlungseingänge automatisch matchen (FinAPI/GoCardless)
- **Webhook-System** für Zapier/Make/n8n
- **Public-API** mit Tokens

## 📱 Multi-Platform

- **Mobile Apps** (iOS + Android) für Quick-Tracking unterwegs
- **Web-App** als Browser-Version (gleiche Codebase wie Desktop)
- **Browser-Extension** zum Tracken aus dem Browser
- **CLI-Tool** für Power-User (`kavoma start "task X"`)
- **Apple Watch / Wear OS** Companion

## 🤖 KI-Features (V2.5?)

- **Auto-Description** aus aktuell offenen Apps / Fenstertiteln vorschlagen
- **Smart-Categorization** — Eingaben automatisch in Projekte einordnen
- **Anomalie-Detection** — "Du arbeitest sonst nie sonntags, vergessen Pause zu setzen?"
- **Forecasting** mit ML — realistische Zeitschätzung für neue Aufgaben basierend auf Historie
- **Auto-Invoice-Draft** — Ende Monat Vorschlag mit Rechnungstext
- **Natural-Language-Eingabe** — "Track 2 Stunden Frontend bei Müller gestern"
- **Voice-Tracking** — "Kavoma, starte Timer für Schulze AG"

## 🔐 Enterprise & Compliance

- **SSO** (SAML, OIDC)
- **Audit-Log** aller Änderungen mit unveränderbarem Trail
- **GoBD-zertifizierter Archiv-Modus** mit Drittprüfer-Token
- **2FA** verpflichtend setzen
- **Data Residency** — DSGVO-Pflicht: Server in DE / EU
- **End-to-End-Encryption** für sensible Daten (Stundensätze, Kundenadressen)
- **SOC-2-konforme Infra** (für US-/internationale Kunden)

## 📊 Erweiterte Analytics

- **Custom-Dashboards** — Widgets frei platzierbar
- **Berichts-Builder** mit Export als PDF/Excel
- **Benchmarks** — wie schnell warst du im Vergleich zu vergleichbaren Projekten?
- **Profitability-Forecasting** — Jahres-Hochrechnung mit Saisonalität

## 💡 Crazy-Ideen (für Differenzierung)

- **Public-Profil pro Freelancer** — "Verifizierte Stunden" auf eigener kavoma.de/max-mustermann Seite (Trust-Signal für neue Kunden)
- **Marketplace** — Kavoma-Freelancer können verfügbare Slots an Kunden anbieten
- **Stunden-Token** — abgerechnete Stunden als NFT/Blockchain-Beleg (Nice-to-have, niemand braucht's wirklich 😄)
- **Pomodoro-Battles** — Multiplayer-Fokus-Sessions im Team
- **Time-Travel-Replay** — exakte Wiedergabe wie der Arbeitstag aussah

## 🎯 Monetarisierung V2

- V1 bleibt **kostenlos** als Open-Source / Free Desktop App (Kunden-Akquise)
- V2 als **SaaS-Modell**:
  - **Free**: 1 User, 3 Kunden, 1 GB Daten
  - **Pro** (~9 €/Monat): unbegrenzte Kunden, Cloud-Sync, alle Integrationen
  - **Team** (~7 €/User/Monat): Multi-User, Approval-Workflows, Reporting
  - **Business** (Custom): SSO, Audit, GoBD, dedicated Support

## 🗺️ Migrationspfad V1 → V2

- V1-Daten **importieren** via JSON-Export aus V1
- V2-Cloud kann optional als **Backup** für V1-Daten dienen (Hybrid-Modus)
- V1-User bekommen **lebenslangen Rabatt** auf V2-Pro

---

## V1 → V2 Hand-off-Punkte (gut für Roadmap)

- Datenstruktur in V1 schon kompatibel halten (`id` als string statt number)
- Alle State-Mutationen schon als "Events" denken (vorbereitend für CRDT/Sync)
- IPC-Schicht zwischen Renderer + Store ist später API-Schicht
- E-Invoice-XML in V1 schon erzeugen — in V2 nur weiterleiten
