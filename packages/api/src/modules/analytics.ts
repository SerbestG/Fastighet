import type { FastifyInstance } from 'fastify';
import { db, requirePermission, scopeCondition } from '../core/context.js';
import { sequence } from '../core/sequence.js';

/**
 * Förvaltarens översikt.
 *
 * Alla tal räknas fram ur verkliga rader i databasen. Varje nyckeltal har en
 * `drilldown` som talar om vilken filtrering i ärendeinkorgen som visar exakt de
 * ärenden talet bygger på – siffran går alltid att spåra tillbaka (avsnitt 22).
 */
export async function registerAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/staff/dashboard', async (request) => {
    const auth = requirePermission(request, 'analytics:read');
    return db(request, async (client) => {
      const params: unknown[] = [];
      const scope = scopeCondition(auth.scopes, { areaId: 'c.area_id', propertyId: 'c.property_id' }, params);
      const sensitive = auth.permissions.has('case:read_sensitive') ? 'true' : 'c.sensitive = false';
      const base = `${scope} and ${sensitive} and c.merged_into_case_id is null`;

      const [totals, response, categories, perProperty, visits, notices, satisfaction, threads, contractors] =
        await sequence([

          () => client.query<{
            open: number;
            emergency: number;
            overdue: number;
            awaiting_tenant: number;
            unassigned: number;
            closed_30d: number;
          }>(
            `select
               count(*) filter (where c.status not in ('closed','cancelled'))::int as open,
               count(*) filter (where c.priority = 'emergency'
                                  and c.status not in ('closed','cancelled'))::int as emergency,
               count(*) filter (where c.sla_resolve_at < now()
                                  and c.status not in ('resolved','closed','cancelled'))::int as overdue,
               count(*) filter (where c.status = 'awaiting_tenant')::int as awaiting_tenant,
               count(*) filter (where c.assignee_id is null
                                  and c.status not in ('closed','cancelled'))::int as unassigned,
               count(*) filter (where c.closed_at > now() - interval '30 days')::int as closed_30d
             from cases c where ${base}`,
            params,
          ),

          () => client.query<{ avg_response_hours: number | null; avg_resolution_hours: number | null; measured: number }>(
            `select
               avg(extract(epoch from (c.first_response_at - c.created_at)) / 3600)
                 filter (where c.first_response_at is not null) as avg_response_hours,
               avg(extract(epoch from (c.resolved_at - c.created_at)) / 3600)
                 filter (where c.resolved_at is not null) as avg_resolution_hours,
               count(*) filter (where c.created_at > now() - interval '90 days')::int as measured
             from cases c
            where ${base} and c.created_at > now() - interval '90 days'`,
            params,
          ),

          () => client.query(
            `select c.category_key, c.subcategory_key, count(*)::int as count
               from cases c
              where ${base} and c.created_at > now() - interval '90 days'
              group by c.category_key, c.subcategory_key
              order by count desc limit 10`,
            params,
          ),

          () => client.query(
            `select c.property_id, p.name as property_name, a.name as area_name,
                    count(*)::int as total,
                    count(*) filter (where c.status not in ('closed','cancelled'))::int as open,
                    count(*) filter (where c.sla_resolve_at < now()
                                       and c.status not in ('resolved','closed','cancelled'))::int as overdue
               from cases c
               join properties p on p.id = c.property_id
               join areas a on a.id = p.area_id
              where ${base} and c.created_at > now() - interval '90 days'
              group by c.property_id, p.name, a.name
              order by open desc, total desc limit 20`,
            params,
          ),

          () => client.query(
            `select b.id, lower(b.slot) as starts_at, upper(b.slot) as ends_at, r.name as resource_name,
                    c.case_number, c.id as case_id, uh.object_number, uh.property_street
               from bookings b
               join resources r on r.id = b.resource_id
               left join cases c on c.id = b.case_id
               left join unit_hierarchy uh on uh.unit_id = c.unit_id
              where b.status in ('reserved','confirmed') and lower(b.slot) between now() and now() + interval '7 days'
              order by lower(b.slot) limit 20`,
          ),

          () => client.query(
            `select n.id, n.kind, n.severity, n.title, n.starts_at, n.expected_end_at, n.next_update_at
               from notices n
              where n.status = 'published'
                and n.kind not in ('news','event')
                and (n.expected_end_at is null or n.expected_end_at > now())
              order by case n.severity when 'critical' then 0 when 'important' then 1 else 2 end,
                       n.starts_at nulls last limit 10`,
          ),

          () => client.query<{ average: number | null; responses: number; last_90d: number | null }>(
            `select avg(f.rating) as average,
                    count(*)::int as responses,
                    avg(f.rating) filter (where f.created_at > now() - interval '90 days') as last_90d
               from case_feedback f`,
          ),

          () => client.query<{ unread: number }>(
            'select count(*)::int as unread from threads where unread_for_staff',
          ),

          () => client.query(
            `select co.name, count(w.id)::int as total,
                    count(w.id) filter (where w.status = 'completed')::int as completed,
                    count(w.id) filter (where w.status = 'declined')::int as declined,
                    count(w.id) filter (where w.status = 'blocked')::int as blocked,
                    avg(extract(epoch from (w.completed_at - w.accepted_at)) / 3600)
                      filter (where w.completed_at is not null and w.accepted_at is not null) as avg_hours
               from contractor_orgs co
               left join work_orders w on w.contractor_org_id = co.id
                    and w.created_at > now() - interval '180 days'
              group by co.id, co.name order by total desc limit 10`,
          ),
      ]);

      const t = totals.rows[0]!;
      const r = response.rows[0]!;

      return {
        // Varje nyckeltal pekar på den filtrering som visar underlaget.
        kpis: [
          { key: 'open', label: 'Öppna ärenden', value: t.open, drilldown: { view: 'cases', filters: { status: ['received','under_review','assigned','visit_booked','in_progress','awaiting_materials','awaiting_tenant','resolved'] } } },
          { key: 'emergency', label: 'Akuta ärenden', value: t.emergency, tone: t.emergency > 0 ? 'critical' : 'neutral', drilldown: { view: 'cases', filters: { priority: 'emergency' } } },
          { key: 'overdue', label: 'Försenade ärenden', value: t.overdue, tone: t.overdue > 0 ? 'warning' : 'neutral', drilldown: { view: 'cases', filters: { overdue: true } } },
          { key: 'unassigned', label: 'Ej tilldelade', value: t.unassigned, drilldown: { view: 'cases', filters: { unassigned: true } } },
          { key: 'awaiting_tenant', label: 'Väntar på hyresgäst', value: t.awaiting_tenant, drilldown: { view: 'cases', filters: { status: ['awaiting_tenant'] } } },
          { key: 'closed_30d', label: 'Avslutade senaste 30 dagarna', value: t.closed_30d, drilldown: { view: 'cases', filters: { status: ['closed'] } } },
        ],
        serviceLevels: {
          // Talet redovisas bara när det finns underlag – ingen påhittad statistik.
          avgResponseHours: r.avg_response_hours === null ? null : Number(r.avg_response_hours),
          avgResolutionHours: r.avg_resolution_hours === null ? null : Number(r.avg_resolution_hours),
          measuredCases: r.measured,
          basis: 'Ärenden skapade de senaste 90 dagarna.',
        },
        topCategories: categories.rows,
        casesPerProperty: perProperty.rows,
        upcomingVisits: visits.rows,
        activeNotices: notices.rows,
        satisfaction: {
          average: satisfaction.rows[0]?.average === null || satisfaction.rows[0]?.average === undefined
            ? null
            : Number(satisfaction.rows[0].average),
          responses: satisfaction.rows[0]?.responses ?? 0,
          last90d: satisfaction.rows[0]?.last_90d === null || satisfaction.rows[0]?.last_90d === undefined
            ? null
            : Number(satisfaction.rows[0].last_90d),
        },
        unreadThreads: threads.rows[0]?.unread ?? 0,
        contractors: contractors.rows,
      };
    });
  });

  /** Återkommande fel: samma kategori och byggnad flera gånger. */
  app.get('/api/staff/analytics/recurring', async (request) => {
    const auth = requirePermission(request, 'analytics:read');
    return db(request, async (client) => {
      const params: unknown[] = [];
      const scope = scopeCondition(auth.scopes, { areaId: 'c.area_id', propertyId: 'c.property_id' }, params);
      const result = await client.query(
        `select c.building_id, b.name as building_name, p.name as property_name,
                c.category_key, c.subcategory_key, count(*)::int as count,
                min(c.created_at) as first_seen, max(c.created_at) as last_seen
           from cases c
           join buildings b on b.id = c.building_id
           join properties p on p.id = c.property_id
          where ${scope} and c.created_at > now() - interval '180 days' and c.merged_into_case_id is null
          group by c.building_id, b.name, p.name, c.category_key, c.subcategory_key
         having count(*) >= 3
          order by count desc limit 25`,
        params,
      );
      return { recurring: result.rows };
    });
  });

  /** Aktivitet i tjänsten: inloggningar, ärenden och bokningar över tid. */
  app.get<{ Querystring: { days?: string } }>('/api/staff/analytics/activity', async (request) => {
    requirePermission(request, 'analytics:read');
    const days = Math.min(Number(request.query.days ?? 30) || 30, 365);
    return db(request, async (client) => {
      const [activeUsers, series, byArea] = await sequence([

        () => client.query<{ active_30d: number; total_residents: number }>(
          `select count(distinct u.id) filter (where u.last_login_at > now() - interval '30 days')::int as active_30d,
                  count(distinct u.id)::int as total_residents
             from users u
             join user_roles ur on ur.user_id = u.id and ur.role in ('tenant','co_resident')
            where u.status = 'active'`,
        ),

        () => client.query(
          `select d::date as day,
                  (select count(*)::int from cases c where c.created_at::date = d::date) as cases,
                  (select count(*)::int from bookings b where b.created_at::date = d::date) as bookings,
                  (select count(*)::int from sessions s where s.created_at::date = d::date) as logins
             from generate_series(now() - make_interval(days => $1), now(), interval '1 day') d
            order by day`,
          [days],
        ),

        () => client.query(
          `select a.name as area_name,
                  count(distinct c.id)::int as cases,
                  count(distinct b.id)::int as bookings
             from areas a
             left join cases c on c.area_id = a.id and c.created_at > now() - make_interval(days => $1)
             left join tenancies t on t.unit_id = c.unit_id
             left join bookings b on b.tenancy_id = t.id and b.created_at > now() - make_interval(days => $1)
            group by a.id, a.name order by cases desc`,
          [days],
        ),
      ]);
      return {
        activeResidents: activeUsers.rows[0],
        daily: series.rows,
        byArea: byArea.rows,
        periodDays: days,
      };
    });
  });
}
