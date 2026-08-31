import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { relativeTime } from '../lib/format.js';
import { Button, Field, QueryBoundary, Textarea } from '../components/ui.js';
import { ChevronLeft } from '../components/icons.js';

interface ThreadDetail {
  thread: { id: string; subject: string; status: string; case_id: string | null };
  messages: { id: string; body: string; created_at: string; first_name: string | null; from_staff: boolean }[];
}

export function ThreadPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const state = useQuery<ThreadDetail>(id ? `/api/threads/${id}` : null);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  const send = async () => {
    if (!id || !body.trim()) return;
    setPending(true);
    try {
      await api.post(`/api/threads/${id}/messages`, { body: body.trim(), internal: false });
      setBody('');
      state.reload();
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page stack stack-5">
      <div className="row">
        <button type="button" className="icon-btn" onClick={() => navigate('/meddelanden')} aria-label={t('common.back')}>
          <ChevronLeft />
        </button>
        <h1 className="grow truncate" style={{ fontSize: 'var(--text-xl)' }}>
          {state.data?.thread.subject ?? t('message.title')}
        </h1>
      </div>

      <QueryBoundary state={state}>
        {(data) => (
          <>
            <div className="stack stack-3">
              {data.messages.map((message) => (
                <div
                  className="card"
                  key={message.id}
                  style={{ background: message.from_staff ? 'var(--surface-primary-soft)' : 'var(--surface-raised)' }}
                >
                  <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                    <span className="small strong">
                      {message.from_staff ? (message.first_name ?? 'Förvaltningen') : 'Du'}
                    </span>
                    <span className="xs subtle">{relativeTime(message.created_at)}</span>
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{message.body}</p>
                </div>
              ))}
            </div>

            <div className="stack stack-2">
              <Field label={t('message.reply')}>
                {({ id: fieldId }) => (
                  <Textarea id={fieldId} value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
                )}
              </Field>
              <Button variant="primary" block loading={pending} disabled={!body.trim()} onClick={() => void send()}>
                {t('common.send')}
              </Button>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
