import { describe, expect, it } from 'vitest';
import {
  CASE_CATEGORIES,
  LOCALES,
  canTransition,
  derivePriority,
  findSubcategory,
  formatAmount,
  formatDate,
  formatDateTime,
  formatTime,
  missingKeys,
  simpleStatus,
  spaceLabel,
  translate,
  triageSummary,
} from '@hemvist/shared';

describe('Kategoriträd och prioritering', () => {
  it('varje kategori och underkategori har svensk och engelsk text', () => {
    for (const category of CASE_CATEGORIES) {
      expect(category.label.sv.length).toBeGreaterThan(0);
      expect(category.label.en.length).toBeGreaterThan(0);
      expect(category.subcategories.length).toBeGreaterThan(0);
      for (const subcategory of category.subcategories) {
        expect(subcategory.label.sv.length).toBeGreaterThan(0);
        expect(subcategory.label.en.length).toBeGreaterThan(0);
        for (const question of subcategory.triage) {
          expect(question.label.sv.length).toBeGreaterThan(0);
          expect(question.label.en.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('en pågående läcka som inte går att stänga av blir akut', () => {
    const result = derivePriority('water_drainage', 'leak', {
      ongoing: 'yes',
      can_shut_off: 'no',
      damage_risk: 'yes',
    });
    expect(result.priority).toBe('emergency');
    expect(result.escalated).toBe(true);
    expect(result.reasons).toContain('can_shut_off');
  });

  it('en läcka som redan är avstängd hanteras som hög, inte akut', () => {
    const result = derivePriority('water_drainage', 'leak', {
      ongoing: 'no',
      can_shut_off: 'yes',
      damage_risk: 'no',
    });
    expect(result.priority).toBe('high');
    expect(result.escalated).toBe(false);
  });

  it('en person som sitter fast i hissen ger akut', () => {
    expect(derivePriority('elevator', 'stopped', { person_trapped: 'yes' }).priority).toBe('emergency');
  });

  it('en trasig lampa i trapphuset förblir låg prioritet', () => {
    expect(derivePriority('common_areas', 'lighting', {}).priority).toBe('normal');
    expect(derivePriority('kitchen', 'cabinets', {}).priority).toBe('low');
  });

  it('störningskategorin är markerad som känslig', () => {
    const found = findSubcategory('disturbance', 'noise');
    expect(found?.category.sensitive).toBe(true);
    expect(found?.subcategory.emergencyGuidance?.sv).toMatch(/112/);
  });

  it('följdfrågor sammanställs med läsbara etiketter', () => {
    const summary = triageSummary('water_drainage', 'leak', { ongoing: 'yes', can_shut_off: 'no' });
    expect(summary[0]!.label).toBe('Pågår läckan just nu?');
    expect(summary[0]!.value).toBe('Ja');
    expect(summary[1]!.escalating).toBe(true);
  });

  it('utrymmen översätts till läsbar text', () => {
    expect(spaceLabel('bathroom')).toBe('Badrum');
    expect(spaceLabel('stairwell')).toBe('Trapphus');
    expect(spaceLabel(null)).toBeNull();
  });
});

describe('Statusflöde', () => {
  it('tillåter bara definierade övergångar', () => {
    expect(canTransition('received', 'under_review')).toBe(true);
    expect(canTransition('received', 'closed')).toBe(false);
    expect(canTransition('resolved', 'closed')).toBe(true);
    expect(canTransition('closed', 'in_progress')).toBe(false);
  });

  it('översätter till hyresgästens enklare status', () => {
    expect(simpleStatus('received')).toBe('not_started');
    expect(simpleStatus('in_progress')).toBe('in_progress');
    expect(simpleStatus('closed')).toBe('completed');
  });
});

describe('Språk', () => {
  it('alla språk har samma nycklar', () => {
    for (const locale of LOCALES) {
      expect(missingKeys(locale), `saknade nycklar i ${locale}`).toEqual([]);
    }
  });

  it('platshållare ersätts', () => {
    expect(translate('sv', 'home.greeting', { name: 'Robin' })).toBe('Hej Robin');
    expect(translate('en', 'home.greeting', { name: 'Robin' })).toBe('Hi Robin');
  });
});

describe('Format enligt svensk standard', () => {
  const moment = '2026-09-10T06:42:00.000Z';

  it('datum skrivs som åååå-mm-dd', () => {
    expect(formatDate(moment)).toBe('2026-09-10');
  });

  it('klockslag skrivs med punkt och lokal tid', () => {
    // 06.42 UTC är 08.42 svensk sommartid.
    expect(formatTime(moment)).toBe('08.42');
    expect(formatDateTime(moment)).toBe('2026-09-10 08.42');
  });

  it('belopp visas i kronor trots att de lagras i ören', () => {
    expect(formatAmount(895_000).replace(/ /g, ' ')).toBe('8 950 kr');
    expect(formatAmount(1050).replace(/ /g, ' ')).toBe('10,50 kr');
  });
});
