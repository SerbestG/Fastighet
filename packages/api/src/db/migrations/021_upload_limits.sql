-- ---------------------------------------------------------------------------
-- Gränser för uppladdning per fastighetsbolag (krav C.5.6).
--
-- Kravet är att godkända filtyper och filstorlekar ska kunna begränsas. Det
-- innebär att beställaren själv ska kunna sätta gränserna, inte bara att en
-- driftinställning finns. Tom lista betyder att plattformens grundinställning
-- gäller.
-- ---------------------------------------------------------------------------

alter table organisations
  add column upload_allowed_mime_types text[] not null default '{}',
  add column upload_max_file_bytes integer
    check (upload_max_file_bytes is null or upload_max_file_bytes between 100000 and 104857600);
