import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type pg from 'pg';
import { config } from '../config.js';
import { AppError } from './errors.js';
import { inspectPdf, stripMetadata } from './media.js';
import { scanUpload } from './scanning.js';

/**
 * Filhantering.
 *
 * Uppladdat innehåll kontrolleras mot både angiven filtyp och filens verkliga
 * inledande byte innan det sparas. Filer lagras utanför webbroten under en
 * slumpad nyckel per organisation, och kan bara hämtas via ett API-anrop som
 * kontrollerar behörighet (krav C.5.6).
 */

interface Signature {
  mime: string;
  test: (buffer: Buffer) => boolean;
}

const startsWith = (bytes: number[]) => (buffer: Buffer) =>
  bytes.every((byte, index) => buffer[index] === byte);

const SIGNATURES: Signature[] = [
  { mime: 'image/jpeg', test: startsWith([0xff, 0xd8, 0xff]) },
  { mime: 'image/png', test: startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  {
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'application/pdf', test: startsWith([0x25, 0x50, 0x44, 0x46]) },
  { mime: 'video/mp4', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
  { mime: 'video/quicktime', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
  {
    mime: 'image/heic',
    test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' && b.subarray(8, 12).toString('ascii').startsWith('hei'),
  },
];

/** Mönster som aldrig får förekomma i början av en fil som påstår sig vara en bild. */
const SCRIPT_MARKERS = [/^\s*<\?php/i, /^\s*<script/i, /^\s*<!doctype html/i, /^\s*<html/i, /^#!/];

export interface StoredFile {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  /** `pending` betyder att filen ligger i karantän i väntan på granskning. */
  scanStatus: 'clean' | 'pending';
}

function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'fil';
  return base.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'fil';
}

/** Gränser som gäller för en viss organisation, med plattformens som tak. */
export interface UploadLimits {
  maxFileBytes: number;
  allowedMimeTypes: string[];
}

/**
 * Beställarens egna gränser, begränsade av plattformens. En organisation kan
 * alltså strama åt men aldrig vidga utöver det plattformen tillåter.
 */
export async function uploadLimits(client: pg.PoolClient): Promise<UploadLimits> {
  const result = await client.query<{
    upload_allowed_mime_types: string[];
    upload_max_file_bytes: number | null;
  }>('select upload_allowed_mime_types, upload_max_file_bytes from organisations limit 1');
  const row = result.rows[0];

  const allowed = row?.upload_allowed_mime_types?.length
    ? row.upload_allowed_mime_types.filter((type) => config.storage.allowedMimeTypes.includes(type))
    : config.storage.allowedMimeTypes;

  return {
    maxFileBytes: Math.min(row?.upload_max_file_bytes ?? config.storage.maxFileBytes, config.storage.maxFileBytes),
    allowedMimeTypes: allowed,
  };
}

/** Kontrollerar storlek, tillåten typ och att innehållet matchar den angivna typen. */
export function inspect(
  buffer: Buffer,
  declaredMime: string,
  originalName: string,
  limits: UploadLimits = {
    maxFileBytes: config.storage.maxFileBytes,
    allowedMimeTypes: config.storage.allowedMimeTypes,
  },
): string {
  if (buffer.length === 0) {
    throw new AppError('validation_error', 'Filen är tom.');
  }
  if (buffer.length > limits.maxFileBytes) {
    throw new AppError('payload_too_large');
  }
  const normalised = declaredMime.split(';')[0]!.trim().toLowerCase();
  if (!limits.allowedMimeTypes.includes(normalised)) {
    throw new AppError('unsupported_media_type', `Filtypen ${normalised} är inte tillåten.`);
  }

  const head = buffer.subarray(0, 64).toString('latin1');
  if (SCRIPT_MARKERS.some((pattern) => pattern.test(head))) {
    throw new AppError('unsupported_media_type', 'Filens innehåll ser inte ut att vara en bild eller ett dokument.');
  }

  const matches = SIGNATURES.filter((signature) => signature.test(buffer));
  if (matches.length === 0) {
    throw new AppError(
      'unsupported_media_type',
      `Innehållet i ${safeName(originalName)} stämmer inte med en filtyp som stöds.`,
    );
  }
  if (!matches.some((m) => m.mime === normalised)) {
    throw new AppError(
      'unsupported_media_type',
      'Filändelsen och filens innehåll stämmer inte överens.',
    );
  }
  return normalised;
}

export async function storeFile(
  client: pg.PoolClient,
  params: {
    orgId: string;
    uploadedBy: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  },
): Promise<StoredFile> {
  const limits = await uploadLimits(client);
  const mimeType = inspect(params.buffer, params.mimeType, params.originalName, limits);

  // En PDF som startar program eller kör skript vid öppning avvisas (krav C.5.6).
  if (mimeType === 'application/pdf') {
    const findings = inspectPdf(params.buffer);
    if (findings.length) {
      throw new AppError('unsupported_media_type', 'PDF-filen innehåller aktivt innehåll och kan inte tas emot.', {
        internal: { keywords: findings.map((f) => f.keyword) },
      });
    }
  }

  // Metadata som position och enhetsmodell behövs inte för en felanmälan och
  // följer inte med in i systemet.
  const cleaned = stripMetadata(params.buffer, mimeType);
  const buffer = cleaned.buffer;

  // Granskning hos en konfigurerad skanningstjänst. En fil som inte kunnat
  // granskas sparas i karantän och går inte att hämta.
  const scan = await scanUpload(buffer, params.originalName);
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const storageKey = `${params.orgId}/${new Date().getFullYear()}/${randomUUID()}`;

  const absolute = resolveStoragePath(storageKey);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer, { mode: 0o600 });

  const result = await client.query<{ id: string }>(
    `insert into files (org_id, storage_key, original_name, mime_type, size_bytes, checksum_sha256,
                        scan_status, scan_detail, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      params.orgId,
      storageKey,
      safeName(params.originalName),
      mimeType,
      buffer.length,
      checksum,
      scan.scanStatus,
      // Vad som rensades bort redovisas i filens granskningsanteckning.
      cleaned.removed.length ? `${scan.detail}; rensade ${cleaned.removed.join(', ')}` : scan.detail,
      params.uploadedBy,
    ],
  );

  return {
    id: result.rows[0]!.id,
    storageKey,
    originalName: safeName(params.originalName),
    mimeType,
    sizeBytes: buffer.length,
    checksum,
    scanStatus: scan.scanStatus,
  };
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return readFile(resolveStoragePath(storageKey));
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  try {
    await unlink(resolveStoragePath(storageKey));
  } catch {
    // Filen kan redan vara borttagen; gallringen ska ändå gå vidare.
  }
}

/**
 * Bygger en absolut sökväg och kontrollerar att den ligger kvar under lagringsroten,
 * så att en manipulerad nyckel inte kan peka ut något annat på disken.
 */
function resolveStoragePath(storageKey: string): string {
  const root = config.storage.localRoot;
  const absolute = resolve(join(root, storageKey));
  if (absolute !== root && !absolute.startsWith(root + '/')) {
    throw new AppError('forbidden', 'Ogiltig filreferens.');
  }
  return absolute;
}
