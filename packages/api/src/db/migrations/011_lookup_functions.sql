-- ---------------------------------------------------------------------------
-- Uppslag som måste ske innan organisationen är känd.
--
-- Vid inloggning vet servern ännu inte vilken organisation användaren tillhör,
-- och Row Level Security tillåter då ingen läsning. Funktionerna nedan körs med
-- ägarens rättigheter men är avsiktligt smala: de returnerar enbart vilken
-- organisation en uppgift hör till, aldrig namn, lösenord eller annan kunddata.
-- ---------------------------------------------------------------------------

create or replace function app.orgs_for_login(p_email text)
  returns table (org_id uuid, org_slug text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select u.org_id, o.slug
      from users u
      join organisations o on o.id = u.org_id
     where lower(u.email) = lower(p_email)
       and u.status = 'active'
       and o.active
  $$;

create or replace function app.org_for_email_verification(p_token_hash text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select org_id from email_verifications
     where token_hash = p_token_hash and used_at is null and expires_at > now()
     limit 1
  $$;

create or replace function app.org_for_refresh_token(p_token_hash text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select org_id from sessions
     where refresh_token_hash = p_token_hash and revoked_at is null and expires_at > now()
     limit 1
  $$;

revoke all on function app.orgs_for_login(text) from public;
revoke all on function app.org_for_email_verification(text) from public;
revoke all on function app.org_for_refresh_token(text) from public;
grant execute on function app.orgs_for_login(text) to hemvist_app;
grant execute on function app.org_for_email_verification(text) to hemvist_app;
grant execute on function app.org_for_refresh_token(text) to hemvist_app;
