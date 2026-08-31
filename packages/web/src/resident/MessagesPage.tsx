import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { relativeTime } from '../lib/format.js';
import { Button, EmptyState, Field, Input, QueryBoundary, Sheet, Textarea } from '../components/ui.js';
import { ChevronRight, MessageIcon, PlusIcon } from '../components/icons.js';

interface Thread {
  id: string;
  subject: string;
  status: string;
  last_message_at: string;
  last_message: string | null;
  unread: number;
  case_number: string | null;
}

export function MessagesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const state = useQuery<{ threads: Thread[] }>('/api/threads');
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ threadId: string }>('/api/threads', { subject, body });
      toast.show('Meddelandet är skickat.');
      setOpen(false);
      setSubject('');
      setBody('');
      navigate(`/meddelanden/${result.threadId}`);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page stack stack-5">
      <header className="page-header row-between">
        <h1>{t('message.title')}</h1>
        <Button variant="primary" size="sm" icon={<PlusIcon size={16} />} onClick={() => setOpen(true)}>
          {t('message.new')}
        </Button>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.threads.length === 0,
          render: (
            <EmptyState
              icon={<MessageIcon size={24} />}
              title={t('message.noneTitle')}
              body={t('message.noneBody')}
              action={
                <Button variant="primary" onClick={() => setOpen(true)}>
                  {t('message.new')}
                </Button>
              }
            />
          ),
        }}
      >
        {(data) => (
          <div className="card card-flush">
            {data.threads.map((thread) => (
              <Link className="list-item" to={`/meddelanden/${thread.id}`} key={thread.id}>
                <span className="grow stack stack-1">
                  <span className="list-title">{thread.subject}</span>
                  {thread.last_message ? <span className="list-meta clamp-2">{thread.last_message}</span> : null}
                  <span className="xs subtle">
                    {relativeTime(thread.last_message_at)}
                    {thread.case_number ? ` · Ärende ${thread.case_number}` : ''}
                  </span>
                </span>
                {thread.unread > 0 ? <span className="tag">{thread.unread} nya</span> : null}
                <ChevronRight size={18} className="chevron" />
              </Link>
            ))}
          </div>
        )}
      </QueryBoundary>

      {open ? (
        <Sheet
          title={t('message.new')}
          onClose={() => setOpen(false)}
          footer={
            <Button variant="primary" block loading={pending} disabled={!subject.trim() || !body.trim()} onClick={() => void create()}>
              {t('common.send')}
            </Button>
          }
        >
          <div className="stack stack-4">
            <Field label={t('message.subject')} error={error?.fieldErrors.subject}>
              {({ id }) => <Input id={id} value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} />}
            </Field>
            <Field label={t('message.body')} error={error?.fieldErrors.body}>
              {({ id }) => <Textarea id={id} value={body} onChange={(event) => setBody(event.target.value)} rows={5} />}
            </Field>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
