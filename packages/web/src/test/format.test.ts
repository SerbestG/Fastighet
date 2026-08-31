import { describe, expect, it } from 'vitest';
import { fileSize, longDate, relativeTime, timeRange } from '../lib/format.js';

describe('Formatering i gränssnittet', () => {
  it('visar relativ tid på svenska', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 5 * 60_000))).toBe('för 5 min sedan');
    expect(relativeTime(new Date(now - 3 * 3_600_000))).toBe('för 3 tim sedan');
    expect(relativeTime(new Date(now - 26 * 3_600_000))).toBe('i går');
  });

  it('skriver ut veckodag och datum', () => {
    expect(longDate('2026-09-10T08:00:00.000Z')).toBe('torsdag 10 september');
  });

  it('skriver tidsintervall med svenska klockslag', () => {
    expect(timeRange('2026-09-10T07:00:00.000Z', '2026-09-10T10:00:00.000Z')).toBe('09.00–12.00');
  });

  it('visar filstorlek läsbart', () => {
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(2048)).toBe('2 kB');
    expect(fileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
