-- ---------------------------------------------------------------------------
-- Inflyttning och utflyttning, passage och nycklar, enkäter.
-- ---------------------------------------------------------------------------

create table move_flows (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  tenancy_id   uuid not null references tenancies(id) on delete cascade,
  kind         text not null check (kind in ('move_in','move_out')),
  move_date    date,
  status       text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenancy_id, kind)
);
create index move_flows_org_idx on move_flows (org_id, status);

create table move_steps (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  flow_id     uuid not null references move_flows(id) on delete cascade,
  key         text not null,
  title       text not null,
  description text,
  status      text not null default 'pending'
              check (status in ('pending','in_progress','done','not_applicable')),
  required    boolean not null default true,
  sort_order  integer not null default 0,
  data        jsonb not null default '{}'::jsonb,
  note        text,
  completed_at timestamptz,
  completed_by uuid references users(id) on delete set null,
  unique (flow_id, key)
);
create index move_steps_org_flow_idx on move_steps (org_id, flow_id, sort_order);

-- Brister som hyresgästen anmäler vid digital inflyttningskontroll.
create table move_defects (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  flow_id    uuid not null references move_flows(id) on delete cascade,
  space      text not null,
  description text not null,
  case_id    uuid references cases(id) on delete set null,
  created_at timestamptz not null default now()
);
create index move_defects_org_flow_idx on move_defects (org_id, flow_id);

-- --------------------------------------------------------- passage/nycklar

create table access_points (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  kind           text not null
                 check (kind in ('entrance_door','apartment','laundry','garage','bike_room',
                                 'storage','common_room','other')),
  name           text not null,
  scope          text not null
                 check (scope in ('organisation','area','property','building','entrance','unit')),
  scope_id       uuid,
  -- Utan en integration som är i status connected visas ingen digital nyckel.
  integration_id uuid,
  external_ref   text,
  created_at     timestamptz not null default now()
);
create index access_points_org_scope_idx on access_points (org_id, scope, scope_id);

alter table resources
  add constraint resources_access_point_fk foreign key (access_point_id)
  references access_points(id) on delete set null;

create table access_grants (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organisations(id) on delete cascade,
  access_point_id uuid not null references access_points(id) on delete cascade,
  user_id         uuid references users(id) on delete cascade,
  contractor_org_id uuid references contractor_orgs(id) on delete cascade,
  work_order_id   uuid references work_orders(id) on delete cascade,
  valid_from      timestamptz not null,
  valid_to        timestamptz,
  status          text not null default 'active'
                  check (status in ('pending','active','revoked','expired','failed')),
  reason          text,
  granted_by      uuid references users(id) on delete set null,
  revoked_at      timestamptz,
  revoked_by      uuid references users(id) on delete set null,
  external_ref    text,
  created_at      timestamptz not null default now(),
  check (user_id is not null or contractor_org_id is not null)
);
create index access_grants_org_point_idx on access_grants (org_id, access_point_id, status);
create index access_grants_org_user_idx on access_grants (org_id, user_id, status);

-- Alla tillträdesändringar loggas (avsnitt 14 i kravbilden).
create table access_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  grant_id      uuid references access_grants(id) on delete cascade,
  access_point_id uuid references access_points(id) on delete cascade,
  at            timestamptz not null default now(),
  kind          text not null,
  actor_user_id uuid references users(id) on delete set null,
  detail        jsonb not null default '{}'::jsonb
);
create index access_events_org_idx on access_events (org_id, at desc);

-- ---------------------------------------------------------------- enkäter

create table surveys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  kind        text not null
              check (kind in ('resident_survey','case_followup','area_study','renovation_input','option_vote')),
  title       text not null,
  description text,
  status      text not null default 'draft' check (status in ('draft','open','closed')),
  anonymous   boolean not null default true,
  opens_at    timestamptz,
  closes_at   timestamptz,
  questions   jsonb not null,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index surveys_org_status_idx on surveys (org_id, status);
create trigger surveys_touch before update on surveys for each row execute function app.touch_updated_at();

create table survey_audiences (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organisations(id) on delete cascade,
  survey_id uuid not null references surveys(id) on delete cascade,
  scope     text not null,
  scope_id  uuid
);
create index survey_audiences_idx on survey_audiences (org_id, survey_id);

-- Svaren lagras utan koppling till användaren när enkäten är anonym. Strukturen
-- (område, fastighet) behålls så att resultat kan sammanställas per nivå utan att
-- enskilda svar kan spåras till en person (avsnitt 17 i kravbilden).
create table survey_responses (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  survey_id    uuid not null references surveys(id) on delete cascade,
  respondent_key text not null,
  user_id      uuid references users(id) on delete set null,
  tenancy_id   uuid references tenancies(id) on delete set null,
  property_id  uuid references properties(id) on delete set null,
  area_id      uuid references areas(id) on delete set null,
  case_id      uuid references cases(id) on delete set null,
  answers      jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (survey_id, respondent_key)
);
create index survey_responses_org_idx on survey_responses (org_id, survey_id);
