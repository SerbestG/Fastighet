import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  CASE_CATEGORIES,
  COMMON_AREA_SPACES,
  RESIDENCE_SPACES,
  SLA_HOURS,
  TERMINAL_CASE_STATUSES,
  caseCommentSchema,
  caseFeedbackSchema,
  caseListQuerySchema,
  canTransition,
  createCaseSchema,
  derivePriority,
  findSubcategory,
  linkCasesSchema,
  mergeCasesSchema,
  simpleStatus,
  updateCaseSchema,
  type CasePriority,
  type CaseStatus,
} from '@hemvist/shared';
import { audit, auditWithin } from '../core/audit.js';
import { db, requireAuth, requirePermission, scopeCondition, type AuthContext } from '../core/context.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../core/errors.js';
import { notify } from '../core/notify.js';
import { parse } from '../core/validate.js';
import { sequence } from '../core/sequence.js';

/**
 * Ärendehantering.
 *
 * Behörigheten kontrolleras i varje anrop mot den inloggade användaren:
 * en hyresgäst når bara ärenden som hör till det egna boendet, en handläggare
 * bara de fastigheter som personen har tilldelats, och känsliga ärenden kräver
 * utökad behörighet (krav C.3.14).
 */

interface CaseRow {
  id: string;
  case_number: string;
  status: CaseStatus;
  priority: CasePriority;
  sensitive: boolean;
  tenancy_id: string | null;
  reporter_user_id: string | null;
  area_id: string | null;
  property_id: string | null;
  merged_into_case_id: string | null;
}

async function nextCaseNumber(client: pg.PoolClient, orgId: string): Promise<string> {
  const result = await client.query<{ number: number }>(
    `insert into case_counters (org_id, next_number) values ($1, 2)
     on conflict (org_id) do update set next_number = case_counters.next_number + 1
     returning case_counters.next_number - 1 as number`,
    [orgId],
  );
  const number = result.rows[0]?.number ?? 1;
  return `${new Date().getFullYear()}-${String(number).padStart(5, '0')}`;
}

/** Hämtar ett ärende och kontrollerar att den inloggade får se det. */
async function loadCase(
  client: pg.PoolClient,
  auth: AuthContext,
  caseId: string,
): Promise<CaseRow> {
  const result = await client.query<CaseRow>(
    `select id, case_number, status, priority, sensitive, tenancy_id, reporter_user_id,
            area_id, property_id, merged_into_case_id
       from cases where id = $1`,
    [caseId],
  );
  const row = result.rows[0];
  // Row Level Security garanterar redan att raden tillhör rätt organisation.
  if (!row) throw notFound('Ärendet hittades inte.');

  if (auth.surface === 'resident') {
    const ownTenancy = row.tenancy_id && auth.tenancyIds.includes(row.tenancy_id);
    const isReporter = row.reporter_user_id === auth.userId;
    if (!ownTenancy && !isReporter) throw notFound('Ärendet hittades inte.');
    return row;
  }

  if (auth.surface === 'contractor') {
    const assigned = await client.query(
      'select 1 from work_orders where case_id = $1 and contractor_org_id = $2',
      [caseId, auth.contractorOrgId],
    );
    if (!assigned.rowCount) throw notFound('Ärendet hittades inte.');
    return row;
  }

  if (!auth.permissions.has('case:read')) throw forbidden();
  if (row.sensitive && !auth.permissions.has('case:read_sensitive')) {
    throw forbidden('Ärendet är markerat som känsligt och kräver utökad behörighet.');
  }
  if (!auth.scopes.unrestricted) {
    const inScope =
      (row.area_id && auth.scopes.areaIds.includes(row.area_id)) ||
      (row.property_id && auth.scopes.propertyIds.includes(row.property_id));
    if (!inScope) throw forbidden('Ärendet ligger utanför din behörighet.');
  }
  return row;
}

async function addEvent(
  client: pg.PoolClient,
  params: {
    orgId: string;
    caseId: string;
    actorUserId: string | null;
    actorLabel?: string | null;
    kind: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    payload?: Record<string, unknown>;
    visibleToResident?: boolean;
  },
): Promise<void> {
  await client.query(
    `insert into case_events (org_id, case_id, actor_user_id, actor_label, kind, from_status,
                              to_status, payload, visible_to_resident)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      params.orgId,
      params.caseId,
      params.actorUserId,
      params.actorLabel ?? null,
      params.kind,
      params.fromStatus ?? null,
      params.toStatus ?? null,
      JSON.stringify(params.payload ?? {}),
      params.visibleToResident ?? true,
    ],
  );
}

export async function registerCaseRoutes(app: FastifyInstance): Promise<void> {
  /* --------------------------------------------------- kategoriträd --- */

  app.get('/api/case-taxonomy', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      // Utrymmen och objekt som hyresgästen faktiskt har avtal på (krav B.1.29).
      const contractObjects = auth.tenancyIds.length
        ? await client.query(
            `select t.id as tenancy_id, uh.unit_id, uh.object_number, uh.unit_label, uh.unit_kind,
                    uh.property_name, uh.building_name, uh.building_id
               from tenancies t join unit_hierarchy uh on uh.unit_id = t.unit_id
              where t.id = any($1::uuid[])`,
            [auth.tenancyIds],
          )
        : { rows: [] as Record<string, unknown>[] };

      return {
        categories: CASE_CATEGORIES,
        spaces: { residence: RESIDENCE_SPACES, common_area: COMMON_AREA_SPACES },
        locations: contractObjects.rows,
      };
    });
  });

  /* ------------------------------------------------ hyresgästens vy --- */

  app.get('/api/cases', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:case:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select c.id, c.case_number, c.kind, c.status, c.priority, c.title, c.category_key,
                c.subcategory_key, c.space, c.created_at, c.updated_at, c.resolved_at, c.closed_at,
                uh.property_name, uh.unit_label,
                (select max(at) from case_events e where e.case_id = c.id and e.visible_to_resident) as last_activity_at,
                exists (select 1 from case_feedback f where f.case_id = c.id and f.user_id = $1) as has_feedback,
                (select count(*)::int from bookings b
                  where b.case_id = c.id and b.status in ('reserved','confirmed')) as upcoming_visits
           from cases c
           left join unit_hierarchy uh on uh.unit_id = c.unit_id
          where (c.tenancy_id = any($2::uuid[]) or c.reporter_user_id = $1)
            and c.merged_into_case_id is null
          order by c.created_at desc
          limit 100`,
        [auth.userId, auth.tenancyIds],
      );
      return {
        cases: result.rows.map((row) => ({
          ...row,
          simpleStatus: simpleStatus(row.status as CaseStatus),
        })),
      };
    });
  });

  app.post('/api/cases', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:case:create');
    const input = parse(createCaseSchema, request.body);

    const found = findSubcategory(input.categoryKey, input.subcategoryKey);
    if (!found) {
      throw badRequest('Okänd kategori.', [{ path: 'categoryKey', message: 'Välj en kategori i listan.' }]);
    }
    if (!found.category.locationKinds.includes(input.locationKind)) {
      throw badRequest('Kategorin går inte att välja för den platsen.', [
        { path: 'locationKind', message: 'Välj en annan plats eller kategori.' },
      ]);
    }
    // Obligatoriska följdfrågor måste vara besvarade innan ärendet tas emot.
    const missing = found.subcategory.triage
      .filter((q) => q.required && !input.triageAnswers[q.id])
      .map((q) => ({ path: `triageAnswers.${q.id}`, message: 'Frågan måste besvaras.' }));
    if (missing.length) throw badRequest('Några följdfrågor saknar svar.', missing);

    const { priority, escalated, reasons } = derivePriority(
      input.categoryKey,
      input.subcategoryKey,
      input.triageAnswers,
    );

    return db(request, async (client) => {
      let tenancyId: string | null = null;
      let unitId: string | null = null;
      let buildingId: string | null = null;
      let propertyId: string | null = null;
      let areaId: string | null = null;

      if (input.locationKind === 'residence' || input.locationKind === 'contract_object') {
        tenancyId = input.tenancyId ?? auth.tenancyIds[0] ?? null;
        if (!tenancyId || !auth.tenancyIds.includes(tenancyId)) {
          throw badRequest('Välj vilket boende anmälan gäller.', [
            { path: 'tenancyId', message: 'Du har inget avtal på det objektet.' },
          ]);
        }
        const hierarchy = await client.query<{
          unit_id: string;
          building_id: string;
          property_id: string;
          area_id: string;
        }>(
          `select uh.unit_id, uh.building_id, uh.property_id, uh.area_id
             from tenancies t join unit_hierarchy uh on uh.unit_id = t.unit_id
            where t.id = $1`,
          [tenancyId],
        );
        const row = hierarchy.rows[0];
        if (!row) throw badRequest('Boendet kunde inte hittas.');
        ({ unit_id: unitId, building_id: buildingId, property_id: propertyId, area_id: areaId } = row);
      } else {
        // Gemensamma utrymmen: byggnaden måste vara en där hyresgästen bor.
        const allowed = await client.query<{
          building_id: string;
          property_id: string;
          area_id: string;
        }>(
          `select distinct uh.building_id, uh.property_id, uh.area_id
             from tenancies t join unit_hierarchy uh on uh.unit_id = t.unit_id
            where t.id = any($1::uuid[])`,
          [auth.tenancyIds],
        );
        const match = input.buildingId
          ? allowed.rows.find((r) => r.building_id === input.buildingId)
          : allowed.rows[0];
        if (!match) {
          throw badRequest('Välj en byggnad du bor i.', [
            { path: 'buildingId', message: 'Byggnaden hör inte till ditt boende.' },
          ]);
        }
        ({ building_id: buildingId, property_id: propertyId, area_id: areaId } = match);
      }

      // Fördelning till rätt handläggargrupp (krav B.1.33).
      const routing = await client.query<{ team_id: string }>(
        `select team_id from routing_rules
          where active
            and (category_key is null or category_key = $1)
            and (subcategory_key is null or subcategory_key = $2)
            and (area_id is null or area_id = $3)
          order by sort_order asc limit 1`,
        [input.categoryKey, input.subcategoryKey, areaId],
      );

      const caseNumber = await nextCaseNumber(client, auth.orgId);
      const sla = SLA_HOURS[priority];
      // Rubriken ska gå att läsa i en lista. Utrymmet läggs till när det finns,
      // annars räcker underkategorin.
      const spaceLabel = input.space
        ? [...RESIDENCE_SPACES, ...COMMON_AREA_SPACES].find((item) => item.key === input.space)?.label.sv
        : undefined;
      const title =
        input.title ??
        (spaceLabel && spaceLabel !== 'Hela bostaden'
          ? `${found.subcategory.label.sv} – ${spaceLabel.toLowerCase()}`
          : found.subcategory.label.sv
        ).slice(0, 160);

      const inserted = await client.query<{ id: string; created_at: Date }>(
        `insert into cases
           (org_id, case_number, kind, status, priority, location_kind, category_key, subcategory_key,
            space, title, description, tenancy_id, unit_id, building_id, property_id, area_id,
            reporter_user_id, team_id, sensitive, allow_master_key, has_pets, pet_notes,
            access_windows, contact_phone, triage_answers, escalated, escalation_reasons,
            sla_respond_at, sla_resolve_at)
         values ($1,$2,$3,'received',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 $21,$22,$23,$24,$25,$26,
                 now() + make_interval(hours => $27), now() + make_interval(hours => $28))
         returning id, created_at`,
        [
          auth.orgId,
          caseNumber,
          found.category.key === 'disturbance' ? 'disturbance' : input.kind,
          priority,
          input.locationKind,
          input.categoryKey,
          input.subcategoryKey,
          input.space ?? null,
          title,
          input.description,
          tenancyId,
          unitId,
          buildingId,
          propertyId,
          areaId,
          auth.userId,
          routing.rows[0]?.team_id ?? null,
          Boolean(found.category.sensitive),
          input.allowMasterKeyAccess,
          input.hasPets,
          input.petNotes ?? null,
          JSON.stringify(input.accessWindows),
          input.contactPhone ?? null,
          JSON.stringify(input.triageAnswers),
          escalated,
          reasons,
          sla.respond,
          sla.resolve,
        ],
      );
      const caseId = inserted.rows[0]!.id;

      if (input.attachmentIds.length) {
        await attachFiles(client, auth, caseId, input.attachmentIds, null);
      }

      await addEvent(client, {
        orgId: auth.orgId,
        caseId,
        actorUserId: auth.userId,
        kind: 'created',
        toStatus: 'received',
        payload: { source: 'app', escalated },
      });

      await notify(client, {
        orgId: auth.orgId,
        userIds: [auth.userId],
        topic: 'case_updates',
        title: 'Vi har tagit emot din anmälan',
        body: `Ärende ${caseNumber}: ${title}`,
        linkRoute: 'case',
        linkId: caseId,
        dedupeKey: `case-created:${caseId}`,
      });

      await auditWithin(
        client,
        {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          actorEmail: auth.email,
          actorRoles: auth.roles,
          ip: request.ip,
          traceId: request.traceId,
        },
        { action: 'case.created', entityType: 'case', entityId: caseId, detail: { caseNumber, priority } },
      );

      return {
        case: {
          id: caseId,
          caseNumber,
          status: 'received' as const,
          priority,
          escalated,
          createdAt: inserted.rows[0]!.created_at,
        },
        // Akuta ärenden ska styras till jouren i stället för till den vanliga kön.
        emergency: escalated
          ? {
              guidance:
                found.subcategory.emergencyGuidance?.sv ??
                'Ärendet är markerat som akut och hanteras av jouren.',
              phone: await emergencyPhone(client, auth.orgId, found.category.key === 'disturbance'),
            }
          : null,
      };
    });
  });

  app.get<{ Params: { id: string } }>('/api/cases/:id', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      await loadCase(client, auth, request.params.id);
      return caseDetail(client, auth, request.params.id, auth.surface !== 'resident');
    });
  });

  app.post<{ Params: { id: string } }>('/api/cases/:id/comments', async (request) => {
    const auth = requireAuth(request);
    const input = parse(caseCommentSchema, request.body);
    return db(request, async (client) => {
      const row = await loadCase(client, auth, request.params.id);
      if (TERMINAL_CASE_STATUSES.includes(row.status)) {
        throw conflict('Ärendet är avslutat och går inte att komplettera.');
      }
      const isStaff = auth.surface === 'staff';
      const internal = isStaff && input.internal;
      if (!isStaff && input.internal) throw forbidden();

      const comment = await client.query<{ id: string }>(
        `insert into case_comments (org_id, case_id, author_user_id, body, internal)
         values ($1,$2,$3,$4,$5) returning id`,
        [auth.orgId, row.id, auth.userId, input.body, internal],
      );
      if (input.attachmentIds.length) {
        await attachFiles(client, auth, row.id, input.attachmentIds, comment.rows[0]!.id);
      }
      await addEvent(client, {
        orgId: auth.orgId,
        caseId: row.id,
        actorUserId: auth.userId,
        kind: internal ? 'internal_note' : 'comment',
        visibleToResident: !internal,
        payload: { attachments: input.attachmentIds.length },
      });

      if (isStaff && !internal) {
        const recipients = await residentsForCase(client, row.id);
        await notify(client, {
          orgId: auth.orgId,
          userIds: recipients,
          topic: 'case_messages',
          title: `Nytt svar i ärende ${row.case_number}`,
          body: 'Din hyresvärd har svarat i ditt ärende.',
          linkRoute: 'case',
          linkId: row.id,
          dedupeKey: `case-comment:${comment.rows[0]!.id}`,
        });
      } else if (!isStaff) {
        // Hyresgästens komplettering återöppnar ärendet om det väntade på svar.
        if (row.status === 'awaiting_tenant') {
          await client.query("update cases set status = 'in_progress' where id = $1", [row.id]);
          await addEvent(client, {
            orgId: auth.orgId,
            caseId: row.id,
            actorUserId: auth.userId,
            kind: 'status_changed',
            fromStatus: 'awaiting_tenant',
            toStatus: 'in_progress',
          });
        }
        await client.query('update cases set updated_at = now() where id = $1', [row.id]);
      }

      await auditWithin(
        client,
        { orgId: auth.orgId, actorUserId: auth.userId, actorEmail: auth.email, actorRoles: auth.roles, ip: request.ip, traceId: request.traceId },
        { action: 'case.commented', entityType: 'case', entityId: row.id, detail: { internal } },
      );
      return { commentId: comment.rows[0]!.id };
    });
  });

  app.post<{ Params: { id: string } }>('/api/cases/:id/confirm-resolved', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:case:comment');
    return db(request, async (client) => {
      const row = await loadCase(client, auth, request.params.id);
      if (auth.surface !== 'resident') throw forbidden();
      if (!canTransition(row.status, 'closed')) {
        throw conflict('Ärendet går inte att avsluta i sitt nuvarande läge.');
      }
      await client.query("update cases set status = 'closed', closed_at = now() where id = $1", [row.id]);
      await addEvent(client, {
        orgId: auth.orgId,
        caseId: row.id,
        actorUserId: auth.userId,
        kind: 'confirmed_by_resident',
        fromStatus: row.status,
        toStatus: 'closed',
      });
      await audit(request, { action: 'case.confirmed_resolved', entityType: 'case', entityId: row.id });
      return { status: 'closed' };
    });
  });

  app.post<{ Params: { id: string } }>('/api/cases/:id/feedback', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:survey:respond');
    const input = parse(caseFeedbackSchema, request.body);
    return db(request, async (client) => {
      const row = await loadCase(client, auth, request.params.id);
      if (!['resolved', 'closed'].includes(row.status)) {
        throw conflict('Återkoppling kan lämnas när ärendet är klart.');
      }
      await client.query(
        `insert into case_feedback (org_id, case_id, user_id, rating, comment, resolved)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (case_id, user_id) do update
           set rating = excluded.rating, comment = excluded.comment, resolved = excluded.resolved`,
        [auth.orgId, row.id, auth.userId, input.rating, input.comment ?? null, input.resolved],
      );
      // Om hyresgästen anger att felet inte är löst öppnas ärendet igen.
      if (!input.resolved && row.status !== 'closed') {
        await client.query(
          "update cases set status = 'in_progress', reopened_count = reopened_count + 1, resolved_at = null where id = $1",
          [row.id],
        );
        await addEvent(client, {
          orgId: auth.orgId,
          caseId: row.id,
          actorUserId: auth.userId,
          kind: 'reopened',
          fromStatus: row.status,
          toStatus: 'in_progress',
          payload: { reason: 'hyresgästen anger att felet kvarstår' },
        });
      }
      await audit(request, { action: 'case.feedback', entityType: 'case', entityId: row.id });
      return { ok: true, reopened: !input.resolved };
    });
  });

  /* ------------------------------------------------- personalens vy --- */

  app.get('/api/staff/cases', async (request) => {
    const auth = requirePermission(request, 'case:read');
    const query = parse(caseListQuerySchema, request.query);
    return db(request, async (client) => {
      const params: unknown[] = [];
      const where: string[] = ['c.merged_into_case_id is null'];

      if (!auth.permissions.has('case:read_sensitive')) where.push('c.sensitive = false');
      where.push(scopeCondition(auth.scopes, { areaId: 'c.area_id', propertyId: 'c.property_id' }, params));

      if (query.status) {
        const statuses = Array.isArray(query.status) ? query.status : [query.status];
        params.push(statuses);
        where.push(`c.status = any($${params.length}::text[])`);
      }
      if (query.priority) {
        params.push(query.priority);
        where.push(`c.priority = $${params.length}`);
      }
      if (query.kind) {
        params.push(query.kind);
        where.push(`c.kind = $${params.length}`);
      }
      if (query.categoryKey) {
        params.push(query.categoryKey);
        where.push(`c.category_key = $${params.length}`);
      }
      if (query.propertyId) {
        params.push(query.propertyId);
        where.push(`c.property_id = $${params.length}`);
      }
      if (query.buildingId) {
        params.push(query.buildingId);
        where.push(`c.building_id = $${params.length}`);
      }
      if (query.areaId) {
        params.push(query.areaId);
        where.push(`c.area_id = $${params.length}`);
      }
      if (query.assigneeId) {
        params.push(query.assigneeId);
        where.push(`c.assignee_id = $${params.length}`);
      }
      if (query.unassigned) where.push('c.assignee_id is null');
      if (query.overdue) where.push("c.sla_resolve_at < now() and c.status not in ('resolved','closed','cancelled')");
      if (query.q) {
        params.push(`%${query.q}%`);
        const i = params.length;
        where.push(`(c.title ilike $${i} or c.description ilike $${i} or c.case_number ilike $${i})`);
      }

      const order =
        query.sort === 'created_asc'
          ? 'c.created_at asc'
          : query.sort === 'priority'
            ? "array_position(array['emergency','high','normal','low'], c.priority), c.created_at asc"
            : query.sort === 'due'
              ? 'c.sla_resolve_at asc nulls last'
              : 'c.created_at desc';

      params.push(query.limit, query.offset);

      const result = await client.query(
        `select c.id, c.case_number, c.kind, c.status, c.priority, c.title, c.category_key,
                c.subcategory_key, c.space, c.created_at, c.updated_at, c.sla_respond_at,
                c.sla_resolve_at, c.first_response_at, c.resolved_at, c.sensitive, c.escalated,
                c.allow_master_key, c.has_pets,
                (c.sla_resolve_at < now() and c.status not in ('resolved','closed','cancelled')) as overdue,
                uh.object_number, uh.unit_label, uh.entrance_name, uh.building_name, uh.property_name,
                uh.property_street, uh.area_name, uh.latitude, uh.longitude,
                p.name as fallback_property_name,
                a.first_name as assignee_first_name, a.last_name as assignee_last_name,
                tm.name as team_name,
                (select count(*)::int from case_comments cc where cc.case_id = c.id and not cc.internal) as public_comments
           from cases c
           left join unit_hierarchy uh on uh.unit_id = c.unit_id
           left join properties p on p.id = c.property_id
           left join users a on a.id = c.assignee_id
           left join teams tm on tm.id = c.team_id
          where ${where.join(' and ')}
          order by ${order}
          limit $${params.length - 1} offset $${params.length}`,
        params,
      );

      const totalParams = params.slice(0, params.length - 2);
      const total = await client.query<{ count: number }>(
        `select count(*)::int as count from cases c where ${where.join(' and ')}`,
        totalParams,
      );

      return {
        cases: result.rows,
        total: total.rows[0]?.count ?? 0,
        limit: query.limit,
        offset: query.offset,
      };
    });
  });

  app.get<{ Params: { id: string } }>('/api/staff/cases/:id', async (request) => {
    const auth = requirePermission(request, 'case:read');
    return db(request, async (client) => {
      await loadCase(client, auth, request.params.id);
      const detail = await caseDetail(client, auth, request.params.id, true);

      // Andra ärenden i samma byggnad den senaste månaden, för att upptäcka att
      // flera hyresgäster rapporterar samma sak (avsnitt 7 i kravbilden).
      const similar = await client.query(
        `select c2.id, c2.case_number, c2.title, c2.status, c2.created_at, c2.category_key,
                c2.subcategory_key
           from cases c1
           join cases c2 on c2.building_id = c1.building_id and c2.id <> c1.id
          where c1.id = $1
            and c2.category_key = c1.category_key
            and c2.created_at > now() - interval '30 days'
            and c2.merged_into_case_id is null
            and (c2.sensitive = false or $2::boolean)
          order by c2.created_at desc limit 10`,
        [request.params.id, auth.permissions.has('case:read_sensitive')],
      );

      const history = detail.case?.tenancy_id
        ? await client.query(
            `select id, case_number, title, status, created_at, category_key
               from cases where tenancy_id = $1 and id <> $2
               order by created_at desc limit 10`,
            [detail.case.tenancy_id, request.params.id],
          )
        : { rows: [] };

      return { ...detail, similarInBuilding: similar.rows, tenancyHistory: history.rows };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/staff/cases/:id', async (request) => {
    const auth = requirePermission(request, 'case:write');
    const input = parse(updateCaseSchema, request.body);
    return db(request, async (client) => {
      const row = await loadCase(client, auth, request.params.id);
      const updates: string[] = [];
      const params: unknown[] = [row.id];

      if (input.status && input.status !== row.status) {
        if (!canTransition(row.status, input.status)) {
          throw conflict(`Ärendet kan inte gå från ${row.status} till ${input.status}.`);
        }
        if (['resolved', 'closed'].includes(input.status) && !auth.permissions.has('case:close')) {
          throw forbidden('Du saknar behörighet att avsluta ärenden.');
        }
        params.push(input.status);
        updates.push(`status = $${params.length}`);
        if (input.status === 'resolved') updates.push('resolved_at = now()');
        if (input.status === 'closed') updates.push('closed_at = now()');
      }
      if (input.priority) {
        params.push(input.priority);
        updates.push(`priority = $${params.length}`);
        const sla = SLA_HOURS[input.priority];
        params.push(sla.respond, sla.resolve);
        updates.push(
          `sla_respond_at = created_at + make_interval(hours => $${params.length - 1})`,
          `sla_resolve_at = created_at + make_interval(hours => $${params.length})`,
        );
      }
      if (input.assigneeId !== undefined) {
        if (!auth.permissions.has('case:assign')) throw forbidden('Du saknar behörighet att tilldela ärenden.');
        if (input.assigneeId) {
          const valid = await client.query('select 1 from users where id = $1', [input.assigneeId]);
          if (!valid.rowCount) throw badRequest('Handläggaren hittades inte.');
        }
        params.push(input.assigneeId);
        updates.push(`assignee_id = $${params.length}`);
        // Ett ärende som tilldelas går automatiskt vidare från Mottaget, men bara
        // när anropet inte redan sätter en status själv.
        if (input.assigneeId && row.status === 'received' && !input.status) {
          updates.push("status = 'assigned'");
        }
      }
      if (input.teamId !== undefined) {
        params.push(input.teamId);
        updates.push(`team_id = $${params.length}`);
      }
      if (input.title) {
        params.push(input.title);
        updates.push(`title = $${params.length}`);
      }
      if (input.categoryKey && input.subcategoryKey) {
        if (!findSubcategory(input.categoryKey, input.subcategoryKey)) throw badRequest('Okänd kategori.');
        params.push(input.categoryKey, input.subcategoryKey);
        updates.push(`category_key = $${params.length - 1}`, `subcategory_key = $${params.length}`);
      }
      if (input.costEstimateOre !== undefined) {
        params.push(input.costEstimateOre);
        updates.push(`cost_estimate_ore = $${params.length}`);
      }
      if (input.costActualOre !== undefined) {
        params.push(input.costActualOre);
        updates.push(`cost_actual_ore = $${params.length}`);
      }
      if (!updates.length) return { updated: false };

      // Första svaret registreras när en handläggare agerar första gången.
      updates.push('first_response_at = coalesce(first_response_at, now())');

      await client.query(`update cases set ${updates.join(', ')} where id = $1`, params);

      if (input.status && input.status !== row.status) {
        await addEvent(client, {
          orgId: auth.orgId,
          caseId: row.id,
          actorUserId: auth.userId,
          kind: 'status_changed',
          fromStatus: row.status,
          toStatus: input.status,
          payload: input.reason ? { reason: input.reason } : {},
        });
        const recipients = await residentsForCase(client, row.id);
        await notify(client, {
          orgId: auth.orgId,
          userIds: recipients,
          topic: 'case_updates',
          title: `Ärende ${row.case_number} har uppdaterats`,
          body: statusMessage(input.status),
          linkRoute: 'case',
          linkId: row.id,
          dedupeKey: `case-status:${row.id}:${input.status}`,
        });
      }
      if (input.assigneeId !== undefined) {
        await addEvent(client, {
          orgId: auth.orgId,
          caseId: row.id,
          actorUserId: auth.userId,
          kind: input.assigneeId ? 'assigned' : 'unassigned',
          visibleToResident: true,
        });
      }

      await auditWithin(
        client,
        { orgId: auth.orgId, actorUserId: auth.userId, actorEmail: auth.email, actorRoles: auth.roles, ip: request.ip, traceId: request.traceId },
        { action: 'case.updated', entityType: 'case', entityId: row.id, detail: { fields: Object.keys(input) } },
      );
      return { updated: true };
    });
  });

  app.post<{ Params: { id: string } }>('/api/staff/cases/:id/merge', async (request) => {
    const auth = requirePermission(request, 'case:merge');
    const input = parse(mergeCasesSchema, request.body);
    return db(request, async (client) => {
      const target = await loadCase(client, auth, request.params.id);
      let merged = 0;
      for (const sourceId of input.sourceCaseIds) {
        if (sourceId === target.id) continue;
        const source = await loadCase(client, auth, sourceId);
        if (source.merged_into_case_id) continue;
        await client.query(
          `update cases set merged_into_case_id = $2, status = 'closed', closed_at = now() where id = $1`,
          [source.id, target.id],
        );
        await client.query(
          `insert into case_links (org_id, case_id, related_case_id, kind) values ($1,$2,$3,'merged')
           on conflict do nothing`,
          [auth.orgId, target.id, source.id],
        );
        await addEvent(client, {
          orgId: auth.orgId,
          caseId: source.id,
          actorUserId: auth.userId,
          kind: 'merged',
          fromStatus: source.status,
          toStatus: 'closed',
          payload: { into: target.case_number, reason: input.reason ?? null },
        });
        merged += 1;
      }
      await addEvent(client, {
        orgId: auth.orgId,
        caseId: target.id,
        actorUserId: auth.userId,
        kind: 'merge_target',
        payload: { count: merged },
        visibleToResident: false,
      });
      await audit(request, { action: 'case.merged', entityType: 'case', entityId: target.id, detail: { merged } });
      return { merged };
    });
  });

  app.post<{ Params: { id: string } }>('/api/staff/cases/:id/links', async (request) => {
    const auth = requirePermission(request, 'case:write');
    const input = parse(linkCasesSchema, request.body);
    return db(request, async (client) => {
      const target = await loadCase(client, auth, request.params.id);
      for (const relatedId of input.relatedCaseIds) {
        if (relatedId === target.id) continue;
        await loadCase(client, auth, relatedId);
        await client.query(
          `insert into case_links (org_id, case_id, related_case_id) values ($1,$2,$3)
           on conflict do nothing`,
          [auth.orgId, target.id, relatedId],
        );
      }
      return { ok: true };
    });
  });
}

/* --------------------------------------------------------- hjälpare --- */

async function caseDetail(
  client: pg.PoolClient,
  auth: AuthContext,
  caseId: string,
  includeInternal: boolean,
) {
  const caseResult = await client.query(
    `select c.*, uh.object_number, uh.unit_label, uh.entrance_name, uh.building_name,
            uh.property_name, uh.property_street, uh.property_city, uh.area_name,
            uh.latitude, uh.longitude,
            a.first_name as assignee_first_name, a.last_name as assignee_last_name,
            tm.name as team_name, co.name as contractor_name,
            r.first_name as reporter_first_name, r.last_name as reporter_last_name,
            r.phone as reporter_phone
       from cases c
       left join unit_hierarchy uh on uh.unit_id = c.unit_id
       left join users a on a.id = c.assignee_id
       left join users r on r.id = c.reporter_user_id
       left join teams tm on tm.id = c.team_id
       left join contractor_orgs co on co.id = c.contractor_org_id
      where c.id = $1`,
    [caseId],
  );
  const row = caseResult.rows[0];
  if (!row) throw notFound('Ärendet hittades inte.');

  // Hyresgästen ska inte se interna anteckningar eller personalens telefonnummer.
  if (!includeInternal) {
    delete row.reporter_phone;
  }

  const [events, comments, attachments, visits, links, workOrders] = await sequence([

    () => client.query(
      `select e.id, e.at, e.kind, e.from_status, e.to_status, e.payload, e.visible_to_resident,
              u.first_name, u.last_name, e.actor_label
         from case_events e left join users u on u.id = e.actor_user_id
        where e.case_id = $1 and ($2::boolean or e.visible_to_resident)
        order by e.at asc`,
      [caseId, includeInternal],
    ),

    () => client.query(
      `select c.id, c.body, c.internal, c.created_at, u.first_name, u.last_name,
              exists (select 1 from user_roles ur where ur.user_id = c.author_user_id
                        and ur.role not in ('tenant','co_resident')) as from_staff
         from case_comments c left join users u on u.id = c.author_user_id
        where c.case_id = $1 and ($2::boolean or c.internal = false)
        order by c.created_at asc`,
      [caseId, includeInternal],
    ),

    () => client.query(
      `select a.id, a.file_id, a.comment_id, f.original_name, f.mime_type, f.size_bytes, a.created_at
         from case_attachments a join files f on f.id = a.file_id
        where a.case_id = $1 order by a.created_at`,
      [caseId],
    ),

    () => client.query(
      `select b.id, lower(b.slot) as starts_at, upper(b.slot) as ends_at, b.status, r.name as resource_name
         from bookings b join resources r on r.id = b.resource_id
        where b.case_id = $1 order by lower(b.slot)`,
      [caseId],
    ),

    () => client.query(
      `select l.related_case_id as id, c.case_number, c.title, c.status, l.kind
         from case_links l join cases c on c.id = l.related_case_id
        where l.case_id = $1`,
      [caseId],
    ),

    () => includeInternal
      ? client.query(
          `select w.id, w.number, w.title, w.status, w.planned_start, w.planned_end,
                  w.minutes_spent, co.name as contractor_name
             from work_orders w left join contractor_orgs co on co.id = w.contractor_org_id
            where w.case_id = $1 order by w.created_at`,
          [caseId],
        )
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
      ]);

  return {
    case: { ...row, simpleStatus: simpleStatus(row.status as CaseStatus) },
    events: events.rows,
    comments: comments.rows,
    attachments: attachments.rows,
    visits: visits.rows,
    relatedCases: links.rows,
    workOrders: workOrders.rows,
    viewer: { surface: auth.surface },
  };
}

async function residentsForCase(client: pg.PoolClient, caseId: string): Promise<string[]> {
  const result = await client.query<{ user_id: string }>(
    `select distinct coalesce(tr.user_id, c.reporter_user_id) as user_id
       from cases c
       left join tenancy_residents tr on tr.tenancy_id = c.tenancy_id and tr.moved_out_at is null
      where c.id = $1 and coalesce(tr.user_id, c.reporter_user_id) is not null`,
    [caseId],
  );
  return result.rows.map((r) => r.user_id);
}

async function attachFiles(
  client: pg.PoolClient,
  auth: AuthContext,
  caseId: string,
  fileIds: string[],
  commentId: string | null,
): Promise<void> {
  // Filerna måste vara uppladdade av samma användare och godkända i kontrollen.
  const valid = await client.query<{ id: string }>(
    `select id from files
      where id = any($1::uuid[]) and uploaded_by = $2 and scan_status = 'clean'`,
    [fileIds, auth.userId],
  );
  if (valid.rowCount !== fileIds.length) {
    throw badRequest('En eller flera bilagor kunde inte kopplas till ärendet.');
  }
  for (const file of valid.rows) {
    await client.query(
      `insert into case_attachments (org_id, case_id, comment_id, file_id) values ($1,$2,$3,$4)
       on conflict do nothing`,
      [auth.orgId, caseId, commentId, file.id],
    );
  }
}

async function emergencyPhone(
  client: pg.PoolClient,
  orgId: string,
  disturbance: boolean,
): Promise<string | null> {
  const result = await client.query<{ emergency_phone: string | null; disturbance_phone: string | null }>(
    'select emergency_phone, disturbance_phone from organisations where id = $1',
    [orgId],
  );
  const row = result.rows[0];
  return (disturbance ? row?.disturbance_phone : row?.emergency_phone) ?? null;
}

function statusMessage(status: CaseStatus): string {
  const messages: Record<CaseStatus, string> = {
    received: 'Vi har tagit emot ditt ärende.',
    under_review: 'Ditt ärende granskas.',
    assigned: 'Ditt ärende har tilldelats en handläggare.',
    visit_booked: 'Ett besök har bokats i ditt ärende.',
    in_progress: 'Arbetet med ditt ärende har påbörjats.',
    awaiting_materials: 'Vi väntar på material.',
    awaiting_tenant: 'Vi behöver ett svar från dig.',
    resolved: 'Ditt ärende är åtgärdat.',
    closed: 'Ditt ärende är avslutat.',
    cancelled: 'Ditt ärende har avbrutits.',
  };
  return messages[status] ?? 'Ditt ärende har uppdaterats.';
}

export { AppError };
