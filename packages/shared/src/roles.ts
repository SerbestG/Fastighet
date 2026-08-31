/**
 * Roller och behörigheter.
 *
 * Behörighetsmatrisen är den enda källan till sanning och används av backend vid
 * varje anrop (se `requirePermission` i API:et). Gränssnittet använder samma matris
 * enbart för att dölja irrelevanta val – aldrig som skydd.
 */

export const ROLES = [
  'tenant',
  'co_resident',
  'property_manager',
  'customer_service',
  'caretaker',
  'technician',
  'letting_agent',
  'area_manager',
  'admin',
  'contractor',
  'superadmin',
] as const;

export type Role = (typeof ROLES)[number];

/** Roller som tillhör hyresgästsidan (mobilappen). */
export const RESIDENT_ROLES: readonly Role[] = ['tenant', 'co_resident'];

/** Roller som tillhör personalens administrationsgränssnitt. */
export const STAFF_ROLES: readonly Role[] = [
  'property_manager',
  'customer_service',
  'caretaker',
  'technician',
  'letting_agent',
  'area_manager',
  'admin',
  'superadmin',
];

/** Roller som endast når entreprenörsportalen. */
export const CONTRACTOR_ROLES: readonly Role[] = ['contractor'];

export type Surface = 'resident' | 'staff' | 'contractor';

export function surfaceForRole(role: Role): Surface {
  if (RESIDENT_ROLES.includes(role)) return 'resident';
  if (CONTRACTOR_ROLES.includes(role)) return 'contractor';
  return 'staff';
}

/** Personalroller kräver alltid tvåfaktorsautentisering (krav C.2.6, C.2.11). */
export function requiresMfa(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export const PERMISSIONS = [
  // Egen boendedata (hyresgäst)
  'self:read',
  'self:update',
  'self:case:create',
  'self:case:read',
  'self:case:comment',
  'self:booking:manage',
  'self:invoice:read',
  'self:document:read',
  'self:survey:respond',
  'self:onboarding:manage',
  'self:message:send',
  'self:disturbance:report',

  // Ärendehantering (personal)
  'case:read',
  'case:write',
  'case:assign',
  'case:merge',
  'case:close',
  'case:read_sensitive',
  'workorder:read',
  'workorder:write',

  // Fastighetsstruktur
  'property:read',
  'property:write',

  // Hyresgäster och avtal
  'tenancy:read',
  'tenancy:write',
  'resident:read',
  'resident:write',

  // Kommunikation
  'message:read',
  'message:write',
  'notice:read',
  'notice:write',
  'notice:publish',

  // Bokningar och resurser
  'booking:read',
  'booking:write',
  'resource:write',

  // Dokument och ekonomi
  'document:read',
  'document:write',
  'invoice:read',
  'invoice:write',

  // Passage och nycklar
  'access:read',
  'access:write',

  // Enkäter
  'survey:read',
  'survey:write',

  // Statistik
  'analytics:read',

  // Administration
  'user:read',
  'user:write',
  'org:settings',
  'integration:read',
  'integration:write',
  'audit:read',
  'gdpr:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const RESIDENT_BASE: Permission[] = [
  'self:read',
  'self:update',
  'self:case:create',
  'self:case:read',
  'self:case:comment',
  'self:booking:manage',
  'self:invoice:read',
  'self:document:read',
  'self:survey:respond',
  'self:onboarding:manage',
  'self:message:send',
  'self:disturbance:report',
];

const HANDLER_BASE: Permission[] = [
  'case:read',
  'case:write',
  'workorder:read',
  'property:read',
  'tenancy:read',
  'resident:read',
  'message:read',
  'message:write',
  'notice:read',
  'booking:read',
  'document:read',
  'analytics:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  tenant: RESIDENT_BASE,

  // Medboende ser boendet men äger inte avtalet: ingen åtkomst till avier.
  co_resident: RESIDENT_BASE.filter(
    (p) => p !== 'self:invoice:read' && p !== 'self:onboarding:manage',
  ),

  customer_service: [
    ...HANDLER_BASE,
    'case:assign',
    'case:merge',
    'booking:write',
    'invoice:read',
    'survey:read',
    'notice:write',
  ],

  caretaker: [...HANDLER_BASE, 'case:assign', 'case:close', 'workorder:write', 'access:read'],

  technician: [...HANDLER_BASE, 'workorder:write', 'case:close'],

  letting_agent: [
    ...HANDLER_BASE,
    'tenancy:write',
    'resident:write',
    'document:write',
    'access:read',
  ],

  property_manager: [
    ...HANDLER_BASE,
    'case:assign',
    'case:merge',
    'case:close',
    'case:read_sensitive',
    'workorder:write',
    'property:write',
    'tenancy:write',
    'resident:write',
    'notice:write',
    'notice:publish',
    'booking:write',
    'resource:write',
    'document:write',
    'invoice:read',
    'access:read',
    'access:write',
    'survey:read',
    'survey:write',
  ],

  area_manager: [
    ...HANDLER_BASE,
    'case:assign',
    'case:merge',
    'case:close',
    'case:read_sensitive',
    'workorder:write',
    'property:write',
    'tenancy:write',
    'resident:write',
    'notice:write',
    'notice:publish',
    'booking:write',
    'resource:write',
    'document:write',
    'invoice:read',
    'invoice:write',
    'access:read',
    'access:write',
    'survey:read',
    'survey:write',
    'user:read',
  ],

  admin: [
    ...HANDLER_BASE,
    'case:assign',
    'case:merge',
    'case:close',
    'case:read_sensitive',
    'workorder:write',
    'property:write',
    'tenancy:write',
    'resident:write',
    'notice:write',
    'notice:publish',
    'booking:write',
    'resource:write',
    'document:write',
    'invoice:read',
    'invoice:write',
    'access:read',
    'access:write',
    'survey:read',
    'survey:write',
    'user:read',
    'user:write',
    'org:settings',
    'integration:read',
    'integration:write',
    'audit:read',
    'gdpr:manage',
  ],

  // Superadministratör förvaltar plattformen. Notera: rollen ger inte automatisk
  // läsning av andra organisationers data – organisationsspärren i databasen (RLS)
  // gäller även här och kringgås aldrig av en roll.
  superadmin: [...PERMISSIONS],

  contractor: ['workorder:read', 'workorder:write'],
};

export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) out.add(permission);
  }
  return out;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => (ROLE_PERMISSIONS[role] ?? []).includes(permission));
}
