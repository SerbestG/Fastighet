import { describe, expect, it } from 'vitest';
import { createAdminPool } from '../src/db/pool.js';
import { ACCOUNTS, get, login, post } from './helpers.js';

/**
 * Användningsstatistik (krav A.3.12, A.3.13, A.3.14).
 *
 * Statistiken ska svara på hur många som använt en del av appen, totalt och per
 * område. Testerna kontrollerar både att siffrorna stämmer och att ingen
 * användaridentitet lagras.
 */

describe('Användningsstatistik', () => {
  it('registrerar användning utan att spara vem', async () => {
    const tenant = await login(ACCOUNTS.orgA.tenant);
    const result = await post<{ recorded: number }>(tenant, '/api/usage', {
      events: [
        { kind: 'menu', key: '/avier' },
        { kind: 'view', key: '/mitt-boende' },
      ],
    });
    expect(result.status).toBe(200);
    expect(result.body.recorded).toBe(2);

    const pool = createAdminPool();
    try {
      const rows = await pool.query<{ subject_key: string; area_id: string | null }>(
        "select subject_key, area_id from usage_events where key = '/avier'",
      );
      expect(rows.rowCount).toBeGreaterThan(0);
      // Nyckeln är varken användarens id eller e-post.
      expect(rows.rows[0]!.subject_key).not.toBe(tenant.userId);
      expect(rows.rows[0]!.subject_key).not.toContain('@');
      // Området finns med, så att uppdelningen per område går att göra.
      expect(rows.rows[0]!.area_id).toBeTruthy();

      // Tabellen har ingen kolumn som pekar ut en person.
      const columns = await pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name = 'usage_events'`,
      );
      const names = columns.rows.map((r) => r.column_name);
      expect(names).not.toContain('user_id');
      expect(names).not.toContain('email');
    } finally {
      await pool.end();
    }
  });

  it('samma person och nyckel räknas en gång per dag', async () => {
    const tenant = await login(ACCOUNTS.orgA.tenant);
    await post(tenant, '/api/usage', { events: [{ kind: 'menu', key: '/dokument' }] });
    await post(tenant, '/api/usage', { events: [{ kind: 'menu', key: '/dokument' }] });

    const pool = createAdminPool();
    try {
      const rows = await pool.query("select 1 from usage_events where key = '/dokument'");
      expect(rows.rowCount).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it('två personer räknas som två användare', async () => {
    const first = await login(ACCOUNTS.orgA.tenant);
    const second = await login(ACCOUNTS.orgA.otherTenant);
    await post(first, '/api/usage', { events: [{ kind: 'menu', key: '/enkater' }] });
    await post(second, '/api/usage', { events: [{ kind: 'menu', key: '/enkater' }] });

    const staff = await login(ACCOUNTS.orgA.admin);
    const stats = await get<{ byKey: { kind: string; key: string; users: number }[] }>(
      staff,
      '/api/staff/analytics/usage?days=30',
    );
    const row = stats.body.byKey.find((r) => r.key === '/enkater');
    expect(row?.users).toBe(2);
  });

  it('redovisar aktiva kunder och uppdelning per område', async () => {
    const staff = await login(ACCOUNTS.orgA.admin);
    const stats = await get<{
      activeCustomers: number;
      totalCustomers: number;
      byArea: { area: string; users: number }[];
      overTime: { day: string; users: number }[];
    }>(staff, '/api/staff/analytics/usage');
    expect(stats.status).toBe(200);
    expect(stats.body.activeCustomers).toBeGreaterThan(0);
    expect(stats.body.totalCustomers).toBeGreaterThanOrEqual(stats.body.activeCustomers);
    expect(stats.body.byArea.length).toBeGreaterThan(0);
    expect(stats.body.overTime.length).toBeGreaterThan(0);
  });

  it('statistiken stannar hos rätt fastighetsbolag', async () => {
    const other = await login(ACCOUNTS.orgB.tenant);
    await post(other, '/api/usage', { events: [{ kind: 'menu', key: '/bara-hos-b' }] });

    const staff = await login(ACCOUNTS.orgA.admin);
    const stats = await get<{ byKey: { key: string }[] }>(staff, '/api/staff/analytics/usage');
    expect(stats.body.byKey.some((r) => r.key === '/bara-hos-b')).toBe(false);
  });

  it('hyresgäst får inte läsa statistiken', async () => {
    const tenant = await login(ACCOUNTS.orgA.tenant);
    const stats = await get(tenant, '/api/staff/analytics/usage');
    expect(stats.status).toBe(403);
  });
});
