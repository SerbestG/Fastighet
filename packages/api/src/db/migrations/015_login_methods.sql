-- ---------------------------------------------------------------------------
-- Vilka inloggningssätt ett bolag erbjuder.
--
-- Inloggningssidan behöver veta detta innan någon är inloggad. Funktionen
-- lämnar bara ut om ett sätt är påslaget och vad knappen ska heta – aldrig
-- klient-id, adresser eller hemligheter.
-- ---------------------------------------------------------------------------

create or replace function app.login_methods(p_slug text)
  returns table (sso_enabled boolean, sso_name text, bankid_enabled boolean)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select
      coalesce(bool_or(p.enabled and p.client_secret is not null), false) as sso_enabled,
      max(p.name) filter (where p.enabled and p.client_secret is not null) as sso_name,
      coalesce(
        (select bool_or(i.status in ('connected', 'sandbox'))
           from integrations i
          where i.org_id = o.id and i.kind = 'bankid'),
        false
      ) as bankid_enabled
      from organisations o
      left join sso_providers p on p.org_id = o.id
     where o.slug = lower(p_slug) and o.active
     group by o.id
  $$;

grant execute on function app.login_methods(text) to hemvist_app;
