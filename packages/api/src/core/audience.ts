import type { AudienceScope } from '@hemvist/shared';
import type pg from 'pg';

export interface AudienceEntry {
  scope: AudienceScope;
  scopeId?: string | null;
}

/**
 * Publicering riktas mot en eller flera nivåer i fastighetsstrukturen. Villkoret
 * nedan matchar ett hyresförhållande mot en sådan lista och används både för att
 * räkna mottagare och för att avgöra vad en hyresgäst får se
 * (krav B.1.15, B.1.16, B.1.17).
 */
const MATCH_SQL = `
  exists (
    select 1 from aud a
     where (a.scope = 'organisation')
        or (a.scope = 'area'     and a.scope_id = uh.area_id)
        or (a.scope = 'property' and a.scope_id = uh.property_id)
        or (a.scope = 'building' and a.scope_id = uh.building_id)
        or (a.scope = 'entrance' and a.scope_id = uh.entrance_id)
        or (a.scope = 'unit'     and a.scope_id = uh.unit_id)
        or (a.scope = 'tenancy'  and a.scope_id = t.id)
  )`;

const AUD_CTE = `
  with aud(scope, scope_id) as (
    select * from unnest($1::text[], $2::uuid[])
  )`;

function toArrays(audience: AudienceEntry[]): [string[], (string | null)[]] {
  return [audience.map((a) => a.scope), audience.map((a) => a.scopeId ?? null)];
}

/** Användare som berörs av en publicering. Endast boende med pågående avtal. */
export async function resolveAudienceUsers(
  client: pg.PoolClient,
  audience: AudienceEntry[],
): Promise<{ userId: string; tenancyId: string }[]> {
  if (audience.length === 0) return [];
  const [scopes, ids] = toArrays(audience);
  const result = await client.query<{ user_id: string; tenancy_id: string }>(
    `${AUD_CTE}
     select distinct tr.user_id, t.id as tenancy_id
       from tenancies t
       join unit_hierarchy uh on uh.unit_id = t.unit_id
       join tenancy_residents tr on tr.tenancy_id = t.id and tr.moved_out_at is null
      where t.status in ('upcoming','active','notice_given')
        and ${MATCH_SQL}`,
    [scopes, ids],
  );
  return result.rows.map((r) => ({ userId: r.user_id, tenancyId: r.tenancy_id }));
}

export async function countAudience(
  client: pg.PoolClient,
  audience: AudienceEntry[],
): Promise<{ residents: number; tenancies: number }> {
  if (audience.length === 0) return { residents: 0, tenancies: 0 };
  const [scopes, ids] = toArrays(audience);
  const result = await client.query<{ residents: number; tenancies: number }>(
    `${AUD_CTE}
     select count(distinct tr.user_id)::int as residents,
            count(distinct t.id)::int       as tenancies
       from tenancies t
       join unit_hierarchy uh on uh.unit_id = t.unit_id
       join tenancy_residents tr on tr.tenancy_id = t.id and tr.moved_out_at is null
      where t.status in ('upcoming','active','notice_given')
        and ${MATCH_SQL}`,
    [scopes, ids],
  );
  return result.rows[0] ?? { residents: 0, tenancies: 0 };
}

/**
 * Villkor som avgör om en publicering med id `noticeIdColumn` berör någon av
 * användarens bostäder. Används i hyresgästens frågor.
 */
export const AUDIENCE_FOR_USER_SQL = `
  exists (
    select 1
      from notice_audiences na
      join tenancies t on t.id = any($TENANCIES$)
      join unit_hierarchy uh on uh.unit_id = t.unit_id
     where na.notice_id = n.id
       and (
            na.scope = 'organisation'
         or (na.scope = 'area'     and na.scope_id = uh.area_id)
         or (na.scope = 'property' and na.scope_id = uh.property_id)
         or (na.scope = 'building' and na.scope_id = uh.building_id)
         or (na.scope = 'entrance' and na.scope_id = uh.entrance_id)
         or (na.scope = 'unit'     and na.scope_id = uh.unit_id)
         or (na.scope = 'tenancy'  and na.scope_id = t.id)
       )
  )`;

/** Sätter in parameterplatsen för hyresförhållanden i villkoret ovan. */
export function audienceForUser(param: number): string {
  return AUDIENCE_FOR_USER_SQL.replace('$TENANCIES$', `$${param}::uuid[]`);
}
