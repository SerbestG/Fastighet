import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Locale, Permission, Role, Surface } from '@hemvist/shared';
import { ApiError, api, hasSession, onSessionEnded, storeTokens } from './api.js';

export interface Organisation {
  id: string;
  slug: string;
  display_name: string;
  primary_color: string;
  accent_color: string;
  logo_file_id: string | null;
  support_email: string | null;
  support_phone: string | null;
  emergency_phone: string | null;
  disturbance_phone: string | null;
  website_url: string | null;
  default_locale: Locale;
  terminology: Record<string, string>;
  enabled_features: string[];
}

export interface Tenancy {
  id: string;
  starts_at: string;
  ends_at: string | null;
  earliest_move_out: string | null;
  status: string;
  monthly_rent_ore: number | null;
  resident_role: string;
  is_primary: boolean;
  unit_id: string;
  object_number: string;
  unit_label: string;
  entrance_name: string;
  building_id: string;
  building_name: string;
  property_id: string;
  property_name: string;
  property_street: string;
  property_city: string;
  area_id: string;
  area_name: string;
  floor: number | null;
  rooms: number | null;
  area_sqm: number | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  locale: Locale;
  email_verified_at: string | null;
  mfa_enabled: boolean;
  roles: Role[];
  permissions: Permission[];
  surface: Surface;
  contractorOrgId: string | null;
  scopes: { areaIds: string[]; propertyIds: string[]; unrestricted: boolean };
}

export interface NotificationPreference {
  topic: string;
  channels: string[] | null;
  mandatory: boolean;
}

interface Me {
  user: CurrentUser;
  organisation: Organisation;
  tenancies: Tenancy[];
  notificationPreferences: NotificationPreference[];
}

interface AuthValue {
  me: Me | null;
  loading: boolean;
  signedIn: boolean;
  can: (permission: Permission) => boolean;
  /** Har bolaget aktiverat modulen för hyresgästerna? (krav B.1.11) */
  feature: (key: string) => boolean;
  /** Bolagets egna begrepp, t.ex. "Serviceanmälan" i stället för "Felanmälan". */
  term: (key: string, fallback: string) => string;
  signIn: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Sätter organisationens färger som CSS-variabler för hela gränssnittet. */
function applyBranding(organisation: Organisation | null): void {
  const root = document.documentElement;
  if (!organisation) {
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-accent');
    return;
  }
  root.style.setProperty('--brand-primary', organisation.primary_color);
  root.style.setProperty('--brand-accent', organisation.accent_color);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(hasSession());

  const load = useCallback(async () => {
    if (!hasSession()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get<Me>('/api/me');
      setMe(data);
      applyBranding(data.organisation);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        storeTokens(null);
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      onSessionEnded(() => {
        setMe(null);
        applyBranding(null);
      }),
    [],
  );

  const signIn = useCallback(
    async (tokens: { accessToken: string; refreshToken: string }) => {
      storeTokens(tokens);
      setLoading(true);
      await load();
    },
    [load],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Sessionen avslutas lokalt även om anropet misslyckas.
    }
    storeTokens(null);
    setMe(null);
    applyBranding(null);
  }, []);

  const value = useMemo<AuthValue>(() => {
    const permissions = new Set(me?.user.permissions ?? []);
    const features = new Set(me?.organisation.enabled_features ?? []);
    const terminology = me?.organisation.terminology ?? {};
    return {
      me,
      loading,
      signedIn: Boolean(me),
      can: (permission) => permissions.has(permission),
      feature: (key) => features.has(key),
      term: (key, fallback) => terminology[key] ?? fallback,
      signIn,
      signOut,
      reload: load,
    };
  }, [me, loading, signIn, signOut, load]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth måste användas inom AuthProvider.');
  return value;
}
