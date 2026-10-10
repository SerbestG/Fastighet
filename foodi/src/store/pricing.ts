// Priser, tillval och avgifter. Ren logik utan beroenden till gränssnittet, så
// att samma beräkning kan flyttas till ett API utan att resultatet ändras.

import type { Cart, CartLine, Dish, OptionChoice, OptionGroup, PlatformSettings, Restaurant } from '../types';

export function defaultSelections(dish: Dish): Record<string, string[]> {
  const selections: Record<string, string[]> = {};
  for (const group of dish.optionGroups ?? []) {
    const first = group.choices[0];
    selections[group.id] = group.kind === 'single' && group.required && first ? [first.id] : [];
  }
  return selections;
}

export function selectedChoices(dish: Dish, selections: Record<string, string[]>): { group: OptionGroup; choice: OptionChoice }[] {
  const result: { group: OptionGroup; choice: OptionChoice }[] = [];
  for (const group of dish.optionGroups ?? []) {
    for (const id of selections[group.id] ?? []) {
      const choice = group.choices.find((c) => c.id === id);
      if (choice) result.push({ group, choice });
    }
  }
  return result;
}

export function unitPrice(dish: Dish, selections: Record<string, string[]>): number {
  return dish.price + selectedChoices(dish, selections).reduce((sum, { choice }) => sum + choice.price, 0);
}

/** Läsbara rader om vad kunden har ändrat, t.ex. "Utan lök" och "+ Extra ost". */
export function modifiers(dish: Dish, line: Pick<CartLine, 'removed' | 'selections'>): string[] {
  const result: string[] = [];
  for (const { group, choice } of selectedChoices(dish, line.selections)) {
    result.push(group.kind === 'single' && group.required ? choice.name : `+ ${choice.name}`);
  }
  for (const id of line.removed) {
    const ingredient = dish.ingredients?.find((i) => i.id === id);
    if (ingredient) result.push(`Utan ${ingredient.name.toLowerCase()}`);
  }
  return result;
}

/** Felmeddelande per tillvalsgrupp som inte är korrekt ifylld. */
export function validateSelections(dish: Dish, selections: Record<string, string[]>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const group of dish.optionGroups ?? []) {
    const count = (selections[group.id] ?? []).length;
    if (group.required && count === 0) errors[group.id] = 'Välj ett alternativ';
    if (group.kind === 'single' && count > 1) errors[group.id] = 'Välj bara ett alternativ';
    if (group.max && count > group.max) errors[group.id] = `Välj högst ${group.max}`;
  }
  return errors;
}

export function serviceFee(subtotal: number, settings: PlatformSettings): number {
  if (subtotal <= 0) return 0;
  return Math.min(settings.serviceFeeCap, Math.round((subtotal * settings.serviceFeePct) / 100));
}

/** Momsen som ingår i ett pris inklusive moms. */
export function includedVat(amount: number, vatPct: number): number {
  return amount - amount / (1 + vatPct / 100);
}

export interface PricedLine {
  line: CartLine;
  dish: Dish | undefined;
  unit: number;
  total: number;
  modifiers: string[];
  /** Rätten finns inte längre eller är slutsåld. */
  unavailable: boolean;
}

export interface CartTotals {
  lines: PricedLine[];
  count: number;
  subtotal: number;
  serviceFee: number;
  total: number;
  hasUnavailable: boolean;
}

export function cartTotals(cart: Cart | null, restaurant: Restaurant | undefined, settings: PlatformSettings): CartTotals {
  const lines: PricedLine[] = (cart?.lines ?? []).map((line) => {
    const dish = restaurant?.dishes.find((d) => d.id === line.dishId);
    const unit = dish ? unitPrice(dish, line.selections) : 0;
    return {
      line,
      dish,
      unit,
      total: unit * line.quantity,
      modifiers: dish ? modifiers(dish, line) : [],
      unavailable: !dish || Boolean(dish.soldOut),
    };
  });
  const available = lines.filter((l) => !l.unavailable);
  const subtotal = available.reduce((sum, l) => sum + l.total, 0);
  const fee = serviceFee(subtotal, settings);
  return {
    lines,
    count: available.reduce((sum, l) => sum + l.line.quantity, 0),
    subtotal,
    serviceFee: fee,
    total: subtotal + fee,
    hasUnavailable: lines.some((l) => l.unavailable),
  };
}

/** Två rader med samma rätt och samma val slås ihop i varukorgen. */
export function sameConfiguration(a: Omit<CartLine, 'id' | 'quantity'>, b: Omit<CartLine, 'id' | 'quantity'>): boolean {
  if (a.dishId !== b.dishId || (a.comment ?? '') !== (b.comment ?? '')) return false;
  const norm = (s: Record<string, string[]>) =>
    JSON.stringify(
      Object.keys(s)
        .sort()
        .map((k) => [k, [...(s[k] ?? [])].sort()]),
    );
  return [...a.removed].sort().join() === [...b.removed].sort().join() && norm(a.selections) === norm(b.selections);
}
