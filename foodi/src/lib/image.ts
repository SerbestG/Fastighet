/** Skalar ned en uppladdad bild så att den ryms i webbläsarens lokala lagring. */
export async function resizeImage(file: File, maxSize = 640, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Välj en bildfil (JPG, PNG eller WebP).');
  if (file.size > 15 * 1024 * 1024) throw new Error('Bilden är större än 15 MB. Välj en mindre bild.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Bilden gick inte att läsa.'));
      el.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Bilden gick inte att bearbeta.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', quality);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
