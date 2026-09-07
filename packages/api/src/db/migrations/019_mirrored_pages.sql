-- ---------------------------------------------------------------------------
-- Speglat innehåll från beställarens webbplats (krav B.1.26).
--
-- Handläggaren väljer vilka sidor som ska visas i appen. Adressen måste ligga
-- på bolagets egen webbplats – tjänsten hämtar aldrig en godtycklig adress.
-- Innehållet rensas innan det sparas och publiceras först efter granskning.
-- ---------------------------------------------------------------------------

create table mirrored_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  source_url text not null,
  -- Var i appen sidan hör hemma.
  section text not null default 'info'
    check (section in ('info', 'area', 'moving', 'support')),
  sort_order integer not null default 100,
  -- Den rensade texten. Null tills första hämtningen lyckats.
  content_html text,
  -- Vilka taggar som rensades bort senast, för att kunna visa vad som togs bort.
  removed_tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'error')),
  last_fetch_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  refresh_interval_minutes integer not null default 1440
    check (refresh_interval_minutes between 60 and 43200),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mirrored_pages_org_idx on mirrored_pages (org_id, section, sort_order);

alter table mirrored_pages enable row level security;
create policy mirrored_pages_isolation on mirrored_pages
  using (org_id = app.current_org()) with check (org_id = app.current_org());

grant select, insert, update, delete on mirrored_pages to hemvist_app;
