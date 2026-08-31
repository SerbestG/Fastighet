import type { FastifyRequest } from 'fastify';
import type { Locale, Permission, Role, Surface } from '@hemvist/shared';
import type pg from 'pg';
import { withOrg } from '../db/pool.js';
import { forbidden, unauthorized } from './errors.js';

/**
 * Behörighetsavgränsning för en handläggare. Tom lista på båda nivåerna betyder
 * hela organisationen; annars begränsas åtkomsten till angivna områden och
 * fastigheter (avsnitt 3 i kravbilden).
 */
export interface UserScopes {
  areaIds: string[];
  propertyIds: string[];
  unrestricted: boolean;
}

export interface AuthContext {
  userId: string;
  orgId: string;
  orgSlug: string;
  sessionId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  permissions: Set<Permission>;
  surface: Surface;
  contractorOrgId: string | null;
  scopes: UserScopes;
  locale: Locale;
  /** Aktiva hyresförhållanden, tomt för personal och entreprenörer. */
  tenancyIds: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
    traceId: string;
  }
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

export function requirePermission(request: FastifyRequest, permission: Permission): AuthContext {
  const auth = requireAuth(request);
  if (!auth.permissions.has(permission)) {
    throw forbidden(undefined, { permission, roles: auth.roles });
  }
  return auth;
}

export function requireAnyPermission(
  request: FastifyRequest,
  permissions: Permission[],
): AuthContext {
  const auth = requireAuth(request);
  if (!permissions.some((p) => auth.permissions.has(p))) {
    throw forbidden(undefined, { permissions, roles: auth.roles });
  }
  return auth;
}

/** Kör en fråga i den inloggade användarens organisationskontext. */
export function db<T>(
  request: FastifyRequest,
  fn: (client: pg.PoolClient, auth: AuthContext) => Promise<T>,
): Promise<T> {
  const auth = requireAuth(request);
  return withOrg({ orgId: auth.orgId, userId: auth.userId }, (client) => fn(client, auth));
}

/**
 * SQL-villkor som begränsar en fråga till handläggarens områden och fastigheter.
 * Returnerar `true` när användaren har hela beståndet, så att villkoret kan
 * fogas in i en WHERE-sats utan specialfall.
 */
export function scopeCondition(
  scopes: UserScopes,
  columns: { areaId: string; propertyId: string },
  params: unknown[],
): string {
  if (scopes.unrestricted) return 'true';
  const clauses: string[] = [];
  if (scopes.areaIds.length) {
    params.push(scopes.areaIds);
    clauses.push(`${columns.areaId} = any($${params.length}::uuid[])`);
  }
  if (scopes.propertyIds.length) {
    params.push(scopes.propertyIds);
    clauses.push(`${columns.propertyId} = any($${params.length}::uuid[])`);
  }
  // En handläggare utan tilldelad avgränsning ser ingenting förrän en tilldelas.
  return clauses.length ? `(${clauses.join(' or ')})` : 'false';
}
