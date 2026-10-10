import { useRef, useState } from 'react';
import { ImagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Dish, DishTag, Restaurant } from '../../types';
import { addCategory, addDish, removeDish, saveFailed, updateDish } from '../../store/store';
import { toast } from '../../store/toast';
import { normalize } from '../../store/discovery';
import { resizeImage } from '../../lib/image';
import { uid } from '../../lib/random';
import { kr, plural } from '../../lib/format';
import { DishImage } from '../../components/Media';
import { ConfirmDialog, Sheet } from '../../components/Sheet';

const TAGS: { id: DishTag; label: string }[] = [
  { id: 'vegetarisk', label: 'Vegetarisk' },
  { id: 'vegansk', label: 'Vegansk' },
  { id: 'stark', label: 'Stark' },
  { id: 'glutenfri', label: 'Glutenfri' },
  { id: 'laktosfri', label: 'Laktosfri' },
];

export function PartnerMenu({ restaurant }: { restaurant: Restaurant }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Dish | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Dish | null>(null);
  const soldOut = restaurant.dishes.filter((d) => d.soldOut).length;
  const q = normalize(query);
  const visible = (d: Dish) => !q || normalize(d.name).includes(q) || normalize(d.description).includes(q);

  return (
    <div className="menu-admin">
      <div className="staff-toolbar">
        <div>
          <h1 className="staff-title">Meny</h1>
          <p className="muted">
            {plural(restaurant.dishes.length, 'rätt', 'rätter')} · {soldOut > 0 ? `${soldOut} slutsålda idag` : 'allt finns i lager'}. Ändringar syns
            direkt för kunderna.
          </p>
        </div>
        <div className="staff-toolbar__actions">
          <label className="search-mini" htmlFor="menu-search">
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">Sök i menyn</span>
            <input id="menu-search" type="search" placeholder="Sök rätt" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            <Plus size={18} aria-hidden="true" /> Ny rätt
          </button>
        </div>
      </div>

      {restaurant.menu.map((category) => {
        const dishes = restaurant.dishes.filter((d) => d.categoryId === category.id && visible(d));
        if (dishes.length === 0 && q) return null;
        return (
          <section key={category.id} className="menu-admin__section" aria-labelledby={`admin-cat-${category.id}`}>
            <h2 id={`admin-cat-${category.id}`}>
              {category.name} <span className="muted">{dishes.length}</span>
            </h2>
            {dishes.length === 0 ? (
              <p className="muted menu-admin__empty">Inga rätter i kategorin än.</p>
            ) : (
              <ul className="menu-admin__list">
                {dishes.map((dish) => (
                  <MenuRow key={`${dish.id}-${dish.price}`} dish={dish} restaurant={restaurant} onEdit={() => setEditing(dish)} onDelete={() => setDeleting(dish)} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <DishEditor restaurant={restaurant} dish={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        title={`Ta bort ${deleting?.name ?? ''}?`}
        message={<p>Rätten försvinner från menyn och från kunders varukorgar. Vill du bara pausa den, markera den som slutsåld i stället.</p>}
        confirmLabel="Ta bort"
        tone="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            removeDish(restaurant.id, deleting.id);
            toast(`${deleting.name} är borttagen`);
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}

function MenuRow({ dish, restaurant, onEdit, onDelete }: { dish: Dish; restaurant: Restaurant; onEdit: () => void; onDelete: () => void }) {
  const [price, setPrice] = useState(String(dish.price));
  const fileRef = useRef<HTMLInputElement>(null);

  const savePrice = () => {
    const value = Math.round(Number(price.replace(',', '.')));
    if (!Number.isFinite(value) || value < 0 || value > 5000) {
      toast('Ange ett pris mellan 0 och 5 000 kr', { tone: 'error' });
      setPrice(String(dish.price));
      return;
    }
    if (value !== dish.price) {
      updateDish(restaurant.id, dish.id, { price: value });
      toast(`${dish.name} kostar nu ${kr(value)}`, { tone: 'success' });
    }
    setPrice(String(value));
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const photo = await resizeImage(file);
      updateDish(restaurant.id, dish.id, { photo });
      if (saveFailed()) toast('Bilden visas nu men ryms inte i webbläsarens lagring. Välj en mindre bild.', { tone: 'error' });
      else toast('Bilden är uppladdad', { tone: 'success' });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Bilden gick inte att ladda upp', { tone: 'error' });
    }
  };

  return (
    <li className={`menu-admin__row${dish.soldOut ? ' is-sold-out' : ''}`}>
      <button type="button" className="menu-admin__photo" onClick={() => fileRef.current?.click()} aria-label={`Byt bild för ${dish.name}`}>
        <DishImage dish={dish} brand={restaurant.brand} />
        <span className="menu-admin__photo-hint">
          <ImagePlus size={16} aria-hidden="true" />
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void uploadPhoto(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="menu-admin__text">
        <strong>{dish.name}</strong>
        <span className="muted">{dish.description}</span>
        {dish.optionGroups && dish.optionGroups.length > 0 && (
          <span className="menu-admin__meta">{dish.optionGroups.map((g) => g.title).join(' · ')}</span>
        )}
      </div>
      <label className="price-input" htmlFor={`price-${dish.id}`}>
        <span className="visually-hidden">Pris för {dish.name}</span>
        <input
          id={`price-${dish.id}`}
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={savePrice}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span>kr</span>
      </label>
      <label className="stock-toggle" htmlFor={`stock-${dish.id}`}>
        <span className="switch">
          <input
            id={`stock-${dish.id}`}
            type="checkbox"
            checked={!dish.soldOut}
            onChange={(e) => {
              updateDish(restaurant.id, dish.id, { soldOut: !e.target.checked });
              toast(e.target.checked ? `${dish.name} finns igen` : `${dish.name} är slutsåld för idag`);
            }}
          />
          <span className="switch__track" />
        </span>
        <span>{dish.soldOut ? 'Slutsåld' : 'I lager'}</span>
      </label>
      <div className="menu-admin__actions">
        <button type="button" className="icon-btn icon-btn--plain icon-btn--sm" onClick={onEdit} aria-label={`Redigera ${dish.name}`}>
          <Pencil size={17} />
        </button>
        <button type="button" className="icon-btn icon-btn--plain icon-btn--sm" onClick={onDelete} aria-label={`Ta bort ${dish.name}`}>
          <Trash2 size={17} />
        </button>
      </div>
    </li>
  );
}

function DishEditor({ restaurant, dish, onClose }: { restaurant: Restaurant; dish: Dish | 'new' | null; onClose: () => void }) {
  const isNew = dish === 'new';
  const current = dish && dish !== 'new' ? dish : null;
  const [form, setForm] = useState({ name: '', description: '', price: '', categoryId: '', tags: [] as DishTag[], popular: false, emoji: '🍽️' });
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastDish, setLastDish] = useState<Dish | 'new' | null>(null);

  if (dish !== lastDish) {
    setLastDish(dish);
    setError(null);
    setNewCategory('');
    setForm({
      name: current?.name ?? '',
      description: current?.description ?? '',
      price: current ? String(current.price) : '',
      categoryId: current?.categoryId ?? restaurant.menu[0]?.id ?? '',
      tags: current?.tags ?? [],
      popular: current?.popular ?? false,
      emoji: current?.emoji ?? restaurant.brand.motif[0] ?? '🍽️',
    });
  }

  const save = () => {
    const price = Math.round(Number(form.price.replace(',', '.')));
    if (form.name.trim().length < 2) return setError('Ge rätten ett namn.');
    if (!Number.isFinite(price) || price <= 0) return setError('Ange ett pris i kronor.');
    let categoryId = form.categoryId;
    if (categoryId === '__new') {
      if (newCategory.trim().length < 2) return setError('Skriv ett namn på den nya kategorin.');
      categoryId = addCategory(restaurant.id, newCategory.trim());
    }
    const patch = {
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      categoryId,
      tags: form.tags,
      popular: form.popular,
      emoji: form.emoji,
    };
    if (current) {
      updateDish(restaurant.id, current.id, patch);
      toast(`${patch.name} är uppdaterad`, { tone: 'success' });
    } else {
      addDish(restaurant.id, { id: `${restaurant.id}-${uid().slice(0, 8)}`, ...patch });
      toast(`${patch.name} finns nu på menyn`, { tone: 'success' });
    }
    onClose();
  };

  return (
    <Sheet
      open={dish !== null}
      onClose={onClose}
      title={isNew ? 'Ny rätt' : `Redigera ${current?.name ?? ''}`}
      footer={
        <div className="filter-footer">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Avbryt
          </button>
          <button type="button" className="btn btn--primary btn--lg" onClick={save}>
            {isNew ? 'Lägg till på menyn' : 'Spara'}
          </button>
        </div>
      }
    >
      <div className="editor">
        <div className="field">
          <label className="field__label" htmlFor="dish-name">
            Namn
          </label>
          <input id="dish-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-autofocus />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="dish-desc">
            Beskrivning
          </label>
          <textarea
            id="dish-desc"
            className="textarea"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="editor__row">
          <div className="field">
            <label className="field__label" htmlFor="dish-price">
              Pris (kr, inkl. moms)
            </label>
            <input id="dish-price" className="input" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="dish-cat">
              Kategori
            </label>
            <select id="dish-cat" className="select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              {restaurant.menu.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ Ny kategori</option>
            </select>
          </div>
        </div>
        {form.categoryId === '__new' && (
          <div className="field">
            <label className="field__label" htmlFor="dish-newcat">
              Namn på ny kategori
            </label>
            <input id="dish-newcat" className="input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          </div>
        )}
        <fieldset className="filters__group">
          <legend>Märkning</legend>
          <div className="filters__chips">
            {TAGS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                aria-pressed={form.tags.includes(t.id)}
                onClick={() => setForm({ ...form, tags: form.tags.includes(t.id) ? form.tags.filter((x) => x !== t.id) : [...form.tags, t.id] })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="toggle-row" htmlFor="dish-popular">
          <span>
            <strong>Visa under Populärast</strong>
            <span className="muted">Lyfts fram högst upp på restaurangsidan</span>
          </span>
          <span className="switch">
            <input id="dish-popular" type="checkbox" checked={form.popular} onChange={(e) => setForm({ ...form, popular: e.target.checked })} />
            <span className="switch__track" />
          </span>
        </label>
        <p className="muted editor__hint">Lägg till en bild genom att trycka på rättens bild i menylistan.</p>
        {error && <p className="field__error">{error}</p>}
      </div>
    </Sheet>
  );
}
