-- ---------------------------------------------------------------------------
-- Grund: schema, hjälpfunktioner, organisationer och identitet.
--
-- Varje tabell som innehåller kunddata bär en org_id. Isoleringen mellan
-- fastighetsbolag drivs av Row Level Security i databasen (se 009_rls.sql) och
-- inte enbart av villkor i applikationskoden.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create extension if not exists pg_trgm;

create schema if not exists app;

-- Aktuell organisation för sessionen. Sätts med SET LOCAL av API:et vid varje
-- transaktion och kan aldrig sättas av en inkommande begäran direkt.
create or replace function app.current_org() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

-- Aktuell användare, används för spårbarhet i triggers.
create or replace function app.current_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function app.touch_updated_at() returns trigger
  language plpgsql
  as $$ begin new.updated_at := now(); return new; end $$;

-- ------------------------------------------------------------ organisationer

create table organisations (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  legal_name       text not null,
  display_name     text not null,
  org_number       text,
  primary_color    text not null default '#1F3A34' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color     text not null default '#C6704F' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_file_id     uuid,
  support_email    text,
  support_phone    text,
  emergency_phone  text,
  disturbance_phone text,
  website_url      text,
  default_locale   text not null default 'sv' check (default_locale in ('sv','en')),
  -- Egna begrepp gentemot kund, t.ex. {"case":"Serviceanmälan"} (krav A.2.11).
  terminology      jsonb not null default '{}'::jsonb,
  -- Moduler som är påslagna för hyresgästerna (krav B.1.11).
  enabled_features text[] not null default array[
    'cases','bookings','invoices','documents','notices','messages','my_home',
    'moving','surveys','area','access'
  ],
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger organisations_touch before update on organisations
  for each row execute function app.touch_updated_at();

-- ------------------------------------------------------------------- filer

create table files (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  storage_key    text not null,
  original_name  text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes >= 0),
  checksum_sha256 text not null,
  -- Uppladdat innehåll släpps igenom först efter kontroll (krav C.5.6).
  scan_status    text not null default 'pending'
                 check (scan_status in ('pending','clean','rejected','failed')),
  scan_detail    text,
  uploaded_by    uuid,
  created_at     timestamptz not null default now()
);
create index files_org_idx on files (org_id, created_at desc);
create unique index files_storage_key_idx on files (storage_key);

alter table organisations
  add constraint organisations_logo_fk foreign key (logo_file_id) references files(id) on delete set null;

-- --------------------------------------------------------------- användare

create table users (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organisations(id) on delete cascade,
  email              text not null,
  password_hash      text,
  password_algo      text not null default 'scrypt',
  password_changed_at timestamptz,
  first_name         text not null,
  last_name          text not null,
  phone              text,
  -- Personnummer lagras aldrig i klartext; hashen används enbart för att matcha
  -- en BankID-inloggning mot rätt kundpost (krav C.2.2).
  personal_number_hash text,
  locale             text not null default 'sv' check (locale in ('sv','en')),
  status             text not null default 'active'
                     check (status in ('invited','active','suspended','anonymised')),
  email_verified_at  timestamptz,
  mfa_secret         text,
  mfa_enabled_at     timestamptz,
  failed_logins      integer not null default 0,
  locked_until       timestamptz,
  last_login_at      timestamptz,
  -- Extern identitet från fastighetssystemet (krav A.1.17).
  external_ref       text,
  anonymised_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index users_org_email_idx on users (org_id, lower(email));
create index users_org_name_idx on users (org_id, lower(last_name), lower(first_name));
create index users_org_external_idx on users (org_id, external_ref) where external_ref is not null;
create trigger users_touch before update on users
  for each row execute function app.touch_updated_at();

alter table files
  add constraint files_uploaded_by_fk foreign key (uploaded_by) references users(id) on delete set null;

create table user_roles (
  org_id  uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role    text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references users(id) on delete set null,
  primary key (user_id, role)
);
create index user_roles_org_idx on user_roles (org_id, role);

-- Vilken del av beståndet en handläggare har behörighet till. Tom mängd betyder
-- hela organisationen (används för administratörer och kundservice).
create table user_scopes (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organisations(id) on delete cascade,
  user_id  uuid not null references users(id) on delete cascade,
  scope    text not null check (scope in ('area','property')),
  scope_id uuid not null,
  unique (user_id, scope, scope_id)
);
create index user_scopes_org_idx on user_scopes (org_id, user_id);

create table sessions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organisations(id) on delete cascade,
  user_id            uuid not null references users(id) on delete cascade,
  refresh_token_hash text not null unique,
  user_agent         text,
  ip                 inet,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  -- Absolut giltighetstid.
  expires_at         timestamptz not null,
  -- Sessioner avslutas även efter inaktivitet (krav C.2.10).
  idle_expires_at    timestamptz not null,
  revoked_at         timestamptz,
  revoked_reason     text
);
create index sessions_user_idx on sessions (org_id, user_id, revoked_at);

create table login_attempts (
  id         bigserial primary key,
  org_id     uuid references organisations(id) on delete cascade,
  email      text not null,
  ip         inet,
  successful boolean not null,
  reason     text,
  at         timestamptz not null default now()
);
create index login_attempts_lookup_idx on login_attempts (email, at desc);

-- Inbjudan kopplar ett nytt konto till rätt hyresobjekt.
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  code_hash   text not null,
  email       text,
  tenancy_id  uuid,
  role        text not null default 'tenant' check (role in ('tenant','co_resident')),
  invited_by  uuid references users(id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index invitations_code_idx on invitations (code_hash);
create index invitations_org_idx on invitations (org_id, tenancy_id);

create table email_verifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create table push_tokens (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  token        text not null,
  platform     text not null check (platform in ('ios','android','web')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);

create table notification_preferences (
  org_id   uuid not null references organisations(id) on delete cascade,
  user_id  uuid not null references users(id) on delete cascade,
  topic    text not null,
  channels text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, topic)
);
