import { z } from 'zod';
import {
  ACCESS_POINT_KINDS,
  AUDIENCE_SCOPES,
  BOOKING_STATUSES,
  CASE_KINDS,
  CASE_LOCATION_KINDS,
  CASE_PRIORITIES,
  CASE_STATUSES,
  DOCUMENT_KINDS,
  INTEGRATION_STATUSES,
  INVOICE_STATUSES,
  LOCALES,
  MOVE_FLOW_KINDS,
  MOVE_STEP_STATUSES,
  NOTICE_KINDS,
  NOTICE_SEVERITIES,
  NOTICE_STATUSES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
  RESOURCE_KINDS,
  SURVEY_KINDS,
  WORK_ORDER_STATUSES,
} from './domain.js';
import { ROLES } from './roles.js';

export const uuid = z.string().uuid();
const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

/* ---------------------------------------------------------------- auth --- */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
  orgSlug: z.string().trim().min(1).max(64).optional(),
  totp: z.string().trim().regex(/^\d{6}$/).optional(),
});

export const registerSchema = z.object({
  orgSlug: z.string().trim().min(1).max(64),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(200),
  firstName: trimmed(80),
  lastName: trimmed(80),
  phone: z.string().trim().max(32).optional(),
  /** Engångskod som kopplar kontot till rätt hyresobjekt. */
  invitationCode: z.string().trim().min(6).max(64),
  locale: z.enum(LOCALES).default('sv'),
});

export const verifyEmailSchema = z.object({ token: z.string().trim().min(10).max(200) });

export const refreshSchema = z.object({ refreshToken: z.string().trim().min(10).max(500) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

export const enrollMfaSchema = z.object({ totp: z.string().trim().regex(/^\d{6}$/) });

/* ------------------------------------------------------------ profile --- */

export const updateProfileSchema = z.object({
  firstName: trimmed(80).optional(),
  lastName: trimmed(80).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  locale: z.enum(LOCALES).optional(),
});

export const notificationPreferenceSchema = z.object({
  topic: z.enum(NOTIFICATION_TOPICS),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).max(4),
});

export const updateNotificationPreferencesSchema = z.object({
  preferences: z.array(notificationPreferenceSchema).max(20),
});

export const registerPushTokenSchema = z.object({
  token: trimmed(400),
  platform: z.enum(['ios', 'android', 'web']),
});

/* --------------------------------------------------------------- case --- */

export const triageAnswersSchema = z.record(z.string().max(64), z.string().max(2000));

export const createCaseSchema = z.object({
  kind: z.enum(CASE_KINDS).default('fault_report'),
  locationKind: z.enum(CASE_LOCATION_KINDS),
  /** Krävs för `contract_object`; för bostad används hyresgästens aktiva avtal. */
  tenancyId: uuid.optional(),
  buildingId: uuid.optional(),
  space: z.string().trim().max(64).optional(),
  categoryKey: trimmed(64),
  subcategoryKey: trimmed(64),
  title: trimmed(160).optional(),
  description: z.string().trim().min(3).max(4000),
  triageAnswers: triageAnswersSchema.default({}),
  /** Tillträde med huvudnyckel/nyckel i tub (krav B.1.30). */
  allowMasterKeyAccess: z.boolean().default(false),
  hasPets: z.boolean().default(false),
  petNotes: z.string().trim().max(280).optional(),
  accessWindows: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(14)
    .default([]),
  contactPhone: z.string().trim().max(32).optional(),
  attachmentIds: z.array(uuid).max(10).default([]),
});

export const caseListQuerySchema = paginationSchema.extend({
  status: z.union([z.enum(CASE_STATUSES), z.array(z.enum(CASE_STATUSES))]).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  kind: z.enum(CASE_KINDS).optional(),
  categoryKey: z.string().trim().max(64).optional(),
  propertyId: uuid.optional(),
  buildingId: uuid.optional(),
  areaId: uuid.optional(),
  assigneeId: uuid.optional(),
  unassigned: z.coerce.boolean().optional(),
  overdue: z.coerce.boolean().optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['created_desc', 'created_asc', 'priority', 'due']).default('created_desc'),
});

export const updateCaseSchema = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  assigneeId: uuid.nullable().optional(),
  teamId: uuid.nullable().optional(),
  categoryKey: z.string().trim().max(64).optional(),
  subcategoryKey: z.string().trim().max(64).optional(),
  title: trimmed(160).optional(),
  costEstimateOre: z.number().int().min(0).max(1_000_000_00).nullable().optional(),
  costActualOre: z.number().int().min(0).max(1_000_000_00).nullable().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const caseCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  /** Interna kommentarer visas aldrig för hyresgästen. */
  internal: z.boolean().default(false),
  attachmentIds: z.array(uuid).max(10).default([]),
});

export const mergeCasesSchema = z.object({
  sourceCaseIds: z.array(uuid).min(1).max(50),
  reason: z.string().trim().max(500).optional(),
});

export const linkCasesSchema = z.object({
  relatedCaseIds: z.array(uuid).min(1).max(50),
});

export const caseFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
  resolved: z.boolean(),
});

/* ---------------------------------------------------------- work order --- */

export const createWorkOrderSchema = z.object({
  caseId: uuid,
  contractorOrgId: uuid.optional(),
  assigneeId: uuid.optional(),
  title: trimmed(160),
  instructions: z.string().trim().max(4000).optional(),
  plannedStart: z.string().datetime().optional(),
  plannedEnd: z.string().datetime().optional(),
});

export const updateWorkOrderSchema = z.object({
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  notes: z.string().trim().max(4000).optional(),
  blockerReason: z.string().trim().max(1000).optional(),
  materials: z
    .array(
      z.object({
        description: trimmed(200),
        quantity: z.number().min(0).max(100000),
        unit: z.string().trim().max(20).default('st'),
        unitCostOre: z.number().int().min(0).max(10_000_00).optional(),
      }),
    )
    .max(50)
    .optional(),
  minutesSpent: z.number().int().min(0).max(10000).optional(),
  attachmentIds: z.array(uuid).max(20).optional(),
});

/* ------------------------------------------------------------ booking --- */

export const createResourceSchema = z.object({
  kind: z.enum(RESOURCE_KINDS),
  name: trimmed(120),
  description: z.string().trim().max(2000).optional(),
  scope: z.enum(AUDIENCE_SCOPES),
  scopeId: uuid.nullable().optional(),
  slotMinutes: z.number().int().min(15).max(1440).default(180),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/).default('22:00'),
  maxActivePerTenancy: z.number().int().min(1).max(20).default(2),
  maxDaysAhead: z.number().int().min(1).max(365).default(30),
  cancellationHours: z.number().int().min(0).max(720).default(2),
  priceOre: z.number().int().min(0).max(1_000_000).default(0),
  depositOre: z.number().int().min(0).max(1_000_000).default(0),
  requiresApproval: z.boolean().default(false),
  waitlistEnabled: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const bookingSlotQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createBookingSchema = z.object({
  resourceId: uuid,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  note: z.string().trim().max(500).optional(),
  joinWaitlist: z.boolean().default(false),
});

export const blockResourceSchema = z.object({
  resourceId: uuid,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: trimmed(200),
});

/* ------------------------------------------------------------- notice --- */

export const audienceSchema = z
  .array(
    z.object({
      scope: z.enum(AUDIENCE_SCOPES),
      scopeId: uuid.nullable().optional(),
    }),
  )
  .min(1)
  .max(200);

export const createNoticeSchema = z.object({
  kind: z.enum(NOTICE_KINDS),
  severity: z.enum(NOTICE_SEVERITIES).default('info'),
  title: trimmed(200),
  bodyHtml: z.string().trim().min(1).max(50_000),
  summary: z.string().trim().max(400).optional(),
  imageFileId: uuid.nullable().optional(),
  audience: audienceSchema,
  startsAt: z.string().datetime().optional(),
  expectedEndAt: z.string().datetime().nullable().optional(),
  nextUpdateAt: z.string().datetime().nullable().optional(),
  publishAt: z.string().datetime().nullable().optional(),
  unpublishAt: z.string().datetime().nullable().optional(),
  pinnedUntil: z.string().datetime().nullable().optional(),
  contactInfo: z.string().trim().max(500).optional(),
  requiresAcknowledgement: z.boolean().default(false),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).max(4).default(['inapp']),
  translations: z
    .record(z.enum(LOCALES), z.object({ title: trimmed(200), bodyHtml: z.string().trim().max(50_000) }))
    .optional(),
});

export const updateNoticeSchema = createNoticeSchema.partial().extend({
  status: z.enum(NOTICE_STATUSES).optional(),
});

/* ------------------------------------------------------------ message --- */

export const createThreadSchema = z.object({
  subject: trimmed(200),
  body: z.string().trim().min(1).max(8000),
  tenancyId: uuid.optional(),
  recipientUserId: uuid.optional(),
  attachmentIds: z.array(uuid).max(10).default([]),
});

export const replyThreadSchema = z.object({
  body: z.string().trim().min(1).max(8000),
  internal: z.boolean().default(false),
  attachmentIds: z.array(uuid).max(10).default([]),
});

export const broadcastSchema = z.object({
  subject: trimmed(200),
  body: z.string().trim().min(1).max(8000),
  audience: audienceSchema,
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).max(4),
  scheduledAt: z.string().datetime().nullable().optional(),
  requiresAcknowledgement: z.boolean().default(false),
});

/* --------------------------------------------------------- properties --- */

export const createAreaSchema = z.object({
  name: trimmed(120),
  code: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2000).optional(),
});

export const createPropertySchema = z.object({
  areaId: uuid,
  name: trimmed(120),
  designation: z.string().trim().max(80).optional(),
  street: trimmed(160),
  postalCode: z.string().trim().max(12).optional(),
  city: trimmed(80),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export const createBuildingSchema = z.object({
  propertyId: uuid,
  name: trimmed(120),
  street: trimmed(160),
  constructionYear: z.number().int().min(1600).max(2200).nullable().optional(),
  floors: z.number().int().min(1).max(80).nullable().optional(),
  hasElevator: z.boolean().default(false),
});

export const createEntranceSchema = z.object({
  buildingId: uuid,
  name: trimmed(80),
  street: trimmed(160),
});

export const createUnitSchema = z.object({
  entranceId: uuid,
  objectNumber: trimmed(40),
  label: trimmed(40),
  floor: z.number().int().min(-5).max(80).nullable().optional(),
  rooms: z.number().min(0).max(30).nullable().optional(),
  areaSqm: z.number().min(0).max(2000).nullable().optional(),
  kind: z.enum(['apartment', 'parking', 'storage', 'commercial', 'other']).default('apartment'),
});

/* ----------------------------------------------------------- tenancy --- */

export const createTenancySchema = z.object({
  unitId: uuid,
  externalRef: z.string().trim().max(64).optional(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  earliestMoveOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyRentOre: z.number().int().min(0).max(100_000_00).nullable().optional(),
});

export const inviteResidentSchema = z.object({
  tenancyId: uuid,
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: trimmed(80),
  lastName: trimmed(80),
  role: z.enum(['tenant', 'co_resident']).default('tenant'),
});

/* ---------------------------------------------------------- documents --- */

export const createDocumentSchema = z.object({
  fileId: uuid,
  kind: z.enum(DOCUMENT_KINDS),
  title: trimmed(200),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tenancyId: uuid.nullable().optional(),
  unitId: uuid.nullable().optional(),
  propertyId: uuid.nullable().optional(),
  visibleToResident: z.boolean().default(true),
  requiresSignature: z.boolean().default(false),
});

/* ----------------------------------------------------------- invoices --- */

export const createInvoiceSchema = z.object({
  tenancyId: uuid,
  invoiceNumber: trimmed(40),
  ocr: z.string().trim().max(40).optional(),
  bankgiro: z.string().trim().max(20).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountOre: z.number().int(),
  status: z.enum(INVOICE_STATUSES).default('open'),
  fileId: uuid.nullable().optional(),
});

/* ------------------------------------------------------------- moving --- */

export const startMoveFlowSchema = z.object({
  tenancyId: uuid,
  kind: z.enum(MOVE_FLOW_KINDS),
  moveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const updateMoveStepSchema = z.object({
  status: z.enum(MOVE_STEP_STATUSES),
  data: z.record(z.string().max(64), z.unknown()).optional(),
  note: z.string().trim().max(2000).optional(),
});

export const terminateTenancySchema = z.object({
  tenancyId: uuid,
  requestedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newAddress: z.string().trim().max(300).optional(),
  reason: z.string().trim().max(500).optional(),
  confirm: z.literal(true),
});

/* ------------------------------------------------------------- access --- */

export const createAccessPointSchema = z.object({
  kind: z.enum(ACCESS_POINT_KINDS),
  name: trimmed(120),
  scope: z.enum(AUDIENCE_SCOPES),
  scopeId: uuid.nullable().optional(),
  integrationId: uuid.nullable().optional(),
});

export const grantAccessSchema = z.object({
  accessPointId: uuid,
  userId: uuid,
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().nullable().optional(),
  reason: z.string().trim().max(300).optional(),
});

/* ------------------------------------------------------------ surveys --- */

export const createSurveySchema = z.object({
  kind: z.enum(SURVEY_KINDS),
  title: trimmed(200),
  description: z.string().trim().max(4000).optional(),
  audience: audienceSchema,
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  anonymous: z.boolean().default(true),
  questions: z
    .array(
      z.object({
        key: trimmed(64),
        label: trimmed(400),
        type: z.enum(['rating', 'single_choice', 'multi_choice', 'text', 'boolean']),
        required: z.boolean().default(false),
        options: z.array(z.object({ value: trimmed(64), label: trimmed(200) })).max(20).optional(),
      }),
    )
    .min(1)
    .max(40),
});

export const submitSurveyResponseSchema = z.object({
  answers: z.record(z.string().max(64), z.union([z.string().max(4000), z.number(), z.boolean(), z.array(z.string().max(200))])),
});

/* ------------------------------------------------------------- admin --- */

export const createStaffUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: trimmed(80),
  lastName: trimmed(80),
  phone: z.string().trim().max(32).optional(),
  roles: z.array(z.enum(ROLES)).min(1).max(6),
  areaIds: z.array(uuid).max(100).default([]),
  propertyIds: z.array(uuid).max(500).default([]),
});

export const updateStaffUserSchema = z.object({
  firstName: trimmed(80).optional(),
  lastName: trimmed(80).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  roles: z.array(z.enum(ROLES)).min(1).max(6).optional(),
  areaIds: z.array(uuid).max(100).optional(),
  propertyIds: z.array(uuid).max(500).optional(),
  active: z.boolean().optional(),
});

export const updateOrgSettingsSchema = z.object({
  displayName: trimmed(120).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoFileId: uuid.nullable().optional(),
  supportEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  supportPhone: z.string().trim().max(32).optional(),
  emergencyPhone: z.string().trim().max(32).optional(),
  disturbancePhone: z.string().trim().max(32).optional(),
  websiteUrl: z.string().trim().url().max(300).optional(),
  defaultLocale: z.enum(LOCALES).optional(),
  /** Egna begrepp gentemot kund, t.ex. felanmälan/serviceanmälan (krav A.2.11). */
  terminology: z.record(z.string().max(64), z.string().max(80)).optional(),
  /** Vilka moduler kunden ska se i appen (krav B.1.11). */
  enabledFeatures: z.array(z.string().max(64)).max(60).optional(),
});

export const updateIntegrationSchema = z.object({
  status: z.enum(INTEGRATION_STATUSES),
  baseUrl: z.string().trim().url().max(300).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  config: z.record(z.string().max(64), z.string().max(500)).optional(),
});

/* --------------------------------------------------------------- gdpr --- */

export const gdprRequestSchema = z.object({
  userId: uuid,
  kind: z.enum(['export', 'rectification', 'erasure', 'anonymisation']),
  reason: z.string().trim().max(1000).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
