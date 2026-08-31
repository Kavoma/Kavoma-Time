// ============================================================
// Supabase-Zugangsdaten
// ============================================================
// Diese Werte stehen bewusst im Klartext im Repository — sie sind dafür
// gemacht, öffentlich zu sein. Der `publishable`-Schlüssel (früher „anon key")
// darf nichts von sich aus: Was er sehen und schreiben darf, entscheiden
// ausschließlich die RLS-Regeln in der Datenbank. Er ist kein Geheimnis,
// sondern eine Adresse.
//
// NICHT hierher gehört der `sb_secret_...`-Schlüssel (früher „service_role").
// Der hebelt RLS vollständig aus und hat in einer Desktop-App nichts zu
// suchen — ein `.asar`-Archiv ist mit einem Befehl wieder aufgemacht.
//
// Warum keine `VITE_`-Umgebungsvariable: Vite baut nur den Renderer. Der
// Sync-Motor läuft im Main-Prozess, und der wird unverändert ins Paket kopiert
// — `import.meta.env.VITE_SUPABASE_URL` wäre dort schlicht `undefined`.
// Dass der Schlüssel im Renderer landet, wollen wir ohnehin nicht: Der
// Datenschlüssel bleibt im Main-Prozess, wie bei den Anhängen auch.

module.exports = {
  url: 'https://rtqwiezmogooqktseqlf.supabase.co',
  publishableKey: 'sb_publishable_NpoCo7ibLPPDW0R5cM6bcg_w_DbHGhG',

  // Die neuen Schlüssel sind keine JWTs. Werden sie als `Authorization: Bearer`
  // geschickt, versucht die Plattform sie als JWT zu lesen und weist sie ab —
  // sie gehören in den `apikey`-Header. `supabase-js` macht das von allein,
  // eigene `fetch`-Aufrufe müssen daran denken.
  authHeaderName: 'apikey',

  // Serverstandort. Steht so in der Datenschutzerklärung (LegalModal.tsx) und
  // muss mit der tatsächlichen Einstellung übereinstimmen — nachzusehen unter
  // Supabase-Konsole → Project Settings → General → Region.
  //
  // `eu-west-2` heißt London. Das Vereinigte Königreich ist seit dem Brexit
  // **kein EU-Mitglied**, die Übermittlung dorthin also eine Drittland-
  // übermittlung nach Art. 44 ff. DSGVO. Gedeckt ist sie durch den
  // Angemessenheitsbeschluss der EU-Kommission, den diese am 19.12.2025 bis
  // zum 27.12.2031 verlängert hat — Standardvertragsklauseln sind daher nicht
  // nötig. Das muss in der Datenschutzerklärung stehen, und zwar so.
  //
  // Wer das vermeiden will, legt ein neues Projekt in `eu-central-1`
  // (Frankfurt) an; die Region eines bestehenden Projekts lässt sich nicht
  // umstellen.
  regionCode: 'eu-west-2',
  region: 'London, Vereinigtes Königreich',
  /** Ob der Standort außerhalb der EU/des EWR liegt — steuert den Zusatz in der Erklärung. */
  regionIsThirdCountry: true,
};
