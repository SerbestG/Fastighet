import { useEffect, useState } from 'react';
import { Check, CreditCard, Smartphone, Wallet } from 'lucide-react';
import type { PaymentMethod } from '../../types';
import { kr, phone } from '../../lib/format';
import { Sheet } from '../../components/Sheet';

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  swish: 'Swish',
  card: 'Kort',
  wallet: 'Mobilplånbok',
};

export function walletName(): string {
  return typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh/.test(navigator.userAgent) ? 'Apple Pay' : 'Google Pay';
}

export function PaymentIcon({ method, size = 20 }: { method: PaymentMethod; size?: number }) {
  if (method === 'swish') return <Smartphone size={size} aria-hidden="true" />;
  if (method === 'card') return <CreditCard size={size} aria-hidden="true" />;
  return <Wallet size={size} aria-hidden="true" />;
}

type Step = 'waiting' | 'done';

const STEPS: Record<PaymentMethod, { title: string; body: (p: string) => string; ms: number }> = {
  swish: {
    title: 'Godkänn i Swish',
    body: (p) => `Vi har skickat en betalförfrågan till ${p}. Öppna Swish och godkänn med BankID.`,
    ms: 2600,
  },
  card: {
    title: 'Verifierar kortet',
    body: () => 'Vi kontrollerar testkortet •••• 4242 med banken.',
    ms: 1800,
  },
  wallet: {
    title: 'Bekräfta betalningen',
    body: () => 'Dubbelklicka eller använd Face ID för att bekräfta i mobilplånboken.',
    ms: 1600,
  },
};

/**
 * Simulerat betalsteg. Ingen riktig betaltjänst anropas och inga pengar dras;
 * det står tydligt i dialogen.
 */
export function PaymentSheet({
  open,
  method,
  amount,
  phoneNumber,
  onSuccess,
  onCancel,
}: {
  open: boolean;
  method: PaymentMethod;
  amount: number;
  phoneNumber: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('waiting');

  useEffect(() => {
    if (!open) return;
    setStep('waiting');
    const toDone = window.setTimeout(() => setStep('done'), STEPS[method].ms);
    const finish = window.setTimeout(onSuccess, STEPS[method].ms + 900);
    return () => {
      window.clearTimeout(toDone);
      window.clearTimeout(finish);
    };
    // Betalningen startar när dialogen öppnas; onSuccess från samma visning används.
  }, [open, method]);

  const config = STEPS[method];
  const name = method === 'wallet' ? walletName() : PAYMENT_LABEL[method];

  return (
    <Sheet open={open} onClose={step === 'done' ? () => undefined : onCancel} title={`Betala med ${name}`} size="sm" hideTitle>
      <div className={`pay-flow pay-flow--${step}`}>
        <span className="pill pill--amber">Simulerad betalning · inga pengar dras</span>
        <div className="pay-flow__visual" aria-hidden="true">
          {step === 'done' ? (
            <span className="pay-flow__check">
              <Check size={40} strokeWidth={3} />
            </span>
          ) : (
            <span className="pay-flow__spinner">
              {method === 'card' ? <CreditCard size={36} /> : method === 'wallet' ? <Wallet size={36} /> : <Smartphone size={36} />}
            </span>
          )}
        </div>
        <h2 className="pay-flow__title" aria-live="polite">
          {step === 'done' ? 'Betalningen är godkänd' : config.title}
        </h2>
        <p className="pay-flow__amount tabular">{kr(amount)}</p>
        <p className="pay-flow__body">{step === 'done' ? 'Vi skickar beställningen till restaurangen.' : config.body(phone(phoneNumber))}</p>
        {step === 'waiting' && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Avbryt betalningen
          </button>
        )}
      </div>
    </Sheet>
  );
}
