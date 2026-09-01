/**
 * Nedskalning av bilder före uppladdning (krav B.1.32).
 *
 * En bild från en modern mobilkamera är ofta 4–12 MB. För en felanmälan behövs
 * inte mer än att man tydligt ser felet. Nedskalningen sker i klienten, innan
 * filen lämnar telefonen, vilket sparar hyresgästens mobildata och gör
 * uppladdningen snabbare på en svag uppkoppling.
 *
 * Original­filen laddas upp oförändrad om nedskalningen inte går att genomföra –
 * en bild som inte kan avkodas i webbläsaren (exempelvis HEIC i vissa
 * webbläsare) ska hellre skickas som den är än inte alls.
 */

/** Längsta sidan efter nedskalning. Räcker gott för att dokumentera ett fel. */
const MAX_DIMENSION = 2048;

/** Bilder under den här storleken lämnas orörda. */
const SKIP_BELOW_BYTES = 400 * 1024;

const JPEG_QUALITY = 0.82;

export interface PreparedFile {
  file: File;
  /** Ursprunglig storlek, för att kunna visa vad nedskalningen gav. */
  originalBytes: number;
  resized: boolean;
}

function isResizableImage(file: File): boolean {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Faller vidare till img-elementet nedan.
    }
  }
  // Allt som kan fela här ska leda till att originalfilen används, aldrig till
  // att uppladdningen avbryts. Äldre webbläsare och inbäddade vyer saknar ibland
  // både createImageBitmap och createObjectURL.
  try {
    if (typeof URL.createObjectURL !== 'function') return null;
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      const done = (result: HTMLImageElement | null) => {
        URL.revokeObjectURL(url);
        resolve(result);
      };
      image.onload = () => done(image);
      image.onerror = () => done(null);
      image.src = url;
    });
  } catch {
    return null;
  }
}

/**
 * Skalar ned en bild så att längsta sidan blir högst 2048 px. Bilder som redan
 * är små, eller som inte går att avkoda, returneras oförändrade.
 */
export async function downscaleImage(file: File): Promise<PreparedFile> {
  const untouched: PreparedFile = { file, originalBytes: file.size, resized: false };
  try {
    return await resize(file, untouched);
  } catch {
    return untouched;
  }
}

async function resize(file: File, untouched: PreparedFile): Promise<PreparedFile> {
  if (!isResizableImage(file) || file.size < SKIP_BELOW_BYTES) return untouched;
  if (typeof document === 'undefined') return untouched;

  const source = await decode(file);
  if (!source) return untouched;

  const width = source.width;
  const height = source.height;
  const longest = Math.max(width, height);
  if (longest <= MAX_DIMENSION) {
    if ('close' in source) source.close();
    return untouched;
  }

  const scale = MAX_DIMENSION / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext('2d');
  if (!context) return untouched;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();

  // PNG behålls bara när bilden faktiskt har genomskinliga partier. En
  // ogenomskinlig PNG – ofta ett fotografi eller en skärmbild – blir avsevärt
  // mindre som JPEG utan att felet blir svårare att se.
  const targetType = file.type === 'image/png' && hasTransparency(context, canvas)
    ? 'image/png'
    : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, targetType, targetType === 'image/jpeg' ? JPEG_QUALITY : undefined);
  });
  if (!blob || blob.size >= file.size) return untouched;

  const name = targetType === file.type ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return {
    file: new File([blob], name, { type: targetType, lastModified: file.lastModified }),
    originalBytes: file.size,
    resized: true,
  };
}

/** Förbereder flera filer för uppladdning. */
export async function prepareForUpload(files: File[]): Promise<PreparedFile[]> {
  return Promise.all(files.map((file) => downscaleImage(file)));
}

/** Sammanfattar vad nedskalningen gav, för att kunna visas för användaren. */
export function describeSaving(prepared: PreparedFile[]): string | null {
  const resized = prepared.filter((item) => item.resized);
  if (resized.length === 0) return null;
  const before = resized.reduce((sum, item) => sum + item.originalBytes, 0);
  const after = resized.reduce((sum, item) => sum + item.file.size, 0);
  if (after >= before) return null;
  const percent = Math.round((1 - after / before) * 100);
  return `${resized.length === 1 ? 'Bilden' : 'Bilderna'} skalades ned med ${percent} % innan uppladdning.`;
}

/**
 * Letar efter genomskinliga bildpunkter. Bilden gås igenom med ett glest raster
 * i stället för bildpunkt för bildpunkt – det räcker för att avgöra saken och
 * håller kontrollen snabb även på en telefon.
 */
function hasTransparency(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean {
  try {
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const step = Math.max(4, Math.floor(data.length / 4 / 20_000) * 4);
    for (let i = 3; i < data.length; i += step) {
      if (data[i]! < 255) return true;
    }
    return false;
  } catch {
    // Kan inte läsas (exempelvis vid en annan ursprungsdomän) – behåll PNG.
    return true;
  }
}
