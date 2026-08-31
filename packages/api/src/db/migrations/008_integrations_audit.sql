-- ---------------------------------------------------------------------------
-- Integrationsregister, integrationslogg, säkerhetslogg och dataskydd.
-- ---------------------------------------------------------------------------

create table integrations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  kind         text not null,
  name         text not null,
  -- Status sätts av verklig konfiguration och anslutningskontroll, aldrig av
  -- att ett gränssnitt finns (avsnitt 21 i kravbilden).
  status       text not null default 'planned'
               check (status in ('connected','requires_configuration','sandbox','disconnected','planned')),
  base_url     text,
  notes        text,
  -- Endast icke-hemliga inställningar. Nycklar och lösenord lagras i plattformens
  -- hemlighetshanterare och refereras via secret_ref (krav C.3.2).
  config       jsonb not null default '{}'::jsonb,
  secret_ref   text,
  last_check_at timestamptz,
  last_ok_at   timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, kind, name)
);
create trigger integrations_touch before update on integrations for each row execute function app.touch_updated_at();

alter table access_points
  add constraint access_points_integration_fk foreign key (integration_id)
  references integrations(id) on delete set null;

-- Loggning av anrop till och från verksamhetssystem (krav C.3.4, C.3.9, A.1.13).
create table integration_events (
  id             bigserial primary key,
  org_id         uuid not null references organisations(id) on delete cascade,
  integration_id uuid references integrations(id) on delete set null,
  at             timestamptz not null default now(),
  direction      text not null check (direction in ('outbound','inbound')),
  endpoint       text not null,
  status_code    integer,
  duration_ms    integer,
  correlation_id text,
  user_id        uuid references users(id) on delete set null,
  entity_type    text,
  entity_id      uuid,
  ok             boolean not null default true,
  error          text,
  summary        jsonb not null default '{}'::jsonb
);
create index integration_events_org_idx on integration_events (org_id, at desc);
create index integration_events_integration_idx on integration_events (org_id, integration_id, at desc);

-- --------------------------------------------------------- säkerhetslogg

-- Loggen är avsedd att vara oföränderlig. Inga UPDATE- eller DELETE-policyer
-- skapas för tabellen (se 009_rls.sql), så applikationsrollen kan bara lägga till.
create table audit_log (
  id             bigserial primary key,
  org_id         uuid references organisations(id) on delete set null,
  at             timestamptz not null default now(),
  actor_user_id  uuid,
  actor_email    text,
  actor_roles    text[],
  action         text not null,
  entity_type    text,
  entity_id      uuid,
  subject_user_id uuid,
  ip             inet,
  user_agent     text,
  trace_id       text,
  outcome        text not null default 'success' check (outcome in ('success','denied','failure')),
  detail         jsonb not null default '{}'::jsonb
);
create index audit_log_org_idx on audit_log (org_id, at desc);
create index audit_log_actor_idx on audit_log (org_id, actor_user_id, at desc);
create index audit_log_entity_idx on audit_log (org_id, entity_type, entity_id, at desc);

-- ------------------------------------------------------------- dataskydd

create table gdpr_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  kind         text not null check (kind in ('export','rectification','erasure','anonymisation')),
  status       text not null default 'pending'
               check (status in ('pending','in_progress','completed','rejected')),
  reason       text,
  requested_by uuid references users(id) on delete set null,
  result_file_id uuid references files(id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index gdpr_requests_org_idx on gdpr_requests (org_id, status, created_at desc);

-- Gallringsregler per datatyp. Bakgrundsjobbet läser tabellen i stället för att
-- ha gallringstider hårdkodade.
create table retention_policies (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  entity       text not null,
  retain_days  integer not null check (retain_days > 0),
  action       text not null default 'anonymise' check (action in ('anonymise','delete')),
  description  text,
  active       boolean not null default true,
  unique (org_id, entity)
);

-- ------------------------------------------------------- bakgrundskörningar

create table job_runs (
  id         bigserial primary key,
  job        text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok         boolean,
  processed  integer not null default 0,
  error      text
);
create index job_runs_job_idx on job_runs (job, started_at desc);
