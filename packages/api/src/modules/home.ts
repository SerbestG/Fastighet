import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { audienceForUser } from '../core/audience.js';
import { db, requireAuth } from '../core/context.js';
import { respondentKey } from '../core/crypto.js';
import { notFound } from '../core/errors.js';
import { sequence } from '../core/sequence.js';

async function filterUnanswered<T extends { id: string }>(
  client: pg.PoolClient,
  surveys: T[],
  userId: string,
): Promise<T[]> {
  if (!surveys.length) return [];
  const keys = surveys.map((s) => respondentKey(s.id, userId));
  const answered = await client.query<{ survey_id: string }>(
    'select survey_id from survey_responses where respondent_key = any($1::text[])',
    [keys],
  );
  const done = new Set(answered.rows.map((r) => r.survey_id));
  return surveys.filter((s) => !done.has(s.id));
}

/**
 * Hyresgästens startsida, sidan "Mitt boende" och information om området.
 *
 * Startsidan visar det som är aktuellt just nu för den inloggade personen och
 * inget annat: pågående driftinformation som berör adressen, ärenden som väntar
 * på svar, nästa förfallande avi och kommande bokningar (avsnitt 4 i kravbilden).
 */
export async function registerHomeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/home', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const tenancies = auth.tenancyIds;

      const [home, notices, cases, invoice, bookings, unread, moveFlow, surveys] = await sequence([

        () => client.query(
          `select t.id as tenancy_id, uh.object_number, uh.unit_label, uh.property_street,
                  uh.property_name, uh.property_city, uh.entrance_name, uh.area_name
             from tenancies t join unit_hierarchy uh on uh.unit_id = t.unit_id
            where t.id = any($1::uuid[])
            order by t.starts_at desc limit 1`,
          [tenancies],
        ),

        () => client.query(
          `select n.id, n.kind, n.severity, n.title, n.summary, n.starts_at, n.expected_end_at,
                  n.next_update_at, n.status,
                  coalesce(tr.title, n.title) as localized_title,
                  (nr.read_at is not null) as is_read
             from notices n
             left join notice_translations tr on tr.notice_id = n.id and tr.locale = $2
             left join notice_reads nr on nr.notice_id = n.id and nr.user_id = $3
            where n.status = 'published'
              and (n.publish_at is null or n.publish_at <= now())
              and (n.unpublish_at is null or n.unpublish_at > now())
              and ${audienceForUser(1)}
            order by (n.pinned_until > now()) desc nulls last,
                     case n.severity when 'critical' then 0 when 'important' then 1 else 2 end,
                     coalesce(n.published_at, n.created_at) desc
            limit 5`,
          [tenancies, auth.locale, auth.userId],
        ),

        () => client.query(
          `select c.id, c.case_number, c.title, c.status, c.priority, c.updated_at,
                  (select min(lower(b.slot)) from bookings b
                    where b.case_id = c.id and b.status in ('reserved','confirmed')
                      and lower(b.slot) > now()) as next_visit_at
             from cases c
            where (c.tenancy_id = any($1::uuid[]) or c.reporter_user_id = $2)
              and c.status not in ('closed','cancelled')
              and c.merged_into_case_id is null
            order by case c.status when 'awaiting_tenant' then 0 else 1 end, c.updated_at desc
            limit 5`,
          [tenancies, auth.userId],
        ),

        () => client.query(
          `select id, invoice_number, due_date, amount_ore, status, ocr, bankgiro
             from invoices
            where tenancy_id = any($1::uuid[]) and status in ('open','overdue')
            order by due_date asc limit 1`,
          [tenancies],
        ),

        () => client.query(
          `select b.id, lower(b.slot) as starts_at, upper(b.slot) as ends_at, r.name as resource_name,
                  r.kind as resource_kind, b.case_id
             from bookings b join resources r on r.id = b.resource_id
            where b.user_id = $1 and b.status in ('reserved','confirmed') and upper(b.slot) > now()
            order by lower(b.slot) limit 5`,
          [auth.userId],
        ),

        () => client.query<{ count: number }>(
          "select count(*)::int as count from notifications where user_id = $1 and channel = 'inapp' and read_at is null",
          [auth.userId],
        ),

        () => client.query(
          `select f.id, f.kind, f.move_date,
                  count(*) filter (where s.status <> 'done' and s.required)::int as remaining
             from move_flows f join move_steps s on s.flow_id = f.id
            where f.tenancy_id = any($1::uuid[]) and f.status = 'active'
            group by f.id, f.kind, f.move_date`,
          [tenancies],
        ),

        () => client.query(
          `select s.id, s.title, s.closes_at
             from surveys s
            where s.status = 'open'
              and (s.opens_at is null or s.opens_at <= now())
              and (s.closes_at is null or s.closes_at > now())
              and exists (
                select 1 from survey_audiences sa
                  join tenancies t on t.id = any($1::uuid[])
                  join unit_hierarchy uh on uh.unit_id = t.unit_id
                 where sa.survey_id = s.id
                   and (sa.scope = 'organisation'
                     or (sa.scope = 'area' and sa.scope_id = uh.area_id)
                     or (sa.scope = 'property' and sa.scope_id = uh.property_id)
                     or (sa.scope = 'building' and sa.scope_id = uh.building_id)))
            limit 5`,
          [tenancies],
        ),
      ]);

      return {
        greetingName: auth.firstName,
        home: home.rows[0] ?? null,
        notices: notices.rows,
        cases: cases.rows,
        nextInvoice: invoice.rows[0] ?? null,
        bookings: bookings.rows,
        unreadNotifications: unread.rows[0]?.count ?? 0,
        moveFlow: moveFlow.rows[0] ?? null,
        // Enkäter som användaren redan besvarat filtreras bort här. Svarsnyckeln
        // beräknas i applikationen eftersom den bygger på en hemlighet som
        // databasen inte känner till – det är också det som gör svaren anonyma.
        openSurveys: await filterUnanswered(client, surveys.rows as { id: string }[], auth.userId),
      };
    });
  });

  app.get('/api/my-home', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const tenancies = await client.query(
        `select t.id, t.starts_at, t.ends_at, t.earliest_move_out, t.status, t.monthly_rent_ore,
                t.notice_given_at,
                uh.unit_id, uh.object_number, uh.unit_label, uh.unit_kind, uh.entrance_name,
                uh.building_id, uh.building_name, uh.property_id, uh.property_name,
                uh.property_street, uh.property_city, uh.area_id, uh.area_name,
                u.floor, u.rooms, u.area_sqm, u.floor_plan_file_id,
                b.has_elevator, b.construction_year
           from tenancies t
           join unit_hierarchy uh on uh.unit_id = t.unit_id
           join units u on u.id = t.unit_id
           join buildings b on b.id = uh.building_id
          where t.id = any($1::uuid[])
          order by t.starts_at desc`,
        [auth.tenancyIds],
      );
      if (!tenancies.rowCount) {
        return { tenancies: [], features: [], coResidents: [], contacts: [], articles: [] };
      }

      const unitIds = tenancies.rows.map((r) => r.unit_id);
      const [features, coResidents, contacts, articles] = await sequence([

        () => client.query(
          'select unit_id, category, label, value from unit_features where unit_id = any($1::uuid[]) order by category, sort_order, label',
          [unitIds],
        ),

        () => client.query(
          `select tr.tenancy_id, tr.role, tr.moved_in_at, u.first_name, u.last_name,
                  (u.id = $2) as is_you
             from tenancy_residents tr join users u on u.id = tr.user_id
            where tr.tenancy_id = any($1::uuid[]) and tr.moved_out_at is null
            order by tr.is_primary desc`,
          [auth.tenancyIds, auth.userId],
        ),

        () => client.query(
          `select distinct pc.role_label, pc.name, pc.phone, pc.email, pc.hours, pc.sort_order
             from property_contacts pc
             join tenancies t on t.id = any($1::uuid[])
             join unit_hierarchy uh on uh.unit_id = t.unit_id
            where pc.scope = 'organisation'
               or (pc.scope = 'area' and pc.scope_id = uh.area_id)
               or (pc.scope = 'property' and pc.scope_id = uh.property_id)
               or (pc.scope = 'building' and pc.scope_id = uh.building_id)
            order by pc.sort_order`,
          [auth.tenancyIds],
        ),

        () => client.query(
          `select slug, category, title, body_html from knowledge_articles
            where published and locale = $1 and category in ('my_home','safety')
            order by sort_order, title`,
          [auth.locale],
        ),
      ]);

      return {
        tenancies: tenancies.rows,
        features: features.rows,
        coResidents: coResidents.rows,
        contacts: contacts.rows,
        articles: articles.rows,
      };
    });
  });

  app.get('/api/area', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const [infos, properties, resources] = await sequence([

        () => client.query(
          `select distinct ai.id, ai.kind, ai.title, ai.body, ai.latitude, ai.longitude, ai.sort_order
             from area_infos ai
             join tenancies t on t.id = any($1::uuid[])
             join unit_hierarchy uh on uh.unit_id = t.unit_id
            where ai.scope = 'organisation'
               or (ai.scope = 'area' and ai.scope_id = uh.area_id)
               or (ai.scope = 'property' and ai.scope_id = uh.property_id)
               or (ai.scope = 'building' and ai.scope_id = uh.building_id)
            order by ai.sort_order, ai.title`,
          [auth.tenancyIds],
        ),

        () => client.query(
          `select distinct uh.property_id as id, uh.property_name as name, uh.property_street as street,
                  uh.property_city as city, uh.latitude, uh.longitude, uh.area_name
             from tenancies t join unit_hierarchy uh on uh.unit_id = t.unit_id
            where t.id = any($1::uuid[])`,
          [auth.tenancyIds],
        ),

        () => client.query(
          `select distinct r.id, r.kind, r.name, r.description
             from resources r
             join tenancies t on t.id = any($1::uuid[])
             join unit_hierarchy uh on uh.unit_id = t.unit_id
            where r.active and (
                  r.scope = 'organisation'
               or (r.scope = 'area' and r.scope_id = uh.area_id)
               or (r.scope = 'property' and r.scope_id = uh.property_id)
               or (r.scope = 'building' and r.scope_id = uh.building_id))
            order by r.kind`,
          [auth.tenancyIds],
        ),
      ]);
      return { infos: infos.rows, properties: properties.rows, resources: resources.rows };
    });
  });

  /** Hjälptexter och kunskapsartiklar, tillgängliga direkt i appen (krav A.2.10). */
  app.get<{ Querystring: { category?: string } }>('/api/knowledge', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query(
        `select slug, category, title, body_html, source_url from knowledge_articles
          where published and locale = $1 and ($2::text is null or category = $2)
          order by category, sort_order, title`,
        [auth.locale, request.query.category ?? null],
      );
      return { articles: result.rows };
    });
  });

  app.get<{ Params: { slug: string } }>('/api/knowledge/:slug', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query(
        `select slug, category, title, body_html, source_url, updated_at
           from knowledge_articles where slug = $1 and locale = $2 and published`,
        [request.params.slug, auth.locale],
      );
      const article = result.rows[0];
      if (!article) throw notFound('Artikeln hittades inte.');
      return { article };
    });
  });

  /** Kontaktuppgifter till hyresvärden (krav B.1.25). */
  app.get('/api/contact', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const org = await client.query(
        `select display_name, support_email, support_phone, emergency_phone, disturbance_phone,
                website_url from organisations where id = $1`,
        [auth.orgId],
      );
      const contacts = await client.query(
        `select distinct pc.role_label, pc.name, pc.phone, pc.email, pc.hours, pc.sort_order
           from property_contacts pc
           left join tenancies t on t.id = any($1::uuid[])
           left join unit_hierarchy uh on uh.unit_id = t.unit_id
          where pc.scope = 'organisation'
             or (pc.scope = 'area' and pc.scope_id = uh.area_id)
             or (pc.scope = 'property' and pc.scope_id = uh.property_id)
             or (pc.scope = 'building' and pc.scope_id = uh.building_id)
          order by pc.sort_order`,
        [auth.tenancyIds],
      );
      return { organisation: org.rows[0], contacts: contacts.rows };
    });
  });
}
