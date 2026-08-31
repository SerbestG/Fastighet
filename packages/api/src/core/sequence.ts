/**
 * Kör ett antal frågor efter varandra på samma anslutning.
 *
 * En klient från anslutningspoolen kan bara hantera en fråga i taget. Promise.all
 * över samma klient ger därför odefinierat beteende. Hjälpfunktionen behåller den
 * bekväma destrukturering som Promise.all ger, men kör frågorna i tur och ordning.
 */
export async function sequence<T extends readonly (() => Promise<unknown>)[] | []>(
  tasks: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<Extract<T[K], () => Promise<unknown>>>> }> {
  const results: unknown[] = [];
  for (const task of tasks) results.push(await (task as () => Promise<unknown>)());
  return results as never;
}
