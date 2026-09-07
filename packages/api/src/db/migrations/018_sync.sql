-- ---------------------------------------------------------------------------
-- Synkronisering mot verksamhetssystem (krav A.1.8, C.3.5, C.3.9–C.3.13).
--
-- Varje datamängd synkas för sig och bär sin egen färskhet. Går en hämtning
-- fel skjuts nästa försök upp med växande fördröjning, och den senast lyckade
-- tidpunkten står kvar – så att gränssnittet kan säga att uppgifterna inte är
-- uppdaterade i stället för att visa dem som aktuella.
-- ---------------------------------------------------------------------------

create table sync_datasets (
  org_id uuid not null references organisations(id) on delete cascade,
  -- Vilken datamängd: kunder, objekt, hyresavtal, avier.
  dataset text not null,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  -- Växande fördröjning efter fel, så att ett trasigt system inte hamras.
  next_attempt_at timestamptz,
  consecutive_failures integer not null default 0,
  -- Markör hos källsystemet, för att bara hämta det som ändrats.
  cursor text,
  rows_last_run integer,
  -- Efter så här länge utan lyckad hämtning räknas uppgifterna som inaktuella.
  stale_after_minutes integer not null default 180,
  updated_at timestamptz not null default now(),
  primary key (org_id, dataset)
);

-- Utgående ändringar till verksamhetssystemet. Raden ligger kvar tills den
-- kvitterats, så att en tillfällig störning inte tappar en ändring.
create table integration_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  kind text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'blocked_no_integration')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index integration_outbox_due_idx on integration_outbox (org_id, status, next_attempt_at)
  where status = 'pending';

alter table sync_datasets enable row level security;
create policy sync_datasets_isolation on sync_datasets
  using (org_id = app.current_org()) with check (org_id = app.current_org());

alter table integration_outbox enable row level security;
create policy integration_outbox_isolation on integration_outbox
  using (org_id = app.current_org()) with check (org_id = app.current_org());

grant select, insert, update, delete on sync_datasets, integration_outbox to hemvist_app;

-- Referenserna från källsystemet måste vara unika för att en hämtning ska kunna
-- uppdatera i stället för att skapa dubbletter.
create unique index tenancies_org_external_ref_idx on tenancies (org_id, external_ref)
  where external_ref is not null;
create unique index invoices_org_external_ref_idx on invoices (org_id, external_ref)
  where external_ref is not null;
