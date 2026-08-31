import type { FastifyInstance } from 'fastify';
import { createSurveySchema, submitSurveyResponseSchema } from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { countAudience, resolveAudienceUsers } from '../core/audience.js';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { respondentKey } from '../core/crypto.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { notify } from '../core/notify.js';
import { parse } from '../core/validate.js';

/**
 * Enkäter och återkoppling.
 *
 * När en enkät är anonym lagras inget användar-id på svaret. I stället sparas en
 * nyckelbunden hash som bara hindrar dubbelsvar – den går inte att räkna baklänges
 * till en person. Strukturen (område, fastighet) sparas så att resultat kan
 * sammanställas per nivå (avsnitt 17 i kravbilden).
 */
export async function registerSurveyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/surveys', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query(
        `select s.id, s.kind, s.title, s.description, s.opens_at, s.closes_at, s.anonymous,
                s.questions
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
                   or (sa.scope = 'building' and sa.scope_id = uh.building_id)
                   or (sa.scope = 'unit' and sa.scope_id = uh.unit_id)))
          order by s.closes_at nulls last limit 20`,
        [auth.tenancyIds],
      );
      if (!result.rowCount) return { surveys: [] };

      const keys = result.rows.map((s) => respondentKey(s.id as string, auth.userId));
      const answered = await client.query<{ survey_id: string }>(
        'select survey_id from survey_responses where respondent_key = any($1::text[])',
        [keys],
      );
      const done = new Set(answered.rows.map((r) => r.survey_id));
      return {
        surveys: result.rows.map((s) => ({ ...s, answered: done.has(s.id as string) })),
      };
    });
  });

  app.post<{ Params: { id: string } }>('/api/surveys/:id/responses', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:survey:respond');
    const input = parse(submitSurveyResponseSchema, request.body);

    return db(request, async (client) => {
      const survey = await client.query<{
        id: string;
        anonymous: boolean;
        questions: { key: string; required: boolean }[];
        status: string;
        closes_at: Date | null;
      }>('select id, anonymous, questions, status, closes_at from surveys where id = $1', [
        request.params.id,
      ]);
      const row = survey.rows[0];
      if (!row) throw notFound('Enkäten hittades inte.');
      if (row.status !== 'open' || (row.closes_at && row.closes_at < new Date())) {
        throw conflict('Enkäten är stängd.');
      }

      const missing = row.questions
        .filter((q) => q.required && input.answers[q.key] === undefined)
        .map((q) => ({ path: `answers.${q.key}`, message: 'Frågan måste besvaras.' }));
      if (missing.length) throw badRequest('Några frågor saknar svar.', missing);

      const structure = await client.query<{ property_id: string; area_id: string; tenancy_id: string }>(
        `select uh.property_id, uh.area_id, t.id as tenancy_id
           from tenancies t join unit_hierarchy uh on uh.unit_id = t.unit_id
          where t.id = any($1::uuid[]) limit 1`,
        [auth.tenancyIds],
      );

      try {
        await client.query(
          `insert into survey_responses (org_id, survey_id, respondent_key, user_id, tenancy_id,
                                         property_id, area_id, answers)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            auth.orgId,
            row.id,
            respondentKey(row.id, auth.userId),
            // Anonyma enkäter lagrar inget användar-id.
            row.anonymous ? null : auth.userId,
            row.anonymous ? null : (structure.rows[0]?.tenancy_id ?? null),
            structure.rows[0]?.property_id ?? null,
            structure.rows[0]?.area_id ?? null,
            JSON.stringify(input.answers),
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw conflict('Du har redan svarat på enkäten.');
        throw error;
      }

      await audit(request, {
        action: 'survey.responded',
        entityType: 'survey',
        entityId: row.id,
        // Svarens innehåll loggas aldrig.
        detail: { anonymous: row.anonymous },
      });
      return { submitted: true };
    });
  });

  /* ------------------------------------------------- administration --- */

  app.get('/api/staff/surveys', async (request) => {
    requirePermission(request, 'survey:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select s.id, s.kind, s.title, s.status, s.anonymous, s.opens_at, s.closes_at, s.created_at,
                (select count(*)::int from survey_responses r where r.survey_id = s.id) as response_count
           from surveys s order by s.created_at desc limit 100`,
      );
      return { surveys: result.rows };
    });
  });

  app.post('/api/staff/surveys', async (request) => {
    const auth = requirePermission(request, 'survey:write');
    const input = parse(createSurveySchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into surveys (org_id, kind, title, description, status, anonymous, opens_at,
                              closes_at, questions, created_by)
         values ($1,$2,$3,$4,'open',$5,$6,$7,$8,$9) returning id`,
        [
          auth.orgId,
          input.kind,
          input.title,
          input.description ?? null,
          input.anonymous,
          input.opensAt ?? null,
          input.closesAt ?? null,
          JSON.stringify(input.questions),
          auth.userId,
        ],
      );
      const surveyId = result.rows[0]!.id;
      for (const entry of input.audience) {
        await client.query(
          'insert into survey_audiences (org_id, survey_id, scope, scope_id) values ($1,$2,$3,$4)',
          [auth.orgId, surveyId, entry.scope, entry.scopeId ?? null],
        );
      }
      const counts = await countAudience(client, input.audience);
      const users = await resolveAudienceUsers(client, input.audience);
      await notify(client, {
        orgId: auth.orgId,
        userIds: [...new Set(users.map((u) => u.userId))],
        topic: 'surveys',
        title: 'Vi vill gärna höra vad du tycker',
        body: input.title,
        linkRoute: 'survey',
        linkId: surveyId,
        dedupeKey: `survey:${surveyId}`,
      });
      await audit(request, { action: 'survey.created', entityType: 'survey', entityId: surveyId });
      return { id: surveyId, recipients: counts.residents };
    });
  });

  /**
   * Sammanställning per fastighet och område. Grupper med få svar redovisas inte
   * separat, så att enskilda svar inte går att härleda.
   */
  app.get<{ Params: { id: string }; Querystring: { groupBy?: string } }>(
    '/api/staff/surveys/:id/results',
    async (request) => {
      requirePermission(request, 'survey:read');
      const groupBy = request.query.groupBy === 'area' ? 'area' : 'property';
      const MIN_GROUP = 5;
      return db(request, async (client) => {
        const survey = await client.query<{
          id: string;
          title: string;
          questions: { key: string; label: string; type: string }[];
        }>('select id, title, questions from surveys where id = $1', [request.params.id]);
        const row = survey.rows[0];
        if (!row) throw notFound('Enkäten hittades inte.');

        const total = await client.query<{ count: number }>(
          'select count(*)::int as count from survey_responses where survey_id = $1',
          [row.id],
        );

        const groups = await client.query<{
          group_id: string | null;
          group_name: string | null;
          count: number;
          answers: Record<string, unknown>[];
        }>(
          groupBy === 'area'
            ? `select r.area_id as group_id, a.name as group_name, count(*)::int as count,
                      json_agg(r.answers) as answers
                 from survey_responses r left join areas a on a.id = r.area_id
                where r.survey_id = $1 group by r.area_id, a.name`
            : `select r.property_id as group_id, p.name as group_name, count(*)::int as count,
                      json_agg(r.answers) as answers
                 from survey_responses r left join properties p on p.id = r.property_id
                where r.survey_id = $1 group by r.property_id, p.name`,
          [row.id],
        );

        const summarise = (answers: Record<string, unknown>[]) => {
          const out: Record<string, unknown> = {};
          for (const question of row.questions) {
            const values = answers.map((a) => a[question.key]).filter((v) => v !== undefined);
            if (question.type === 'rating') {
              const numbers = values.map(Number).filter((n) => Number.isFinite(n));
              out[question.key] = numbers.length
                ? { average: Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 100) / 100, responses: numbers.length }
                : null;
            } else if (question.type === 'boolean') {
              const yes = values.filter((v) => v === true || v === 'true').length;
              out[question.key] = { yes, no: values.length - yes };
            } else if (question.type === 'text') {
              // Fritextsvar redovisas inte i sammanställningen.
              out[question.key] = { responses: values.length };
            } else {
              const counts: Record<string, number> = {};
              for (const value of values) {
                const key = String(value);
                counts[key] = (counts[key] ?? 0) + 1;
              }
              out[question.key] = counts;
            }
          }
          return out;
        };

        return {
          survey: { id: row.id, title: row.title, questions: row.questions },
          totalResponses: total.rows[0]?.count ?? 0,
          minimumGroupSize: MIN_GROUP,
          groups: groups.rows.map((group) => ({
            id: group.group_id,
            name: group.group_name,
            responses: group.count,
            // Under tröskeln redovisas bara antalet, inte innehållet.
            suppressed: group.count < MIN_GROUP,
            summary: group.count < MIN_GROUP ? null : summarise(group.answers ?? []),
          })),
        };
      });
    },
  );
}
