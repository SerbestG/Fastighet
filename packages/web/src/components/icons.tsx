import type { SVGProps } from 'react';

/**
 * Ikoner ritas som linjer i en gemensam stil och är alltid dekorativa –
 * betydelsen bärs av texten bredvid, aldrig av ikonen ensam.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-5.5h5V20" /></Icon>
);
export const WrenchIcon = (p: IconProps) => (
  <Icon {...p}><path d="M15.5 3.5a5 5 0 0 0-6.2 6.4L3.6 15.6a2 2 0 1 0 2.8 2.8l5.7-5.7a5 5 0 0 0 6.4-6.2l-2.9 2.9-2.6-.6-.6-2.6z" /></Icon>
);
export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>
);
export const InvoiceIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 3h12v18l-3-1.8-3 1.8-3-1.8L6 21z" /><path d="M9.5 8.5h5M9.5 12.5h5" /></Icon>
);
export const DocumentIcon = (p: IconProps) => (
  <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M8.5 13h7M8.5 17h4" /></Icon>
);
export const MessageIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z" /></Icon>
);
export const BellIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z" /><path d="M10 18a2 2 0 0 0 4 0" /></Icon>
);
export const ChevronRight = (p: IconProps) => <Icon {...p}><path d="M9 5l7 7-7 7" /></Icon>;
export const ChevronLeft = (p: IconProps) => <Icon {...p}><path d="M15 5l-7 7 7 7" /></Icon>;
export const ChevronDown = (p: IconProps) => <Icon {...p}><path d="M5 9l7 7 7-7" /></Icon>;
export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const CameraIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></Icon>
);
export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7" /></Icon>;
export const CloseIcon = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const AlertIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 4.5 2.8 20h18.4z" /><path d="M12 10v4.5M12 17.2v.3" /></Icon>
);
export const InfoIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.3" /></Icon>
);
export const WaterIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3s6 6.6 6 10.4A6 6 0 0 1 6 13.4C6 9.6 12 3 12 3z" /></Icon>
);
export const BoltIcon = (p: IconProps) => <Icon {...p}><path d="M13.5 2 5 13.5h5.5L9.5 22 19 10h-5.5z" /></Icon>;
export const ElevatorIcon = (p: IconProps) => (
  <Icon {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M12 3v18M9 9l-1.5 2h3zM15 15l1.5-2h-3z" /></Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Icon>
);
export const FilterIcon = (p: IconProps) => <Icon {...p}><path d="M3.5 6h17M6.5 12h11M10 18h4" /></Icon>;
export const UserIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></Icon>
);
export const KeyIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3.5M15.5 12v2.5" /></Icon>
);
export const MapIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z" /><path d="M9 4v14M15 6v14" /></Icon>
);
export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 5.2 2 2 0 0 1 6 3z" /></Icon>
);
export const MailIcon = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></Icon>
);
export const ChartIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12.5 16V8M17 16v-6" /></Icon>
);
export const BuildingIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 21V6l7-3 7 3v15" /><path d="M4 21h16M8.5 9h.01M13 9h.01M8.5 13h.01M13 13h.01M10 21v-4h3v4" /></Icon>
);
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" /></Icon>
);
export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 8l-4 4 4 4M6 12h9" /></Icon>
);
export const MenuIcon = (p: IconProps) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9z" />
  </Icon>
);
export const ClipboardIcon = (p: IconProps) => (
  <Icon {...p}><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 4.5V3.5h6v1M9 10h6M9 14h4" /></Icon>
);
export const ToolboxIcon = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8.5 8V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M3 13h18" /></Icon>
);
export const MegaphoneIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 10v4a1 1 0 0 0 1 1h3l8 4V5L8 9H5a1 1 0 0 0-1 1z" /><path d="M19 9.5a3.5 3.5 0 0 1 0 5" /></Icon>
);
export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3.2 5 6v6c0 4.2 3 7.7 7 8.8 4-1.1 7-4.6 7-8.8V6z" /><path d="M9.2 12.2 11.3 14l3.5-3.8" /></Icon>
);
export const BoxIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></Icon>
);
export const ArrowRight = (p: IconProps) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></Icon>
);
export const PinIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></Icon>
);
export const LinkIcon = (p: IconProps) => (
  <Icon {...p}><path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.4 1.4" /><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4" /></Icon>
);
export const LeafIcon = (p: IconProps) => (
  <Icon {...p}><path d="M20 4c0 9-6 13-11 13a5 5 0 0 1-5-5C4 7 12 4 20 4z" /><path d="M4 20c3-6 7-9 11-10.5" /></Icon>
);
