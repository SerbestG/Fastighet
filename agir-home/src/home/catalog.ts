import type { DeviceKind } from '../devices/types';

/**
 * Agir-sortimentet: allt Plejd har – och lite till. Alla produkter pratar
 * Matter över Thread, så kunden kan blanda märken och aldrig låses in.
 */
export interface Product {
  id: string;
  name: string;
  kind: DeviceKind;
  /** Standardnamn på enheten i appen. */
  defaultName: string;
  sub: string;
  variant?: string;
  /** Kräver behörig elinstallatör (230 V). */
  electrician?: boolean;
}

export interface ProductGroup { id: string; label: string; items: Product[] }

const P = (id: string, name: string, kind: DeviceKind, defaultName: string, sub: string, extra: Partial<Product> = {}): Product =>
  ({ id, name, kind, defaultName, sub, ...extra });

export const CATALOG: ProductGroup[] = [
  { id: 'dimmer', label: 'Dimrar och reläer', items: [
    P('d1', 'Agir Dosdimmer D1', 'light', 'Taklampa', 'Bakom strömbrytaren · 250 W · med eller utan nolla', { electrician: true }),
    P('d2', 'Agir Krondimmer D2', 'light', 'Taklampa', 'I takdosan vid lampan', { electrician: true }),
    P('r1', 'Agir Relä R1', 'relay', 'Relä', 'Av/på för fläkt, utebelysning eller pump', { electrician: true }),
    P('r2', 'Agir Relä R2 2-pol', 'relay', 'Relä', 'Bryter båda faserna · 16 A', { electrician: true }),
    P('dali', 'Agir DALI-brygga', 'light', 'DALI-armaturer', 'Styr befintliga DALI-armaturer', { electrician: true }),
  ] },
  { id: 'led', label: 'LED och armaturer', items: [
    P('l10', 'Agir LED-driver L10', 'strip', 'LED-list', '10 W · spotlights och LED-list · ställbar färgton', { electrician: true }),
    P('l75', 'Agir LED-driver L75', 'strip', 'LED-list', '75 W · längre lister och flera spotlights', { electrician: true }),
    P('dwn', 'Agir Downlight', 'light', 'Downlight', 'Infälld spot med dygnsrytm', { electrician: true }),
    P('pan', 'Agir Plafond', 'light', 'Plafond', 'Taklampa med ställbar färgton', { electrician: true }),
    P('out', 'Agir Vägglampa ute', 'light', 'Vägglampa', 'IP65 · tänds vid solnedgång', { electrician: true }),
    P('lst', 'Agir LED-list Inkapslad', 'strip', 'LED-list', 'Fuktsäker · badrum och utomhus' ),
  ] },
  { id: 'plug', label: 'Uttag', items: [
    P('sp1', 'Agir Plugg P1', 'plug', 'Plugg', 'Av/på · mäter effekt · ingen elektriker', { variant: 'onoff' }),
    P('sp2', 'Agir Plugg P2 dimmer', 'plug', 'Golvlampa', 'Dimmer för lösa lampor · ingen elektriker', { variant: 'dim' }),
  ] },
  { id: 'climate', label: 'Klimat och solskydd', items: [
    P('t1', 'Agir Termostat T1', 'heat', 'Golvvärme', 'Golvvärme · följer elpriset', { electrician: true }),
    P('j1', 'Agir Jalusi J1', 'blind', 'Persienner', 'Persienner, markis och rullgardin', { electrician: true }),
  ] },
  { id: 'wireless', label: 'Sensorer och knappar', items: [
    P('m1', 'Agir Rörelsevakt M1', 'motion', 'Rörelsevakt', 'Tänder vid rörelse · mäter ljus · batteri'),
    P('k1', 'Agir Knapp K1', 'button', 'Knapp', 'Trådlös · sätts var som helst', { variant: 'push' }),
    P('v1', 'Agir Vrid V1', 'button', 'Vridknapp', 'Trådlös vridknapp för att dimra', { variant: 'rotary' }),
    P('w1', 'Agir Knappingång W1', 'button', 'Knapp', 'Gör en vanlig strömbrytare smart', { variant: 'push', electrician: true }),
    P('lk', 'Agir Läckagevakt', 'leak', 'Läckagevakt', 'Stänger vattnet vid läcka'),
    P('fs', 'Agir Fönstersensor', 'window', 'Fönster', 'Pausar värmen när fönstret öppnas'),
  ] },
];

export const ALL_PRODUCTS = CATALOG.flatMap((g) => g.items);
