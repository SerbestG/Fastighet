/**
 * Rensning av metadata och djupare innehållskontroll (krav C.5.6).
 *
 * En bild från en telefon bär ofta position, enhetsmodell och tidpunkt. Det
 * behövs inte för en felanmälan och ska inte följa med in i systemet. Därför
 * plockas metadatablocken bort innan filen sparas.
 *
 * PDF-filer granskas dessutom på innehåll: en PDF som startar program eller
 * kör skript vid öppning avvisas.
 */

export interface CleanResult {
  buffer: Buffer;
  /** Vilka block som togs bort, för loggning och för att kunna berätta det. */
  removed: string[];
}

/* ------------------------------------------------------------------ JPEG --- */

/**
 * Behåller bildens data men tar bort alla APPn-segment utom APP0 (JFIF), som
 * bär bildens egna grundegenskaper. Där ligger EXIF, GPS, XMP och IPTC.
 */
function cleanJpeg(buffer: Buffer): CleanResult {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { buffer, removed: [] };
  }

  const out: Buffer[] = [buffer.subarray(0, 2)];
  const removed: string[] = [];
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1]!;

    // Start of scan: resten är bilddata och kopieras oförändrad.
    if (marker === 0xda) {
      out.push(buffer.subarray(offset));
      offset = buffer.length;
      break;
    }
    // Markörer utan längdfält.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    const segment = buffer.subarray(offset, offset + 2 + length);

    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if ((isApp && marker !== 0xe0) || isComment) {
      removed.push(isComment ? 'kommentar' : `APP${marker - 0xe0}`);
    } else {
      out.push(segment);
    }
    offset += 2 + length;
  }

  if (offset < buffer.length) out.push(buffer.subarray(offset));
  return { buffer: Buffer.concat(out), removed: [...new Set(removed)] };
}

/* ------------------------------------------------------------------- PNG --- */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Tar bort textblock och EXIF ur en PNG, men rör inte bilddata. */
function cleanPng(buffer: Buffer): CleanResult {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return { buffer, removed: [] };

  const drop = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
  const out: Buffer[] = [buffer.subarray(0, 8)];
  const removed: string[] = [];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (length > buffer.length || end > buffer.length) break;

    if (drop.has(type)) removed.push(type);
    else out.push(buffer.subarray(offset, end));

    offset = end;
    if (type === 'IEND') break;
  }

  return { buffer: Buffer.concat(out), removed: [...new Set(removed)] };
}

/* ------------------------------------------------------------------ WebP --- */

/** Tar bort EXIF- och XMP-block ur en WebP i RIFF-behållare. */
function cleanWebp(buffer: Buffer): CleanResult {
  if (
    buffer.length < 12 ||
    buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return { buffer, removed: [] };
  }

  const drop = new Set(['EXIF', 'XMP ']);
  const chunks: Buffer[] = [];
  const removed: string[] = [];
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    // RIFF-block fylls ut till jämnt antal byte.
    const padded = size + (size % 2);
    const end = offset + 8 + padded;
    if (end > buffer.length) break;

    if (drop.has(type)) removed.push(type.trim());
    else chunks.push(buffer.subarray(offset, end));

    offset = end;
  }

  if (!removed.length) return { buffer, removed: [] };

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'ascii');
  return { buffer: Buffer.concat([header, body]), removed: [...new Set(removed)] };
}

/* -------------------------------------------------------------------- PDF --- */

/** Nyckelord som gör att en PDF kör något när den öppnas. */
const PDF_ACTIVE_CONTENT = [
  '/JavaScript',
  '/JS',
  '/OpenAction',
  '/AA',
  '/Launch',
  '/EmbeddedFile',
  '/RichMedia',
];

export interface PdfFinding {
  keyword: string;
}

/**
 * Letar efter aktivt innehåll i en PDF. Sökningen görs på råa byte, så att
 * innehållet hittas även om det ligger i en ström som inte tolkas här.
 */
export function inspectPdf(buffer: Buffer): PdfFinding[] {
  const text = buffer.toString('latin1');
  return PDF_ACTIVE_CONTENT.filter((keyword) => text.includes(keyword)).map((keyword) => ({
    keyword,
  }));
}

/* ----------------------------------------------------------------- entré --- */

/**
 * Rensar metadata utifrån filtyp. Okända typer lämnas orörda; kontrollen av att
 * innehållet stämmer med typen har redan skett innan den här funktionen körs.
 */
export function stripMetadata(buffer: Buffer, mimeType: string): CleanResult {
  switch (mimeType) {
    case 'image/jpeg':
      return cleanJpeg(buffer);
    case 'image/png':
      return cleanPng(buffer);
    case 'image/webp':
      return cleanWebp(buffer);
    default:
      return { buffer, removed: [] };
  }
}
