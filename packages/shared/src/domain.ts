/** Domänkonstanter som delas mellan API och gränssnitt. */

export const CASE_STATUSES = [
  'received',
  'under_review',
  'assigned',
  'visit_booked',
  'in_progress',
  'awaiting_materials',
  'awaiting_tenant',
  'resolved',
  'closed',
  'cancelled',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Förenklad status som visas för hyresgäst (krav B.1.34). */
export const SIMPLE_CASE_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type SimpleCaseStatus = (typeof SIMPLE_CASE_STATUSES)[number];

export function simpleStatus(status: CaseStatus): SimpleCaseStatus {
  switch (status) {
    case 'received':
    case 'under_review':
      return 'not_started';
    case 'resolved':
    case 'closed':
    case 'cancelled':
      return 'completed';
    default:
      return 'in_progress';
  }
}

/** Statusar där ärendet räknas som avslutat och inte längre ligger i kön. */
export const TERMINAL_CASE_STATUSES: readonly CaseStatus[] = ['closed', 'cancelled'];

/** Tillåtna statusövergångar. Backend avvisar allt annat. */
export const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  received: ['under_review', 'assigned', 'cancelled'],
  under_review: ['assigned', 'awaiting_tenant', 'cancelled', 'resolved'],
  assigned: ['visit_booked', 'in_progress', 'awaiting_materials', 'awaiting_tenant', 'cancelled'],
  visit_booked: ['in_progress', 'assigned', 'awaiting_tenant', 'cancelled'],
  in_progress: ['awaiting_materials', 'awaiting_tenant', 'visit_booked', 'resolved', 'cancelled'],
  awaiting_materials: ['in_progress', 'visit_booked', 'cancelled'],
  awaiting_tenant: ['in_progress', 'visit_booked', 'assigned', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return (CASE_TRANSITIONS[from] ?? []).includes(to);
}

export const CASE_PRIORITIES = ['emergency', 'high', 'normal', 'low'] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

/** Svarstid och lösningstid i timmar per prioritet (SLA). */
export const SLA_HOURS: Record<CasePriority, { respond: number; resolve: number }> = {
  emergency: { respond: 1, resolve: 8 },
  high: { respond: 4, resolve: 48 },
  normal: { respond: 24, resolve: 240 },
  low: { respond: 72, resolve: 720 },
};

/** Var felet finns – styrs av hyresgästens avtal (krav B.1.29). */
export const CASE_LOCATION_KINDS = ['residence', 'contract_object', 'common_area'] as const;
export type CaseLocationKind = (typeof CASE_LOCATION_KINDS)[number];

export const CASE_KINDS = ['fault_report', 'disturbance', 'request', 'inspection'] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

export const BOOKING_STATUSES = [
  'reserved',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'waitlisted',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const RESOURCE_KINDS = [
  'laundry',
  'common_room',
  'sauna',
  'guest_apartment',
  'parking',
  'caretaker_visit',
  'inspection',
  'key_pickup',
  'other',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const NOTICE_KINDS = [
  'water_shutoff',
  'elevator_fault',
  'power_outage',
  'heating',
  'ventilation',
  'noisy_work',
  'planned_maintenance',
  'waste',
  'snow_clearing',
  'safety',
  'news',
  'event',
  'other',
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** Driftkategorier som ska hanteras som driftinformation, inte som nyhet. */
export const OPERATIONAL_NOTICE_KINDS: readonly NoticeKind[] = [
  'water_shutoff',
  'elevator_fault',
  'power_outage',
  'heating',
  'ventilation',
  'noisy_work',
  'planned_maintenance',
  'waste',
  'snow_clearing',
  'safety',
];

export const NOTICE_STATUSES = ['draft', 'scheduled', 'published', 'resolved', 'archived'] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

export const NOTICE_SEVERITIES = ['critical', 'important', 'info'] as const;
export type NoticeSeverity = (typeof NOTICE_SEVERITIES)[number];

/** Nivåer i fastighetsstrukturen som en publicering kan riktas mot (krav B.1.15, B.1.16). */
export const AUDIENCE_SCOPES = [
  'organisation',
  'area',
  'property',
  'building',
  'entrance',
  'unit',
  'tenancy',
] as const;
export type AudienceScope = (typeof AUDIENCE_SCOPES)[number];

export const NOTIFICATION_CHANNELS = ['inapp', 'push', 'email', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const DELIVERY_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Notiskategorier som användaren kan styra själv (krav B.1.7). */
export const NOTIFICATION_TOPICS = [
  'case_updates',
  'case_messages',
  'bookings',
  'invoices',
  'news',
  'surveys',
  'moving',
  'operational_info',
  'safety_critical',
] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

/**
 * Kritisk drift- och säkerhetsinformation hanteras separat och kan inte stängas av
 * i appen (avsnitt 19 i kravbilden).
 */
export const MANDATORY_TOPICS: readonly NotificationTopic[] = ['safety_critical'];

export const DOCUMENT_KINDS = [
  'lease',
  'invoice',
  'inspection_protocol',
  'house_rules',
  'consent',
  'permit',
  'floor_plan',
  'signature_request',
  'other',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const INVOICE_STATUSES = ['open', 'paid', 'overdue', 'credited', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const MOVE_FLOW_KINDS = ['move_in', 'move_out'] as const;
export type MoveFlowKind = (typeof MOVE_FLOW_KINDS)[number];

export const MOVE_STEP_STATUSES = ['pending', 'in_progress', 'done', 'not_applicable'] as const;
export type MoveStepStatus = (typeof MOVE_STEP_STATUSES)[number];

export const WORK_ORDER_STATUSES = [
  'offered',
  'accepted',
  'declined',
  'scheduled',
  'on_site',
  'blocked',
  'completed',
  'cancelled',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

/**
 * Integrationsstatus. En integration får bara visas som `connected` när det finns
 * en verklig konfigurerad anslutning – aldrig enbart för att gränssnittet finns
 * (avsnitt 21 i kravbilden).
 */
export const INTEGRATION_STATUSES = [
  'connected',
  'requires_configuration',
  'sandbox',
  'disconnected',
  'planned',
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const INTEGRATION_KINDS = [
  'property_system',
  'finance',
  'rent_invoicing',
  'payments',
  'e_signing',
  'access_control',
  'digital_locks',
  'booking',
  'email',
  'sms',
  'push',
  'maps',
  'customer_service',
  'contractor_system',
  'identity',
  'bankid',
  'calendar',
  'metering',
  'sso',
] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const LOCALES = ['sv', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'sv';

export const ACCESS_POINT_KINDS = [
  'entrance_door',
  'apartment',
  'laundry',
  'garage',
  'bike_room',
  'storage',
  'common_room',
  'other',
] as const;
export type AccessPointKind = (typeof ACCESS_POINT_KINDS)[number];

export const SURVEY_STATUSES = ['draft', 'open', 'closed'] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const SURVEY_KINDS = [
  'resident_survey',
  'case_followup',
  'area_study',
  'renovation_input',
  'option_vote',
] as const;
export type SurveyKind = (typeof SURVEY_KINDS)[number];
