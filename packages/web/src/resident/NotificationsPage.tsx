import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { relativeTime } from '../lib/format.js';
import { Button, EmptyState, QueryBoundary } from '../components/ui.js';
import { BellIcon, ChevronLeft } from '../components/icons.js';

interface Notification {
  id: string;
  topic: string;
  title: string;
  body: string;
  link_route: string | null;
  link_id: string | null;
  created_at: string;
  read_at: string | null;
}

const ROUTES: Record<string, (id: string | null) => string> = {
  case: (id) => (id ? `/arenden/${id}` : '/arenden'),
  notice: (id) => (id ? `/driftinfo/${id}` : '/driftinfo'),
  thread: (id) => (id ? `/meddelanden/${id}` : '/meddelanden'),
  booking: () => '/boka',
  bookings: () => '/boka',
  moving: () => '/flytt',
  survey: () => '/enkater',
  broadcast: () => '/driftinfo',
};

/** Varje notis leder till rätt sida och rätt objekt. */
export function NotificationsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const state = useQuery<{ notifications: Notification[]; unreadCount: number }>('/api/me/notifications');

  const open = async (notification: Notification) => {
    if (!notification.read_at) {
      await api.post(`/api/me/notifications/${notification.id}/read`, {}).catch(() => undefined);
    }
    const resolver = notification.link_route ? ROUTES[notification.link_route] : undefined;
    navigate(resolver ? resolver(notification.link_id) : '/');
  };

  const markAll = async () => {
    await api.post('/api/me/notifications/read-all', {}).catch(() => undefined);
    state.reload();
  };

  return (
    <div className="page stack stack-5">
      <div className="row-between">
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <ChevronLeft />
          </button>
          <h1 style={{ fontSize: 'var(--text-xl)' }}>{t('profile.notifications')}</h1>
        </div>
        {(state.data?.unreadCount ?? 0) > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => void markAll()}>
            Markera alla som lästa
          </Button>
        ) : null}
      </div>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.notifications.length === 0,
          render: <EmptyState icon={<BellIcon size={24} />} title="Inga notiser" body="Här samlas det vi meddelar dig." />,
        }}
      >
        {(data) => (
          <div className="card card-flush">
            {data.notifications.map((notification) => (
              <button
                type="button"
                className="list-item"
                key={notification.id}
                onClick={() => void open(notification)}
                style={{ background: notification.read_at ? undefined : 'var(--surface-primary-soft)' }}
              >
                <span className="grow stack stack-1">
                  <span className="list-title">{notification.title}</span>
                  <span className="list-meta clamp-2">{notification.body}</span>
                  <span className="xs subtle">{relativeTime(notification.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
