import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { startMoveFlowSchema, terminateTenancySchema, updateMoveStepSchema } from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.js';
import { notify } from '../core/notify.js';
import { parse } from '../core/validate.js';

/** Standardsteg för in- och utflyttning (avsnitt 13 i kravbilden). */
const MOVE_IN_STEPS = [
  { key: 'sign_lease', title: 'Signera hyresavtalet', description: 'Läs igenom och signera avtalet.', required: true },
  { key: 'choose_language', title: 'Välj kommunikationsspråk', description: 'Vi kontaktar dig på det språk du väljer.', required: true },
  { key: 'book_keys', title: 'Boka nyckelhämtning', description: 'Välj en tid för att hämta dina nycklar.', required: true },
  { key: 'register_co_resident', title: 'Registrera medboende', description: 'Bjud in den som ska bo med dig.', required: false },
  { key: 'check_contact', title: 'Kontrollera kontaktuppgifter', description: 'Stämmer telefon och e-post?', required: true },
  { key: 'house_rules', title: 'Ta del av ordningsreglerna', description: 'Reglerna gäller alla som bor i huset.', required: true },
  { key: 'move_in_check', title: 'Genomför digital inflyttningskontroll', description: 'Gå igenom bostaden rum för rum.', required: true },
  { key: 'report_defects', title: 'Anmäl upptäckta brister', description: 'Brister du anmäler nu belastar inte dig vid utflytt.', required: false },
  { key: 'activate_services', title: 'Aktivera tjänster', description: 'Bredband, el och hemförsäkring.', required: false },
];

const MOVE_OUT_STEPS = [
  { key: 'give_notice', title: 'Säg upp bostaden', description: 'Uppsägningen är bindande när den är registrerad.', required: true },
  { key: 'book_inspection', title: 'Boka besiktning', description: 'Besiktningen görs innan du flyttar ut.', required: true },
  { key: 'cleaning_instructions', title: 'Läs städinstruktionerna', description: 'Bostaden ska vara flyttstädad.', required: true },
  { key: 'return_keys', title: 'Lämna nycklar', description: 'Samtliga nycklar och taggar ska lämnas tillbaka.', required: true },
  { key: 'new_address', title: 'Registrera ny adress', description: 'Så att vi kan skicka slutavräkningen.', required: true },
  { key: 'final_inspection', title: 'Följ upp slutbesiktningen', description: 'Resultatet visas här när besiktningen är klar.', required: true },
  { key: 'costs', title: 'Se eventuella åtgärder eller kostnader', description: 'Kostnader som kan komma att debiteras.', required: false },
  { key: 'close_access', title: 'Avsluta behörigheter', description: 'Passerbehörigheter avslutas på utflyttningsdagen.', required: true },
];

export async function registerMovingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/move-flows', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const flows = await client.query(
        `select f.id, f.kind, f.move_date, f.status, f.created_at, f.completed_at,
                uh.object_number, uh.property_street
           from move_flows f
           join tenancies t on t.id = f.tenancy_id
           join unit_hierarchy uh on uh.unit_id = t.unit_id
          where f.tenancy_id = any($1::uuid[])
          order by f.created_at desc`,
        [auth.tenancyIds],
      );
      if (!flows.rowCount) return { flows: [] };
      const steps = await client.query(
        `select id, flow_id, key, title, description, status, required, sort_order, data, note,
                completed_at
           from move_steps where flow_id = any($1::uuid[]) order by sort_order`,
        [flows.rows.map((f) => f.id)],
      );
      const defects = await client.query(
        'select id, flow_id, space, description, case_id, created_at from move_defects where flow_id = any($1::uuid[])',
        [flows.rows.map((f) => f.id)],
      );
      return {
        flows: flows.rows.map((flow) => ({
          ...flow,
          steps: steps.rows.filter((s) => s.flow_id === flow.id),
          defects: defects.rows.filter((d) => d.flow_id === flow.id),
        })),
      };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/move-steps/:id', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:onboarding:manage');
    const input = parse(updateMoveStepSchema, request.body);
    return db(request, async (client) => {
      const step = await client.query<{ id: string; flow_id: string; key: string }>(
        `select s.id, s.flow_id, s.key from move_steps s
           join move_flows f on f.id = s.flow_id
          where s.id = $1 and f.tenancy_id = any($2::uuid[])`,
        [request.params.id, auth.tenancyIds],
      );
      if (!step.rowCount) throw notFound('Steget hittades inte.');

      await client.query(
        `update move_steps set status = $2, data = coalesce($3::jsonb, data), note = coalesce($4, note),
                completed_at = case when $2 = 'done' then now() else null end,
                completed_by = case when $2 = 'done' then $5::uuid else null end
          where id = $1`,
        [
          request.params.id,
          input.status,
          input.data ? JSON.stringify(input.data) : null,
          input.note ?? null,
          auth.userId,
        ],
      );

      // Flödet räknas som klart när alla obligatoriska steg är avklarade.
      const remaining = await client.query<{ count: number }>(
        `select count(*)::int as count from move_steps
          where flow_id = $1 and required and status <> 'done'`,
        [step.rows[0]!.flow_id],
      );
      if ((remaining.rows[0]?.count ?? 0) === 0) {
        await client.query(
          "update move_flows set status = 'completed', completed_at = now() where id = $1 and status = 'active'",
          [step.rows[0]!.flow_id],
        );
      }

      await audit(request, {
        action: 'move.step_updated',
        entityType: 'move_step',
        entityId: request.params.id,
        detail: { key: step.rows[0]!.key, status: input.status },
      });
      return { updated: true, remainingRequired: remaining.rows[0]?.count ?? 0 };
    });
  });

  /** Anmäl brist vid digital inflyttningskontroll. Skapar även ett ärende. */
  app.post<{ Params: { id: string } }>('/api/move-flows/:id/defects', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:onboarding:manage');
    const body = (request.body ?? {}) as { space?: string; description?: string };
    const space = body.space?.trim();
    const description = body.description?.trim();
    if (!space || !description) throw badRequest('Ange utrymme och beskrivning.');

    return db(request, async (client) => {
      const flow = await client.query<{ id: string; tenancy_id: string }>(
        `select f.id, f.tenancy_id from move_flows f
          where f.id = $1 and f.tenancy_id = any($2::uuid[])`,
        [request.params.id, auth.tenancyIds],
      );
      if (!flow.rowCount) throw notFound('Flödet hittades inte.');

      const result = await client.query<{ id: string }>(
        'insert into move_defects (org_id, flow_id, space, description) values ($1,$2,$3,$4) returning id',
        [auth.orgId, flow.rows[0]!.id, space.slice(0, 64), description.slice(0, 2000)],
      );
      await audit(request, { action: 'move.defect_reported', entityType: 'move_flow', entityId: flow.rows[0]!.id });
      return { id: result.rows[0]!.id };
    });
  });

  /** Uppsägning av bostaden. Kräver ett uttryckligt godkännande. */
  app.post('/api/tenancies/terminate', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:onboarding:manage');
    const input = parse(terminateTenancySchema, request.body);
    return db(request, async (client) => {
      if (!auth.tenancyIds.includes(input.tenancyId)) throw forbidden();
      const tenancy = await client.query<{
        id: string;
        status: string;
        earliest_move_out: string | null;
      }>(
        // Datumet läses som text så att jämförelsen nedan blir en ren
        // strängjämförelse på formen ÅÅÅÅ-MM-DD.
        `select id, status, to_char(earliest_move_out, 'YYYY-MM-DD') as earliest_move_out
           from tenancies where id = $1`,
        [input.tenancyId],
      );
      const row = tenancy.rows[0];
      if (!row) throw notFound('Avtalet hittades inte.');
      if (row.status === 'notice_given') throw conflict('Bostaden är redan uppsagd.');
      if (row.earliest_move_out && input.requestedEndDate < row.earliest_move_out) {
        throw badRequest(
          `Tidigaste datum för utflytt är ${row.earliest_move_out}.`,
          [{ path: 'requestedEndDate', message: `Välj ${row.earliest_move_out} eller senare.` }],
        );
      }

      await client.query(
        `update tenancies set status = 'notice_given', notice_given_at = now(),
                requested_end_date = $2, new_address = coalesce($3, new_address)
          where id = $1`,
        [row.id, input.requestedEndDate, input.newAddress ?? null],
      );
      const flowId = await ensureMoveFlow(client, auth.orgId, row.id, 'move_out', input.requestedEndDate);
      await client.query(
        "update move_steps set status = 'done', completed_at = now(), completed_by = $2 where flow_id = $1 and key = 'give_notice'",
        [flowId, auth.userId],
      );

      await notify(client, {
        orgId: auth.orgId,
        userIds: [auth.userId],
        topic: 'moving',
        title: 'Din uppsägning är registrerad',
        body: `Bostaden är uppsagd till ${input.requestedEndDate}. Nästa steg är att boka besiktning.`,
        linkRoute: 'moving',
        linkId: flowId,
        dedupeKey: `notice-given:${row.id}`,
      });
      await audit(request, {
        action: 'tenancy.notice_given',
        entityType: 'tenancy',
        entityId: row.id,
        detail: { requestedEndDate: input.requestedEndDate },
      });
      return { flowId, status: 'notice_given' };
    });
  });

  /* ------------------------------------------------- administration --- */

  app.post('/api/staff/move-flows', async (request) => {
    const auth = requirePermission(request, 'tenancy:write');
    const input = parse(startMoveFlowSchema, request.body);
    return db(request, async (client) => {
      const flowId = await ensureMoveFlow(
        client,
        auth.orgId,
        input.tenancyId,
        input.kind,
        input.moveDate ?? null,
      );
      await audit(request, { action: 'move.flow_started', entityType: 'move_flow', entityId: flowId });
      return { id: flowId };
    });
  });

  app.get<{ Querystring: { kind?: string } }>('/api/staff/move-flows', async (request) => {
    requirePermission(request, 'tenancy:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select f.id, f.kind, f.move_date, f.status, f.created_at,
                uh.object_number, uh.property_name, uh.property_street,
                u.first_name, u.last_name,
                count(*) filter (where s.required and s.status <> 'done')::int as remaining_required,
                count(s.id)::int as total_steps
           from move_flows f
           join tenancies t on t.id = f.tenancy_id
           join unit_hierarchy uh on uh.unit_id = t.unit_id
           left join tenancy_residents tr on tr.tenancy_id = t.id and tr.is_primary
           left join users u on u.id = tr.user_id
           left join move_steps s on s.flow_id = f.id
          where ($1::text is null or f.kind = $1)
          group by f.id, uh.object_number, uh.property_name, uh.property_street, u.first_name, u.last_name
          order by f.move_date nulls last, f.created_at desc limit 200`,
        [request.query.kind ?? null],
      );
      return { flows: result.rows };
    });
  });
}

export async function ensureMoveFlow(
  client: pg.PoolClient,
  orgId: string,
  tenancyId: string,
  kind: 'move_in' | 'move_out',
  moveDate: string | null,
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'select id from move_flows where tenancy_id = $1 and kind = $2',
    [tenancyId, kind],
  );
  if (existing.rows[0]) {
    if (moveDate) {
      await client.query('update move_flows set move_date = $2 where id = $1', [
        existing.rows[0].id,
        moveDate,
      ]);
    }
    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
    'insert into move_flows (org_id, tenancy_id, kind, move_date) values ($1,$2,$3,$4) returning id',
    [orgId, tenancyId, kind, moveDate],
  );
  const flowId = inserted.rows[0]!.id;
  const steps = kind === 'move_in' ? MOVE_IN_STEPS : MOVE_OUT_STEPS;
  for (const [index, step] of steps.entries()) {
    await client.query(
      `insert into move_steps (org_id, flow_id, key, title, description, required, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [orgId, flowId, step.key, step.title, step.description, step.required, index],
    );
  }
  return flowId;
}
