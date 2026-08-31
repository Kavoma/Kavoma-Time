-- ============================================================
-- Gerätesynchronisation — Schema (Issue #31)
-- ============================================================
-- Der Server sieht ausschließlich Chiffrat. `payload` und `wrapped_dek` sind
-- base64-kodierte AES-256-GCM-Umschläge (IV|Tag|Ciphertext), deren Schlüssel
-- das Gerät nie verlässt. Was hier in Klartext steht, sind reine Metadaten:
-- wer, wann, in welcher Reihenfolge — nie, was drinsteht.
--
-- Deshalb gibt es hier auch keine Spalten für Kunden, Rechnungen oder Zeiten:
-- Die Datenbank ist bewusst dumm. Sie ordnet und verteilt, sie versteht nicht.

-- === Geräte ================================================================
create table public.devices (
  id           uuid primary key,               -- vom Gerät erzeugt, siehe sync_device_id
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  platform     text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Fremdschlüssel werden von Postgres nicht automatisch indiziert. Ohne Index
-- wird jede RLS-Prüfung und jedes `on delete cascade` zum Full Scan.
create index devices_user_id_idx on public.devices (user_id);

-- === Schlüsselumschläge ====================================================
-- Zwei Zeilen pro Konto: eine für die Passphrase, eine für den
-- Wiederherstellungscode. Beide umschließen denselben Datenschlüssel — deshalb
-- ist ein vergessenes Passwort kein Totalverlust, und ein Passwortwechsel
-- schreibt nur den Umschlag neu, nicht den Bestand.
create table public.sync_keys (
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('passphrase', 'recovery')),
  kdf         jsonb not null,                  -- { algo, N, r, p, salt }
  wrapped_dek text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, kind)                  -- user_id führt → deckt Lookups ab
);

-- === Änderungsprotokoll ====================================================
create table public.sync_ops (
  seq        bigint generated always as identity primary key,  -- Gesamtordnung
  user_id    uuid not null references auth.users (id) on delete cascade,
  device_id  uuid not null,
  lamport    bigint not null check (lamport >= 0),
  payload    text not null,
  created_at timestamptz not null default now()
);

-- Der einzige Zugriffspfad: „alles von mir ab Marke X".
create index sync_ops_user_seq_idx on public.sync_ops (user_id, seq);

-- === Verdichtung ===========================================================
-- Ohne sie wüchse `sync_ops` unbegrenzt und jedes neu angemeldete Gerät müsste
-- die gesamte Historie durchspielen. Alle paar hundert Ops legt ein Gerät
-- einen verschlüsselten Vollstand ab; ältere Ops können dann weg.
create table public.sync_snapshots (
  user_id    uuid not null references auth.users (id) on delete cascade,
  up_to_seq  bigint not null,
  payload    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, up_to_seq)
);

-- === Nummernkreise =========================================================
-- Der Grund, warum hier eine Datenbank steht und kein geteilter Ordner:
-- Rechnungsnummern dürfen sich nie doppeln, und nur eine Zeilensperre kann das
-- garantieren.
create table public.number_sequences (
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('invoice', 'debtor')),
  year       int  not null check (year between 2000 and 2200),
  next_value bigint not null check (next_value >= 1),
  primary key (user_id, kind, year)
);

-- === Row Level Security ====================================================
-- `force` gilt auch für den Tabelleneigentümer. `(select auth.uid())` statt
-- `auth.uid()`: So wird die Funktion einmal ausgewertet statt einmal pro Zeile.
alter table public.devices          enable row level security;
alter table public.sync_keys        enable row level security;
alter table public.sync_ops         enable row level security;
alter table public.sync_snapshots   enable row level security;
alter table public.number_sequences enable row level security;

alter table public.devices          force row level security;
alter table public.sync_keys        force row level security;
alter table public.sync_ops         force row level security;
alter table public.sync_snapshots   force row level security;
alter table public.number_sequences force row level security;

create policy devices_own on public.devices
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy sync_keys_own on public.sync_keys
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy sync_ops_own on public.sync_ops
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy sync_snapshots_own on public.sync_snapshots
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy number_sequences_own on public.number_sequences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- === Nummernvergabe ========================================================
-- Bewusst `security invoker` (die Voreinstellung, hier ausgeschrieben): Die
-- Funktion braucht keine erhöhten Rechte, weil RLS den Nutzer ohnehin auf
-- seine eigene Zeile begrenzt. Eine `security definer`-Funktion würde RLS
-- aushebeln und müsste die Identität selbst nachprüfen — mehr Angriffsfläche
-- für null Gewinn.
--
-- `set search_path = ''` schließt Search-Path-Injection aus; deshalb ist unten
-- alles voll qualifiziert.
--
-- Atomar durch `insert … on conflict do update … returning`: Die Zeilensperre
-- der Datenbank ist die einzige Stelle, an der zwei Geräte nicht dieselbe
-- Nummer ziehen können.
create or replace function public.allocate_number(
  p_kind  text,
  p_year  int,
  p_count int default 1
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_first bigint;
begin
  if p_kind not in ('invoice', 'debtor') then
    raise exception 'Unbekannter Nummernkreis: %', p_kind;
  end if;
  -- Deckel gegen versehentliches Verbrennen des Nummernkreises.
  if p_count < 1 or p_count > 100 then
    raise exception 'Ungültige Anzahl: %', p_count;
  end if;

  -- Alias `ns`: In `on conflict do update` wird die Zieltabelle über Namen oder
  -- Alias angesprochen, nicht schema-qualifiziert — `public.number_sequences.…`
  -- wäre hier ein ungültiger FROM-Verweis.
  insert into public.number_sequences as ns (user_id, kind, year, next_value)
  values ((select auth.uid()), p_kind, p_year, 1 + p_count)
  on conflict (user_id, kind, year)
  do update set next_value = ns.next_value + p_count
  returning ns.next_value - p_count into v_first;

  return v_first;
end;
$$;

revoke execute on function public.allocate_number(text, int, int) from public, anon;
grant  execute on function public.allocate_number(text, int, int) to authenticated;
