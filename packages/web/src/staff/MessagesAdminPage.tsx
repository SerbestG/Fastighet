import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { relativeTime } from '../lib/format.js';
import { Button, EmptyState, Field, Pill, QueryBoundary, Tabs, Textarea } from '../components/ui.js';
import { MessageIcon } from '../components/icons.js';

interface Thread {
  id: string;
  subject: string;
  status: string;
  last_message_at: string;
  unread_for_staff: boolean;
  last_message: string | null;
  first_name: string | null;
  last_name: string | null;
  object_number: string | null;
  property_name: string | null;
  case_id: string | null;
}

interface ThreadDetail {
  thread: { id: string; subject: string; status: string };
  messages: { id: string; body: string; internal: boolean; created_at: string; first_name: string | null; from_staff: boolean }[];
}

export function MessagesAdminPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const threads = useQuery<{ threads: Thread[] }>('/api/staff/threads');
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useQuery<ThreadDetail>(selected ? `/api/threads/${selected}` : null);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<'unread' | 'all'>('unread');

  const send = async () => {
    if (!selected || !reply.trim()) return;
    setPending(true);
    try {
      await api.post(`/api/threads/${selected}/messages`, { body: reply, internal });
      setReply('');
      detail.reload();
      threads.reload();
      toast.show(internal ? 'Anteckningen är sparad.' : 'Svaret är skickat.');
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header">
        <div className="eyebrow">Kommunikation</div>
        <h1>{t('staff.messages')}</h1>
      </header>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 22rem) 1fr', alignItems: 'start' }}>
        <div className="stack stack-3">
          <Tabs
            label="Filter"
            active={tab}
            onChange={setTab}
            tabs={[
              { value: 'unread', label: 'Olästa' },
              { value: 'all', label: 'Alla' },
            ]}
          />
          <QueryBoundary
            state={threads}
            empty={{
              when: (data) => data.threads.length === 0,
              render: <EmptyState icon={<MessageIcon size={24} />} title="Inga meddelanden" />,
            }}
          >
            {(data) => {
              const list = tab === 'unread' ? data.threads.filter((thread) => thread.unread_for_staff) : data.threads;
              return list.length === 0 ? (
                <EmptyState title="Inget oläst" body="Alla meddelanden är besvarade." />
              ) : (
                <div className="card card-flush">
                  {list.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      className="list-item"
                      onClick={() => setSelected(thread.id)}
                      style={{ background: selected === thread.id ? 'var(--surface-primary-soft)' : undefined }}
                    >
                      <span className="grow stack stack-1">
                        <span className="list-title">{thread.subject}</span>
                        <span className="list-meta clamp-2">{thread.last_message}</span>
                        <span className="xs subtle">
                          {thread.first_name} {thread.last_name}
                          {thread.object_number ? ` · ${thread.object_number}` : ''} · {relativeTime(thread.last_message_at)}
                        </span>
                      </span>
                      {thread.unread_for_staff ? <Pill tone="warning">Nytt</Pill> : null}
                    </button>
                  ))}
                </div>
              );
            }}
          </QueryBoundary>
        </div>

        <div className="stack stack-4">
          {!selected ? (
            <EmptyState title="Välj en tråd" body="Meddelandet visas här." />
          ) : (
            <QueryBoundary state={detail}>
              {(data) => (
                <>
                  <h2>{data.thread.subject}</h2>
                  <div className="stack stack-3">
                    {data.messages.map((message) => (
                      <div
                        className="card"
                        key={message.id}
                        style={{
                          background: message.internal
                            ? 'var(--status-warning-soft)'
                            : message.from_staff
                              ? 'var(--surface-primary-soft)'
                              : 'var(--surface-raised)',
                          borderStyle: message.internal ? 'dashed' : 'solid',
                        }}
                      >
                        <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                          <span className="small strong">
                            {message.first_name ?? 'Okänd'}
                            {message.internal ? ' · intern' : ''}
                          </span>
                          <span className="xs subtle">{relativeTime(message.created_at)}</span>
                        </div>
                        <p style={{ whiteSpace: 'pre-wrap' }}>{message.body}</p>
                      </div>
                    ))}
                  </div>

                  {can('message:write') ? (
                    <div className="card stack stack-3">
                      <Field label={internal ? t('staff.internalNote') : t('staff.replyToTenant')}>
                        {({ id }) => <Textarea id={id} rows={4} value={reply} onChange={(event) => setReply(event.target.value)} />}
                      </Field>
                      <div className="row-between">
                        <label className="row" style={{ cursor: 'pointer' }}>
                          <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />
                          <span className="small">Intern anteckning</span>
                        </label>
                        <Button variant="primary" loading={pending} disabled={!reply.trim()} onClick={() => void send()}>
                          {t('common.send')}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </QueryBoundary>
          )}
        </div>
      </div>
    </div>
  );
}
