-- ---------------------------------------------------------------------------
-- Fastighetsstruktur: område > fastighet > byggnad > trapphus > hyresobjekt.
-- Strukturen speglar den nivåindelning som publiceringar och bokningsresurser
-- kan riktas mot (krav B.1.15, B.1.16, B.1.37, B.1.38).
-- ---------------------------------------------------------------------------

create table areas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  name        text not null,
  code        text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index areas_org_name_idx on areas (org_id, lower(name));
create trigger areas_touch before update on areas for each row execute function app.touch_updated_at();

create table properties (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  area_id     uuid not null references areas(id) on delete restrict,
  name        text not null,
  designation text,
  street      text not null,
  postal_code text,
  city        text not null,
  latitude    double precision check (latitude between -90 and 90),
  longitude   double precision check (longitude between -180 and 180),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index properties_org_area_idx on properties (org_id, area_id);
create index properties_search_idx on properties using gin (
  (name || ' ' || street || ' ' || city) gin_trgm_ops
);
create trigger properties_touch before update on properties for each row execute function app.touch_updated_at();

create table buildings (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organisations(id) on delete cascade,
  property_id       uuid not null references properties(id) on delete cascade,
  name              text not null,
  street            text not null,
  construction_year integer check (construction_year between 1600 and 2200),
  floors            integer check (floors between 1 and 80),
  has_elevator      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index buildings_org_property_idx on buildings (org_id, property_id);
create trigger buildings_touch before update on buildings for each row execute function app.touch_updated_at();

create table entrances (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  building_id uuid not null references buildings(id) on delete cascade,
  name        text not null,
  street      text not null,
  created_at  timestamptz not null default now()
);
create index entrances_org_building_idx on entrances (org_id, building_id);

create table units (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  entrance_id   uuid not null references entrances(id) on delete cascade,
  -- Objektnummer från fastighetssystemet (krav A.1.17, A.1.19).
  object_number text not null,
  label         text not null,
  floor         integer,
  rooms         numeric(4,1) check (rooms >= 0),
  area_sqm      numeric(7,1) check (area_sqm >= 0),
  kind          text not null default 'apartment'
                check (kind in ('apartment','parking','storage','commercial','other')),
  floor_plan_file_id uuid references files(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index units_org_object_number_idx on units (org_id, object_number);
create index units_org_entrance_idx on units (org_id, entrance_id);
create trigger units_touch before update on units for each row execute function app.touch_updated_at();

-- Utrustning och vitvaror kopplade till objektet (avsnitt 11 i kravbilden).
create table unit_features (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organisations(id) on delete cascade,
  unit_id  uuid not null references units(id) on delete cascade,
  category text not null,
  label    text not null,
  value    text,
  sort_order integer not null default 0
);
create index unit_features_org_unit_idx on unit_features (org_id, unit_id);

-- Kontaktuppgifter som visas för hyresgästen, knutna till en nivå i strukturen.
create table property_contacts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  scope      text not null check (scope in ('organisation','area','property','building')),
  scope_id   uuid,
  role_label text not null,
  name       text not null,
  phone      text,
  email      text,
  hours      text,
  sort_order integer not null default 0
);
create index property_contacts_org_scope_idx on property_contacts (org_id, scope, scope_id);

-- Lokal information om området: miljörum, lekplatser, parkering, trygghet m.m.
create table area_infos (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  scope      text not null check (scope in ('organisation','area','property','building')),
  scope_id   uuid,
  kind       text not null,
  title      text not null,
  body       text not null,
  latitude   double precision,
  longitude  double precision,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index area_infos_org_scope_idx on area_infos (org_id, scope, scope_id);
create trigger area_infos_touch before update on area_infos for each row execute function app.touch_updated_at();

-- Kunskapsartiklar: skötselråd, ansvarsfördelning, brandinformation, hjälptexter
-- och speglat innehåll från bolagets webbplats (krav A.2.6, A.2.10, B.1.26).
create table knowledge_articles (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  slug       text not null,
  locale     text not null default 'sv' check (locale in ('sv','en')),
  category   text not null,
  title      text not null,
  body_html  text not null,
  source_url text,
  published  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index knowledge_articles_org_slug_idx on knowledge_articles (org_id, slug, locale);
create trigger knowledge_articles_touch before update on knowledge_articles
  for each row execute function app.touch_updated_at();

-- ------------------------------------------------------------------ avtal

create table tenancies (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organisations(id) on delete cascade,
  unit_id          uuid not null references units(id) on delete restrict,
  external_ref     text,
  starts_at        date not null,
  ends_at          date,
  earliest_move_out date,
  monthly_rent_ore integer check (monthly_rent_ore >= 0),
  status           text not null default 'active'
                   check (status in ('upcoming','active','notice_given','ended')),
  notice_given_at  timestamptz,
  requested_end_date date,
  new_address      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index tenancies_org_unit_idx on tenancies (org_id, unit_id);
create index tenancies_org_status_idx on tenancies (org_id, status);
create trigger tenancies_touch before update on tenancies for each row execute function app.touch_updated_at();

create table tenancy_residents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  tenancy_id   uuid not null references tenancies(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  role         text not null default 'tenant' check (role in ('tenant','co_resident')),
  is_primary   boolean not null default false,
  moved_in_at  date,
  moved_out_at date,
  created_at   timestamptz not null default now(),
  unique (tenancy_id, user_id)
);
create index tenancy_residents_org_user_idx on tenancy_residents (org_id, user_id);

alter table invitations
  add constraint invitations_tenancy_fk foreign key (tenancy_id) references tenancies(id) on delete cascade;

-- Uppslag från hyresobjekt till hela strukturen. Används av behörighetskontroller
-- och av publiceringar för att avgöra vilka som berörs.
create or replace view unit_hierarchy as
  select u.id            as unit_id,
         u.org_id,
         u.object_number,
         u.label         as unit_label,
         u.kind          as unit_kind,
         e.id            as entrance_id,
         e.name          as entrance_name,
         b.id            as building_id,
         b.name          as building_name,
         p.id            as property_id,
         p.name          as property_name,
         p.street        as property_street,
         p.city          as property_city,
         p.latitude,
         p.longitude,
         a.id            as area_id,
         a.name          as area_name
    from units u
    join entrances e on e.id = u.entrance_id
    join buildings b on b.id = e.building_id
    join properties p on p.id = b.property_id
    join areas a on a.id = p.area_id;
