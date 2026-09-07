import type { Permission } from './roles.js';

/**
 * Scope-katalog för maskin-till-maskin-anrop (krav A.1.15 och C.3.3).
 *
 * En integration ska bara komma åt det den behöver. Scope är därför avsiktligt
 * grova och läsinriktade: varje scope motsvarar en avgränsad uppgift som ett
 * verksamhetssystem faktiskt behöver, och skrivande scope finns bara där en
 * integration rimligen ska kunna skriva.
 */
export const OAUTH_SCOPES = {
  'cases:read': {
    label: { sv: 'Läsa ärenden', en: 'Read cases' },
    description: {
      sv: 'Hämta ärenden, status och händelser.',
      en: 'Fetch cases, status and events.',
    },
    permissions: ['case:read', 'workorder:read'],
  },
  'cases:write': {
    label: { sv: 'Skriva ärenden', en: 'Write cases' },
    description: {
      sv: 'Skapa ärenden och uppdatera status från ett verksamhetssystem.',
      en: 'Create cases and update status from a business system.',
    },
    permissions: ['case:read', 'case:write', 'workorder:read', 'workorder:write'],
  },
  'properties:read': {
    label: { sv: 'Läsa fastighetsstruktur', en: 'Read property structure' },
    description: {
      sv: 'Hämta områden, fastigheter, byggnader och objekt.',
      en: 'Fetch areas, properties, buildings and units.',
    },
    permissions: ['property:read'],
  },
  'properties:write': {
    label: { sv: 'Skriva fastighetsstruktur', en: 'Write property structure' },
    description: {
      sv: 'Föra över fastighetsstruktur och hyresförhållanden från fastighetssystemet.',
      en: 'Push property structure and tenancies from the property system.',
    },
    permissions: ['property:read', 'property:write', 'tenancy:read', 'tenancy:write', 'resident:read', 'resident:write'],
  },
  'invoices:write': {
    label: { sv: 'Skriva hyresavier', en: 'Write invoices' },
    description: {
      sv: 'Föra över avier och betalstatus från ekonomisystemet.',
      en: 'Push invoices and payment status from the finance system.',
    },
    permissions: ['invoice:read', 'invoice:write'],
  },
  'notices:write': {
    label: { sv: 'Publicera driftinformation', en: 'Publish operational notices' },
    description: {
      sv: 'Lägga in driftinformation från ett driftövervakningssystem.',
      en: 'Post operational notices from a monitoring system.',
    },
    permissions: ['notice:read', 'notice:write', 'notice:publish'],
  },
  'bookings:read': {
    label: { sv: 'Läsa bokningar', en: 'Read bookings' },
    description: {
      sv: 'Hämta bokningar och resurser, till exempel för ett passersystem.',
      en: 'Fetch bookings and resources, for example for an access system.',
    },
    permissions: ['booking:read'],
  },
  'access:write': {
    label: { sv: 'Hantera passagebehörighet', en: 'Manage access rights' },
    description: {
      sv: 'Läsa och återkalla passagebehörigheter i passersystemet.',
      en: 'Read and revoke access rights in the access system.',
    },
    permissions: ['access:read', 'access:write'],
  },
  'analytics:read': {
    label: { sv: 'Läsa statistik', en: 'Read analytics' },
    description: {
      sv: 'Hämta sammanställd statistik utan personuppgifter.',
      en: 'Fetch aggregated statistics without personal data.',
    },
    permissions: ['analytics:read'],
  },
} as const satisfies Record<
  string,
  {
    label: { sv: string; en: string };
    description: { sv: string; en: string };
    permissions: readonly Permission[];
  }
>;

export type OAuthScope = keyof typeof OAUTH_SCOPES;

export const OAUTH_SCOPE_KEYS = Object.keys(OAUTH_SCOPES) as OAuthScope[];

export function isOAuthScope(value: string): value is OAuthScope {
  return Object.hasOwn(OAUTH_SCOPES, value);
}

/** Behörigheterna ett tokenlöfte ger. Okända scope bidrar med ingenting. */
export function permissionsForScopes(scopes: readonly string[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const scope of scopes) {
    if (!isOAuthScope(scope)) continue;
    for (const permission of OAUTH_SCOPES[scope].permissions) result.add(permission);
  }
  return result;
}
