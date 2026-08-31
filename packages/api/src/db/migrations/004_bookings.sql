-- ---------------------------------------------------------------------------
-- Bokningsbara resurser, bokningar, väntelista och spärrar.
-- ---------------------------------------------------------------------------

create table resources (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organisations(id) on delete cascade,
  kind                  text not null
                        check (kind in ('laundry','common_room','sauna','guest_apartment','parking',
                                        'caretaker_visit','inspection','key_pickup','other')),
  name                  text not null,
  description           text,
  -- Resursen tillhör en nivå i fastighetsstrukturen (krav B.1.37, B.1.38).
  scope                 text not null
                        check (scope in ('organisation','area','property','building','entrance','unit')),
  scope_id              uuid,
  slot_minutes          integer not null default 180 check (slot_minutes between 15 and 1440),
  opens_at              time not null default '07:00',
  closes_at             time not null default '22:00',
  max_active_per_tenancy integer not null default 2 check (max_active_per_tenancy between 1 and 20),
  max_days_ahead        integer not null default 30 check (max_days_ahead between 1 and 365),
  cancellation_hours    integer not null default 2 check (cancellation_hours >= 0),
  price_ore             integer not null default 0 check (price_ore >= 0),
  deposit_ore           integer not null default 0 check (deposit_ore >= 0),
  requires_approval     boolean not null default false,
  waitlist_enabled      boolean not null default false,
  access_point_id       uuid,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (closes_at > opens_at)
);
create index resources_org_scope_idx on resources (org_id, scope, scope_id) where active;
create trigger resources_touch before update on resources for each row execute function app.touch_updated_at();

create table bookings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  resource_id  uuid not null references resources(id) on delete cascade,
  tenancy_id   uuid references tenancies(id) on delete set null,
  user_id      uuid references users(id) on delete set null,
  -- Ett besök av fastighetsskötare är en bokning kopplad till ett ärende.
  case_id      uuid references cases(id) on delete cascade,
  work_order_id uuid references work_orders(id) on delete set null,
  slot         tstzrange not null,
  status       text not null default 'confirmed'
               check (status in ('reserved','confirmed','cancelled','completed','no_show','waitlisted')),
  note         text,
  -- Tillfällig passerkod skapas endast när en verklig låsintegration finns.
  access_code  text,
  access_code_valid_to timestamptz,
  price_ore    integer not null default 0,
  deposit_ore  integer not null default 0,
  reminder_sent_at timestamptz,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references users(id) on delete set null,
  cancel_reason text,
  updated_at   timestamptz not null default now(),
  check (not isempty(slot))
);
-- Dubbelbokning är omöjlig på databasnivå, inte bara i applikationen.
alter table bookings add constraint bookings_no_overlap
  exclude using gist (
    resource_id with =,
    slot with &&
  ) where (status in ('reserved','confirmed'));
create index bookings_org_resource_idx on bookings (org_id, resource_id, slot);
create index bookings_org_user_idx on bookings (org_id, user_id, slot);
create index bookings_org_case_idx on bookings (org_id, case_id) where case_id is not null;
create index bookings_upcoming_idx on bookings (org_id, lower(slot)) where status in ('reserved','confirmed');
create trigger bookings_touch before update on bookings for each row execute function app.touch_updated_at();

create table resource_blocks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  slot        tstzrange not null,
  reason      text not null,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index resource_blocks_idx on resource_blocks using gist (resource_id, slot);
create index resource_blocks_org_idx on resource_blocks (org_id, resource_id);

create table booking_waitlist (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  tenancy_id  uuid references tenancies(id) on delete set null,
  slot        tstzrange not null,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  unique (resource_id, user_id, slot)
);
create index booking_waitlist_org_idx on booking_waitlist (org_id, resource_id, created_at);
