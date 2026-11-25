import type { Tone } from '../devices/types';

export const TONES: Record<Tone, { rgb: string; hex: string; label: string }> = {
  warm: { rgb: '255,176,92', hex: '#FFB35C', label: 'Varm' },
  neutral: { rgb: '255,226,184', hex: '#FFE2B8', label: 'Neutral' },
  cool: { rgb: '190,215,255', hex: '#CFE3FF', label: 'Kall' },
};

export const toneOf = (t?: Tone) => TONES[t ?? 'warm'];
