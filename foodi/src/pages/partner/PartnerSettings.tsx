import { useState } from 'react';
import { Moon, Pause, Play, Timer } from 'lucide-react';
import type { OpeningSpan, Restaurant, WeekHours } from '../../types';
import { updateRestaurant } from '../../store/store';
import { useNow } from '../../store/hooks';
import { toast } from '../../store/toast';
import { clock } from '../../lib/format';
import { WEEKDAYS } from '../../lib/time';
import { QuantityStepper } from '../../components/Bits';
import { restaurantStatus } from '../../components/status';

export function PartnerSettings({ restaurant }: { restaurant: Restaurant }) {
  const now = useNow(15_000);
  const [hours, setHours] = useState<WeekHours>(restaurant.hours);
  const [phoneNumber, setPhoneNumber] = useState(restaurant.phone);
  const dirty = JSON.stringify(hours) !== JSON.stringify(restaurant.hours);
  const status = restaurantStatus(restaurant, now);
  const paused = Boolean(restaurant.pausedUntil && restaurant.pausedUntil > now);

  const setDay = (index: number, span: OpeningSpan | null) => setHours((h) => h.map((s, i) => (i === index ? span : s)));

  const saveHours = () => {
    const invalid = hours.some((s) => s && (!/^\d{2}:\d{2}$/.test(s.open) || !/^\d{2}:\d{2}$/.test(s.close) || s.open === s.close));
    if (invalid) {
      toast('Kontrollera tiderna – öppning och stängning kan inte vara samma tid', { tone: 'error' });
      return;
    }
    updateRestaurant(restaurant.id, { hours });
    toast('Öppettiderna är sparade och syns för kunderna', { tone: 'success' });
  };

  return (
    <div className="settings-page">
      <div className="staff-toolbar">
        <div>
          <h1 className="staff-title">Öppettider & drift</h1>
          <p className="muted">
            Kunderna ser just nu: <strong className={`text-${status.tone}`}>{status.label}</strong>
          </p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="panel settings-panel" aria-labelledby="ops-title">
          <h2 id="ops-title">Ta emot beställningar</h2>
          {paused ? (
            <div className="ops-state ops-state--paused">
              <Pause size={20} aria-hidden="true" />
              <p>
                <strong>Pausat till {clock(restaurant.pausedUntil ?? now)}.</strong> Kunder kan förbeställa till senare tider men inte hämta direkt.
              </p>
              <button
                type="button"
                className="btn btn--lime"
                onClick={() => {
                  updateRestaurant(restaurant.id, { pausedUntil: undefined });
                  toast('Restaurangen tar emot beställningar igen', { tone: 'success' });
                }}
              >
                <Play size={16} aria-hidden="true" /> Återuppta nu
              </button>
            </div>
          ) : (
            <div className="ops-state">
              <p>Mycket i köket? Pausa nya beställningar en stund så slipper kunderna vänta.</p>
              <div className="ops-state__buttons">
                {[15, 30, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="btn btn--outline"
                    onClick={() => {
                      updateRestaurant(restaurant.id, { pausedUntil: Date.now() + m * 60_000 });
                      toast(`Beställningar pausade i ${m} min`);
                    }}
                  >
                    <Pause size={16} aria-hidden="true" /> {m} min
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="prep-setting">
            <Timer size={20} aria-hidden="true" />
            <span>
              <strong>Normal tillagningstid</strong>
              <span className="muted">Styr den tidigaste hämttiden kunderna kan välja</span>
            </span>
            <QuantityStepper
              value={restaurant.prepMinutes}
              min={5}
              max={90}
              label="Tillagningstid i minuter"
              onChange={(v) => {
                const minutes = Math.max(5, Math.min(90, v < restaurant.prepMinutes ? restaurant.prepMinutes - 5 : restaurant.prepMinutes + 5));
                updateRestaurant(restaurant.id, { prepMinutes: minutes });
              }}
            />
            <span className="prep-setting__unit">min</span>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="r-phone">
              Telefon till restaurangen
            </label>
            <input
              id="r-phone"
              className="input"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onBlur={() => {
                if (phoneNumber.trim() && phoneNumber !== restaurant.phone) {
                  updateRestaurant(restaurant.id, { phone: phoneNumber.trim() });
                  toast('Telefonnumret är sparat', { tone: 'success' });
                }
              }}
            />
            <span className="field__hint">Visas för kunder som vill fråga om allergener.</span>
          </div>
        </section>

        <section className="panel settings-panel" aria-labelledby="hours-title">
          <h2 id="hours-title">Öppettider</h2>
          <ul className="hours-editor">
            {WEEKDAYS.map((day, i) => {
              const span = hours[i];
              const overnight = span && span.close <= span.open;
              return (
                <li key={day} className={span ? '' : 'is-closed'}>
                  <label className="hours-editor__day" htmlFor={`open-${i}`}>
                    <span className="switch">
                      <input
                        id={`open-${i}`}
                        type="checkbox"
                        checked={Boolean(span)}
                        onChange={(e) => setDay(i, e.target.checked ? (restaurant.hours[i] ?? { open: '11:00', close: '21:00' }) : null)}
                      />
                      <span className="switch__track" />
                    </span>
                    <span>{day}</span>
                  </label>
                  {span ? (
                    <span className="hours-editor__times">
                      <label className="visually-hidden" htmlFor={`from-${i}`}>
                        Öppnar {day.toLowerCase()}
                      </label>
                      <input id={`from-${i}`} className="input input--sm" type="time" value={span.open} onChange={(e) => setDay(i, { ...span, open: e.target.value })} />
                      <span aria-hidden="true">–</span>
                      <label className="visually-hidden" htmlFor={`to-${i}`}>
                        Stänger {day.toLowerCase()}
                      </label>
                      <input id={`to-${i}`} className="input input--sm" type="time" value={span.close} onChange={(e) => setDay(i, { ...span, close: e.target.value })} />
                      {overnight && (
                        <span className="hours-editor__night" title="Stänger efter midnatt">
                          <Moon size={14} aria-hidden="true" />
                          <span className="visually-hidden">Stänger efter midnatt</span>
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="muted">Stängt</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="field__hint">En stängningstid före öppningstiden betyder att ni stänger efter midnatt.</p>
          <div className="settings-panel__actions">
            <button type="button" className="btn btn--ghost" disabled={!dirty} onClick={() => setHours(restaurant.hours)}>
              Ångra
            </button>
            <button type="button" className="btn btn--primary" disabled={!dirty} onClick={saveHours}>
              Spara öppettider
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
