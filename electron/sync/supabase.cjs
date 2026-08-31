// ============================================================
// Transport — die einzige Stelle, die mit Supabase spricht
// ============================================================
// Läuft im Main-Prozess, nicht im Renderer. Gründe: Der Datenschlüssel darf
// den Main-Prozess nie verlassen, der Abgleich muss auch weiterlaufen wenn das
// Fenster im Tray liegt, und der Refresh-Token gehört in denselben
// verschlüsselten Speicher wie der Rest.
//
// Was hier hochgeht, ist bereits Chiffrat — verschlüsselt wird in `crypto.cjs`,
// bevor irgendetwas diese Datei erreicht. Diese Datei kennt den Klartext nicht.

const { createClient } = require('@supabase/supabase-js');
const config = require('./config.cjs');

/**
 * Sitzungsspeicher für `supabase-js`.
 *
 * Die Bibliothek erwartet `localStorage` — das gibt es im Main-Prozess nicht.
 * Ohne Ersatz wäre die Anmeldung nach jedem Neustart weg. Der Speicher wird
 * von außen hereingereicht (in der App der verschlüsselte `electron-store`,
 * im Test ein einfaches Objekt), damit dieses Modul ohne Electron testbar
 * bleibt.
 */
function makeStorageAdapter(store, key = 'sync_session') {
  return {
    getItem: (name) => {
      const bag = store.get(key) || {};
      return Object.prototype.hasOwnProperty.call(bag, name) ? bag[name] : null;
    },
    setItem: (name, value) => {
      const bag = store.get(key) || {};
      bag[name] = value;
      store.set(key, bag);
    },
    removeItem: (name) => {
      const bag = store.get(key) || {};
      delete bag[name];
      store.set(key, bag);
    },
  };
}

/**
 * @param store  Etwas mit `get(key)` / `set(key, value)` — in der App der
 *               electron-store, im Test ein Speicher im Arbeitsspeicher.
 */
function createSyncClient(store, { url = config.url, key = config.publishableKey } = {}) {
  const client = createClient(url, key, {
    auth: {
      storage: makeStorageAdapter(store),
      persistSession: true,
      autoRefreshToken: true,
      // Es gibt keine Browser-URL, aus der eine Sitzung zu lesen wäre — ohne
      // dieses Flag wartet die Bibliothek auf ein `window`, das hier fehlt.
      detectSessionInUrl: false,
    },
  });

  /** Wirft mit der Postgres-/Auth-Meldung statt still `null` zu liefern. */
  function unwrap({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    client,

    // === Konto ===
    async signUp(email, password) {
      return unwrap(await client.auth.signUp({ email, password }));
    },

    async signIn(email, password) {
      return unwrap(await client.auth.signInWithPassword({ email, password }));
    },

    signOut: () => client.auth.signOut(),

    async getUser() {
      const { data } = await client.auth.getUser();
      return data?.user ?? null;
    },

    // === Geräte ===
    // `upsert`, weil dasselbe Gerät sich bei jedem Start meldet — und dabei
    // `last_seen_at` mitzieht, damit die Geräteliste in den Einstellungen nicht
    // Karteileichen anzeigt.
    async registerDevice(userId, device) {
      return unwrap(await client.from('devices').upsert({
        id: device.id,
        user_id: userId,
        name: device.name,
        platform: device.platform,
        last_seen_at: new Date().toISOString(),
      }).select().single());
    },

    async listDevices() {
      return unwrap(await client.from('devices').select('*').order('last_seen_at', { ascending: false }));
    },

    async revokeDevice(deviceId) {
      return unwrap(await client.from('devices').delete().eq('id', deviceId));
    },

    // === Schlüsselumschläge ===
    async getKeyEnvelopes() {
      return unwrap(await client.from('sync_keys').select('*'));
    },

    async putKeyEnvelope(userId, kind, kdf, wrappedDek) {
      return unwrap(await client.from('sync_keys').upsert({
        user_id: userId, kind, kdf, wrapped_dek: wrappedDek,
        updated_at: new Date().toISOString(),
      }));
    },

    // === Änderungsprotokoll ===
    async pushOps(userId, deviceId, lamport, payload) {
      return unwrap(await client.from('sync_ops')
        .insert({ user_id: userId, device_id: deviceId, lamport, payload })
        .select('seq').single());
    },

    /** Alles ab `sinceSeq` (ausschließlich), aufsteigend — die Gesamtordnung. */
    async pullOps(sinceSeq = 0, limit = 1000) {
      return unwrap(await client.from('sync_ops')
        .select('*').gt('seq', sinceSeq)
        .order('seq', { ascending: true }).limit(limit));
    },

    // === Verdichtung ===
    async latestSnapshot() {
      const rows = unwrap(await client.from('sync_snapshots')
        .select('*').order('up_to_seq', { ascending: false }).limit(1));
      return rows?.[0] ?? null;
    },

    async putSnapshot(userId, upToSeq, payload) {
      return unwrap(await client.from('sync_snapshots')
        .upsert({ user_id: userId, up_to_seq: upToSeq, payload }));
    },

    async pruneOpsBefore(seq) {
      return unwrap(await client.from('sync_ops').delete().lte('seq', seq));
    },

    // === Nummernkreise ===
    // Der einzige Grund, warum hier eine Datenbank steht: Diese Vergabe ist
    // atomar. Zwei Geräte können nicht dieselbe Rechnungsnummer ziehen.
    async allocateNumber(kind, year, count = 1) {
      const { data, error } = await client.rpc('allocate_number', {
        p_kind: kind, p_year: year, p_count: count,
      });
      if (error) throw new Error(error.message);
      return Number(data);
    },

    // === Belege ===
    // Pfad `<user_id>/<attachment_id>.enc` — der erste Abschnitt trägt die
    // Zugriffsregel, siehe Migration.
    async uploadAttachment(userId, id, bytes) {
      const { error } = await client.storage.from('attachments')
        .upload(`${userId}/${id}.enc`, bytes, { contentType: 'application/octet-stream', upsert: true });
      if (error) throw new Error(error.message);
      return true;
    },

    async downloadAttachment(userId, id) {
      const { data, error } = await client.storage.from('attachments').download(`${userId}/${id}.enc`);
      if (error) throw new Error(error.message);
      return Buffer.from(await data.arrayBuffer());
    },

    /** IDs aller Belege, die für dieses Konto schon in der Ablage liegen. */
    async listAttachments(userId) {
      const { data, error } = await client.storage.from('attachments')
        .list(userId, { limit: 10_000 });
      if (error) throw new Error(error.message);
      return (data ?? []).map((o) => o.name.replace(/\.enc$/, ''));
    },

    async deleteAttachment(userId, id) {
      const { error } = await client.storage.from('attachments').remove([`${userId}/${id}.enc`]);
      if (error) throw new Error(error.message);
      return true;
    },

    // === Realtime ===
    // Ohne das würde nur der 60-Sekunden-Nachlauf greifen; damit erscheint eine
    // Änderung vom anderen Gerät in ein bis zwei Sekunden.
    subscribeToOps(userId, onInsert) {
      const channel = client
        .channel(`sync_ops:${userId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'sync_ops', filter: `user_id=eq.${userId}` },
          (payload) => onInsert(payload.new))
        .subscribe();
      return () => { client.removeChannel(channel); };
    },
  };
}


module.exports = { createSyncClient, makeStorageAdapter };
