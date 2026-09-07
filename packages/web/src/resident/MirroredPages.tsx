import { useQuery } from '../lib/useQuery.js';
import { QueryBoundary } from '../components/ui.js';

/**
 * Innehåll speglat från bolagets webbplats (krav B.1.26).
 *
 * Texten är rensad på servern innan den sparades. Här visas den som text, och
 * källan anges så att den som vill kan läsa hela sidan på webbplatsen.
 */

interface Page {
  id: string;
  title: string;
  section: string;
  content_html: string;
  source_url: string;
  last_success_at: string | null;
}

export function MirroredPages({ section }: { section: string }) {
  const state = useQuery<{ pages: Page[] }>(`/api/pages?section=${encodeURIComponent(section)}`);

  return (
    <QueryBoundary state={state} loadingRows={2}>
      {(data) =>
        data.pages.length === 0 ? null : (
          <div className="stack stack-3">
            {data.pages.map((page) => (
              <article className="card stack stack-2" key={page.id}>
                <h2 className="section-title">{page.title}</h2>
                {/*
                  Innehållet är rensat på servern med en tillåtandelista: skript,
                  formulär och händelseattribut finns inte kvar.
                */}
                <div className="stack stack-2" dangerouslySetInnerHTML={{ __html: page.content_html }} />
                <p className="xs subtle">
                  Hämtat från{' '}
                  <a href={page.source_url} target="_blank" rel="noopener noreferrer">
                    bolagets webbplats
                  </a>
                </p>
              </article>
            ))}
          </div>
        )
      }
    </QueryBoundary>
  );
}
