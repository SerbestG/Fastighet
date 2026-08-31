-- ---------------------------------------------------------------------------
-- Ärenden: felanmälan, störning, övriga ärendetyper och arbetsorder.
-- ---------------------------------------------------------------------------

-- Handläggargrupper som en ärendetyp kan riktas till (krav B.1.33).
create table teams (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  name        text not null,
  description text,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index teams_org_name_idx on teams (org_id, lower(name));

create table team_members (
  org_id  uuid not null references organisations(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (team_id, user_id)
);
create index team_members_org_user_idx on team_members (org_id, user_id);

-- Regler för automatisk fördelning: kategori (och valfritt område) styr vilken
-- grupp ärendet hamnar i.
create table routing_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organisations(id) on delete cascade,
  category_key    text,
  subcategory_key text,
  area_id         uuid references areas(id) on delete cascade,
  team_id         uuid not null references teams(id) on delete cascade,
  priority_floor  text check (priority_floor in ('emergency','high','normal','low')),
  sort_order      integer not null default 0,
  active          boolean not null default true
);
create index routing_rules_org_idx on routing_rules (org_id, active, sort_order);

create table contractor_orgs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  name          text not null,
  org_number    text,
  contact_email text,
  contact_phone text,
  trades        text[] not null default '{}',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index contractor_orgs_org_name_idx on contractor_orgs (org_id, lower(name));

-- Entreprenörsanvändare hör till ett entreprenörsbolag och ser inget annat.
alter table users add column contractor_org_id uuid references contractor_orgs(id) on delete set null;
create index users_contractor_idx on users (org_id, contractor_org_id) where contractor_org_id is not null;

-- Löpnummer per organisation, så att ärendenummer inte avslöjar volymen hos
-- andra bolag i plattformen.
create table case_counters (
  org_id uuid primary key references organisations(id) on delete cascade,
  next_number bigint not null default 1
);

create table cases (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organisations(id) on delete cascade,
  case_number     text not null,
  kind            text not null default 'fault_report'
                  check (kind in ('fault_report','disturbance','request','inspection')),
  status          text not null default 'received'
                  check (status in ('received','under_review','assigned','visit_booked',
                                    'in_progress','awaiting_materials','awaiting_tenant',
                                    'resolved','closed','cancelled')),
  priority        text not null default 'normal'
                  check (priority in ('emergency','high','normal','low')),
  location_kind   text not null check (location_kind in ('residence','contract_object','common_area')),
  category_key    text not null,
  subcategory_key text not null,
  space           text,
  title           text not null,
  description     text not null,

  -- Placering i beståndet. Minst en av tenancy_id och building_id är satt.
  tenancy_id      uuid references tenancies(id) on delete set null,
  unit_id         uuid references units(id) on delete set null,
  building_id     uuid references buildings(id) on delete set null,
  property_id     uuid references properties(id) on delete set null,
  area_id         uuid references areas(id) on delete set null,

  reporter_user_id uuid references users(id) on delete set null,
  assignee_id      uuid references users(id) on delete set null,
  team_id          uuid references teams(id) on delete set null,
  contractor_org_id uuid references contractor_orgs(id) on delete set null,

  -- Känsliga ärenden (störning, trygghet) kräver utökad behörighet.
  sensitive       boolean not null default false,

  allow_master_key boolean not null default false,
  has_pets        boolean not null default false,
  pet_notes       text,
  access_windows  jsonb not null default '[]'::jsonb,
  contact_phone   text,
  triage_answers  jsonb not null default '{}'::jsonb,
  escalated       boolean not null default false,
  escalation_reasons text[] not null default '{}',

  sla_respond_at  timestamptz,
  sla_resolve_at  timestamptz,
  first_response_at timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  reopened_count  integer not null default 0,

  cost_estimate_ore integer check (cost_estimate_ore >= 0),
  cost_actual_ore   integer check (cost_actual_ore >= 0),

  merged_into_case_id uuid references cases(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index cases_org_number_idx on cases (org_id, case_number);
create index cases_org_status_idx on cases (org_id, status, created_at desc);
create index cases_org_priority_idx on cases (org_id, priority, created_at desc);
create index cases_org_assignee_idx on cases (org_id, assignee_id) where assignee_id is not null;
create index cases_org_property_idx on cases (org_id, property_id, created_at desc);
create index cases_org_building_idx on cases (org_id, building_id, created_at desc);
create index cases_org_tenancy_idx on cases (org_id, tenancy_id, created_at desc);
create index cases_org_category_idx on cases (org_id, category_key, subcategory_key);
create index cases_sla_idx on cases (org_id, sla_resolve_at) where closed_at is null;
create index cases_search_idx on cases using gin ((title || ' ' || description) gin_trgm_ops);
create trigger cases_touch before update on cases for each row execute function app.touch_updated_at();

-- Tidslinje. Varje rad är en händelse som kan visas för hyresgästen eller
-- enbart internt.
create table case_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  case_id        uuid not null references cases(id) on delete cascade,
  at             timestamptz not null default now(),
  actor_user_id  uuid references users(id) on delete set null,
  actor_label    text,
  kind           text not null,
  from_status    text,
  to_status      text,
  payload        jsonb not null default '{}'::jsonb,
  visible_to_resident boolean not null default true
);
create index case_events_case_idx on case_events (org_id, case_id, at);

create table case_comments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  case_id        uuid not null references cases(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  body           text not null,
  -- Interna kommentarer lämnar aldrig personalgränssnittet.
  internal       boolean not null default false,
  created_at     timestamptz not null default now()
);
create index case_comments_case_idx on case_comments (org_id, case_id, created_at);

create table case_attachments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  case_id    uuid not null references cases(id) on delete cascade,
  comment_id uuid references case_comments(id) on delete cascade,
  file_id    uuid not null references files(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (case_id, file_id)
);
create index case_attachments_case_idx on case_attachments (org_id, case_id);

create table case_links (
  org_id          uuid not null references organisations(id) on delete cascade,
  case_id         uuid not null references cases(id) on delete cascade,
  related_case_id uuid not null references cases(id) on delete cascade,
  kind            text not null default 'related' check (kind in ('related','duplicate','merged')),
  created_at      timestamptz not null default now(),
  primary key (case_id, related_case_id),
  check (case_id <> related_case_id)
);
create index case_links_org_idx on case_links (org_id, related_case_id);

create table case_feedback (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  case_id    uuid not null references cases(id) on delete cascade,
  user_id    uuid references users(id) on delete set null,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  resolved   boolean not null default true,
  created_at timestamptz not null default now(),
  unique (case_id, user_id)
);
create index case_feedback_org_idx on case_feedback (org_id, created_at desc);

-- ------------------------------------------------------------ arbetsorder

create table work_orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organisations(id) on delete cascade,
  case_id           uuid not null references cases(id) on delete cascade,
  number            text not null,
  contractor_org_id uuid references contractor_orgs(id) on delete set null,
  assignee_id       uuid references users(id) on delete set null,
  title             text not null,
  instructions      text,
  status            text not null default 'offered'
                    check (status in ('offered','accepted','declined','scheduled','on_site',
                                      'blocked','completed','cancelled')),
  planned_start     timestamptz,
  planned_end       timestamptz,
  accepted_at       timestamptz,
  declined_at       timestamptz,
  declined_reason   text,
  checked_in_at     timestamptz,
  completed_at      timestamptz,
  blocker_reason    text,
  minutes_spent     integer check (minutes_spent >= 0),
  notes             text,
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index work_orders_org_number_idx on work_orders (org_id, number);
create index work_orders_org_case_idx on work_orders (org_id, case_id);
create index work_orders_contractor_idx on work_orders (org_id, contractor_org_id, status);
create trigger work_orders_touch before update on work_orders for each row execute function app.touch_updated_at();

create table work_order_materials (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  description   text not null,
  quantity      numeric(10,2) not null check (quantity >= 0),
  unit          text not null default 'st',
  unit_cost_ore integer check (unit_cost_ore >= 0),
  created_at    timestamptz not null default now()
);
create index work_order_materials_org_idx on work_order_materials (org_id, work_order_id);

create table work_order_attachments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  file_id       uuid not null references files(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (work_order_id, file_id)
);
