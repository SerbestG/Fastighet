import type { DeviceKind } from '../devices/types';

export const PATHS = {
  light: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  heat: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2',
  blind: 'M4 4h16M4 8h16M4 12h16M4 16h16M12 16v4',
  camera: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  leak: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  window: 'M4 3h16v18H4zM12 3v18M4 12h16',
  media: 'M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6',
  charger: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
  strip: 'M3 15h18M6 15v-3M10 15v-3M14 15v-3M18 15v-3M5 19h14',
  relay: 'M3 12h4l3-5M14 12h7M10 7l4 5M7 18h10',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
  motion: 'M13 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM9 21l2-6 3 3v3M7 12l3-3h4l3 3M11 15l1-6',
  button: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  signal: 'M4 20v-3M9 20v-7M14 20v-11M19 20V5',
  battery: 'M3 8h15v8H3zM21 11v2M6 11v2',
  timer: 'M12 8v5l2 2M9 2h6M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  sun: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  blinds: 'M4 4h16M4 8h16M4 12h16M4 16h16',
  spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  close: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  power: 'M12 3v8M6.3 7.3a8 8 0 1 0 11.4 0',
  check: 'M5 12l5 5L20 7',
  shield: 'M12 2l8 3.5v6c0 5.2-3.4 9.3-8 10.5-4.6-1.2-8-5.3-8-10.5v-6z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  list: 'M4 6h16M4 12h16M4 18h10',
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  people: 'M9 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 20c1-3 3.5-5 6-5M21 20c-1-3-3.5-5-6-5',
  grid: 'M3 3h18v18H3zM3 12h9V3M12 12v9',
  hub: 'M4 8h16v8H4zM8 12h.01M16 12h.01',
  mic: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  send: 'M4 12l16-8-6 16-2-7z',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  play: 'M7 5l12 7-12 7z',
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 1.8, className, color }: { name: IconName | DeviceKind; size?: number; stroke?: number; className?: string; color?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name as IconName]} />
    </svg>
  );
}
