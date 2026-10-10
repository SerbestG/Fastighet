import { useEffect, useMemo, useState } from 'react';
import type { Restaurant, UserLocation } from '../types';
import { areaById } from '../data/areas';
import { metersBetween } from '../lib/geo';
import { useAppState } from './store';

/** Aktuell tid som uppdateras med jämna mellanrum. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  label: string;
}

export function locationPoint(location: UserLocation): LocationPoint {
  if (location.kind === 'gps') return { lat: location.lat, lng: location.lng, label: location.label };
  const area = areaById(location.areaId);
  return { lat: area.lat, lng: area.lng, label: area.name };
}

export function useLocationPoint(): LocationPoint {
  const { location } = useAppState();
  return useMemo(() => locationPoint(location), [location]);
}

export function useRestaurant(id: string | undefined): Restaurant | undefined {
  const { restaurants } = useAppState();
  return restaurants.find((r) => r.id === id);
}

export function distanceTo(r: Restaurant, point: LocationPoint): number {
  return metersBetween(point, r);
}
