// ============================================================
// Sync-Motor
// ============================================================
// Hält alles zusammen: Anmeldung, Schlüssel, Hoch- und Runterladen,
// Realtime. Läuft im Main-Prozess — der Datenschlüssel darf den nie verlassen,
// und der Abgleich muss weiterlaufen, wenn das Fenster im Tray liegt.
//
// Der Motor kennt die Bedeutung der Daten nicht. Er bekommt fertige Ops vom
// Renderer, verschlüsselt sie und lädt sie hoch; umgekehrt entschlüsselt er
// und reicht sie zurück. Zusammengeführt wird im Renderer (`src/sync/merge.ts`)
// — als reine Funktion, die sich testen lässt.

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('../crypto.cjs');
const { createSyncClient } = require('./supabase.cjs');
const linking = require('./linking.cjs');

const CURSOR_KEY = 'sync_cursor';
const DEK_FILE = 'kavoma-sync.key';
/** Netz für verlorene Realtime-Verbindungen. */
const POLL_MS = 60_000;
/** Ab so vielen Ops lohnt ein verdichteter Vollstand. */
const SNAPSHOT_EVERY = 500;
/** Wie oft die Belege auf der Platte mit der Ablage verglichen werden. */
const RECONCILE_EVERY_MS = 5 * 60_000;

/**
 * @param api  Optional. Standardmäßig der echte Supabase-Transport; in Tests
 *             ein Doppel, damit sich zwei Geräte in einem Prozess nachstellen
 *             lassen, ohne ein Konto anzulegen.
 */
/**
 * @param kdfOverrides  Nur für Tests. Die Voreinstellung (N=2^17, ~128 MB,
 *                      ~0,4 s) ist bewusst teuer — sie ist der einzige Schutz
 *                      der Passphrase gegen Durchprobieren. In Tests wäre sie
 *                      allerdings nur Wartezeit, und eine Suite, die Minuten
 *                      braucht, führt niemand mehr aus.
 */
function createEngine({ store, userDataPath, safeStorage, broadcast, api = null, kdfOverrides = {} }) {
  api = api || createSyncClient(store);

  let dek = null;
  let user = null;
  let device = null;
  let unsubscribe = null;
  let unsubscribeLinks = null;
  let pollTimer = null;
  let lastError = null;
  let lastSyncAt = null;
  let busy = false;
  /** Während eines laufenden Abgleichs eingegangener Wunsch nach einem weiteren. */
  let rerun = false;
  /** Der gerade laufende Durchgang, damit Wartende ihn mitbekommen. */
  let inflight = null;
  /** Zugriff auf die lokalen Belege — nur der Main-Prozess kennt sie. */
  let attachmentHooks = null;
  let lastReconcileAt = 0;
  /** Laufender Verbindungsvorgang. Der private Schlüssel darf nur hier leben. */
  let link = null;
  let linkTimer = null;
  /** Ops, die noch nicht hochgeladen sind. Überlebt Verbindungsabbrüche. */
  let queue = [];

  const dekPath = () => path.join(userDataPath, DEK_FILE);

  // === Datenschlüssel auf Platte ===========================================
  // Ohne das müsste bei jedem Start die Passphrase eingegeben werden. Der
  // Schlüssel liegt hier genauso geschützt wie `kavoma.key` — an dieses
  // Benutzerkonto auf diesem Rechner gebunden.
  function persistDek(buf) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Verschlüsselung nicht verfügbar — der Sync-Schlüssel würde im Klartext liegen.');
    }
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(dekPath(), safeStorage.encryptString(buf.toString('base64')));
  }

  function loadDek() {
    try {
      if (!fs.existsSync(dekPath())) return null;
      if (!safeStorage.isEncryptionAvailable()) return null;
      return Buffer.from(safeStorage.decryptString(fs.readFileSync(dekPath())), 'base64');
    } catch (e) {
      console.warn('Sync-Schlüssel nicht lesbar:', e.message);
      return null;
    }
  }

  function forgetDek() {
    dek = null;
    try { if (fs.existsSync(dekPath())) fs.rmSync(dekPath(), { force: true }); } catch (_) { /* egal */ }
  }

  // === Zustand =============================================================
  function state() {
    if (!user) return 'off';
    if (!dek) return 'locked';
    if (lastError) return 'error';
    if (busy) return 'syncing';
    return lastSyncAt ? 'synced' : 'offline';
  }

  function status() {
    return {
      state: state(),
      account: user?.email ?? null,
      lastSyncAt,
      pendingOps: queue.length,
      error: lastError,
      deviceId: device?.id ?? null,
    };
  }

  function publish() {
    broadcast('sync-status', status());
  }

  const cursor = {
    get: () => Number(store.get(CURSOR_KEY)) || 0,
    set: (v) => store.set(CURSOR_KEY, Number(v) || 0),
  };

  /** Bindet ein Chiffrat an seinen Platz — Chiffrat lässt sich nicht verschieben. */
  const aadFor = (deviceId, lamport) => `${user.id}:${deviceId}:${lamport}`;

  // === Übertragung =========================================================
  async function flush() {
    if (!user || !dek || queue.length === 0) return;
    const batch = queue;
    queue = [];
    try {
      const lamport = Math.max(...batch.map((o) => o.lamport ?? 0), 0);
      const payload = crypto.seal(dek, JSON.stringify(batch), aadFor(device.id, lamport));
      await api.pushOps(user.id, device.id, lamport, payload);
      lastError = null;
    } catch (e) {
      // Zurück in die Schlange — beim nächsten Versuch erneut. Ein verlorener
      // Zeiteintrag ist schlimmer als eine doppelte Übertragung, und der Merge
      // ist ohnehin idempotent.
      queue = [...batch, ...queue];
      lastError = e.message;
      throw e;
    }
  }

  async function pull() {
    if (!user || !dek) return { applied: 0 };
    const rows = await api.pullOps(cursor.get());
    if (rows.length === 0) return { applied: 0 };

    const ops = [];
    let highest = cursor.get();
    for (const row of rows) {
      highest = Math.max(highest, row.seq);
      // Eigene Ops überspringen — die stehen hier schon im State.
      if (row.device_id === device.id) continue;
      try {
        const klartext = crypto.open(dek, row.payload, aadFor(row.device_id, row.lamport));
        const batch = JSON.parse(klartext);
        if (Array.isArray(batch)) ops.push(...batch);
      } catch (e) {
        // Eine unlesbare Zeile darf den Abgleich nicht anhalten — sonst
        // blockiert ein einziges kaputtes Paket alles Weitere für immer.
        console.warn(`Op ${row.seq} nicht lesbar, übersprungen:`, e.message);
      }
    }
    cursor.set(highest);
    if (ops.length > 0) broadcast('sync-ops', ops);
    return { applied: ops.length, upTo: highest };
  }

  /**
   * Läuft schon ein Abgleich, wird der neue Wunsch nicht verworfen, sondern
   * gemerkt und danach nachgeholt.
   *
   * Einfach `return` wäre bequemer, ließe aber Ops liegen: Wer während eines
   * laufenden Abgleichs etwas ändert, müsste sonst bis zum nächsten
   * Minutentakt warten — und beim Zumachen der App wäre die Änderung weg.
   */
  /**
   * Gleicht die Belege auf der Platte mit denen in der Ablage ab und lädt hoch,
   * was dort fehlt.
   *
   * Deckt zwei Fälle ab, die sonst still danebengingen: Belege, die vor dem
   * Einrichten der Synchronisierung entstanden sind, und solche, deren Upload
   * beim Anlegen scheiterte, weil kein Netz da war. Ohne das erschiene auf dem
   * zweiten Gerät der Eintrag, aber die Datei ließe sich nicht öffnen.
   */
  async function reconcileAttachments() {
    if (!user || !dek || !attachmentHooks) return { uploaded: 0 };

    let lokal;
    try { lokal = await attachmentHooks.listLocalIds(); } catch (_) { return { uploaded: 0 }; }
    if (!lokal || lokal.length === 0) { lastReconcileAt = Date.now(); return { uploaded: 0 }; }

    const fern = new Set(await api.listAttachments(user.id));
    let uploaded = 0;
    for (const id of lokal) {
      if (fern.has(id)) continue;
      try {
        const klartext = await attachmentHooks.readPlain(id);
        const chiffrat = Buffer.from(crypto.seal(dek, klartext.toString('base64'), `${user.id}:att:${id}`), 'utf8');
        await api.uploadAttachment(user.id, id, chiffrat);
        uploaded++;
      } catch (e) {
        // Einer, der nicht hochgeht, darf die übrigen nicht aufhalten.
        console.warn(`Beleg ${id} konnte nicht nachgeladen werden:`, e.message);
      }
    }
    lastReconcileAt = Date.now();
    return { uploaded };
  }

  async function runSync() {
    busy = true;
    publish();
    try {
      do {
        rerun = false;
        await flush();
        await pull();
      } while (rerun);
      lastSyncAt = Date.now();
      lastError = null;
      // Belege nachziehen — gedrosselt, das Auflisten der Ablage soll nicht an
      // jedem Tastendruck hängen.
      if (Date.now() - lastReconcileAt > RECONCILE_EVERY_MS) {
        await reconcileAttachments().catch((e) => console.warn('Beleg-Abgleich:', e.message));
      }
    } catch (e) {
      lastError = e.message;
    } finally {
      busy = false;
      rerun = false;
      inflight = null;
      publish();
    }
  }

  function sync() {
    if (!user || !dek) return Promise.resolve();
    // Läuft schon einer, wird der Wunsch gemerkt und dessen Zusage
    // zurückgegeben — wer wartet, wartet dann auf die tatsächliche Arbeit und
    // nicht auf ein gesetztes Flag.
    if (inflight) { rerun = true; return inflight; }
    inflight = runSync();
    return inflight;
  }

  // === Lebenszyklus ========================================================
  async function attach() {
    if (!user) return;
    device = await ensureDevice();
    await api.registerDevice(user.id, device).catch((e) => console.warn('Gerät nicht registriert:', e.message));

    unsubscribe?.();
    unsubscribe = api.subscribeToOps(user.id, (row) => {
      if (row.device_id === device.id) return;   // eigenes Echo
      sync();
    });

    // Verbindungsanfragen anderer Geräte. Der Hinweis soll überall in der App
    // auftauchen, nicht nur in den Einstellungen — deshalb hier und nicht in
    // der Oberfläche.
    unsubscribeLinks?.();
    unsubscribeLinks = api.subscribeToLinks?.(user.id, (row) => {
      if (row.requester_device_id === device.id) return;   // die eigene
      broadcast('sync-link-request', {
        id: row.id, name: row.requester_name, platform: row.requester_platform,
      });
    });

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(sync, POLL_MS);
    // Beim Aufnehmen einmal ohne Drosselung: Genau hier stehen die Belege an,
    // die vor der Einrichtung entstanden sind.
    lastReconcileAt = 0;
    await sync();
  }

  function detach() {
    unsubscribe?.();
    unsubscribe = null;
    unsubscribeLinks?.();
    unsubscribeLinks = null;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function ensureDevice() {
    const os = require('node:os');
    let id = store.get('sync_device_id');
    if (typeof id !== 'string' || !id) {
      id = require('node:crypto').randomUUID();
      store.set('sync_device_id', id);
    }
    let name;
    try { name = os.hostname(); } catch (_) { name = 'Unbekanntes Gerät'; }
    return { id, name, platform: process.platform };
  }

  // === Gerät mit Gerät verbinden ===========================================
  // Ersetzt die Passphrase. Der Ablauf in Kurzform:
  //
  //   1. Neues Gerät legt eine Anfrage mit seiner öffentlichen Hälfte ab.
  //   2. Eingerichtetes Gerät antwortet **automatisch** mit seiner — eine
  //      öffentliche Hälfte verrät nichts, und ohne sie könnte das neue Gerät
  //      die Zahl gar nicht erst anzeigen.
  //   3. Beide rechnen dieselbe sechsstellige Zahl aus.
  //   4. Der Mensch tippt sie vom neuen ins eingerichtete Gerät.
  //   5. Stimmt sie, wandert der Datenschlüssel — verpackt mit dem gemeinsamen
  //      Geheimnis, das nur die beiden Geräte kennen.
  //
  // Erst Schritt 5 gibt etwas preis. Alles davor ist öffentlich.

  const LINK_POLL_MS = 1500;

  function stopLinkPolling() {
    if (linkTimer) clearInterval(linkTimer);
    linkTimer = null;
  }

  /** Neues Gerät: Anfrage stellen und auf die Antwort warten. */
  async function startDeviceLink() {
    if (!user) throw new Error('Nicht angemeldet.');
    cancelDeviceLink();

    const paar = linking.generateLinkKeypair();
    const geraet = await ensureDevice();
    await api.pruneDeviceLinks().catch(() => {});
    const zeile = await api.createDeviceLink(user.id, geraet, paar.publicKey);

    link = { rolle: 'anfrage', id: zeile.id, paar, code: null, shared: null };

    linkTimer = setInterval(() => { void pollLinkOnce(); }, LINK_POLL_MS);
    return { linkId: zeile.id };
  }

  /** Ein Abfrageschritt des wartenden Geräts. Eigene Funktion, damit sich der
   *  Ablauf testen lässt, ohne auf Timer zu warten. */
  async function pollLinkOnce() {
    if (!link || link.rolle !== 'anfrage') return { state: 'inaktiv' };
    try {
      const aktuell = await api.getDeviceLink(link.id);
      if (!aktuell) return { state: 'wartet' };

      // Schritt 3: Gegenstück da → Zahl anzeigen.
      if (aktuell.responder_pubkey && !link.code) {
        link.shared = linking.deriveShared(link.paar.privateKey, aktuell.responder_pubkey);
        link.code = linking.deriveCode(link.shared, link.paar.publicKey, aktuell.responder_pubkey);
        broadcast('sync-link-code', { code: link.code });
      }

      // Schritt 5: Schlüssel da → auspacken und loslegen.
      if (aktuell.wrapped_dek && link.shared) {
        const geoeffnet = linking.openDek(link.shared, aktuell.wrapped_dek, `link:${link.id}`);
        stopLinkPolling();
        persistDek(geoeffnet);
        dek = geoeffnet;
        await api.deleteDeviceLink(link.id).catch(() => {});
        link = null;
        publish();
        broadcast('sync-link-done', { ok: true });
        return { state: 'fertig' };
      }
      return { state: link.code ? 'zahl-steht' : 'wartet', code: link.code };
    } catch (e) {
      stopLinkPolling();
      broadcast('sync-link-done', { ok: false, error: e.message });
      return { state: 'fehler', error: e.message };
    }
  }

  function cancelDeviceLink() {
    stopLinkPolling();
    if (link?.id && link.rolle === 'anfrage') api.deleteDeviceLink(link.id).catch(() => {});
    link = null;
  }

  /** Eingerichtetes Gerät: offene Anfragen anderer Geräte. */
  async function listPendingLinks() {
    if (!user || !dek) return [];
    const zeilen = await api.listPendingLinks();
    const eigenes = (await ensureDevice()).id;
    return zeilen
      .filter((z) => z.requester_device_id !== eigenes && !z.wrapped_dek)
      .map((z) => ({
        id: z.id, name: z.requester_name, platform: z.requester_platform, createdAt: z.created_at,
      }));
  }

  /**
   * Eingerichtetes Gerät: mit der eigenen öffentlichen Hälfte antworten.
   *
   * Gibt die Zahl **nicht** zurück — sie wird hier nur gemerkt. Würde das alte
   * Gerät sie anzeigen, könnte man sie blind abnicken; der Sinn ist, dass sie
   * vom *anderen* Bildschirm kommt.
   */
  async function respondToLink(id) {
    if (!user || !dek) throw new Error('Dieses Gerät ist nicht entsperrt.');
    const zeile = await api.getDeviceLink(id);
    if (!zeile) throw new Error('Diese Anfrage gibt es nicht mehr.');
    if (new Date(zeile.expires_at) < new Date()) throw new Error('Diese Anfrage ist abgelaufen.');

    const paar = linking.generateLinkKeypair();
    const shared = linking.deriveShared(paar.privateKey, zeile.requester_pubkey);
    const code = linking.deriveCode(shared, paar.publicKey, zeile.requester_pubkey);

    link = { rolle: 'bestaetigung', id, paar, shared, code };
    await api.publishLinkResponse(id, paar.publicKey);
    return { id, name: zeile.requester_name, platform: zeile.requester_platform };
  }

  /** Eingerichtetes Gerät: Zahl prüfen und bei Übereinstimmung den Schlüssel senden. */
  async function approveLink(id, eingetippt) {
    if (!link || link.id !== id || link.rolle !== 'bestaetigung') {
      throw new Error('Für diese Anfrage läuft gerade kein Vorgang.');
    }
    if (!linking.codesMatch(eingetippt, link.code)) {
      throw new Error('Die Zahlen stimmen nicht überein. Brich ab und versuch es neu — '
        + 'wenn es wieder nicht passt, stimmt etwas mit der Verbindung nicht.');
    }
    await api.publishLinkKey(id, linking.sealDek(link.shared, dek, `link:${id}`));
    link = null;
    return { ok: true };
  }

  async function rejectLink(id) {
    await api.deleteDeviceLink(id).catch(() => {});
    if (link?.id === id) link = null;
    return { ok: true };
  }

  // === Öffentliche Schnittstelle ===========================================
  return {
    status,

    /** Beim App-Start: gibt es noch eine gültige Sitzung? */
    async restore() {
      try {
        user = await api.getUser();
      } catch (_) { user = null; }
      if (!user) { publish(); return status(); }
      dek = loadDek();
      if (dek) await attach();
      publish();
      return status();
    },

    async signIn(email, password) {
      const result = await api.signIn(email, password);
      user = result.user;
      dek = loadDek();
      if (dek) await attach();
      publish();
      return status();
    },

    async signOut() {
      detach();
      cancelDeviceLink();
      await api.signOut().catch(() => {});
      // Der Datenschlüssel geht mit: Ein abgemeldetes Gerät soll nichts mehr
      // entschlüsseln können, was es später herunterlädt.
      forgetDek();
      user = null;
      device = null;
      lastSyncAt = null;
      queue = [];
      publish();
      return status();
    },

    /** Liegen auf dem Server schon Schlüsselumschläge? Entscheidet, ob der
     *  Dialog „Passphrase festlegen" oder „Passphrase eingeben" zeigt. */
    async hasKeys() {
      if (!user) return false;
      const rows = await api.getKeyEnvelopes();
      return rows.length > 0;
    },

    /**
     * Erstmalige Einrichtung. Erzeugt den Datenschlüssel und legt ihn zweimal
     * umschlossen ab — einmal hinter der Passphrase, einmal hinter einem
     * Wiederherstellungscode. Der Code wird genau einmal zurückgegeben.
     */
    async setupPassphrase(passphrase) {
      if (!user) throw new Error('Nicht angemeldet.');
      const fresh = crypto.generateDek();
      const recoveryCode = crypto.generateRecoveryCode();

      const viaPass = crypto.wrapDek(fresh, passphrase, kdfOverrides);
      const viaCode = crypto.wrapDek(fresh, crypto.normalizeRecoveryCode(recoveryCode), kdfOverrides);

      await api.putKeyEnvelope(user.id, 'passphrase', viaPass.kdf, viaPass.wrapped);
      await api.putKeyEnvelope(user.id, 'recovery', viaCode.kdf, viaCode.wrapped);

      persistDek(fresh);
      dek = fresh;
      await attach();
      publish();
      return { recoveryCode };
    },

    /**
     * Erstes Gerät: Datenschlüssel anlegen — ohne Passphrase.
     *
     * Gesichert wird er allein über den Wiederherstellungscode. Der ist nicht
     * Bequemlichkeit, sondern der einzige Weg zurück, wenn alle Geräte weg
     * sind: Der Schlüssel liegt sonst nirgends.
     */
    async initializeKey() {
      if (!user) throw new Error('Nicht angemeldet.');
      const frisch = crypto.generateDek();
      const recoveryCode = crypto.generateRecoveryCode();
      const umschlag = crypto.wrapDek(frisch, crypto.normalizeRecoveryCode(recoveryCode), kdfOverrides);

      await api.putKeyEnvelope(user.id, 'recovery', umschlag.kdf, umschlag.wrapped);
      persistDek(frisch);
      dek = frisch;
      await attach();
      publish();
      return { recoveryCode };
    },

    pollLinkOnce,

    /** Zweites Gerät: Umschlag holen und mit Passphrase oder Code öffnen. */
    async unlock(secret) {
      if (!user) throw new Error('Nicht angemeldet.');
      const rows = await api.getKeyEnvelopes();
      if (rows.length === 0) throw new Error('Für dieses Konto ist noch keine Passphrase eingerichtet.');

      const normalized = crypto.normalizeRecoveryCode(secret);
      let opened = null;
      for (const row of rows) {
        // Beides probieren: Der Nutzer weiß nicht, ob er gerade Passphrase
        // oder Notfallcode tippt — und muss es auch nicht wissen.
        for (const candidate of [secret, normalized]) {
          try { opened = crypto.unwrapDek(row.wrapped_dek, row.kdf, candidate); break; } catch (_) { /* nächster */ }
        }
        if (opened) break;
      }
      if (!opened) throw new Error('Passphrase oder Wiederherstellungscode ist falsch.');

      persistDek(opened);
      dek = opened;
      // Bewusst **kein** `attach()`: Auf einem zweiten Gerät liegen meist schon
      // Daten. Würde hier sofort abgeglichen, wäre die Zusammenführung
      // passiert, bevor der Mensch sie zu Gesicht bekommt. Der Renderer holt
      // sich erst eine Vorschau und ruft dann `start()`.
      publish();
      return status();
    },

    /** Abgleich aufnehmen — nach dem Erstabgleich oder wenn keiner nötig war. */
    async start() {
      if (!user || !dek) throw new Error('Nicht entsperrt.');
      await attach();
      publish();
      return status();
    },

    /** Ops aus dem Renderer entgegennehmen und bei nächster Gelegenheit senden. */
    enqueue(ops) {
      if (!Array.isArray(ops) || ops.length === 0) return status();
      queue.push(...ops);
      publish();
      void sync();
      return status();
    },

    sync,

    /** Für den Erstabgleich: alles vom Server, ohne den Cursor zu bewegen. */
    async fetchAll() {
      if (!user || !dek) throw new Error('Nicht entsperrt.');
      const rows = await api.pullOps(0, 10_000);
      const ops = [];
      for (const row of rows) {
        if (row.device_id === device?.id) continue;
        try {
          const batch = JSON.parse(crypto.open(dek, row.payload, aadFor(row.device_id, row.lamport)));
          if (Array.isArray(batch)) ops.push(...batch);
        } catch (_) { /* unlesbare Zeile überspringen */ }
      }
      return { ops, upTo: rows.length ? rows[rows.length - 1].seq : 0 };
    },

    /** Nach dem Erstabgleich: dort weitermachen, wo die Vorschau aufhörte. */
    acceptCursor(seq) { cursor.set(seq); },

    // === Belege ==============================================================
    // Der Kniff: Lokal bleibt alles im vorhandenen, geräteverschlüsselten
    // Format. Nur für den Transport wird umgeschlüsselt. Dadurch bleiben
    // `attachment-read` und die gesamte PDF-Anzeige unangetastet.
    //
    // Metadaten wandern immer mit dem Änderungsprotokoll, die Datei selbst erst
    // beim ersten Öffnen — mehrere hundert Megabyte beim Einrichten wären
    // sonst der sicherste Weg, die Funktion unbenutzbar zu machen.

    /** @param readLocal  liefert den Klartext als Buffer (Geräteschlüssel) */
    async uploadAttachment(id, readLocal) {
      if (!user || !dek) throw new Error('Nicht entsperrt.');
      const klartext = await readLocal(id);
      const chiffrat = Buffer.from(crypto.seal(dek, klartext.toString('base64'), `${user.id}:att:${id}`), 'utf8');
      await api.uploadAttachment(user.id, id, chiffrat);
      return true;
    },

    /** @param writeLocal  schreibt den Klartext wieder geräteverschlüsselt weg */
    async downloadAttachment(id, writeLocal) {
      if (!user || !dek) throw new Error('Nicht entsperrt.');
      const chiffrat = await api.downloadAttachment(user.id, id);
      const klartext = Buffer.from(crypto.open(dek, chiffrat.toString('utf8'), `${user.id}:att:${id}`), 'base64');
      await writeLocal(id, klartext);
      return true;
    },

    async deleteAttachment(id) {
      if (!user) return false;
      return api.deleteAttachment(user.id, id).catch(() => false);
    },

    startDeviceLink,
    cancelDeviceLink,
    listPendingLinks,
    respondToLink,
    approveLink,
    rejectLink,

    /** Zugriff auf die lokalen Belege hereinreichen. */
    setAttachmentHooks(hooks) { attachmentHooks = hooks; },
    reconcileAttachments,

    listDevices: () => api.listDevices(),
    revokeDevice: (id) => api.revokeDevice(id),

    stop: detach,

    /** Nur für Tests: erlaubt zwei Motoren in einem Prozess. */
    _internals: { get dek() { return dek; }, get queue() { return queue; }, api },
  };
}

module.exports = { createEngine, SNAPSHOT_EVERY };
