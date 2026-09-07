/**
 * Rensning av hämtad HTML (krav B.1.26, C.3.8).
 *
 * Innehåll från webbplatsen visas i appen, och måste därför rensas innan det
 * sparas. Rensningen bygger på en tillåtandelista: allt som inte uttryckligen
 * är tillåtet tas bort. Skript, formulär, inbäddade ramar och alla
 * händelseattribut försvinner, liksom adresser som inte är http eller https.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
  'h2', 'h3', 'h4', 'blockquote', 'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'width', 'height']),
};

/** Element vars hela innehåll ska bort, inte bara taggarna. */
const DROP_WITH_CONTENT = ['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'form', 'svg'];

function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Läser attributen ur en starttagg. */
function parseAttributes(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const name = match[1]!.toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    attributes.set(name, value);
  }
  return attributes;
}

export interface SanitiseResult {
  html: string;
  /** Taggar som togs bort, för att kunna redovisa vad som rensades. */
  removed: string[];
}

export function sanitiseHtml(input: string, options: { baseUrl?: string } = {}): SanitiseResult {
  const removed = new Set<string>();

  // Element som ska bort med innehåll och allt.
  let working = input;
  for (const tag of DROP_WITH_CONTENT) {
    const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    if (pattern.test(working)) removed.add(tag);
    working = working.replace(pattern, '');
    // Även en ensam öppningstagg utan avslut.
    const lone = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    working = working.replace(lone, '');
  }

  // Kommentarer bär ibland villkorlig kod och tas bort.
  working = working.replace(/<!--[\s\S]*?-->/g, '');

  const output: string[] = [];
  const pattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(working)) !== null) {
    const [full, tagName, attributeText, textContent] = match;

    if (textContent !== undefined) {
      output.push(escapeText(textContent));
      continue;
    }

    const tag = tagName!.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      removed.add(tag);
      continue;
    }

    const closing = full.startsWith('</');
    if (closing) {
      output.push(`</${tag}>`);
      continue;
    }

    const allowed = ALLOWED_ATTRIBUTES[tag];
    const attributes = allowed ? parseAttributes(attributeText ?? '') : new Map<string, string>();
    const parts: string[] = [];

    for (const [name, value] of attributes) {
      if (!allowed?.has(name)) continue;
      if (name === 'href' || name === 'src') {
        const absolute = options.baseUrl ? resolve(value, options.baseUrl) : value;
        const url = absolute ? safeUrl(absolute) : null;
        if (!url) continue;
        parts.push(`${name}="${escapeText(url).replaceAll('"', '&quot;')}"`);
        continue;
      }
      parts.push(`${name}="${escapeText(value).replaceAll('"', '&quot;')}"`);
    }

    // Länkar som lämnar appen öppnas i ny flik och får inte styra oss tillbaka.
    if (tag === 'a') parts.push('rel="noopener noreferrer"', 'target="_blank"');

    const selfClosing = tag === 'br' || tag === 'img';
    output.push(`<${tag}${parts.length ? ` ${parts.join(' ')}` : ''}${selfClosing ? ' />' : '>'}`);
  }

  const html = output
    .join('')
    // Tomma stycken efter rensningen bidrar med ingenting.
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { html, removed: [...removed].sort() };
}

function resolve(value: string, baseUrl: string): string | null {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Plockar ut brödtexten ur ett helt dokument, om ett huvudelement finns. */
export function extractMain(html: string): string {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (main) return main[1]!;
  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (article) return article[1]!;
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return body ? body[1]! : html;
}
