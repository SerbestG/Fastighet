import type { FastifyInstance } from 'fastify';
import { createWorkOrderSchema, updateWorkOrderSchema } from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.js';
import { notify } from '../core/notify.js';
import { parse } from '../core/validate.js';
import { sequence } from '../core/sequence.js';

/**
 * Arbetsorder och entreprenörsportal.
 *
 * En entreprenör ser bara arbetsorder som tilldelats det egna bolaget, och bara
 * de uppgifter som krävs för att genomföra uppdraget. Hyresgästens namn och
 * telefonnummer lämnas ut först när uppdraget accepterats, och aldrig avtal,
 * avier eller andra ärenden (avsnitt 23 i kravbilden).
 */
export async function registerWorkOrderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/staff/work-orders', async (request) => {
    const auth = requirePermission(request, 'workorder:write');
    const input = parse(createWorkOrderSchema, request.body);
    return db(request, async (client) => {
      const target = await client.query<{ id: string; case_number: string }>(
        'select id, case_number from cases where id = $1',
        [input.caseId],
      );
      if (!target.rowCount) throw notFound('Ärendet hittades inte.');

      const seq = await client.query<{ count: number }>(
        'select count(*)::int as count from work_orders',
      );
      const number = `AO-${new Date().getFullYear()}-${String((seq.rows[0]?.count ?? 0) + 1).padStart(4, '0')}`;

      const result = await client.query<{ id: string }>(
        `insert into work_orders (org_id, case_id, number, contractor_org_id, assignee_id, title,
                                  instructions, status, planned_start, planned_end, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,'offered',$8,$9,$10) returning id`,
        [
          auth.orgId,
          input.caseId,
          number,
          input.contractorOrgId ?? null,
          input.assigneeId ?? null,
          input.title,
          input.instructions ?? null,
          input.plannedStart ?? null,
          input.plannedEnd ?? null,
          auth.userId,
        ],
      );
      if (input.contractorOrgId) {
        await client.query('update cases set contractor_org_id = $2 where id = $1', [
          input.caseId,
          input.contractorOrgId,
        ]);
      }
      await client.query(
        `insert into case_events (org_id, case_id, actor_user_id, kind, payload, visible_to_resident)
         values ($1,$2,$3,'work_order_created',$4,true)`,
        [auth.orgId, input.caseId, auth.userId, JSON.stringify({ number })],
      );

      await audit(request, {
        action: 'workorder.created',
        entityType: 'work_order',
        entityId: result.rows[0]!.id,
        detail: { caseNumber: target.rows[0]!.case_number, number },
      });
      return { id: result.rows[0]!.id, number };
    });
  });

  app.get<{ Querystring: { status?: string; caseId?: string } }>(
    '/api/staff/work-orders',
    async (request) => {
      requirePermission(request, 'workorder:read');
      return db(request, async (client) => {
        const params: unknown[] = [];
        const where: string[] = ['true'];
        if (request.query.status) {
          params.push(request.query.status);
          where.push(`w.status = $${params.length}`);
        }
        if (request.query.caseId) {
          params.push(request.query.caseId);
          where.push(`w.case_id = $${params.length}`);
        }
        const result = await client.query(
          `select w.id, w.number, w.title, w.status, w.planned_start, w.planned_end, w.accepted_at,
                  w.declined_at, w.declined_reason, w.checked_in_at, w.completed_at, w.blocker_reason,
                  w.minutes_spent, w.created_at,
                  c.case_number, c.title as case_title, c.priority,
                  co.name as contractor_name,
                  uh.object_number, uh.property_name, uh.property_street,
                  (select coalesce(sum(m.quantity * coalesce(m.unit_cost_ore,0))::int, 0)
                     from work_order_materials m where m.work_order_id = w.id) as material_cost_ore
             from work_orders w
             join cases c on c.id = w.case_id
             left join contractor_orgs co on co.id = w.contractor_org_id
             left join unit_hierarchy uh on uh.unit_id = c.unit_id
            where ${where.join(' and ')}
            order by w.created_at desc limit 200`,
          params,
        );
        return { workOrders: result.rows };
      });
    },
  );

  app.get('/api/staff/contractors', async (request) => {
    requirePermission(request, 'workorder:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select co.id, co.name, co.org_number, co.contact_email, co.contact_phone, co.trades, co.active,
                count(w.id) filter (where w.status not in ('completed','cancelled','declined'))::int as open_orders,
                count(w.id) filter (where w.status = 'completed')::int as completed_orders,
                count(w.id) filter (where w.status = 'declined')::int as declined_orders,
                avg(extract(epoch from (w.completed_at - w.accepted_at)) / 3600)
                  filter (where w.completed_at is not null and w.accepted_at is not null) as avg_completion_hours
           from contractor_orgs co
           left join work_orders w on w.contractor_org_id = co.id
          group by co.id order by co.name`,
      );
      return { contractors: result.rows };
    });
  });

  /* -------------------------------------------- entreprenörsportalen --- */

  app.get('/api/partner/work-orders', async (request) => {
    const auth = requirePermission(request, 'workorder:read');
    if (auth.surface !== 'contractor') {
      // Personal använder personalvyn ovan.
      throw forbidden('Portalen är avsedd för entreprenörer.');
    }
    return db(request, async (client) => {
      const result = await client.query(
        `select w.id, w.number, w.title, w.instructions, w.status, w.planned_start, w.planned_end,
                w.accepted_at, w.checked_in_at, w.completed_at, w.blocker_reason, w.minutes_spent,
                w.notes, w.created_at,
                c.case_number, c.priority, c.category_key, c.subcategory_key, c.space,
                c.description as case_description, c.allow_master_key, c.has_pets, c.pet_notes,
                c.access_windows,
                uh.object_number, uh.unit_label, uh.entrance_name, uh.property_street,
                uh.property_city, uh.building_name,
                -- Kontaktuppgifter lämnas ut först när uppdraget accepterats.
                case when w.status in ('accepted','scheduled','on_site','blocked','completed')
                     then r.first_name end as contact_first_name,
                case when w.status in ('accepted','scheduled','on_site','blocked','completed')
                     then coalesce(c.contact_phone, r.phone) end as contact_phone
           from work_orders w
           join cases c on c.id = w.case_id
           left join unit_hierarchy uh on uh.unit_id = c.unit_id
           left join users r on r.id = c.reporter_user_id
          where w.contractor_org_id = $1
            and w.status <> 'cancelled'
          order by
            case w.status when 'offered' then 0 when 'accepted' then 1 when 'on_site' then 2 else 3 end,
            w.planned_start nulls last, w.created_at desc
          limit 200`,
        [auth.contractorOrgId],
      );
      return { workOrders: result.rows };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/partner/work-orders/:id', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'workorder:write');
    const input = parse(updateWorkOrderSchema, request.body);

    return db(request, async (client) => {
      const isContractor = auth.surface === 'contractor';
      const result = await client.query<{
        id: string;
        case_id: string;
        status: string;
        number: string;
        contractor_org_id: string | null;
      }>(
        `select id, case_id, status, number, contractor_org_id from work_orders
          where id = $1 and ($2::uuid is null or contractor_org_id = $2)`,
        [request.params.id, isContractor ? auth.contractorOrgId : null],
      );
      const order = result.rows[0];
      if (!order) throw notFound('Arbetsordern hittades inte.');

      const allowed: Record<string, string[]> = {
        offered: ['accepted', 'declined'],
        accepted: ['scheduled', 'on_site', 'blocked', 'completed'],
        scheduled: ['on_site', 'blocked', 'completed', 'accepted'],
        on_site: ['completed', 'blocked'],
        blocked: ['on_site', 'scheduled', 'completed'],
        completed: [],
        declined: [],
        cancelled: [],
      };
      if (input.status && input.status !== order.status) {
        if (!(allowed[order.status] ?? []).includes(input.status)) {
          throw conflict(`Arbetsordern kan inte gå från ${order.status} till ${input.status}.`);
        }
        if (input.status === 'blocked' && !input.blockerReason) {
          throw badRequest('Ange vad som hindrar arbetet.', [
            { path: 'blockerReason', message: 'Beskriv hindret.' },
          ]);
        }
      }

      const sets: string[] = [];
      const params: unknown[] = [order.id];
      if (input.status) {
        params.push(input.status);
        sets.push(`status = $${params.length}`);
        if (input.status === 'accepted') sets.push('accepted_at = now()');
        if (input.status === 'declined') sets.push('declined_at = now()');
        if (input.status === 'on_site') sets.push('checked_in_at = coalesce(checked_in_at, now())');
        if (input.status === 'completed') sets.push('completed_at = now()');
      }
      if (input.notes !== undefined) {
        params.push(input.notes);
        sets.push(`notes = $${params.length}`);
      }
      if (input.blockerReason !== undefined) {
        params.push(input.blockerReason);
        sets.push(`blocker_reason = $${params.length}`);
      }
      if (input.minutesSpent !== undefined) {
        params.push(input.minutesSpent);
        sets.push(`minutes_spent = $${params.length}`);
      }
      if (sets.length) {
        await client.query(`update work_orders set ${sets.join(', ')} where id = $1`, params);
      }

      if (input.materials) {
        await client.query('delete from work_order_materials where work_order_id = $1', [order.id]);
        for (const material of input.materials) {
          await client.query(
            `insert into work_order_materials (org_id, work_order_id, description, quantity, unit, unit_cost_ore)
             values ($1,$2,$3,$4,$5,$6)`,
            [
              auth.orgId,
              order.id,
              material.description,
              material.quantity,
              material.unit,
              material.unitCostOre ?? null,
            ],
          );
        }
      }
      if (input.attachmentIds?.length) {
        const valid = await client.query<{ id: string }>(
          "select id from files where id = any($1::uuid[]) and uploaded_by = $2 and scan_status = 'clean'",
          [input.attachmentIds, auth.userId],
        );
        for (const file of valid.rows) {
          await client.query(
            'insert into work_order_attachments (org_id, work_order_id, file_id) values ($1,$2,$3) on conflict do nothing',
            [auth.orgId, order.id, file.id],
          );
        }
      }

      if (input.status && input.status !== order.status) {
        await client.query(
          `insert into case_events (org_id, case_id, actor_user_id, kind, payload, visible_to_resident)
           values ($1,$2,$3,'work_order_status',$4,$5)`,
          [
            auth.orgId,
            order.case_id,
            auth.userId,
            JSON.stringify({ number: order.number, status: input.status }),
            // Hyresgästen ser att arbete pågår och att det är klart, inte interna hinder.
            ['on_site', 'completed'].includes(input.status),
          ],
        );

        if (input.status === 'completed') {
          await client.query(
            `update cases set status = 'resolved', resolved_at = now()
              where id = $1 and status in ('assigned','visit_booked','in_progress','awaiting_materials')`,
            [order.case_id],
          );
          const residents = await client.query<{ user_id: string }>(
            `select tr.user_id from cases c
               join tenancy_residents tr on tr.tenancy_id = c.tenancy_id and tr.moved_out_at is null
              where c.id = $1`,
            [order.case_id],
          );
          if (residents.rowCount) {
            await notify(client, {
              orgId: auth.orgId,
              userIds: residents.rows.map((r) => r.user_id),
              topic: 'case_updates',
              title: 'Arbetet i ditt ärende är klart',
              body: 'Bekräfta gärna att felet är åtgärdat och lämna återkoppling.',
              linkRoute: 'case',
              linkId: order.case_id,
              dedupeKey: `workorder-done:${order.id}`,
            });
          }
        }
      }

      await audit(request, {
        action: 'workorder.updated',
        entityType: 'work_order',
        entityId: order.id,
        detail: { status: input.status ?? order.status },
      });
      return { updated: true };
    });
  });

  app.get<{ Params: { id: string } }>('/api/partner/work-orders/:id', async (request) => {
    const auth = requirePermission(request, 'workorder:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select w.*, c.case_number, c.description as case_description, c.category_key,
                c.subcategory_key, c.space, c.allow_master_key, c.has_pets, c.pet_notes,
                c.access_windows, uh.object_number, uh.property_street, uh.entrance_name
           from work_orders w
           join cases c on c.id = w.case_id
           left join unit_hierarchy uh on uh.unit_id = c.unit_id
          where w.id = $1 and ($2::uuid is null or w.contractor_org_id = $2)`,
        [request.params.id, auth.surface === 'contractor' ? auth.contractorOrgId : null],
      );
      const order = result.rows[0];
      if (!order) throw notFound('Arbetsordern hittades inte.');

      const [materials, attachments] = await sequence([

        () => client.query(
          'select description, quantity, unit, unit_cost_ore from work_order_materials where work_order_id = $1',
          [order.id],
        ),

        () => client.query(
          `select f.id as file_id, f.original_name, f.mime_type, f.size_bytes
             from work_order_attachments a join files f on f.id = a.file_id
            where a.work_order_id = $1`,
          [order.id],
        ),
      ]);
      return { workOrder: order, materials: materials.rows, attachments: attachments.rows };
    });
  });
}
