import { describe, expect, it } from 'vitest';
import { inspectPdf, stripMetadata } from '../src/core/media.js';

/**
 * Rensning av metadata och kontroll av aktivt innehåll (krav C.5.6).
 *
 * Bilderna byggs upp byte för byte i testet, så att det som prövas är den
 * verkliga hanteringen av filformatet och inte ett bibliotek.
 */

/** JPEG med ett APP1-segment som bär EXIF med en position. */
function jpegWithExif(): Buffer {
  const exifPayload = Buffer.from('Exif\0\0GPSLatitude 59.3 GPSLongitude 18.0', 'latin1');
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    (() => {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(exifPayload.length + 2);
      return length;
    })(),
    exifPayload,
  ]);
  const jfif = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const scan = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xaa, 0xbb, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, app1, scan]);
}

/** PNG med ett tEXt-block. */
function pngWithText(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    return Buffer.concat([length, Buffer.from(type, 'ascii'), data, crc]);
  };
  return Buffer.concat([
    signature,
    chunk('IHDR', Buffer.alloc(13)),
    chunk('tEXt', Buffer.from('Author\0Kameran', 'latin1')),
    chunk('IDAT', Buffer.from([1, 2, 3])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('Rensning av metadata', () => {
  it('tar bort EXIF ur en JPEG men behåller bilddata', () => {
    const original = jpegWithExif();
    expect(original.toString('latin1')).toContain('GPSLatitude');

    const result = stripMetadata(original, 'image/jpeg');
    expect(result.buffer.toString('latin1')).not.toContain('GPSLatitude');
    expect(result.removed).toContain('APP1');
    // Filen är fortfarande en JPEG och slutar med rätt markör.
    expect(result.buffer.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(result.buffer.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    // Bilddata efter start of scan finns kvar.
    expect(result.buffer.toString('latin1')).toContain('\xaa\xbb');
  });

  it('tar bort textblock ur en PNG men behåller bilddata', () => {
    const original = pngWithText();
    expect(original.toString('latin1')).toContain('Kameran');

    const result = stripMetadata(original, 'image/png');
    expect(result.buffer.toString('latin1')).not.toContain('Kameran');
    expect(result.removed).toContain('tEXt');
    expect(result.buffer.subarray(0, 8)).toEqual(original.subarray(0, 8));
    expect(result.buffer.toString('latin1')).toContain('IDAT');
    expect(result.buffer.toString('latin1')).toContain('IEND');
  });

  it('lämnar filtyper utan metadatablock orörda', () => {
    const pdf = Buffer.from('%PDF-1.7\nnågot innehåll\n');
    const result = stripMetadata(pdf, 'application/pdf');
    expect(result.buffer.equals(pdf)).toBe(true);
    expect(result.removed).toEqual([]);
  });
});

describe('Kontroll av PDF', () => {
  it('hittar skript som körs när filen öppnas', () => {
    const pdf = Buffer.from('%PDF-1.7\n/OpenAction << /S /JavaScript /JS (app.alert(1)) >>');
    const findings = inspectPdf(pdf);
    expect(findings.map((f) => f.keyword)).toContain('/JavaScript');
    expect(findings.map((f) => f.keyword)).toContain('/OpenAction');
  });

  it('hittar inbäddade filer och programstart', () => {
    expect(inspectPdf(Buffer.from('%PDF-1.7 /Launch')).length).toBeGreaterThan(0);
    expect(inspectPdf(Buffer.from('%PDF-1.7 /EmbeddedFile')).length).toBeGreaterThan(0);
  });

  it('godkänner en vanlig PDF', () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF');
    expect(inspectPdf(pdf)).toEqual([]);
  });
});
