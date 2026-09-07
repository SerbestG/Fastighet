-- ---------------------------------------------------------------------------
-- OAuth 2.0 för maskin-till-maskin-anrop (krav A.1.15, C.2.12, C.3.2, C.3.3).
--
-- Integrationer loggar in som klienter, inte som personer. Varje klient får ett
-- eget konto med egna scope, egen hemlighet och egen livslängd, så att ett
-- läckt integrationskonto aldrig ger mer än den integrationen behövde.
-- ---------------------------------------------------------------------------

create table oauth_clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  client_id text not null,
  name text not null,
  description text,
  -- Hemligheten lagras bara som hash. Klartexten visas en enda gång.
  secret_hash text not null,
  secret_hint text not null,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'disabled')),
  -- Tom lista betyder ingen adressbegränsning.
  allowed_ips text[] not null default '{}',
  token_ttl_seconds integer not null default 3600 check (token_ttl_seconds between 60 and 86400),
  expires_at timestamptz,
  rotated_at timestamptz,
  last_used_at timestamptz,
  last_used_ip text,
  created_by uuid references users(id),
  disabled_by uuid references users(id),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index oauth_clients_client_id_idx on oauth_clients (client_id);
create index oauth_clients_org_idx on oauth_clients (org_id, status);

create table oauth_access_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  oauth_client_id uuid not null references oauth_clients(id) on delete cascade,
  token_hash text not null,
  scopes text[] not null,
  issued_ip text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text
);

create unique index oauth_access_tokens_hash_idx on oauth_access_tokens (token_hash);
create index oauth_access_tokens_client_idx on oauth_access_tokens (oauth_client_id, expires_at desc);

-- Kundsepareringen gäller även dessa tabeller. 009_rls.sql har redan kört, så
-- policyerna sätts här på samma sätt som där.
alter table oauth_clients enable row level security;
create policy oauth_clients_isolation on oauth_clients
  using (org_id = app.current_org()) with check (org_id = app.current_org());

alter table oauth_access_tokens enable row level security;
create policy oauth_access_tokens_isolation on oauth_access_tokens
  using (org_id = app.current_org()) with check (org_id = app.current_org());

grant select, insert, update, delete on oauth_clients, oauth_access_tokens to hemvist_app;

-- Uppslag vid tokenutfärdande sker innan organisationen är känd.
create or replace function app.org_for_oauth_client(p_client_id text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select c.org_id
      from oauth_clients c
      join organisations o on o.id = c.org_id
     where c.client_id = p_client_id
       and c.status = 'active'
       and o.active
       and (c.expires_at is null or c.expires_at > now())
     limit 1
  $$;

-- Uppslag vid varje anrop med utfärdat token.
create or replace function app.org_for_oauth_token(p_token_hash text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select org_id
      from oauth_access_tokens
     where token_hash = p_token_hash
       and revoked_at is null
       and expires_at > now()
     limit 1
  $$;

grant execute on function app.org_for_oauth_client(text) to hemvist_app;
grant execute on function app.org_for_oauth_token(text) to hemvist_app;

-- Integrationens konto är icke-personligt och ska aldrig kunna logga in som en
-- människa. Kontotypen gör skillnaden synlig i databasen (krav C.2.12).
alter table users add column account_type text not null default 'person'
  check (account_type in ('person', 'service'));

alter table oauth_clients add column service_user_id uuid references users(id) on delete restrict;
