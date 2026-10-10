// Domänmodell för Foodi. Allt som visas i prototypen utgår från de här typerna,
// så att ett riktigt API senare kan ersätta den lokala lagringen utan att
// gränssnittet behöver skrivas om.

/** Öppet ett visst veckodag, t.ex. { open: '11:00', close: '03:00' } (stänger efter midnatt). */
export interface OpeningSpan {
  open: string;
  close: string;
}

/** Index 0 = måndag … 6 = söndag. null betyder stängt hela dagen. */
export type WeekHours = (OpeningSpan | null)[];

export interface Area {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export type CuisineId =
  | 'burgare'
  | 'pizza'
  | 'sushi'
  | 'asiatiskt'
  | 'husman'
  | 'fika'
  | 'vegetariskt'
  | 'mellanostern'
  | 'mexikanskt'
  | 'sallad';

export type DishTag = 'vegetarisk' | 'vegansk' | 'stark' | 'glutenfri' | 'laktosfri';

export interface OptionChoice {
  id: string;
  name: string;
  price: number;
  photo?: string;
}

export interface OptionGroup {
  id: string;
  title: string;
  /** single = välj en, multi = välj flera. */
  kind: 'single' | 'multi';
  required: boolean;
  max?: number;
  choices: OptionChoice[];
}

export interface Ingredient {
  id: string;
  name: string;
  photo?: string;
  emoji?: string;
}

export interface Dish {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  /** Nyckel i fotobiblioteket eller en uppladdad bild (data-URL). */
  photo?: string;
  emoji: string;
  tags?: DishTag[];
  popular?: boolean;
  soldOut?: boolean;
  ingredients?: Ingredient[];
  optionGroups?: OptionGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
}

export type LogoFont = 'script' | 'serif' | 'serif-italic' | 'condensed' | 'hand' | 'mincho' | 'grotesk';

export interface Brand {
  bg: string;
  fg: string;
  accent: string;
  font: LogoFont;
  logo: { primary: string; secondary?: string };
  /** Motiv till omslaget när restaurangen inte har laddat upp ett foto. */
  motif: string[];
}

export interface Restaurant {
  id: string;
  name: string;
  tagline: string;
  cuisines: string[];
  categories: CuisineId[];
  priceLevel: 1 | 2 | 3;
  rating: number;
  ratingCount: number;
  address: string;
  area: string;
  lat: number;
  lng: number;
  phone: string;
  /** Normal tillagningstid i minuter. */
  prepMinutes: number;
  hours: WeekHours;
  /** Restaurangen har pausat beställningar tillfälligt (t.ex. hög belastning). */
  pausedUntil?: number;
  /** Plattformen har stängt av restaurangen. */
  suspended?: boolean;
  /** Provision i procent av matpriset. */
  commission: number;
  cover?: { photo: string; position?: string };
  brand: Brand;
  menu: MenuCategory[];
  dishes: Dish[];
  joined: string;
  about: string;
}

/** En rad i varukorgen. Priset räknas fram från aktuell meny vid varje visning. */
export interface CartLine {
  id: string;
  dishId: string;
  quantity: number;
  /** Ingredienser kunden har valt bort. */
  removed: string[];
  /** Valda alternativ per tillvalsgrupp. */
  selections: Record<string, string[]>;
  comment?: string;
}

export interface Cart {
  restaurantId: string;
  lines: CartLine[];
}

export type OrderStatus = 'placed' | 'accepted' | 'preparing' | 'ready' | 'picked_up' | 'rejected' | 'cancelled';

export type PaymentMethod = 'swish' | 'card' | 'wallet';

export interface OrderLine {
  dishId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: string[];
  comment?: string;
  photo?: string;
  emoji: string;
}

export interface Customer {
  name: string;
  phone: string;
  email?: string;
}

export interface Notice {
  at: number;
  channel: 'sms' | 'epost';
  text: string;
}

export interface Order {
  id: string;
  number: string;
  /** customer = lagd i den här webbläsaren, demo = exempeldata. */
  origin: 'customer' | 'demo';
  restaurantId: string;
  createdAt: number;
  pickup: { mode: 'asap' | 'scheduled'; time: number };
  /** Tiden restaurangen har bekräftat att maten är klar. */
  confirmedTime?: number;
  status: OrderStatus;
  history: { status: OrderStatus; at: number }[];
  lines: OrderLine[];
  subtotal: number;
  serviceFee: number;
  total: number;
  /** Provision i procent vid beställningstillfället. */
  commission: number;
  vatPct: number;
  payment: { method: PaymentMethod; paidAt: number; reference: string; refundedAt?: number };
  customer: Customer;
  note?: string;
  rejectReason?: string;
  /** Låt demorestaurangen svara automatiskt. Stängs av så fort personalen agerar själv. */
  autopilot: boolean;
  rating?: number;
  notices: Notice[];
}

export interface PlatformSettings {
  serviceFeePct: number;
  serviceFeeCap: number;
  defaultCommission: number;
  vatPct: number;
  /** Demorestaurangerna svarar automatiskt på nya beställningar. */
  autopilot: boolean;
}

export type UserLocation =
  | { kind: 'area'; areaId: string }
  | { kind: 'gps'; lat: number; lng: number; label: string };
