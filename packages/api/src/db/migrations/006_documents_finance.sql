-- ---------------------------------------------------------------------------
-- Dokument, hyresavier och betalningsstatus.
-- ---------------------------------------------------------------------------

create table documents (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organisations(id) on delete cascade,
  file_id            uuid not null references files(id) on delete restrict,
  kind               text not null
                     check (kind in ('lease','invoice','inspection_protocol','house_rules','consent',
                                     'permit','floor_plan','signature_request','other')),
  title              text not null,
  document_date      date,
  tenancy_id         uuid references tenancies(id) on delete cascade,
  unit_id            uuid references units(id) on delete cascade,
  property_id        uuid references properties(id) on delete cascade,
  visible_to_resident boolean not null default true,
  requires_signature boolean not null default false,
  signed_at          timestamptz,
  signed_by          uuid references users(id) on delete set null,
  -- Referens till extern signeringstjänst; fylls bara vid verklig integration.
  signature_external_ref text,
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index documents_org_tenancy_idx on documents (org_id, tenancy_id, document_date desc);
create index documents_org_kind_idx on documents (org_id, kind);
create trigger documents_touch before update on documents for each row execute function app.touch_updated_at();

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  tenancy_id     uuid not null references tenancies(id) on delete cascade,
  invoice_number text not null,
  ocr            text,
  bankgiro       text,
  period_start   date not null,
  period_end     date not null,
  due_date       date not null,
  amount_ore     integer not null,
  status         text not null default 'open'
                 check (status in ('open','paid','overdue','credited','cancelled')),
  paid_at        timestamptz,
  file_id        uuid references files(id) on delete set null,
  -- Avierna kommer från ekonomisystemet; referensen behålls för avstämning.
  external_ref   text,
  synced_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end >= period_start)
);
create unique index invoices_org_number_idx on invoices (org_id, invoice_number);
create index invoices_org_tenancy_idx on invoices (org_id, tenancy_id, due_date desc);
create index invoices_org_status_idx on invoices (org_id, status, due_date);
create trigger invoices_touch before update on invoices for each row execute function app.touch_updated_at();

-- Registrerade betalningar. Plattformen tar aldrig emot betalningar själv; raderna
-- speglar det som ekonomisystemet rapporterar.
create table payments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organisations(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount_ore integer not null,
  paid_at    timestamptz not null,
  source     text not null default 'finance_system',
  external_ref text,
  created_at timestamptz not null default now()
);
create index payments_org_invoice_idx on payments (org_id, invoice_id);
