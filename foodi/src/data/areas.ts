import type { Area } from '../types';

export const AREAS: Area[] = [
  { id: 'sodermalm', name: 'Södermalm', lat: 59.3155, lng: 18.0711 },
  { id: 'vasastan', name: 'Vasastan', lat: 59.3434, lng: 18.0485 },
  { id: 'kungsholmen', name: 'Kungsholmen', lat: 59.3326, lng: 18.0355 },
  { id: 'ostermalm', name: 'Östermalm', lat: 59.3381, lng: 18.0835 },
  { id: 'norrmalm', name: 'Norrmalm', lat: 59.3353, lng: 18.0605 },
  { id: 'gamla-stan', name: 'Gamla stan', lat: 59.3251, lng: 18.0711 },
  { id: 'hammarby-sjostad', name: 'Hammarby sjöstad', lat: 59.3044, lng: 18.1012 },
  { id: 'liljeholmen', name: 'Liljeholmen', lat: 59.3101, lng: 18.0229 },
  { id: 'solna', name: 'Solna centrum', lat: 59.3600, lng: 18.0006 },
];

export const DEFAULT_AREA = 'sodermalm';

export function areaById(id: string): Area {
  return AREAS.find((a) => a.id === id) ?? AREAS[0]!;
}

/** Området närmast en punkt, för att ge en GPS-position ett begripligt namn. */
export function nearestArea(lat: number, lng: number): { area: Area; meters: number } {
  let best = AREAS[0]!;
  let bestMeters = Infinity;
  for (const area of AREAS) {
    const dLat = (area.lat - lat) * 111_320;
    const dLng = (area.lng - lng) * 111_320 * Math.cos((lat * Math.PI) / 180);
    const meters = Math.hypot(dLat, dLng);
    if (meters < bestMeters) {
      best = area;
      bestMeters = meters;
    }
  }
  return { area: best, meters: bestMeters };
}
