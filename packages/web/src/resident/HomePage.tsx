import { Link } from 'react-router-dom';
import { OPERATIONAL_NOTICE_KINDS, type NoticeKind } from '@hemvist/shared';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { formatAmount, longDate, timeRange } from '../lib/format.js';
import { QueryBoundary, Pill } from '../components/ui.js';
import {
  AlertIcon,
  MegaphoneIcon,
  CalendarIcon,
  ChevronRight,
  DocumentIcon,
  HomeIcon,
  InvoiceIcon,
  MessageIcon,
  WrenchIcon,
} from '../components/icons.js';

interface HomeData {
  greetingName: string;
  home: {
    object_number: string;
    unit_label: string;
    property_street: string;
    property_name: string;
    property_city: string;
    area_name: string;
  } | null;
  notices: {
    id: string;
    kind: string;
    severity: 'critical' | 'important' | 'info';
    localized_title: string;
    summary: string | null;
    starts_at: string | null;
    expected_end_at: string | null;
    is_read: boolean;
  }[];
  cases: {
    id: string;
    case_number: string;
    title: string;
    status: string;
    priority: string;
    updated_at: string;
    next_visit_at: string | null;
  }[];
  nextInvoice: { id: string; invoice_number: string; due_date: string; amount_ore: number; status: string } | null;
  bookings: { id: string; starts_at: string; ends_at: string; resource_name: string; resource_kind: string }[];
  moveFlow: { id: string; kind: string; remaining: number } | null;
  openSurveys: { id: string; title: string }[];
}

const statusLabel: Record<string, string> = {
  received: 'Mottaget',
  under_review: 'Under granskning',
  assigned: 'Tilldelat',
  visit_booked: 'Besök bokat',
  in_progress: 'Arbete pågår',
  awaiting_materials: 'Väntar på material',
  awaiting_tenant: 'Väntar på dig',
  resolved: 'Klart',
};

/**
 * Startsidan visar bara det som är aktuellt för den inloggade just nu.
 * Finns inget nytt sägs det rakt ut, i stället för att fylla sidan med kort.
 */
export function HomePage() {
  const { t } = useI18n();
  const { term, feature } = useAuth();
  const state = useQuery<HomeData>('/api/home');

  return (
    <div className="page stack stack-6">
      <QueryBoundary state={state} loadingRows={4}>
        {(data) => {
          const hasAnything =
            data.notices.length > 0 ||
            data.cases.length > 0 ||
            data.bookings.length > 0 ||
            data.nextInvoice !== null;

          return (
            <>
              <header className="stack stack-4">
                <h1 className="greeting">{t('home.greeting', { name: data.greetingName })}</h1>
                {data.home ? (
                  <Link to="/mitt-boende" className="home-address" style={{ textDecoration: 'none' }}>
                    <HomeIcon size={22} />
                    <div className="grow">
                      <div className="label">{t('home.yourHome')}</div>
                      <div className="address">
                        {data.home.property_street}, lägenhet {data.home.unit_label}
                      </div>
                      <div className="small muted">
                        {data.home.area_name} · {data.home.object_number}
                      </div>
                    </div>
                    <ChevronRight size={18} />
                  </Link>
                ) : null}
              </header>

              <section aria-labelledby="aktuellt" className="stack stack-3">
                <h2 className="section-title" id="aktuellt">
                  {t('home.current')}
                </h2>
                {hasAnything ? (
                  <div className="card card-flush">
                    {data.notices.map((notice) => (
                      <Link className="feed-item" to={`/driftinfo/${notice.id}`} key={notice.id}>
                        <span
                          className="feed-icon"
                          data-tone={
                            notice.severity === 'critical'
                              ? 'critical'
                              : notice.severity === 'important'
                                ? 'warning'
                                : 'info'
                          }
                        >
                          {OPERATIONAL_NOTICE_KINDS.includes(notice.kind as NoticeKind) ? (
                            <AlertIcon size={18} />
                          ) : (
                            <MegaphoneIcon size={18} />
                          )}
                        </span>
                        <span className="grow">
                          <span className="list-title" style={{ display: 'block' }}>
                            {notice.localized_title}
                          </span>
                          {notice.summary ? <span className="list-meta">{notice.summary}</span> : null}
                          {notice.starts_at ? (
                            <span className="list-meta" style={{ display: 'block' }}>
                              {longDate(notice.starts_at)}
                              {notice.expected_end_at ? ` ${timeRange(notice.starts_at, notice.expected_end_at)}` : ''}
                            </span>
                          ) : null}
                        </span>
                        <ChevronRight size={18} className="chevron" />
                      </Link>
                    ))}

                    {data.cases.map((item) => (
                      <Link className="feed-item" to={`/arenden/${item.id}`} key={item.id}>
                        <span className="feed-icon" data-tone={item.status === 'awaiting_tenant' ? 'warning' : undefined}>
                          <WrenchIcon size={18} />
                        </span>
                        <span className="grow">
                          <span className="list-title" style={{ display: 'block' }}>
                            {item.title}
                          </span>
                          <span className="list-meta">
                            {statusLabel[item.status] ?? item.status}
                            {item.next_visit_at ? ` · Besök ${longDate(item.next_visit_at)}` : ''}
                          </span>
                        </span>
                        <ChevronRight size={18} className="chevron" />
                      </Link>
                    ))}

                    {data.nextInvoice && feature('invoices') ? (
                      <Link className="feed-item" to="/avier" key={data.nextInvoice.id}>
                        <span className="feed-icon" data-tone={data.nextInvoice.status === 'overdue' ? 'critical' : undefined}>
                          <InvoiceIcon size={18} />
                        </span>
                        <span className="grow">
                          <span className="list-title" style={{ display: 'block' }}>
                            Nästa hyresavi förfaller {longDate(data.nextInvoice.due_date)}
                          </span>
                          <span className="list-meta">{formatAmount(data.nextInvoice.amount_ore)}</span>
                        </span>
                        <ChevronRight size={18} className="chevron" />
                      </Link>
                    ) : null}

                    {data.bookings.map((booking) => (
                      <Link className="feed-item" to="/boka" key={booking.id}>
                        <span className="feed-icon">
                          <CalendarIcon size={18} />
                        </span>
                        <span className="grow">
                          <span className="list-title" style={{ display: 'block' }}>
                            {booking.resource_name}
                          </span>
                          <span className="list-meta">
                            {longDate(booking.starts_at)} {timeRange(booking.starts_at, booking.ends_at)}
                          </span>
                        </span>
                        <ChevronRight size={18} className="chevron" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="card">
                    <p className="muted">{t('home.noNews')}</p>
                  </div>
                )}
              </section>

              {data.moveFlow && data.moveFlow.remaining > 0 ? (
                <Link to="/flytt" className="card row-between" style={{ textDecoration: 'none' }}>
                  <div>
                    <div className="strong">
                      {data.moveFlow.kind === 'move_in' ? t('moving.moveIn') : t('moving.moveOut')}
                    </div>
                    <div className="small muted">{data.moveFlow.remaining} steg kvar att göra</div>
                  </div>
                  <ChevronRight size={18} className="chevron" />
                </Link>
              ) : null}

              {data.openSurveys.length ? (
                <Link to="/enkater" className="card row-between" style={{ textDecoration: 'none' }}>
                  <div>
                    <div className="strong">{data.openSurveys[0]!.title}</div>
                    <div className="small muted">Vi vill gärna höra vad du tycker</div>
                  </div>
                  <Pill tone="info">Öppen</Pill>
                </Link>
              ) : null}

              <section aria-labelledby="snabbval" className="stack stack-3">
                <h2 className="section-title" id="snabbval">
                  {t('home.quickActions')}
                </h2>
                <div className="quick-actions">
                  <Link className="quick-action primary" to="/arenden/nytt">
                    <span className="qa-icon">
                      <WrenchIcon size={22} />
                    </span>
                    {term('case', t('home.newCase'))}
                  </Link>
                  <Link className="quick-action" to="/arenden">
                    <span className="qa-icon">
                      <WrenchIcon size={20} />
                    </span>
                    {t('home.myCases')}
                  </Link>
                  <Link className="quick-action" to="/boka">
                    <span className="qa-icon">
                      <CalendarIcon size={20} />
                    </span>
                    {t('home.book')}
                  </Link>
                  {feature('invoices') ? (
                    <Link className="quick-action" to="/avier">
                      <span className="qa-icon">
                        <InvoiceIcon size={20} />
                      </span>
                      {t('home.invoices')}
                    </Link>
                  ) : null}
                  <Link className="quick-action" to="/meddelanden">
                    <span className="qa-icon">
                      <MessageIcon size={20} />
                    </span>
                    {t('home.contact')}
                  </Link>
                  {feature('documents') ? (
                    <Link className="quick-action" to="/dokument">
                      <span className="qa-icon">
                        <DocumentIcon size={20} />
                      </span>
                      {t('home.documents')}
                    </Link>
                  ) : null}
                </div>
              </section>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
