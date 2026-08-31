import type { FastifyInstance } from 'fastify';
import {
  ROLES,
  createStaffUserSchema,
  gdprRequestSchema,
  updateIntegrationSchema,
  updateOrgSettingsSchema,
  updateStaffUserSchema,
  type Role,
} from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { db, requirePermission } from '../core/context.js';
import { generateInvitationCode, hashPassword, hashToken } from '../core/crypto.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { parse } from '../core/validate.js';

/**
 * Administration: användare, roller, organisationsinställningar, integrationer,
 * säkerhetslogg och dataskyddsärenden.
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------------------------------ användare --- */

  app.get('/api/staff/users', async (request) => {
    requirePermission(request, 'user:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select u.id, u.email, u.first_name, u.last_name, u.phone, u.status, u.last_login_at,
                (u.mfa_enabled_at is not null) as mfa_enabled, u.created_at,
                coalesce(array_agg(distinct ur.role) filter (where ur.role is not null), '{}') as roles,
                coalesce(array_agg(distinct us.scope_id) filter (where us.scope = 'area'), '{}') as area_ids,
                coalesce(array_agg(distinct us.scope_id) filter (where us.scope = 'property'), '{}') as property_ids
           from users u
           join user_roles ur on ur.user_id = u.id
           left join user_scopes us on us.user_id = u.id
          where ur.role not in ('tenant','co_resident')
          group by u.id
          order by u.last_name, u.first_name`,
      );
      return { users: result.rows, availableRoles: ROLES };
    });
  });

  app.post('/api/staff/users', async (request) => {
    const auth = requirePermission(request, 'user:write');
    const input = parse(createStaffUserSchema, request.body);
    if (input.roles.includes('tenant') || input.roles.includes('co_resident')) {
      throw badRequest('Hyresgästkonton skapas via inbjudan, inte här.');
    }
    return db(request, async (client) => {
      const existing = await client.query('select 1 from users where lower(email) = lower($1)', [
        input.email,
      ]);
      if (existing.rowCount) throw conflict('E-postadressen används redan.');

      // Ett tillfälligt lösenord sätts och måste bytas vid första inloggningen.
      // Kontot kräver dessutom tvåfaktorsautentisering innan det går att använda.
      const temporaryPassword = generateInvitationCode();
      const result = await client.query<{ id: string }>(
        `insert into users (org_id, email, password_hash, first_name, last_name, phone, status,
                            email_verified_at)
         values ($1,$2,$3,$4,$5,$6,'active', now()) returning id`,
        [
          auth.orgId,
          input.email,
          await hashPassword(temporaryPassword),
          input.firstName,
          input.lastName,
          input.phone ?? null,
        ],
      );
      const userId = result.rows[0]!.id;
      for (const role of input.roles) {
        await client.query(
          'insert into user_roles (org_id, user_id, role, granted_by) values ($1,$2,$3,$4)',
          [auth.orgId, userId, role, auth.userId],
        );
      }
      await setScopes(client, auth.orgId, userId, input.areaIds, input.propertyIds);

      await audit(request, {
        action: 'user.created',
        entityType: 'user',
        entityId: userId,
        subjectUserId: userId,
        detail: { roles: input.roles },
      });
      // Lösenordet returneras en gång och lagras aldrig i klartext.
      return { id: userId, temporaryPassword };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/staff/users/:id', async (request) => {
    const auth = requirePermission(request, 'user:write');
    const input = parse(updateStaffUserSchema, request.body);
    return db(request, async (client) => {
      const existing = await client.query('select 1 from users where id = $1', [request.params.id]);
      if (!existing.rowCount) throw notFound('Användaren hittades inte.');

      const sets: string[] = [];
      const params: unknown[] = [request.params.id];
      if (input.firstName) {
        params.push(input.firstName);
        sets.push(`first_name = $${params.length}`);
      }
      if (input.lastName) {
        params.push(input.lastName);
        sets.push(`last_name = $${params.length}`);
      }
      if (input.phone !== undefined) {
        params.push(input.phone);
        sets.push(`phone = $${params.length}`);
      }
      if (input.active !== undefined) {
        params.push(input.active ? 'active' : 'suspended');
        sets.push(`status = $${params.length}`);
      }
      if (sets.length) await client.query(`update users set ${sets.join(', ')} where id = $1`, params);

      if (input.roles) {
        if (input.roles.includes('tenant') || input.roles.includes('co_resident')) {
          throw badRequest('Personalkonton kan inte ges hyresgästroller.');
        }
        await client.query(
          "delete from user_roles where user_id = $1 and role not in ('tenant','co_resident')",
          [request.params.id],
        );
        for (const role of input.roles as Role[]) {
          await client.query(
            'insert into user_roles (org_id, user_id, role, granted_by) values ($1,$2,$3,$4) on conflict do nothing',
            [auth.orgId, request.params.id, role, auth.userId],
          );
        }
      }
      if (input.areaIds || input.propertyIds) {
        await setScopes(client, auth.orgId, request.params.id, input.areaIds ?? [], input.propertyIds ?? []);
      }

      // När behörigheter ändras avslutas användarens sessioner, så att den nya
      // behörighetsbilden gäller direkt.
      if (input.roles || input.areaIds || input.propertyIds || input.active === false) {
        await client.query(
          `update sessions set revoked_at = now(), revoked_reason = 'permissions_changed'
            where user_id = $1 and revoked_at is null`,
          [request.params.id],
        );
      }

      await audit(request, {
        action: 'user.updated',
        entityType: 'user',
        entityId: request.params.id,
        subjectUserId: request.params.id,
        detail: { fields: Object.keys(input) },
      });
      return { updated: true };
    });
  });

  app.delete<{ Params: { id: string } }>('/api/staff/users/:id', async (request) => {
    requirePermission(request, 'user:write');
    return db(request, async (client) => {
      const result = await client.query(
        "update users set status = 'suspended' where id = $1 returning id",
        [request.params.id],
      );
      if (!result.rowCount) throw notFound('Användaren hittades inte.');
      await client.query(
        `update sessions set revoked_at = now(), revoked_reason = 'user_suspended'
          where user_id = $1 and revoked_at is null`,
        [request.params.id],
      );
      await audit(request, {
        action: 'user.suspended',
        entityType: 'user',
        entityId: request.params.id,
        subjectUserId: request.params.id,
      });
      return { suspended: true };
    });
  });

  app.get('/api/staff/teams', async (request) => {
    requirePermission(request, 'case:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select t.id, t.name, t.description, t.active,
                coalesce(json_agg(json_build_object('id', u.id, 'firstName', u.first_name,
                  'lastName', u.last_name)) filter (where u.id is not null), '[]'::json) as members
           from teams t
           left join team_members tm on tm.team_id = t.id
           left join users u on u.id = tm.user_id
          group by t.id order by t.name`,
      );
      return { teams: result.rows };
    });
  });

  /** Handläggare som kan tilldelas ärenden. */
  app.get('/api/staff/assignees', async (request) => {
    requirePermission(request, 'case:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select distinct u.id, u.first_name, u.last_name,
                array_agg(distinct ur.role) as roles
           from users u join user_roles ur on ur.user_id = u.id
          where u.status = 'active'
            and ur.role in ('property_manager','customer_service','caretaker','technician',
                            'area_manager','admin')
          group by u.id order by u.last_name`,
      );
      return { assignees: result.rows };
    });
  });

  /* ------------------------------------------ organisationsprofil --- */

  app.get('/api/staff/settings', async (request) => {
    requirePermission(request, 'org:settings');
    return db(request, async (client) => {
      const result = await client.query('select * from organisations where id = $1', [
        request.auth!.orgId,
      ]);
      const retention = await client.query(
        'select entity, retain_days, action, description, active from retention_policies order by entity',
      );
      return { organisation: result.rows[0], retentionPolicies: retention.rows };
    });
  });

  app.patch('/api/staff/settings', async (request) => {
    const auth = requirePermission(request, 'org:settings');
    const input = parse(updateOrgSettingsSchema, request.body);
    return db(request, async (client) => {
      const map: Record<string, unknown> = {
        display_name: input.displayName,
        primary_color: input.primaryColor,
        accent_color: input.accentColor,
        logo_file_id: input.logoFileId,
        support_email: input.supportEmail,
        support_phone: input.supportPhone,
        emergency_phone: input.emergencyPhone,
        disturbance_phone: input.disturbancePhone,
        website_url: input.websiteUrl,
        default_locale: input.defaultLocale,
        terminology: input.terminology ? JSON.stringify(input.terminology) : undefined,
        enabled_features: input.enabledFeatures,
      };
      const entries = Object.entries(map).filter(([, value]) => value !== undefined);
      if (!entries.length) return { updated: false };

      const params: unknown[] = [auth.orgId];
      const sets = entries.map(([key, value]) => {
        params.push(value);
        return `${key} = $${params.length}`;
      });
      await client.query(`update organisations set ${sets.join(', ')} where id = $1`, params);
      await audit(request, {
        action: 'org.settings_updated',
        entityType: 'organisation',
        entityId: auth.orgId,
        detail: { fields: entries.map(([key]) => key) },
      });
      return { updated: true };
    });
  });

  /* ------------------------------------------------- integrationer --- */

  app.get('/api/staff/integrations', async (request) => {
    requirePermission(request, 'integration:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select id, kind, name, status, base_url, notes, config, last_check_at, last_ok_at,
                last_error, updated_at,
                (secret_ref is not null) as has_credentials
           from integrations order by
             case status when 'connected' then 0 when 'sandbox' then 1
                         when 'requires_configuration' then 2 when 'disconnected' then 3 else 4 end,
             name`,
      );
      const events = await client.query(
        `select integration_id, count(*)::int as calls,
                count(*) filter (where not ok)::int as failures,
                max(at) as last_call_at
           from integration_events
          where at > now() - interval '7 days'
          group by integration_id`,
      );
      const stats = new Map(events.rows.map((r) => [r.integration_id, r]));
      return {
        integrations: result.rows.map((row) => ({
          ...row,
          // Hemligheter lämnar aldrig servern – bara om de finns eller inte.
          config: row.config,
          recentActivity: stats.get(row.id) ?? { calls: 0, failures: 0, last_call_at: null },
        })),
      };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/staff/integrations/:id', async (request) => {
    requirePermission(request, 'integration:write');
    const input = parse(updateIntegrationSchema, request.body);
    return db(request, async (client) => {
      const existing = await client.query<{ secret_ref: string | null; kind: string; name: string }>(
        'select secret_ref, kind, name from integrations where id = $1',
        [request.params.id],
      );
      if (!existing.rowCount) throw notFound('Integrationen hittades inte.');

      // En integration får bara sättas till Ansluten när det finns både en adress
      // och en registrerad hemlighet. Annars vore statusen missvisande.
      if (input.status === 'connected') {
        const hasSecret = Boolean(existing.rows[0]!.secret_ref);
        const hasUrl = Boolean(input.baseUrl);
        if (!hasSecret || !hasUrl) {
          throw badRequest(
            'Integrationen kan inte markeras som ansluten förrän adress och autentiseringsuppgifter är registrerade.',
          );
        }
      }

      await client.query(
        `update integrations set status = $2, base_url = coalesce($3, base_url),
                notes = coalesce($4, notes), config = coalesce($5::jsonb, config),
                last_check_at = now()
          where id = $1`,
        [
          request.params.id,
          input.status,
          input.baseUrl ?? null,
          input.notes ?? null,
          input.config ? JSON.stringify(input.config) : null,
        ],
      );
      await audit(request, {
        action: 'integration.updated',
        entityType: 'integration',
        entityId: request.params.id,
        detail: { status: input.status, kind: existing.rows[0]!.kind },
      });
      return { updated: true };
    });
  });

  /* ---------------------------------------------------- säkerhetslogg --- */

  app.get<{ Querystring: { action?: string; userId?: string; limit?: string; offset?: string } }>(
    '/api/staff/audit-log',
    async (request) => {
      requirePermission(request, 'audit:read');
      const limit = Math.min(Number(request.query.limit ?? 100) || 100, 500);
      const offset = Number(request.query.offset ?? 0) || 0;
      return db(request, async (client) => {
        const params: unknown[] = [];
        const where: string[] = ['true'];
        if (request.query.action) {
          params.push(`${request.query.action}%`);
          where.push(`action like $${params.length}`);
        }
        if (request.query.userId) {
          params.push(request.query.userId);
          where.push(`(actor_user_id = $${params.length} or subject_user_id = $${params.length})`);
        }
        params.push(limit, offset);
        const result = await client.query(
          `select id, at, actor_email, actor_roles, action, entity_type, entity_id, outcome,
                  ip::text, trace_id, detail
             from audit_log
            where ${where.join(' and ')}
            order by at desc
            limit $${params.length - 1} offset $${params.length}`,
          params,
        );
        return { entries: result.rows, limit, offset };
      });
    },
  );

  /* ------------------------------------------------------ dataskydd --- */

  app.post('/api/staff/gdpr-requests', async (request) => {
    const auth = requirePermission(request, 'gdpr:manage');
    const input = parse(gdprRequestSchema, request.body);
    return db(request, async (client) => {
      const target = await client.query('select 1 from users where id = $1', [input.userId]);
      if (!target.rowCount) throw notFound('Användaren hittades inte.');
      const result = await client.query<{ id: string }>(
        `insert into gdpr_requests (org_id, user_id, kind, reason, requested_by)
         values ($1,$2,$3,$4,$5) returning id`,
        [auth.orgId, input.userId, input.kind, input.reason ?? null, auth.userId],
      );
      await audit(request, {
        action: `gdpr.${input.kind}_requested`,
        entityType: 'gdpr_request',
        entityId: result.rows[0]!.id,
        subjectUserId: input.userId,
      });
      return { id: result.rows[0]!.id, status: 'pending' };
    });
  });

  app.get('/api/staff/gdpr-requests', async (request) => {
    requirePermission(request, 'gdpr:manage');
    return db(request, async (client) => {
      const result = await client.query(
        `select g.id, g.kind, g.status, g.reason, g.created_at, g.completed_at,
                u.first_name, u.last_name, u.email
           from gdpr_requests g join users u on u.id = g.user_id
          order by g.created_at desc limit 100`,
      );
      return { requests: result.rows };
    });
  });

  /**
   * Anonymisering av en person. Ärenden och statistik behålls men kopplingen till
   * personen tas bort, så att historiken går att följa utan personuppgifter.
   */
  app.post<{ Params: { id: string } }>('/api/staff/gdpr-requests/:id/anonymise', async (request) => {
    const auth = requirePermission(request, 'gdpr:manage');
    return db(request, async (client) => {
      const req = await client.query<{ id: string; user_id: string; kind: string }>(
        "select id, user_id, kind from gdpr_requests where id = $1 and status = 'pending'",
        [request.params.id],
      );
      if (!req.rowCount) throw notFound('Begäran hittades inte.');
      const userId = req.rows[0]!.user_id;

      await client.query(
        `update users set
            email = 'anonymiserad+' || id || '@exempel.invalid',
            first_name = 'Anonymiserad',
            last_name = 'användare',
            phone = null,
            password_hash = null,
            personal_number_hash = null,
            mfa_secret = null,
            external_ref = null,
            status = 'anonymised',
            anonymised_at = now()
          where id = $1`,
        [userId],
      );
      await client.query('delete from push_tokens where user_id = $1', [userId]);
      await client.query(
        `update sessions set revoked_at = now(), revoked_reason = 'anonymised'
          where user_id = $1 and revoked_at is null`,
        [userId],
      );
      await client.query(
        "update case_comments set body = '[Borttaget på begäran]' where author_user_id = $1",
        [userId],
      );
      await client.query("update messages set body = '[Borttaget på begäran]' where author_user_id = $1", [
        userId,
      ]);
      await client.query(
        "update gdpr_requests set status = 'completed', completed_at = now() where id = $1",
        [req.rows[0]!.id],
      );

      await audit(request, {
        action: 'gdpr.anonymised',
        entityType: 'user',
        entityId: userId,
        subjectUserId: userId,
        detail: { requestId: req.rows[0]!.id, by: auth.email },
      });
      return { anonymised: true };
    });
  });
}

async function setScopes(
  client: import('pg').PoolClient,
  orgId: string,
  userId: string,
  areaIds: string[],
  propertyIds: string[],
): Promise<void> {
  await client.query('delete from user_scopes where user_id = $1', [userId]);
  for (const areaId of areaIds) {
    await client.query(
      "insert into user_scopes (org_id, user_id, scope, scope_id) values ($1,$2,'area',$3) on conflict do nothing",
      [orgId, userId, areaId],
    );
  }
  for (const propertyId of propertyIds) {
    await client.query(
      "insert into user_scopes (org_id, user_id, scope, scope_id) values ($1,$2,'property',$3) on conflict do nothing",
      [orgId, userId, propertyId],
    );
  }
}

export { hashToken };
