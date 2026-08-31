import type { FastifyInstance } from 'fastify';
import {
  NOTIFICATION_TOPICS,
  MANDATORY_TOPICS,
  registerPushTokenSchema,
  updateNotificationPreferencesSchema,
  updateProfileSchema,
} from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { db, requireAuth } from '../core/context.js';
import { conflict } from '../core/errors.js';
import { parse } from '../core/validate.js';
import { sequence } from '../core/sequence.js';

/** Profil, kontaktuppgifter, notisinställningar och export av egna uppgifter. */
export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const org = await client.query(
        `select id, slug, display_name, primary_color, accent_color, logo_file_id,
                support_email, support_phone, emergency_phone, disturbance_phone, website_url,
                default_locale, terminology, enabled_features
           from organisations where id = $1`,
        [auth.orgId],
      );

      const user = await client.query(
        `select id, email, first_name, last_name, phone, locale, email_verified_at,
                (mfa_enabled_at is not null) as mfa_enabled
           from users where id = $1`,
        [auth.userId],
      );

      const tenancies = await client.query(
        `select t.id, t.starts_at, t.ends_at, t.earliest_move_out, t.status, t.monthly_rent_ore,
                tr.role as resident_role, tr.is_primary,
                uh.unit_id, uh.object_number, uh.unit_label, uh.entrance_name, uh.building_id,
                uh.building_name, uh.property_id, uh.property_name, uh.property_street,
                uh.property_city, uh.area_id, uh.area_name,
                u.floor, u.rooms, u.area_sqm
           from tenancy_residents tr
           join tenancies t on t.id = tr.tenancy_id
           join unit_hierarchy uh on uh.unit_id = t.unit_id
           join units u on u.id = t.unit_id
          where tr.user_id = $1 and tr.moved_out_at is null
          order by tr.is_primary desc, t.starts_at desc`,
        [auth.userId],
      );

      const preferences = await client.query<{ topic: string; channels: string[] }>(
        'select topic, channels from notification_preferences where user_id = $1',
        [auth.userId],
      );
      const prefMap = new Map(preferences.rows.map((r) => [r.topic, r.channels]));

      return {
        user: {
          ...user.rows[0],
          roles: auth.roles,
          permissions: [...auth.permissions],
          surface: auth.surface,
          contractorOrgId: auth.contractorOrgId,
          scopes: auth.scopes,
        },
        organisation: org.rows[0],
        tenancies: tenancies.rows,
        notificationPreferences: NOTIFICATION_TOPICS.map((topic) => ({
          topic,
          channels: prefMap.get(topic) ?? null,
          mandatory: MANDATORY_TOPICS.includes(topic),
        })),
      };
    });
  });

  app.patch('/api/me', async (request) => {
    const auth = requireAuth(request);
    const input = parse(updateProfileSchema, request.body);
    return db(request, async (client) => {
      if (input.email) {
        const taken = await client.query(
          'select 1 from users where lower(email) = lower($1) and id <> $2',
          [input.email, auth.userId],
        );
        if (taken.rowCount) throw conflict('E-postadressen används redan.');
      }

      const result = await client.query(
        `update users set
            first_name = coalesce($2, first_name),
            last_name  = coalesce($3, last_name),
            phone      = case when $4::boolean then $5 else phone end,
            locale     = coalesce($6, locale),
            email      = coalesce($7, email),
            email_verified_at = case when $7 is not null and lower($7) <> lower(email)
                                     then null else email_verified_at end
          where id = $1
          returning id, email, first_name, last_name, phone, locale`,
        [
          auth.userId,
          input.firstName ?? null,
          input.lastName ?? null,
          input.phone !== undefined,
          input.phone ?? null,
          input.locale ?? null,
          input.email ?? null,
        ],
      );

      await audit(request, {
        action: 'profile.updated',
        entityType: 'user',
        entityId: auth.userId,
        // Ändrade fält loggas, inte innehållet.
        detail: { fields: Object.keys(input) },
      });

      // Uppdaterade kontaktuppgifter ska föras vidare till fastighetssystemet
      // (krav B.1.27). Utan ansluten integration köas ingen överföring – kravet
      // uppfylls först när integrationen är i status "Ansluten".
      const integration = await client.query<{ status: string }>(
        "select status from integrations where org_id = $1 and kind = 'property_system' limit 1",
        [auth.orgId],
      );
      const syncStatus = integration.rows[0]?.status ?? 'planned';

      return {
        user: result.rows[0],
        propertySystemSync:
          syncStatus === 'connected'
            ? { status: 'queued' }
            : { status: 'unavailable', reason: 'Integrationen mot fastighetssystemet är inte ansluten.' },
      };
    });
  });

  app.put('/api/me/notification-preferences', async (request) => {
    const auth = requireAuth(request);
    const input = parse(updateNotificationPreferencesSchema, request.body);
    return db(request, async (client) => {
      for (const preference of input.preferences) {
        // Kritisk säkerhetsinformation kan inte stängas av (avsnitt 19 i kravbilden).
        if (MANDATORY_TOPICS.includes(preference.topic)) continue;
        await client.query(
          `insert into notification_preferences (org_id, user_id, topic, channels)
           values ($1,$2,$3,$4)
           on conflict (user_id, topic) do update set channels = excluded.channels, updated_at = now()`,
          [auth.orgId, auth.userId, preference.topic, preference.channels],
        );
      }
      await audit(request, { action: 'profile.notification_preferences_updated', entityType: 'user', entityId: auth.userId });
      const result = await client.query('select topic, channels from notification_preferences where user_id = $1', [auth.userId]);
      return { preferences: result.rows };
    });
  });

  app.post('/api/me/push-tokens', async (request) => {
    const auth = requireAuth(request);
    const input = parse(registerPushTokenSchema, request.body);
    return db(request, async (client) => {
      await client.query(
        `insert into push_tokens (org_id, user_id, token, platform)
         values ($1,$2,$3,$4)
         on conflict (user_id, token) do update set last_seen_at = now()`,
        [auth.orgId, auth.userId, input.token, input.platform],
      );
      // Tokenvärdet loggas aldrig.
      await audit(request, { action: 'profile.push_token_registered', detail: { platform: input.platform } });
      return { ok: true };
    });
  });

  app.delete<{ Params: { token: string } }>('/api/me/push-tokens/:token', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      await client.query('delete from push_tokens where user_id = $1 and token = $2', [
        auth.userId,
        request.params.token,
      ]);
      return { ok: true };
    });
  });

  /**
   * Export av egna personuppgifter (avsnitt 24 i kravbilden). Exporten innehåller
   * det som hör till den inloggade användaren och inget om andra hyresgäster.
   */
  app.get('/api/me/export', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const [user, tenancies, cases, bookings, messages, invoices, notifications, feedback] =
        await sequence([

          () => client.query(
            'select id, email, first_name, last_name, phone, locale, created_at, last_login_at from users where id = $1',
            [auth.userId],
          ),

          () => client.query(
            `select t.id, t.starts_at, t.ends_at, uh.object_number, uh.property_name, uh.property_street
               from tenancy_residents tr join tenancies t on t.id = tr.tenancy_id
               join unit_hierarchy uh on uh.unit_id = t.unit_id
              where tr.user_id = $1`,
            [auth.userId],
          ),

          () => client.query(
            `select case_number, kind, category_key, subcategory_key, title, description, status,
                    created_at, closed_at
               from cases where reporter_user_id = $1 order by created_at desc`,
            [auth.userId],
          ),

          () => client.query(
            `select b.id, r.name as resource, lower(b.slot) as starts_at, upper(b.slot) as ends_at,
                    b.status, b.created_at
               from bookings b join resources r on r.id = b.resource_id
              where b.user_id = $1 order by lower(b.slot) desc`,
            [auth.userId],
          ),

          () => client.query(
            `select m.created_at, t.subject, m.body
               from messages m join threads t on t.id = m.thread_id
              where m.author_user_id = $1 and not m.internal order by m.created_at`,
            [auth.userId],
          ),

          () => client.query(
            `select i.invoice_number, i.period_start, i.period_end, i.due_date, i.amount_ore, i.status
               from invoices i
               join tenancy_residents tr on tr.tenancy_id = i.tenancy_id
              where tr.user_id = $1 order by i.due_date desc`,
            [auth.userId],
          ),

          () => client.query(
            'select topic, channel, title, created_at, status from notifications where user_id = $1 order by created_at desc limit 500',
            [auth.userId],
          ),

          () => client.query('select rating, comment, created_at from case_feedback where user_id = $1', [
            auth.userId,
          ]),
      ]);

      await audit(request, { action: 'gdpr.self_export', entityType: 'user', entityId: auth.userId });

      return {
        generatedAt: new Date().toISOString(),
        note: 'Exporten omfattar de uppgifter som är kopplade till ditt konto.',
        user: user.rows[0],
        tenancies: tenancies.rows,
        cases: cases.rows,
        bookings: bookings.rows,
        messages: messages.rows,
        invoices: invoices.rows,
        notifications: notifications.rows,
        feedback: feedback.rows,
      };
    });
  });

  /** Notiser i appen, med filtrering på olästa. */
  app.get<{ Querystring: { unreadOnly?: string; limit?: string } }>(
    '/api/me/notifications',
    async (request) => {
      const auth = requireAuth(request);
      const limit = Math.min(Number(request.query.limit ?? 50) || 50, 100);
      const unreadOnly = request.query.unreadOnly === 'true';
      return db(request, async (client) => {
        const result = await client.query(
          `select id, topic, title, body, link_route, link_id, status, requires_acknowledgement,
                  acknowledged_at, created_at, read_at
             from notifications
            where user_id = $1 and channel = 'inapp'
              and ($2::boolean is false or read_at is null)
            order by created_at desc
            limit $3`,
          [auth.userId, unreadOnly, limit],
        );
        const unread = await client.query<{ count: number }>(
          "select count(*)::int as count from notifications where user_id = $1 and channel = 'inapp' and read_at is null",
          [auth.userId],
        );
        return { notifications: result.rows, unreadCount: unread.rows[0]?.count ?? 0 };
      });
    },
  );

  app.post<{ Params: { id: string } }>('/api/me/notifications/:id/read', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      await client.query(
        "update notifications set read_at = now(), status = 'read' where id = $1 and user_id = $2",
        [request.params.id, auth.userId],
      );
      return { ok: true };
    });
  });

  app.post('/api/me/notifications/read-all', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query(
        "update notifications set read_at = now(), status = 'read' where user_id = $1 and read_at is null and channel = 'inapp'",
        [auth.userId],
      );
      return { updated: result.rowCount ?? 0 };
    });
  });
}
