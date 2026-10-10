import { Link } from 'react-router-dom';
import { useAppState } from '../../store/store';
import { distanceTo, useLocationPoint, useNow } from '../../store/hooks';
import { PageHeader } from '../../components/Layout';
import { RestaurantCard } from '../../components/Cards';

export function FavoritesPage() {
  const { favorites, restaurants } = useAppState();
  const point = useLocationPoint();
  const now = useNow(30_000);
  const list = restaurants.filter((r) => favorites.includes(r.id) && !r.suspended);
  return (
    <div className="page-width">
      <PageHeader title="Favoriter" subtitle="Dina sparade restauranger" sticky={false} />
      {list.length === 0 ? (
        <div className="empty">
          <div className="empty__art" aria-hidden="true">
            💚
          </div>
          <h2>Inga favoriter än</h2>
          <p>Tryck på hjärtat på en restaurang så hittar du den snabbt här nästa gång.</p>
          <Link to="/" className="btn btn--primary">
            Utforska restauranger
          </Link>
        </div>
      ) : (
        <div className="r-grid">
          {list.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} meters={distanceTo(r, point)} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
