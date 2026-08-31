-- ---------------------------------------------------------------------------
-- Rättigheter för applikationsrollen.
--
-- Rollen skapas av migreringsverktyget innan filerna körs. Den saknar SUPERUSER
-- och BYPASSRLS, vilket är förutsättningen för att policyerna i 009_rls.sql ska
-- få verkan. Rollen får inte heller ändra scheman.
-- ---------------------------------------------------------------------------

grant usage on schema public, app to hemvist_app;
grant select, insert, update, delete on all tables in schema public to hemvist_app;
grant usage, select on all sequences in schema public to hemvist_app;
grant execute on all functions in schema app to hemvist_app;

-- Säkerhetsloggen får inte ändras eller tas bort ens av applikationsrollen.
revoke update, delete on audit_log from hemvist_app;
revoke update, delete on integration_events from hemvist_app;

alter default privileges in schema public
  grant select, insert, update, delete on tables to hemvist_app;
alter default privileges in schema public
  grant usage, select on sequences to hemvist_app;
