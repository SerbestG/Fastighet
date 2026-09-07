-- ---------------------------------------------------------------------------
-- Användningsstatistik (krav A.3.12, A.3.13, A.3.14).
--
-- Frågan som ska besvaras är hur många som använt en viss del av appen, totalt
-- och per område. Det kräver inte att en enskild persons klick sparas.
--
-- Därför lagras ingen användaridentitet, utan en dagsnyckel: en hash av person,
-- dag och en hemlig peppar. Den gör det möjligt att räkna unika användare per
-- dag, men går inte att koppla till en person, och två dagars nycklar går inte
-- att länka ihop.
-- ---------------------------------------------------------------------------

create table usage_events (
  id bigserial primary key,
  org_id uuid not null references organisations(id) on delete cascade,
  at timestamptz not null default now(),
  day date not null default current_date,
  -- Vad som användes: en meny, en vy eller en nyhet.
  kind text not null check (kind in ('menu', 'view', 'notice')),
  -- Menyns nyckel, vyns sökväg eller nyhetens id.
  key text not null,
  -- Området användaren bor i, för uppdelningen per område.
  area_id uuid references areas(id) on delete set null,
  -- Pseudonym som byts varje dygn. Se filhuvudet.
  subject_key text not null,
  surface text not null check (surface in ('resident', 'staff', 'contractor'))
);

create index usage_events_org_day_idx on usage_events (org_id, day, kind);
create index usage_events_org_key_idx on usage_events (org_id, kind, key, day);
-- Samma person och samma nyckel räknas en gång per dag.
create unique index usage_events_unique_idx on usage_events (org_id, day, kind, key, subject_key);

alter table usage_events enable row level security;
create policy usage_events_isolation on usage_events
  using (org_id = app.current_org()) with check (org_id = app.current_org());

grant select, insert, update, delete on usage_events to hemvist_app;
grant usage, select on sequence usage_events_id_seq to hemvist_app;
