-- ---------------------------------------------------------------------------
-- Prenumerationer för webbpush (krav B.1.5, B.1.7).
--
-- Varje enhet får en egen prenumeration. Innehållet krypteras mot enhetens
-- publika nyckel, så att push-tjänsten aldrig kan läsa notisen. En prenumeration
-- som push-tjänsten säger är borta tas bort i stället för att köa fel i evighet.
-- ---------------------------------------------------------------------------

create table web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  -- Enhetens namn så att användaren själv kan känna igen och ta bort den.
  device_label text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0
);

create unique index web_push_subscriptions_endpoint_idx on web_push_subscriptions (endpoint);
create index web_push_subscriptions_user_idx on web_push_subscriptions (user_id);

alter table web_push_subscriptions enable row level security;
create policy web_push_subscriptions_isolation on web_push_subscriptions
  using (org_id = app.current_org()) with check (org_id = app.current_org());

grant select, insert, update, delete on web_push_subscriptions to hemvist_app;
