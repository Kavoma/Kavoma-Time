import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import engineModule from './engine.cjs';

const { createEngine } = engineModule;

// === Doppel ================================================================
// Ein Supabase im Arbeitsspeicher. Bildet nur nach, worauf sich der Motor
// verlässt: eine fortlaufende Gesamtordnung, Zeilen pro Konto und
// Schlüsselumschläge.
function makeFakeBackend() {
  const ops = [];
  const keys = [];
  const devices = new Map();
  const ablage = new Map();
  const links = new Map();
  let seq = 0;
  let linkSeq = 0;
  const state = { offline: false, user: { id: 'user-1', email: 'test@kavoma.invalid' } };

  const guard = () => { if (state.offline) throw new Error('offline'); };

  return {
    state, ops, keys, devices, ablage, links,
    api: {
      async getUser() { guard(); return state.user; },
      async signIn() { guard(); return { user: state.user }; },
      async signOut() { return true; },
      async registerDevice(userId, d) { guard(); devices.set(d.id, { ...d, user_id: userId }); return d; },
      async listDevices() { guard(); return [...devices.values()]; },
      async revokeDevice(id) { guard(); devices.delete(id); return true; },
      async getKeyEnvelopes() { guard(); return keys.map(k => ({ ...k })); },
      async putKeyEnvelope(userId, kind, kdf, wrapped_dek) {
        guard();
        const i = keys.findIndex(k => k.kind === kind);
        const row = { user_id: userId, kind, kdf, wrapped_dek };
        if (i >= 0) keys[i] = row; else keys.push(row);
        return row;
      },
      async pushOps(user_id, device_id, lamport, payload) {
        guard();
        seq += 1;
        ops.push({ seq, user_id, device_id, lamport, payload });
        return { seq };
      },
      async pullOps(since = 0) { guard(); return ops.filter(o => o.seq > since); },
      subscribeToOps() { return () => {}; },
      async allocateNumber() { guard(); return 1; },
      async uploadAttachment(userId, id, bytes) { guard(); ablage.set(`${userId}/${id}`, bytes); return true; },
      async downloadAttachment(userId, id) {
        guard();
        const b = ablage.get(`${userId}/${id}`);
        if (!b) throw new Error('nicht gefunden');
        return b;
      },
      async listAttachments(userId) {
        guard();
        return [...ablage.keys()].filter(k => k.startsWith(`${userId}/`)).map(k => k.split('/')[1]);
      },
      async deleteAttachment(userId, id) { guard(); ablage.delete(`${userId}/${id}`); return true; },

      async createDeviceLink(userId, device, pubkey) {
        guard();
        const zeile = {
          id: `link-${++linkSeq}`, user_id: userId,
          requester_device_id: device.id, requester_name: device.name,
          requester_platform: device.platform, requester_pubkey: pubkey,
          responder_pubkey: null, wrapped_dek: null, consumed_at: null,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          created_at: new Date().toISOString(),
        };
        links.set(zeile.id, zeile);
        return zeile;
      },
      async getDeviceLink(id) { guard(); return links.get(id) ?? null; },
      async listPendingLinks() {
        guard();
        return [...links.values()].filter(z => !z.consumed_at && new Date(z.expires_at) > new Date());
      },
      async publishLinkResponse(id, pubkey) { guard(); links.get(id).responder_pubkey = pubkey; return links.get(id); },
      async publishLinkKey(id, wrapped) {
        guard();
        const z = links.get(id);
        z.wrapped_dek = wrapped;
        z.consumed_at = new Date().toISOString();
        return z;
      },
      async deleteDeviceLink(id) { guard(); links.delete(id); return true; },
      async pruneDeviceLinks() { guard(); return 0; },
    },
  };
}

function makeStore() {
  const bag = new Map();
  return { get: (k) => bag.get(k), set: (k, v) => bag.set(k, v), _bag: bag };
}

// safeStorage-Ersatz: Base64 statt Schlüsselbund. Der Motor braucht nur, dass
// hin und zurück dasselbe herauskommt.
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`v1:${s}`, 'utf8'),
  decryptString: (b) => b.toString('utf8').replace(/^v1:/, ''),
};

let tmpRoot;
beforeEach(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kavoma-sync-')); });
afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

function makeDevice(backend, name) {
  const empfangen = [];
  const zustaende = [];
  const store = makeStore();
  const userDataPath = path.join(tmpRoot, name);
  fs.mkdirSync(userDataPath, { recursive: true });
  const engine = createEngine({
    store, userDataPath, safeStorage: fakeSafeStorage, api: backend.api,
    // Echte Parameter brauchen 128 MB und ~0,4 s je Ableitung — hier nur
    // Wartezeit. Geprüft werden sie in `crypto.test.mjs`.
    kdfOverrides: { N: 1 << 12 },
    broadcast: (kanal, nutzlast) => {
      if (kanal === 'sync-ops') empfangen.push(...nutzlast);
      if (kanal === 'sync-status') zustaende.push(nutzlast);
    },
  });
  return { engine, empfangen, zustaende, store, userDataPath };
}

const op = (i, deviceId, lamport) => ({
  id: `op-${i}`, entity: 'customer', entityId: String(i), op: 'upsert',
  payload: { id: i, name: `Kunde ${i}` }, deviceId, lamport, updatedAt: 1000 + i,
});

describe('Sync-Motor', () => {
  it('richtet die Passphrase ein und legt zwei Umschläge ab', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('test@kavoma.invalid', 'pw');

    const { recoveryCode } = await a.engine.setupPassphrase('meine-passphrase');

    expect(backend.keys.map(k => k.kind).sort()).toEqual(['passphrase', 'recovery']);
    expect(recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/);
    expect(a.engine.status().state).toBe('synced');
  });

  it('das zweite Gerät kommt mit der Passphrase an denselben Schlüssel', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    expect(b.engine.status().state).toBe('locked');   // Sitzung ja, Schlüssel nein

    await b.engine.unlock('geheim');
    // Entsperrt, aber noch nicht abgleichend — erst nach dem Erstabgleich.
    expect(b.engine.status().state).toBe('offline');
    expect(b.engine._internals.dek.equals(a.engine._internals.dek)).toBe(true);

    await b.engine.start();
    expect(b.engine.status().state).toBe('synced');
  });

  it('der Wiederherstellungscode öffnet denselben Schlüssel', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    const { recoveryCode } = await a.engine.setupPassphrase('vergessen');

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    // Kleinschreibung und fehlende Bindestriche verzeihen — vom Papier getippt.
    await b.engine.unlock(recoveryCode.toLowerCase().replace(/-/g, ''));
    expect(b.engine._internals.dek.equals(a.engine._internals.dek)).toBe(true);
  });

  it('weist eine falsche Passphrase ab', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('richtig');

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    await expect(b.engine.unlock('falsch')).rejects.toThrow(/falsch/i);
    expect(b.engine.status().state).toBe('locked');
  });

  it('trägt Änderungen von A nach B', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    await b.engine.unlock('geheim');
    await b.engine.start();

    a.engine.enqueue([op(1, 'gerät-a', 1), op(2, 'gerät-a', 1)]);
    await a.engine.sync();
    await b.engine.sync();

    expect(b.empfangen.map(o => o.entityId)).toEqual(['1', '2']);
  });

  it('spielt eigene Ops nicht bei sich selbst ein', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    a.engine.enqueue([op(1, 'gerät-a', 1)]);
    await a.engine.sync();
    await a.engine.sync();

    expect(a.empfangen).toHaveLength(0);
  });

  it('lädt nichts doppelt — der Zeiger wandert mit', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');
    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    await b.engine.unlock('geheim');
    await b.engine.start();

    a.engine.enqueue([op(1, 'gerät-a', 1)]);
    await a.engine.sync();
    await b.engine.sync();
    await b.engine.sync();
    await b.engine.sync();

    expect(b.empfangen).toHaveLength(1);
  });

  it('behält Ops in der Schlange, wenn das Netz weg ist', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    backend.state.offline = true;
    a.engine.enqueue([op(1, 'gerät-a', 1)]);
    await a.engine.sync();

    expect(a.engine.status().pendingOps).toBe(1);
    expect(backend.ops).toHaveLength(0);

    backend.state.offline = false;
    await a.engine.sync();

    expect(a.engine.status().pendingOps).toBe(0);
    expect(backend.ops).toHaveLength(1);
  });

  it('lässt sich von einer unlesbaren Zeile nicht aufhalten', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');
    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    await b.engine.unlock('geheim');
    await b.engine.start();

    a.engine.enqueue([op(1, 'gerät-a', 1)]);
    await a.engine.sync();
    // Müll dazwischenschieben — etwa aus einer älteren Programmversion.
    backend.ops.push({ seq: 99, user_id: 'user-1', device_id: 'fremd', lamport: 5, payload: 'kein-gueltiges-chiffrat' });
    a.engine.enqueue([op(2, 'gerät-a', 2)]);
    await a.engine.sync();

    await b.engine.sync();

    // Beide echten Ops kommen an, die kaputte Zeile blockiert nichts.
    expect(b.empfangen.map(o => o.entityId).sort()).toEqual(['1', '2']);
  });

  it('vergisst beim Abmelden den Datenschlüssel', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    const schluesselDatei = path.join(a.userDataPath, 'kavoma-sync.key');
    expect(fs.existsSync(schluesselDatei)).toBe(true);

    await a.engine.signOut();

    expect(fs.existsSync(schluesselDatei)).toBe(false);
    expect(a.engine._internals.dek).toBeNull();
    expect(a.engine.status().state).toBe('off');
  });

  it('findet die Sitzung nach einem Neustart wieder', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    // Neustart: neuer Motor, gleicher Ordner, gleicher Store.
    const neu = createEngine({
      store: a.store, userDataPath: a.userDataPath,
      safeStorage: fakeSafeStorage, api: backend.api, broadcast: () => {},
      kdfOverrides: { N: 1 << 12 },
    });
    const zustand = await neu.restore();

    expect(zustand.state).toBe('synced');   // ohne erneute Passphrase-Eingabe
  });

  it('gleicht nach dem Entsperren noch nicht ab — der Mensch sieht erst die Vorschau', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');
    a.engine.enqueue([op(1, 'gerät-a', 1)]);
    await a.engine.sync();

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    await b.engine.unlock('geheim');

    // Entsperrt, aber es darf noch nichts eingespielt worden sein: Sonst wäre
    // der Bestand zusammengeführt, bevor jemand zustimmen konnte.
    expect(b.empfangen).toHaveLength(0);

    await b.engine.start();
    expect(b.empfangen).toHaveLength(1);
  });

  it('lädt Belege nach, die vor der Einrichtung entstanden sind', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');

    // Zwei Belege liegen schon auf der Platte, bevor Sync überhaupt an ist.
    const platte = new Map([['beleg-alt-1', Buffer.from('PDF-1')], ['beleg-alt-2', Buffer.from('PDF-2')]]);
    a.engine.setAttachmentHooks({
      listLocalIds: async () => [...platte.keys()],
      readPlain: async (id) => platte.get(id),
      writePlain: async () => {},
    });

    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    // `attach()` stößt den Nachzug ungedrosselt an — genau dafür ist er da.
    expect([...backend.ablage.keys()].length).toBe(2);
  });

  it('holt einen Beleg nach, dessen Upload offline scheiterte', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    const platte = new Map();
    a.engine.setAttachmentHooks({
      listLocalIds: async () => [...platte.keys()],
      readPlain: async (id) => platte.get(id),
      writePlain: async () => {},
    });
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    // Offline angelegt: lokal da, Upload schlägt fehl.
    backend.state.offline = true;
    platte.set('beleg-offline', Buffer.from('PDF-offline'));
    await a.engine.uploadAttachment('beleg-offline', async (id) => platte.get(id)).catch(() => {});
    expect(backend.ablage.has('user-1/beleg-offline')).toBe(false);

    // Wieder online: der Abgleich zieht ihn nach, ohne dass jemand etwas tut.
    backend.state.offline = false;
    await a.engine.reconcileAttachments();
    expect(backend.ablage.has('user-1/beleg-offline')).toBe(true);
  });

  it('lädt nicht erneut hoch, was schon in der Ablage liegt', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    const platte = new Map([['beleg-1', Buffer.from('PDF')]]);
    a.engine.setAttachmentHooks({
      listLocalIds: async () => [...platte.keys()],
      readPlain: async (id) => platte.get(id),
      writePlain: async () => {},
    });
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    const ersteFassung = backend.ablage.get('user-1/beleg-1');
    const { uploaded } = await a.engine.reconcileAttachments();

    expect(uploaded).toBe(0);
    expect(backend.ablage.get('user-1/beleg-1')).toBe(ersteFassung);
  });

  it('der Beleg kommt beim zweiten Gerät entschlüsselbar an', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    const platteA = new Map([['beleg-1', Buffer.from('%PDF-1.7 Inhalt')]]);
    a.engine.setAttachmentHooks({
      listLocalIds: async () => [...platteA.keys()],
      readPlain: async (id) => platteA.get(id),
      writePlain: async () => {},
    });
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');

    const b = makeDevice(backend, 'b');
    const platteB = new Map();
    b.engine.setAttachmentHooks({
      listLocalIds: async () => [...platteB.keys()],
      readPlain: async (id) => platteB.get(id),
      writePlain: async (id, buf) => { platteB.set(id, buf); },
    });
    await b.engine.signIn('x', 'y');
    await b.engine.unlock('geheim');
    await b.engine.start();

    await b.engine.downloadAttachment('beleg-1', async (id, buf) => { platteB.set(id, buf); });

    expect(platteB.get('beleg-1').toString()).toBe('%PDF-1.7 Inhalt');
  });

  it('richtet das erste Gerät ohne Passphrase ein', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');

    const { recoveryCode } = await a.engine.initializeKey();

    expect(a.engine.status().state).toBe('synced');
    expect(recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/);
    // Nur der Notfall-Umschlag — keine Passphrase mehr.
    expect(backend.keys.map(k => k.kind)).toEqual(['recovery']);
  });

  it('verbindet ein zweites Gerät über die sechsstellige Zahl', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.initializeKey();

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    expect(b.engine.status().state).toBe('locked');

    // 1. Neues Gerät stellt die Anfrage.
    const { linkId } = await b.engine.startDeviceLink();

    // 2. Eingerichtetes Gerät sieht sie und antwortet automatisch.
    const offen = await a.engine.listPendingLinks();
    expect(offen.map(o => o.id)).toContain(linkId);
    await a.engine.respondToLink(linkId);

    // 3. Erst jetzt kann das neue Gerät die Zahl zeigen.
    const zwischenstand = await b.engine.pollLinkOnce();
    expect(zwischenstand.state).toBe('zahl-steht');
    expect(zwischenstand.code).toMatch(/^\d{6}$/);

    // 4. Der Mensch tippt sie am eingerichteten Gerät ein.
    await a.engine.approveLink(linkId, zwischenstand.code);

    // 5. Schlüssel kommt an.
    const fertig = await b.engine.pollLinkOnce();
    expect(fertig.state).toBe('fertig');
    expect(b.engine._internals.dek.equals(a.engine._internals.dek)).toBe(true);
    expect(backend.links.size).toBe(0);   // Vorgang aufgeräumt
  });

  it('gibt den Schlüssel bei falscher Zahl nicht heraus', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.initializeKey();

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    const { linkId } = await b.engine.startDeviceLink();
    await a.engine.respondToLink(linkId);
    const { code } = await b.engine.pollLinkOnce();

    const falsch = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    await expect(a.engine.approveLink(linkId, falsch)).rejects.toThrow(/stimmen nicht überein/);

    // Nichts abgelegt, das zweite Gerät bleibt gesperrt.
    expect(backend.links.get(linkId).wrapped_dek).toBeNull();
    expect(b.engine.status().state).toBe('locked');
  });

  it('das eingerichtete Gerät zeigt seine eigene Anfrage nicht an', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.initializeKey();
    await a.engine.startDeviceLink();

    // Sonst könnte man sich selbst bestätigen — sinnlos und verwirrend.
    expect(await a.engine.listPendingLinks()).toHaveLength(0);
  });

  it('eine abgelehnte Anfrage verschwindet', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.initializeKey();

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    const { linkId } = await b.engine.startDeviceLink();

    await a.engine.rejectLink(linkId);
    expect(await a.engine.listPendingLinks()).toHaveLength(0);
    expect(b.engine.status().state).toBe('locked');
  });

  it('der Wiederherstellungscode bleibt der Ausweg ohne zweites Gerät', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    const { recoveryCode } = await a.engine.initializeKey();

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    await b.engine.unlock(recoveryCode);

    expect(b.engine._internals.dek.equals(a.engine._internals.dek)).toBe(true);
  });

  it('liefert für den Erstabgleich alles, ohne den Zeiger zu bewegen', async () => {
    const backend = makeFakeBackend();
    const a = makeDevice(backend, 'a');
    await a.engine.signIn('x', 'y');
    await a.engine.setupPassphrase('geheim');
    a.engine.enqueue([op(1, 'gerät-a', 1), op(2, 'gerät-a', 1)]);
    await a.engine.sync();

    const b = makeDevice(backend, 'b');
    await b.engine.signIn('x', 'y');
    await b.engine.unlock('geheim');

    const { ops, upTo } = await b.engine.fetchAll();
    expect(ops).toHaveLength(2);
    expect(upTo).toBeGreaterThan(0);
  });
});
