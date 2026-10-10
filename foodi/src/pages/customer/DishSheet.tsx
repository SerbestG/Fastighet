import { useEffect, useState } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import type { CartLine, Dish, OptionGroup, Restaurant } from '../../types';
import { photoSrc } from '../../data/photos';
import { defaultSelections, unitPrice, validateSelections } from '../../store/pricing';
import { updateCartLine } from '../../store/store';
import { toast } from '../../store/toast';
import { kr } from '../../lib/format';
import { Sheet } from '../../components/Sheet';
import { DishImage } from '../../components/Media';
import { DishTags, QuantityStepper } from '../../components/Bits';
import { useCartAdder } from '../../components/cartAdder';

function groupHint(group: OptionGroup): string {
  if (group.kind === 'single') return group.required ? 'Välj 1' : 'Valfritt';
  return group.max ? `Välj upp till ${group.max}` : 'Välj fritt';
}

export function DishSheet({
  restaurant,
  dish,
  editLine,
  open,
  onClose,
}: {
  restaurant: Restaurant;
  dish: Dish | undefined;
  /** Rad i varukorgen som redigeras, annars läggs en ny rad till. */
  editLine?: CartLine;
  open: boolean;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [removed, setRemoved] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [comment, setComment] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const { add, dialog } = useCartAdder();

  useEffect(() => {
    if (!dish || !open) return;
    setQuantity(editLine?.quantity ?? 1);
    setRemoved(editLine?.removed ?? []);
    setSelections(editLine ? { ...defaultSelections(dish), ...editLine.selections } : defaultSelections(dish));
    setComment(editLine?.comment ?? '');
    setShowErrors(false);
  }, [dish, editLine, open]);

  if (!dish) return dialog;

  const errors = validateSelections(dish, selections);
  const hasErrors = Object.keys(errors).length > 0;
  const total = unitPrice(dish, selections) * quantity;
  const hero = photoSrc(dish.photo);

  const toggleChoice = (group: OptionGroup, choiceId: string) => {
    setSelections((prev) => {
      const current = prev[group.id] ?? [];
      if (group.kind === 'single') {
        const next = current.includes(choiceId) && !group.required ? [] : [choiceId];
        return { ...prev, [group.id]: next };
      }
      if (current.includes(choiceId)) return { ...prev, [group.id]: current.filter((id) => id !== choiceId) };
      if (group.max && current.length >= group.max) {
        toast(`Du kan välja högst ${group.max} i ${group.title.toLowerCase()}`);
        return prev;
      }
      return { ...prev, [group.id]: [...current, choiceId] };
    });
  };

  const submit = () => {
    if (hasErrors) {
      setShowErrors(true);
      const firstGroup = Object.keys(errors)[0];
      document.getElementById(`group-${firstGroup}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const line = { dishId: dish.id, quantity, removed, selections, comment: comment.trim() || undefined };
    if (editLine) {
      updateCartLine(editLine.id, line);
      toast('Varukorgen är uppdaterad', { tone: 'success' });
      onClose();
      return;
    }
    add(restaurant.id, line, dish.name, onClose);
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={dish.name}
        bare
        size="lg"
        className="dish-sheet"
        footer={
          <div className="dish-sheet__footer">
            <QuantityStepper value={quantity} onChange={setQuantity} label="Antal" size="lg" />
            <button type="button" className="btn btn--primary btn--lg dish-sheet__submit" onClick={submit} disabled={dish.soldOut}>
              {dish.soldOut ? 'Slutsåld idag' : editLine ? 'Uppdatera' : 'Lägg till'}
              {!dish.soldOut && <span className="btn__meta">{kr(total)}</span>}
            </button>
          </div>
        }
      >
        <div className="dish-sheet__hero">
          {hero ? <img src={hero} alt="" /> : <DishImage dish={dish} brand={restaurant.brand} className="dish-sheet__tile" />}
          <button type="button" className="icon-btn dish-sheet__close" onClick={onClose} aria-label="Stäng">
            <X size={20} />
          </button>
        </div>
        <div className="dish-sheet__content">
          <div className="dish-sheet__head">
            <div>
              <h3 className="dish-sheet__name">{dish.name}</h3>
              <p className="dish-sheet__desc">{dish.description}</p>
              <DishTags tags={dish.tags} />
            </div>
            <span className="dish-sheet__price tabular">{kr(dish.price)}</span>
          </div>

          {dish.soldOut && <p className="notice notice--red">Restaurangen har markerat rätten som slutsåld för idag.</p>}

          {dish.ingredients && dish.ingredients.length > 0 && (
            <section className="opt-group" aria-labelledby="ingredients-title">
              <div className="opt-group__head">
                <h4 id="ingredients-title">Ingår i rätten</h4>
                <span className="opt-group__hint">Tryck för att välja bort</span>
              </div>
              <div className="ingredients">
                {dish.ingredients.map((ing) => {
                  const off = removed.includes(ing.id);
                  const src = photoSrc(ing.photo);
                  return (
                    <button
                      key={ing.id}
                      type="button"
                      className={`ingredient${off ? ' is-removed' : ''}`}
                      aria-pressed={!off}
                      aria-label={off ? `${ing.name}, bortvald. Tryck för att lägga tillbaka` : `${ing.name}, ingår. Tryck för att välja bort`}
                      onClick={() => setRemoved((r) => (off ? r.filter((x) => x !== ing.id) : [...r, ing.id]))}
                    >
                      <span className="ingredient__img">
                        {src ? <img src={src} alt="" /> : <span className="ingredient__emoji">{ing.emoji ?? '•'}</span>}
                        <span className="ingredient__state" aria-hidden="true">
                          {off ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
                        </span>
                      </span>
                      <span className="ingredient__name">{off ? `Utan ${ing.name.toLowerCase()}` : ing.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {(dish.optionGroups ?? []).map((group) => {
            const selected = selections[group.id] ?? [];
            const error = showErrors ? errors[group.id] : undefined;
            return (
              <section key={group.id} id={`group-${group.id}`} className={`opt-group${error ? ' has-error' : ''}`} aria-labelledby={`title-${group.id}`}>
                <div className="opt-group__head">
                  <h4 id={`title-${group.id}`}>{group.title}</h4>
                  <span className={`opt-group__hint${group.required ? ' is-required' : ''}`}>{error ?? groupHint(group)}</span>
                </div>
                <div className={`options${group.choices.some((c) => c.photo) ? ' options--media' : ''}`} role={group.kind === 'single' ? 'radiogroup' : 'group'}>
                  {group.choices.map((c) => {
                    const on = selected.includes(c.id);
                    const src = photoSrc(c.photo);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role={group.kind === 'single' ? 'radio' : 'checkbox'}
                        aria-checked={on}
                        className={`option${on ? ' is-on' : ''}`}
                        onClick={() => toggleChoice(group, c.id)}
                      >
                        {src && <img className="option__img" src={src} alt="" />}
                        <span className="option__text">
                          <span className="option__name">{c.name}</span>
                          {c.price > 0 && <span className="option__price tabular">+ {kr(c.price)}</span>}
                        </span>
                        <span className={`option__mark option__mark--${group.kind}`} aria-hidden="true">
                          {on ? <Check size={14} strokeWidth={3} /> : group.kind === 'multi' ? <Plus size={14} strokeWidth={2.5} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="opt-group">
            <div className="opt-group__head">
              <h4>
                <label htmlFor="dish-comment">Kommentar till köket</label>
              </h4>
              <span className="opt-group__hint">Valfritt</span>
            </div>
            <textarea
              id="dish-comment"
              className="textarea"
              rows={2}
              maxLength={200}
              placeholder="T.ex. allergier eller extra sås"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <p className="field__hint">Vid allvarlig allergi: ring restaurangen på {restaurant.phone} innan du beställer.</p>
          </section>
        </div>
      </Sheet>
      {dialog}
    </>
  );
}
