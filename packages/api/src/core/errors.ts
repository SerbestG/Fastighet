/**
 * Felhantering.
 *
 * Alla fel som når klienten har en stabil kod, ett begripligt meddelande på
 * svenska och ett spårnings-ID som går att söka på i loggarna (avsnitt 26 i
 * kravbilden). Tekniska detaljer lämnar aldrig servern.
 */

export type ErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'mfa_required'
  | 'mfa_setup_required'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'integration_unavailable'
  | 'internal_error';

const STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthorized: 401,
  mfa_required: 401,
  mfa_setup_required: 403,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
  unsupported_media_type: 415,
  integration_unavailable: 503,
  internal_error: 500,
};

const MESSAGES: Record<ErrorCode, string> = {
  validation_error: 'Kontrollera de markerade fälten.',
  unauthorized: 'Du behöver logga in.',
  mfa_required: 'Ange engångskoden från din autentiseringsapp.',
  mfa_setup_required: 'Kontot måste ha tvåfaktorsautentisering aktiverad.',
  forbidden: 'Du saknar behörighet till den här informationen.',
  not_found: 'Informationen hittades inte.',
  conflict: 'Åtgärden kunde inte genomföras eftersom informationen har ändrats.',
  rate_limited: 'För många försök. Vänta en stund och försök igen.',
  payload_too_large: 'Filen är för stor.',
  unsupported_media_type: 'Filtypen stöds inte.',
  integration_unavailable: 'Den bakomliggande tjänsten är inte tillgänglig just nu.',
  internal_error: 'Ett tekniskt fel uppstod.',
};

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly issues?: FieldIssue[];
  /** Detaljer som bara loggas, aldrig skickas till klienten. */
  readonly internal?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: { issues?: FieldIssue[]; internal?: Record<string, unknown> },
  ) {
    super(message ?? MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.issues = options?.issues;
    this.internal = options?.internal;
  }
}

export const badRequest = (message?: string, issues?: FieldIssue[]) =>
  new AppError('validation_error', message, { issues });
export const unauthorized = (message?: string) => new AppError('unauthorized', message);
export const forbidden = (message?: string, internal?: Record<string, unknown>) =>
  new AppError('forbidden', message, { internal });
export const notFound = (message?: string) => new AppError('not_found', message);
export const conflict = (message?: string) => new AppError('conflict', message);
