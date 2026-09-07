-- ---------------------------------------------------------------------------
-- Federerad inloggning med OpenID Connect (krav C.2.4, C.2.5, C.2.6).
--
-- Personalen loggar in i beställarens katalog, till exempel Microsoft Entra ID.
-- Då gäller katalogens egna krav på multifaktor, och plattformen behöver aldrig
-- lagra deras lösenord. Rollerna sätts utifrån gruppanspråket i id-token, så att
-- ett konto som tas bort i katalogen förlorar sin åtkomst här vid nästa inloggning.
-- ---------------------------------------------------------------------------

create table sso_providers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  -- Utfärdaren enligt OpenID Connect Discovery.
  issuer text not null,
  discovery_url text,
  client_id text not null,
  -- Hemligheten lagras krypterad av driftmiljöns hemlighetshantering och sätts
  -- aldrig via gränssnittet. Null betyder att uppgifter saknas.
  client_secret text,
  -- Anspråket som bär grupperna, samt avbildningen grupp -> roll.
  groups_claim text not null default 'groups',
  role_mapping jsonb not null default '{}'::jsonb,
  -- Endast dessa e-postdomäner godtas från katalogen.
  allowed_domains text[] not null default '{}',
  -- När sant skapas en användare vid första inloggningen, annars krävs att
  -- kontot redan är upplagt.
  auto_provision boolean not null default false,
  enabled boolean not null default false,
  last_login_at timestamptz,
  last_error text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index sso_providers_org_idx on sso_providers (org_id);

-- Ett påbörjat inloggningsförsök. State och nonce binder svaret till just den
-- här begäran, och code_verifier ger PKCE även för en förtrolig klient.
create table sso_auth_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  provider_id uuid not null references sso_providers(id) on delete cascade,
  state_hash text not null,
  nonce text not null,
  code_verifier text not null,
  redirect_uri text not null,
  return_to text,
  ip text,
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index sso_auth_requests_state_idx on sso_auth_requests (state_hash);
create index sso_auth_requests_expiry_idx on sso_auth_requests (expires_at);

-- Kopplingen mellan katalogens identitet och kontot här. Ämnet (sub) är stabilt
-- även om användaren byter namn eller e-post i katalogen.
alter table users add column sso_subject text;
create unique index users_sso_subject_idx on users (org_id, sso_subject)
  where sso_subject is not null;

alter table sso_providers enable row level security;
create policy sso_providers_isolation on sso_providers
  using (org_id = app.current_org()) with check (org_id = app.current_org());

alter table sso_auth_requests enable row level security;
create policy sso_auth_requests_isolation on sso_auth_requests
  using (org_id = app.current_org()) with check (org_id = app.current_org());

grant select, insert, update, delete on sso_providers, sso_auth_requests to hemvist_app;

-- Uppslag före inloggning: vilken organisation ett pågående försök hör till.
create or replace function app.org_for_sso_state(p_state_hash text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select org_id from sso_auth_requests
     where state_hash = p_state_hash and used_at is null and expires_at > now()
     limit 1
  $$;

grant execute on function app.org_for_sso_state(text) to hemvist_app;
