import type { Tone } from '../devices/types';

type Fixed = Exclude<Tone, 'auto'>;

export const TONES: Record<Fixed, { rgb: string; hex: string; label: string }> = {
  warm: { rgb: '255,176,92', hex: '#FFB35C', label: 'Varm' },
  neutral: { rgb: '255,226,184', hex: '#FFE2B8', label: 'Neutral' },
  cool: { rgb: '190,215,255', hex: '#CFE3FF', label: 'Kall' },
};

/**
 * Dygnsrytm: ljuset följer dagen som solljus gör.
 * Morgon neutralt, dag kallt och klart, kväll och natt varmt.
 */
export function circadian(hour = new Date().getHours()): Fixed {
  if (hour >= 6 && hour < 9) return 'neutral';
  if (hour >= 9 && hour < 17) return 'cool';
  if (hour >= 17 && hour < 19) return 'neutral';
  return 'warm';
}

export const toneOf = (t?: Tone) => TONES[!t ? 'warm' : t === 'auto' ? circadian() : t];

export const TONE_OPTIONS: { id: Tone; label: string; dot: string }[] = [
  { id: 'warm', label: 'Varm', dot: TONES.warm.hex },
  { id: 'neutral', label: 'Neutral', dot: TONES.neutral.hex },
  { id: 'cool', label: 'Kall', dot: TONES.cool.hex },
  { id: 'auto', label: 'Dygn', dot: '#E9C98F' },
];
