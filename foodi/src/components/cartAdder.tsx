import { useState } from 'react';
import { addToCart, getState, type NewCartLine } from '../store/store';
import { toast } from '../store/toast';
import { ConfirmDialog } from './Sheet';

/**
 * Lägger till i varukorgen och frågar först om kunden vill byta restaurang,
 * eftersom en beställning hämtas på ett ställe.
 */
export function useCartAdder() {
  const [pending, setPending] = useState<{ restaurantId: string; line: NewCartLine; name: string; onDone?: () => void } | null>(null);

  const add = (restaurantId: string, line: NewCartLine, name: string, onDone?: () => void) => {
    if (addToCart(restaurantId, line)) {
      toast(`${line.quantity > 1 ? `${line.quantity} × ` : ''}${name} i varukorgen`, { tone: 'success' });
      onDone?.();
      return;
    }
    setPending({ restaurantId, line, name, onDone });
  };

  const current = getState();
  const currentName = current.restaurants.find((r) => r.id === current.cart?.restaurantId)?.name ?? 'en annan restaurang';
  const nextName = current.restaurants.find((r) => r.id === pending?.restaurantId)?.name ?? '';

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title="Starta en ny beställning?"
      message={
        <p>
          Din varukorg innehåller rätter från <strong>{currentName}</strong>. En beställning hämtas på ett ställe, så vi tömmer
          varukorgen om du lägger till från {nextName}.
        </p>
      }
      confirmLabel="Töm och lägg till"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (!pending) return;
        addToCart(pending.restaurantId, pending.line, { replace: true });
        toast(`${pending.name} i varukorgen`, { tone: 'success' });
        pending.onDone?.();
        setPending(null);
      }}
    />
  );

  return { add, dialog };
}
