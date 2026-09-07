/**
 * Hemligheter för integrationer (krav C.3.2).
 *
 * Databasen bär bara en referens, aldrig själva nyckeln. Referensen slås upp i
 * driftmiljön, som i sin tur kan hämta värdet från en nyckelvalvstjänst. Ett
 * hemligt värde passerar aldrig gränssnittet och skrivs aldrig i loggen.
 */

/** Tillåtna tecken i en referens, så att den inte kan peka på vad som helst. */
const REFERENCE = /^[A-Z][A-Z0-9_]{2,60}$/;

export function resolveSecret(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const normalised = reference.trim().toUpperCase();
  if (!REFERENCE.test(normalised)) return null;
  const value = process.env[`SECRET_${normalised}`];
  return value && value.length > 0 ? value : null;
}

/** Om en referens går att lösa upp just nu. Används för att visa status. */
export function secretAvailable(reference: string | null | undefined): boolean {
  return resolveSecret(reference) !== null;
}
