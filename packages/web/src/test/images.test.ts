import { describe, expect, it } from 'vitest';
import { describeSaving, downscaleImage, type PreparedFile } from '../lib/images.js';

/**
 * jsdom har ingen canvas-implementation, så själva omkodningen kan inte köras
 * här. Testerna kontrollerar det som ändå är avgörande: att filer som inte ska
 * röras lämnas ifred, och att en bild som inte går att avkoda laddas upp som den
 * är i stället för att tappas bort.
 */
describe('Nedskalning av bilder', () => {
  const makeFile = (name: string, type: string, bytes: number): File =>
    new File([new Uint8Array(bytes)], name, { type });

  it('lämnar små bilder orörda', async () => {
    const file = makeFile('liten.jpg', 'image/jpeg', 50 * 1024);
    const result = await downscaleImage(file);
    expect(result.resized).toBe(false);
    expect(result.file).toBe(file);
  });

  it('rör inte filer som inte är bilder', async () => {
    const file = makeFile('avtal.pdf', 'application/pdf', 5 * 1024 * 1024);
    const result = await downscaleImage(file);
    expect(result.resized).toBe(false);
    expect(result.file).toBe(file);
  });

  it('laddar upp originalet när bilden inte går att avkoda', async () => {
    // Innehållet är inte en giltig bild; avkodningen misslyckas.
    const file = makeFile('trasig.jpg', 'image/jpeg', 2 * 1024 * 1024);
    const result = await downscaleImage(file);
    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
  });

  it('sammanfattar besparingen bara när något faktiskt skalades ned', () => {
    const untouched: PreparedFile[] = [
      { file: makeFile('a.jpg', 'image/jpeg', 1000), originalBytes: 1000, resized: false },
    ];
    expect(describeSaving(untouched)).toBeNull();

    const resized: PreparedFile[] = [
      { file: makeFile('b.jpg', 'image/jpeg', 250), originalBytes: 1000, resized: true },
    ];
    expect(describeSaving(resized)).toBe('Bilden skalades ned med 75 % innan uppladdning.');

    const many: PreparedFile[] = [
      { file: makeFile('b.jpg', 'image/jpeg', 250), originalBytes: 1000, resized: true },
      { file: makeFile('c.jpg', 'image/jpeg', 250), originalBytes: 1000, resized: true },
    ];
    expect(describeSaving(many)).toBe('Bilderna skalades ned med 75 % innan uppladdning.');
  });
});
