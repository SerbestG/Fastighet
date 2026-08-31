-- ---------------------------------------------------------------------------
-- Publik profil för inloggningssidan.
--
-- Inloggningssidan behöver bolagets namn, färger och kontaktvägar innan någon är
-- inloggad, alltså innan organisationen kan sättas för sessionen. Funktionen
-- returnerar endast uppgifter som ändå är publika, aldrig kunddata.
-- ---------------------------------------------------------------------------

create or replace function app.public_organisation(p_slug text)
  returns table (
    id uuid,
    slug text,
    display_name text,
    primary_color text,
    accent_color text,
    support_phone text,
    support_email text,
    emergency_phone text,
    disturbance_phone text,
    website_url text,
    default_locale text,
    enabled_features text[]
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$
    select id, slug, display_name, primary_color, accent_color, support_phone, support_email,
           emergency_phone, disturbance_phone, website_url, default_locale, enabled_features
      from organisations
     where slug = lower(p_slug) and active
  $$;

create or replace function app.org_id_for_slug(p_slug text)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$ select id from organisations where slug = lower(p_slug) and active $$;

-- Lista över valbara bolag på inloggningssidan. Enbart namn och slug.
create or replace function app.public_organisations()
  returns table (slug text, display_name text, primary_color text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $$ select slug, display_name, primary_color from organisations where active order by display_name $$;

revoke all on function app.public_organisation(text) from public;
revoke all on function app.org_id_for_slug(text) from public;
revoke all on function app.public_organisations() from public;
grant execute on function app.public_organisation(text) to hemvist_app;
grant execute on function app.org_id_for_slug(text) to hemvist_app;
grant execute on function app.public_organisations() to hemvist_app;
