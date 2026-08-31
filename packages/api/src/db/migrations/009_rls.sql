-- ---------------------------------------------------------------------------
-- Kundseparering med Row Level Security.
--
-- Varje tabell som bär en org_id får en policy som kopplar raden till den
-- organisation som är satt för transaktionen (app.current_org()). API:et sätter
-- värdet med SET LOCAL utifrån den inloggade användarens session – aldrig utifrån
-- något som klienten skickar in.
--
-- Applikationen ansluter med rollen hemvist_app, som varken är superuser eller
-- har BYPASSRLS. Därmed går det inte att läsa en annan organisations rader ens om
-- ett villkor skulle saknas i en fråga. Servern verifierar detta vid uppstart
-- (se src/db/verify-isolation.ts).
-- ---------------------------------------------------------------------------

-- Organisationen själv: en session ser bara sin egen organisationspost.
alter table organisations enable row level security;
create policy organisations_isolation on organisations
  using (id = app.current_org());

do $$
declare
  t record;
begin
  for t in
    select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and a.attnum > 0
     where n.nspname = 'public'
       and c.relkind = 'r'
       -- Loggtabeller får egna, striktare policyer längre ned.
       and c.relname not in ('audit_log', 'integration_events', 'login_attempts')
     order by 1
  loop
    execute format('alter table public.%I enable row level security', t.table_name);
    execute format(
      'create policy %I on public.%I using (org_id = app.current_org()) with check (org_id = app.current_org())',
      t.table_name || '_isolation', t.table_name
    );
  end loop;
end $$;

-- Säkerhetsloggen är avsedd att vara oföränderlig. Applikationsrollen får läsa sin
-- egen organisations rader och lägga till nya, men det finns medvetet ingen policy
-- för UPDATE eller DELETE – utan policy nekar Row Level Security åtgärden
-- (krav C.4.2).
alter table audit_log enable row level security;
create policy audit_log_read on audit_log for select
  using (org_id = app.current_org());
create policy audit_log_append on audit_log for insert
  with check (org_id is null or org_id = app.current_org());

alter table integration_events enable row level security;
create policy integration_events_read on integration_events for select
  using (org_id = app.current_org());
create policy integration_events_append on integration_events for insert
  with check (org_id = app.current_org());

-- Inloggningsförsök skrivs innan organisationen är känd, därav den öppna
-- insättningspolicyn. Läsning är alltid begränsad till egen organisation.
alter table login_attempts enable row level security;
create policy login_attempts_read on login_attempts for select
  using (org_id = app.current_org());
create policy login_attempts_append on login_attempts for insert
  with check (true);
