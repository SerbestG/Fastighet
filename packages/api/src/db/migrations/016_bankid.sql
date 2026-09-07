-- ---------------------------------------------------------------------------
-- BankID-inloggning för hyresgäster (krav C.2.1, C.2.2).
--
-- Ordern lever i några minuter medan användaren legitimerar sig i sin app.
-- Personnumret lagras aldrig i klartext, varken här eller på användaren – bara
-- som en pepprad hash som räcker för att hitta rätt kundpost.
-- ---------------------------------------------------------------------------

create table bankid_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  -- Referensen klienten känner till. BankID:s egen orderRef lämnar aldrig servern.
  session_ref_hash text not null,
  order_ref text not null,
  auto_start_token text not null,
  qr_start_token text not null,
  qr_start_secret text not null,
  status text not null default 'pending'
    check (status in ('pending', 'complete', 'failed', 'cancelled')),
  hint_code text,
  -- Sätts först när identifieringen är klar och kopplad till ett konto.
  user_id uuid references users(id) on delete set null,
  failure_reason text,
  ip text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null
);

create unique index bankid_orders_session_ref_idx on bankid_orders (session_ref_hash);
create index bankid_orders_expiry_idx on bankid_orders (expires_at);

alter table bankid_orders enable row level security;
create policy bankid_orders_isolation on bankid_orders
  using (org_id = app.current_org()) with check (org_id = app.current_org());

grant select, insert, update, delete on bankid_orders to hemvist_app;

-- Uppslag före inloggning: vilken organisation en pågående order hör till.
create or replace function app.org_for_bankid_order(p_session_ref_hash text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select org_id from bankid_orders
     where session_ref_hash = p_session_ref_hash and expires_at > now()
     limit 1
  $$;

grant execute on function app.org_for_bankid_order(text) to hemvist_app;
