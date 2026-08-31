-- ---------------------------------------------------------------------------
-- Driftinformation, nyheter, meddelanden, utskick och notiser.
-- ---------------------------------------------------------------------------

create table notices (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organisations(id) on delete cascade,
  kind               text not null,
  severity           text not null default 'info' check (severity in ('critical','important','info')),
  title              text not null,
  body_html          text not null,
  summary            text,
  image_file_id      uuid references files(id) on delete set null,
  status             text not null default 'draft'
                     check (status in ('draft','scheduled','published','resolved','archived')),
  starts_at          timestamptz,
  expected_end_at    timestamptz,
  next_update_at     timestamptz,
  publish_at         timestamptz,
  unpublish_at       timestamptz,
  pinned_until       timestamptz,
  contact_info       text,
  requires_acknowledgement boolean not null default false,
  channels           text[] not null default array['inapp'],
  published_at       timestamptz,
  resolved_at        timestamptz,
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index notices_org_status_idx on notices (org_id, status, coalesce(publish_at, created_at) desc);
create index notices_publish_queue_idx on notices (publish_at) where status = 'scheduled';
create trigger notices_touch before update on notices for each row execute function app.touch_updated_at();

-- En publicering kan riktas mot flera nivåer samtidigt (krav B.1.17).
create table notice_audiences (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organisations(id) on delete cascade,
  notice_id uuid not null references notices(id) on delete cascade,
  scope     text not null
            check (scope in ('organisation','area','property','building','entrance','unit','tenancy')),
  scope_id  uuid
);
create index notice_audiences_idx on notice_audiences (org_id, notice_id);
create index notice_audiences_scope_idx on notice_audiences (org_id, scope, scope_id);

create table notice_translations (
  org_id    uuid not null references organisations(id) on delete cascade,
  notice_id uuid not null references notices(id) on delete cascade,
  locale    text not null check (locale in ('sv','en')),
  title     text not null,
  body_html text not null,
  primary key (notice_id, locale)
);

create table notice_reads (
  org_id          uuid not null references organisations(id) on delete cascade,
  notice_id       uuid not null references notices(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (notice_id, user_id)
);
create index notice_reads_org_idx on notice_reads (org_id, user_id);

-- ------------------------------------------------------------- meddelanden

create table threads (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  subject        text not null,
  tenancy_id     uuid references tenancies(id) on delete set null,
  case_id        uuid references cases(id) on delete cascade,
  status         text not null default 'open' check (status in ('open','waiting','closed')),
  created_by     uuid references users(id) on delete set null,
  assigned_to    uuid references users(id) on delete set null,
  last_message_at timestamptz not null default now(),
  unread_for_staff boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index threads_org_status_idx on threads (org_id, status, last_message_at desc);
create index threads_org_tenancy_idx on threads (org_id, tenancy_id);
create trigger threads_touch before update on threads for each row execute function app.touch_updated_at();

create table thread_participants (
  org_id    uuid not null references organisations(id) on delete cascade,
  thread_id uuid not null references threads(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  side      text not null check (side in ('resident','staff')),
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);
create index thread_participants_org_user_idx on thread_participants (org_id, user_id);

create table messages (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  thread_id      uuid not null references threads(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  body           text not null,
  internal       boolean not null default false,
  created_at     timestamptz not null default now()
);
create index messages_thread_idx on messages (org_id, thread_id, created_at);

create table message_attachments (
  org_id     uuid not null references organisations(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  file_id    uuid not null references files(id) on delete cascade,
  primary key (message_id, file_id)
);

-- --------------------------------------------------------------- utskick

create table broadcasts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  subject      text not null,
  body         text not null,
  channels     text[] not null,
  scheduled_at timestamptz,
  sent_at      timestamptz,
  requires_acknowledgement boolean not null default false,
  recipient_count integer not null default 0,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index broadcasts_org_idx on broadcasts (org_id, created_at desc);
create index broadcasts_queue_idx on broadcasts (scheduled_at) where sent_at is null;

create table broadcast_audiences (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  scope        text not null,
  scope_id     uuid
);
create index broadcast_audiences_idx on broadcast_audiences (org_id, broadcast_id);

-- ---------------------------------------------------------------- notiser

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organisations(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  topic        text not null,
  channel      text not null check (channel in ('inapp','push','email','sms')),
  title        text not null,
  body         text not null,
  -- Notisen ska öppna rätt sida och rätt objekt (avsnitt 19 i kravbilden).
  link_route   text,
  link_id      uuid,
  status       text not null default 'queued'
               check (status in ('queued','sent','delivered','read','failed')),
  requires_acknowledgement boolean not null default false,
  acknowledged_at timestamptz,
  -- Nyckel som hindrar att samma händelse skickas två gånger.
  dedupe_key   text,
  failed_reason text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  delivered_at timestamptz,
  read_at      timestamptz
);
create index notifications_user_idx on notifications (org_id, user_id, created_at desc);
create index notifications_unread_idx on notifications (org_id, user_id) where status <> 'read';
create unique index notifications_dedupe_idx on notifications (user_id, channel, dedupe_key)
  where dedupe_key is not null;

-- Utgående meddelanden till e-post, SMS och push läggs i en kö. Utan konfigurerad
-- integration stannar de i kön i stället för att tyst försvinna.
create table outbound_queue (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organisations(id) on delete cascade,
  notification_id uuid references notifications(id) on delete cascade,
  channel       text not null check (channel in ('push','email','sms')),
  recipient     text not null,
  payload       jsonb not null,
  status        text not null default 'pending'
                check (status in ('pending','sent','failed','blocked_no_integration')),
  attempts      integer not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);
create index outbound_queue_pending_idx on outbound_queue (status, created_at) where status = 'pending';
create index outbound_queue_org_idx on outbound_queue (org_id, created_at desc);
