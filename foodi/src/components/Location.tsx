import { useState } from 'react';
import { Check, ChevronDown, LocateFixed, MapPin } from 'lucide-react';
import { AREAS, nearestArea } from '../data/areas';
import { setLocation, useAppState } from '../store/store';
import { useLocationPoint } from '../store/hooks';
import { toast } from '../store/toast';
import { Sheet } from './Sheet';

export function LocationButton({ variant = 'chip' }: { variant?: 'chip' | 'header' }) {
  const [open, setOpen] = useState(false);
  const point = useLocationPoint();
  return (
    <>
      <button type="button" className={`location-btn location-btn--${variant}`} onClick={() => setOpen(true)}>
        <MapPin size={18} aria-hidden="true" />
        <span className="location-btn__text">
          <span className="visually-hidden">Hämtar nära </span>
          {point.label}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <LocationSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { location } = useAppState();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useCurrentPosition = () => {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('Din webbläsare kan inte dela plats. Välj ett område i listan.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        const { area, meters } = nearestArea(lat, lng);
        if (meters > 25_000) {
          setError('Du verkar vara utanför Stockholm. Foodi finns bara i Stockholm än så länge – välj ett område i listan.');
          return;
        }
        setLocation({ kind: 'gps', lat, lng, label: `Nära ${area.name}` });
        toast(`Visar restauranger nära dig (${area.name})`, { tone: 'success' });
        onClose();
      },
      () => {
        setLocating(false);
        setError('Vi fick inte tillgång till din plats. Tillåt platsdelning i webbläsaren eller välj ett område i listan.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Var vill du hämta?" size="sm">
      <div className="location-sheet">
        <button type="button" className="location-sheet__gps" onClick={useCurrentPosition} disabled={locating} data-autofocus>
          <span className="location-sheet__gps-icon">
            <LocateFixed size={20} />
          </span>
          <span>
            <strong>{locating ? 'Hämtar din plats …' : 'Använd min nuvarande plats'}</strong>
            <span className="muted">Vi visar restauranger du hinner gå till</span>
          </span>
        </button>
        {error && <p className="field__error location-sheet__error">{error}</p>}
        <p className="location-sheet__label">Eller välj område</p>
        <ul className="location-sheet__list">
          {AREAS.map((area) => {
            const active = location.kind === 'area' && location.areaId === area.id;
            return (
              <li key={area.id}>
                <button
                  type="button"
                  className={`location-sheet__area${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => {
                    setLocation({ kind: 'area', areaId: area.id });
                    onClose();
                  }}
                >
                  <MapPin size={18} aria-hidden="true" />
                  <span>{area.name}</span>
                  {active && <Check size={18} className="location-sheet__check" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
