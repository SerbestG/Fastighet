import type { Restaurant } from '../types';
import { clock, dayLabel } from '../lib/format';
import { openState, startOfDay } from '../lib/time';

export interface StatusText {
  label: string;
  short: string;
  tone: 'green' | 'amber' | 'red';
  open: boolean;
}

function opensLabel(opensAt: number, now: number): string {
  return startOfDay(opensAt) === startOfDay(now) ? `öppnar ${clock(opensAt)}` : `öppnar ${dayLabel(opensAt, now).toLowerCase()} ${clock(opensAt)}`;
}

/** Öppetstatus i ord, t.ex. "Öppet till 22:00" eller "Stängt · öppnar imorgon 10:00". */
export function restaurantStatus(r: Restaurant, now: number): StatusText {
  const state = openState(r, now);
  if (state.open) {
    const closingSoon = state.closesAt - now < 45 * 60_000;
    return {
      label: `Öppet till ${clock(state.closesAt)}`,
      short: closingSoon ? `Stänger ${clock(state.closesAt)}` : 'Öppet',
      tone: closingSoon ? 'amber' : 'green',
      open: true,
    };
  }
  if (state.reason === 'suspended') return { label: 'Tar inte emot beställningar', short: 'Ej tillgänglig', tone: 'red', open: false };
  if (state.reason === 'paused') {
    return {
      label: `Pausat just nu · ${state.opensAt ? `tillbaka ${clock(state.opensAt)}` : 'tillbaka snart'}`,
      short: 'Pausat',
      tone: 'amber',
      open: false,
    };
  }
  return {
    label: state.opensAt ? `Stängt · ${opensLabel(state.opensAt, now)}` : 'Stängt',
    short: 'Stängt',
    tone: 'red',
    open: false,
  };
}
