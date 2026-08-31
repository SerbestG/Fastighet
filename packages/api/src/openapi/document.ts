import { config } from '../config.js';

export interface RouteRecord {
  method: string;
  url: string;
}

/**
 * Kort beskrivning per slutpunkt. Sökvägar utan post här får en beskrivning
 * härledd från metoden, så att dokumentet aldrig innehåller tomma rutor.
 */
const DESCRIPTIONS: Record<string, string> = {
  'POST /api/auth/login': 'Loggar in en användare. Personalkonton kräver engångskod.',
  'POST /api/auth/refresh': 'Byter uppdateringstoken mot en ny åtkomsttoken.',
  'POST /api/auth/logout': 'Avslutar den aktuella sessionen.',
  'POST /api/auth/register': 'Skapar ett hyresgästkonto med en inbjudningskod.',
  'POST /api/auth/verify-email': 'Bekräftar en e-postadress.',
  'POST /api/auth/password': 'Byter lösenord och avslutar övriga sessioner.',
  'POST /api/auth/mfa/setup': 'Skapar en ny hemlighet för tvåfaktorsautentisering.',
  'POST /api/auth/mfa/enroll': 'Aktiverar tvåfaktorsautentisering.',
  'GET /api/me': 'Inloggad användare, organisation, boenden och notisinställningar.',
  'PATCH /api/me': 'Uppdaterar kontaktuppgifter och språk.',
  'GET /api/me/export': 'Exporterar den inloggades egna personuppgifter.',
  'GET /api/home': 'Personlig startsida för hyresgästen.',
  'GET /api/my-home': 'Uppgifter om bostaden, utrustning och kontakter.',
  'GET /api/area': 'Information om området och lokala tjänster.',
  'GET /api/case-taxonomy': 'Kategorier, utrymmen och valbara objekt för felanmälan.',
  'GET /api/cases': 'Hyresgästens egna ärenden.',
  'POST /api/cases': 'Skapar en felanmälan eller annat ärende.',
  'GET /api/cases/:id': 'Ett ärende med tidslinje och bilagor.',
  'POST /api/cases/:id/comments': 'Lägger till information i ett ärende.',
  'POST /api/cases/:id/feedback': 'Lämnar återkoppling på ett avslutat ärende.',
  'GET /api/staff/cases': 'Ärendeinkorg med filtrering och sortering.',
  'PATCH /api/staff/cases/:id': 'Ändrar status, prioritet, handläggare eller kostnad.',
  'POST /api/staff/cases/:id/merge': 'Slår ihop dubbletter till ett ärende.',
  'GET /api/booking/resources': 'Bokningsbara resurser för hyresgästens adress.',
  'GET /api/booking/resources/:id/slots': 'Schema med bokningsbara tider.',
  'POST /api/bookings': 'Bokar en tid.',
  'DELETE /api/bookings/:id': 'Avbokar en tid.',
  'GET /api/notices': 'Driftinformation och nyheter som berör hyresgästen.',
  'POST /api/staff/notices': 'Skapar och publicerar driftinformation eller nyhet.',
  'GET /api/invoices': 'Hyresavier med betalstatus.',
  'GET /api/documents': 'Dokument kopplade till bostaden och avtalet.',
  'GET /api/partner/work-orders': 'Arbetsorder tilldelade entreprenörens bolag.',
  'GET /api/staff/dashboard': 'Nyckeltal för förvaltningen med spårning till underlaget.',
  'GET /api/staff/integrations': 'Integrationsregister med aktuell status.',
  'GET /api/staff/audit-log': 'Säkerhetslogg.',
  'POST /api/files': 'Laddar upp en eller flera filer.',
  'GET /api/files/:id': 'Hämtar en fil efter behörighetskontroll.',
};

const TAG_RULES: [RegExp, string][] = [
  [/^\/api\/auth/, 'Autentisering'],
  [/^\/api\/public/, 'Publikt'],
  [/^\/api\/me/, 'Profil'],
  [/^\/api\/(home|my-home|area|knowledge|contact)/, 'Hyresgäst: boende'],
  [/^\/api\/(cases|case-taxonomy)/, 'Ärenden'],
  [/^\/api\/(booking|bookings)/, 'Bokning'],
  [/^\/api\/notices/, 'Driftinformation'],
  [/^\/api\/(threads)/, 'Meddelanden'],
  [/^\/api\/(documents|invoices)/, 'Dokument och avier'],
  [/^\/api\/(move-flows|move-steps|tenancies)/, 'Flytt'],
  [/^\/api\/surveys/, 'Enkäter'],
  [/^\/api\/access/, 'Passage'],
  [/^\/api\/files/, 'Filer'],
  [/^\/api\/partner/, 'Entreprenörsportal'],
  [/^\/api\/staff\/(dashboard|analytics)/, 'Statistik'],
  [/^\/api\/staff/, 'Administration'],
  [/^\/api\/health/, 'Drift'],
];

function tagFor(url: string): string {
  for (const [pattern, tag] of TAG_RULES) if (pattern.test(url)) return tag;
  return 'Övrigt';
}

/** Fastifys `:param` översätts till OpenAPI:s `{param}`. */
function toOpenApiPath(url: string): { path: string; params: string[] } {
  const params: string[] = [];
  const path = url.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    params.push(name);
    return `{${name}}`;
  });
  return { path, params };
}

export function buildOpenApiDocument(routes: RouteRecord[] = []): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    if (route.method === 'HEAD' || route.method === 'OPTIONS') continue;
    const { path, params } = toOpenApiPath(route.url);
    const key = `${route.method} ${route.url}`;
    const isPublic = route.url.startsWith('/api/public') || route.url.startsWith('/api/health') ||
      route.url.startsWith('/api/auth/login') || route.url.startsWith('/api/auth/register') ||
      route.url === '/api/openapi.json';

    paths[path] ??= {};
    paths[path]![route.method.toLowerCase()] = {
      summary: DESCRIPTIONS[key] ?? defaultSummary(route.method, route.url),
      tags: [tagFor(route.url)],
      security: isPublic ? [] : [{ bearerAuth: [] }],
      parameters: params.map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      })),
      responses: {
        '200': { description: 'Lyckad begäran' },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': { $ref: '#/components/responses/NotFound' },
        '429': { $ref: '#/components/responses/RateLimited' },
        '500': { $ref: '#/components/responses/ServerError' },
      },
    };
  }

  const errorResponse = (description: string) => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Hemvist API',
      version: '1.0.0',
      description:
        'API för hyresgästapplikation och administrationsgränssnitt. Samtliga svar är i UTF-8. ' +
        'Datum och tider anges i ISO 8601 med tidszon. Belopp anges i ören som heltal, för att undvika ' +
        'avrundningsfel. Varje anrop kräver autentisering med undantag för de publika slutpunkterna, ' +
        'och behörigheten kontrolleras på objektnivå vid varje läsning och skrivning.',
      contact: { name: 'Systemförvaltning' },
    },
    servers: [{ url: config.publicApiUrl, description: config.nodeEnv }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Åtkomsttoken från /api/auth/login. Tokens är kortlivade och förnyas med /api/auth/refresh. ' +
            'För maskin-till-maskin-integrationer utfärdas separata klientuppgifter enligt OAuth 2.0 ' +
            '(client credentials) när integrationen är konfigurerad.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'traceId'],
              properties: {
                code: { type: 'string', description: 'Stabil felkod.' },
                message: { type: 'string', description: 'Begripligt meddelande på svenska.' },
                traceId: { type: 'string', description: 'Spårnings-ID som finns i serverloggen.' },
                issues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { path: { type: 'string' }, message: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        ValidationError: errorResponse('Indata kunde inte valideras.'),
        Unauthorized: errorResponse('Autentisering krävs eller har upphört.'),
        Forbidden: errorResponse('Behörighet saknas.'),
        NotFound: errorResponse('Resursen finns inte eller är inte åtkomlig.'),
        RateLimited: errorResponse('För många anrop.'),
        ServerError: errorResponse('Tekniskt fel.'),
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
  };
}

function defaultSummary(method: string, url: string): string {
  const noun = url.split('/').filter(Boolean).slice(1).join(' / ') || 'resurs';
  switch (method) {
    case 'GET':
      return `Hämtar ${noun}.`;
    case 'POST':
      return `Skapar eller utför åtgärd på ${noun}.`;
    case 'PATCH':
    case 'PUT':
      return `Uppdaterar ${noun}.`;
    case 'DELETE':
      return `Tar bort eller avslutar ${noun}.`;
    default:
      return noun;
  }
}
