/**
 * API-klient.
 *
 * Klienten håller reda på åtkomsttoken, förnyar den automatiskt när den gått ut
 * och översätter felsvar till ett objekt som gränssnittet kan visa – med
 * fältfel vid rätt fält och ett spårnings-ID som användaren kan uppge vid
 * kontakt med supporten.
 */

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues: FieldIssue[];
  readonly traceId?: string;

  constructor(status: number, code: string, message: string, issues: FieldIssue[] = [], traceId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.traceId = traceId;
  }

  /** Fältfel uppslagna på fältnamn, för att visas vid rätt inmatning. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const issue of this.issues) out[issue.path] = issue.message;
    return out;
  }
}

const ACCESS_KEY = 'hemvist.access';
const REFRESH_KEY = 'hemvist.refresh';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

function readTokens(): Tokens | null {
  try {
    const accessToken = sessionStorage.getItem(ACCESS_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  } catch {
    return null;
  }
}

export function storeTokens(tokens: Tokens | null): void {
  try {
    if (!tokens) {
      sessionStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      return;
    }
    // Åtkomsttoken ligger i sessionStorage och försvinner när fliken stängs.
    sessionStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  } catch {
    // Privat läge kan blockera lagring; sessionen lever då bara i minnet.
  }
}

export function hasSession(): boolean {
  return readTokens() !== null;
}

type Listener = () => void;
const sessionEndedListeners = new Set<Listener>();

export function onSessionEnded(listener: Listener): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

function endSession(): void {
  storeTokens(null);
  for (const listener of sessionEndedListeners) listener();
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const tokens = readTokens();
  if (!tokens) return false;
  // Flera samtidiga anrop ska bara utlösa en förnyelse.
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as Tokens;
      storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Anrop som inte kräver inloggning, t.ex. inloggningssidan. */
  anonymous?: boolean;
  raw?: boolean;
}

async function parseError(response: Response): Promise<ApiError> {
  let code = 'internal_error';
  let message = 'Ett tekniskt fel uppstod.';
  let issues: FieldIssue[] = [];
  let traceId: string | undefined = response.headers.get('x-trace-id') ?? undefined;
  try {
    const data = (await response.json()) as {
      error?: { code?: string; message?: string; issues?: FieldIssue[]; traceId?: string };
    };
    if (data.error) {
      code = data.error.code ?? code;
      message = data.error.message ?? message;
      issues = data.error.issues ?? [];
      traceId = data.error.traceId ?? traceId;
    }
  } catch {
    if (response.status === 404) message = 'Informationen hittades inte.';
  }
  return new ApiError(response.status, code, message, issues, traceId);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (!options.anonymous) {
      const tokens = readTokens();
      if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
    }
    return fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  };

  let response: Response;
  try {
    response = await send();
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', 'Ingen kontakt med tjänsten. Kontrollera din uppkoppling.');
  }

  // En utgången åtkomsttoken förnyas en gång och anropet görs om.
  if (response.status === 401 && !options.anonymous) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await send();
    } else {
      endSession();
    }
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  if (options.raw) return (await response.text()) as unknown as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  anonymous: {
    get: <T>(path: string) => request<T>(path, { anonymous: true }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body, anonymous: true }),
  },
};

/** Filuppladdning använder multipart och sätter därför inte content-type själv. */
export async function uploadFiles(files: File[]): Promise<{ id: string; originalName: string; mimeType: string; sizeBytes: number }[]> {
  const form = new FormData();
  for (const file of files) form.append('file', file);
  const tokens = readTokens();
  const response = await fetch('/api/files', {
    method: 'POST',
    headers: tokens ? { authorization: `Bearer ${tokens.accessToken}` } : {},
    body: form,
  });
  if (!response.ok) throw await parseError(response);
  const data = (await response.json()) as { files: { id: string; originalName: string; mimeType: string; sizeBytes: number }[] };
  return data.files;
}

/** Hämtar en skyddad fil och öppnar den. Åtkomsten kontrolleras av servern. */
export async function openProtectedFile(fileId: string, filename: string): Promise<void> {
  const tokens = readTokens();
  const response = await fetch(`/api/files/${fileId}`, {
    headers: tokens ? { authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!response.ok) throw await parseError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
