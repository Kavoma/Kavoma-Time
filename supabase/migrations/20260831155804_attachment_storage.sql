-- ============================================================
-- Belege — verschlüsselter Ablageplatz (Issue #31, Schritt 6)
-- ============================================================
-- Auch hier sieht der Server nur Rauschen: Die Datei wird auf dem Gerät mit
-- dem Datenschlüssel verschlüsselt, bevor sie hochgeht. Der Eimer ist privat,
-- die Pfade tragen die Konto-Kennung als erstes Segment — daran hängen die
-- Zugriffsregeln.

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Jede Regel prüft, dass der erste Pfadabschnitt die eigene Konto-Kennung ist.
-- `(select auth.uid())` statt `auth.uid()`: einmal auswerten statt pro Zeile.
create policy attachments_eigene_lesen on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_eigene_schreiben on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_eigene_ersetzen on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_eigene_loeschen on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
