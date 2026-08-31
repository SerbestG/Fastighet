import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { QueryBoundary } from '../components/ui.js';
import { MailIcon, PhoneIcon } from '../components/icons.js';

interface ContactData {
  organisation: {
    display_name: string;
    support_email: string | null;
    support_phone: string | null;
    emergency_phone: string | null;
    disturbance_phone: string | null;
    website_url: string | null;
  };
  contacts: { role_label: string; name: string; phone: string | null; email: string | null; hours: string | null }[];
}

export function ContactPage() {
  const { t } = useI18n();
  const state = useQuery<ContactData>('/api/contact');

  return (
    <div className="page stack stack-5">
      <header className="page-header">
        <h1>{t('nav.contact')}</h1>
      </header>

      <QueryBoundary state={state}>
        {(data) => (
          <>
            {data.organisation.emergency_phone ? (
              <a className="btn btn-danger btn-lg btn-block" href={`tel:${data.organisation.emergency_phone}`}>
                <PhoneIcon size={20} /> Fastighetsjour {data.organisation.emergency_phone}
              </a>
            ) : null}
            <p className="small muted center">
              Vid fara för liv, hälsa eller egendom – ring alltid 112.
            </p>

            <div className="card card-flush">
              {data.contacts.map((contact) => (
                <div className="list-item" key={contact.role_label} style={{ cursor: 'default' }}>
                  <span className="grow stack stack-1">
                    <span className="list-title">{contact.role_label}</span>
                    <span className="list-meta">{contact.name}</span>
                    {contact.hours ? <span className="xs subtle">{contact.hours}</span> : null}
                  </span>
                  <span className="row" style={{ gap: 'var(--space-1)' }}>
                    {contact.phone ? (
                      <a className="icon-btn" href={`tel:${contact.phone}`} aria-label={`Ring ${contact.role_label}`}>
                        <PhoneIcon size={18} />
                      </a>
                    ) : null}
                    {contact.email ? (
                      <a className="icon-btn" href={`mailto:${contact.email}`} aria-label={`Mejla ${contact.role_label}`}>
                        <MailIcon size={18} />
                      </a>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>

            {data.organisation.website_url ? (
              <a className="btn btn-secondary btn-block" href={data.organisation.website_url} target="_blank" rel="noreferrer">
                {data.organisation.display_name} webbplats
              </a>
            ) : null}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
