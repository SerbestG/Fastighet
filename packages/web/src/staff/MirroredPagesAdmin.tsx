import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatDateTime } from '../lib/format.js';
import { Banner, Button, Field, Input, Pill, QueryBoundary, Sheet } from '../components/ui.js';

/**
 * Spegling av innehåll från bolagets webbplats (krav B.1.26).
 *
 * Sidan hämtas, rensas och visas för granskning innan den publiceras. Adressen
 * måste ligga på bolagets egen webbplats – servern avvisar allt annat.
 */

interface Page {
  id: string;
  title: string;
  source_url: string;
  section: string;
  status: 'draft' | 'published' | 'error';
  removed_tags: string[];
  last_success_at: string | null;
  last_error: string | null;
  has_content: boolean;
}

const SECTIONS: Record<string, string> = {
  info: 'Allmän information',
  area: 'Området',
  moving: 'Flytt',
  support: 'Kundservice',
};

export function MirroredPagesAdmin() {
  const { can } = useAuth();
  const toast = useToast();
  const state = useQuery<{ pages: Page[] }>('/api/staff/mirrored-pages');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', sourceUrl: '', section: 'info' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [preview, setPreview] = useState<{ title: string; html: string; removed: string[] } | null>(null);

  const add = async () => {
    setPending(true);
    setError(null);
    try {
      await api.post('/api/staff/mirrored-pages', form);
      toast.show('Sidan är hämtad. Granska texten innan du publicerar.');
      setAdding(false);
      setForm({ title: '', sourceUrl: '', section: 'info' });
      state.reload();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  const open = async (page: Page) => {
    try {
      const result = await api.get<{ page: { title: string; content_html: string; removed_tags: string[] } }>(
        `/api/staff/mirrored-pages/${page.id}`,
      );
      setPreview({
        title: result.page.title,
        html: result.page.content_html,
        removed: result.page.removed_tags,
      });
    } catch (caught) {
      toast.show((caught as ApiError).message);
    }
  };

  const act = async (page: Page, action: 'publish' | 'unpublish' | 'refresh' | 'remove') => {
    try {
      if (action === 'refresh') await api.post(`/api/staff/mirrored-pages/${page.id}/refresh`, {});
      else if (action === 'remove') await api.del(`/api/staff/mirrored-pages/${page.id}`);
      else await api.patch(`/api/staff/mirrored-pages/${page.id}`, {
        status: action === 'publish' ? 'published' : 'draft',
      });
      toast.show(
        action === 'publish' ? 'Sidan visas nu i appen.'
          : action === 'unpublish' ? 'Sidan visas inte längre.'
          : action === 'refresh' ? 'Sidan är hämtad på nytt.'
          : 'Sidan är borttagen.',
      );
      state.reload();
    } catch (caught) {
      toast.show((caught as ApiError).message);
    }
  };

  return (
    <section className="stack stack-4">
      <header className="row row-between">
        <div>
          <h2 className="section-title">Speglat från webbplatsen</h2>
          <p className="small muted">
            Texten hämtas från bolagets webbplats och rensas innan den sparas. Granska innan du
            publicerar — det som visas i appen är den rensade texten, inte sidan som helhet.
          </p>
        </div>
        {can('notice:write') ? (
          <Button size="sm" onClick={() => { setAdding(true); setError(null); }}>
            Spegla en sida
          </Button>
        ) : null}
      </header>

      <QueryBoundary state={state} loadingRows={2}>
        {(data) =>
          data.pages.length === 0 ? (
            <div className="card">
              <p className="small muted">Ingen sida speglas ännu.</p>
            </div>
          ) : (
            <div className="card card-flush">
              {data.pages.map((page) => (
                <div className="integration-row" key={page.id}>
                  <div className="grow">
                    <div className="strong">{page.title}</div>
                    <div className="small muted">
                      {SECTIONS[page.section] ?? page.section} · {page.source_url}
                    </div>
                    <div className="xs subtle">
                      {page.last_success_at
                        ? `Hämtad ${formatDateTime(page.last_success_at)}`
                        : 'Aldrig hämtad'}
                      {page.removed_tags.length
                        ? ` · rensade bort ${page.removed_tags.join(', ')}`
                        : ''}
                    </div>
                    {page.last_error ? (
                      <div className="xs" style={{ color: 'var(--status-critical)' }}>{page.last_error}</div>
                    ) : null}
                  </div>
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    <Pill tone={page.status === 'published' ? 'success' : page.status === 'error' ? 'critical' : 'neutral'}>
                      {page.status === 'published' ? 'Publicerad' : page.status === 'error' ? 'Fel' : 'Utkast'}
                    </Pill>
                    <Button size="sm" variant="ghost" onClick={() => void open(page)}>
                      Granska
                    </Button>
                    {can('notice:write') ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => void act(page, 'refresh')}>
                          Hämta om
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void act(page, page.status === 'published' ? 'unpublish' : 'publish')}
                        >
                          {page.status === 'published' ? 'Avpublicera' : 'Publicera'}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </QueryBoundary>

      {adding ? (
        <Sheet
          title="Spegla en sida"
          onClose={() => setAdding(false)}
          footer={
            <Button
              variant="primary"
              block
              loading={pending}
              disabled={!form.title || !form.sourceUrl}
              onClick={() => void add()}
            >
              Hämta och granska
            </Button>
          }
        >
          <div className="stack stack-4">
            {error ? <Banner tone="critical" title={error.message} /> : null}
            <Field label="Rubrik i appen">
              {({ id }) => (
                <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              )}
            </Field>
            <Field label="Adress" hint="Måste ligga på bolagets egen webbplats och använda https.">
              {({ id }) => (
                <Input
                  id={id}
                  inputMode="url"
                  placeholder="https://…"
                  value={form.sourceUrl}
                  onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                />
              )}
            </Field>
            <Field label="Var i appen">
              {({ id }) => (
                <select
                  className="select"
                  id={id}
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                >
                  {Object.entries(SECTIONS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </Sheet>
      ) : null}

      {preview ? (
        <Sheet title={preview.title} onClose={() => setPreview(null)}>
          <div className="stack stack-3">
            {preview.removed.length ? (
              <Banner tone="info" title="Detta rensades bort">
                <p className="small">{preview.removed.join(', ')}</p>
              </Banner>
            ) : null}
            <div className="card stack stack-2" dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}
