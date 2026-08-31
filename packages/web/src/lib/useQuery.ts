import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api.js';

/**
 * Enkel datahämtning med de tillstånd varje flöde behöver: laddar, tomt,
 * lyckat och fel – med möjlighet att försöka igen (avsnitt 26 i kravbilden).
 */
export interface QueryState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Sant vid omladdning när data redan finns, så att sidan inte blinkar. */
  refreshing: boolean;
  reload: () => void;
  setData: (updater: (current: T | null) => T | null) => void;
}

export function useQuery<T>(path: string | null, deps: unknown[] = []): QueryState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const hasData = useRef(false);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    if (hasData.current) setRefreshing(true);
    else setLoading(true);

    api
      .get<T>(path, controller.signal)
      .then((result) => {
        setDataState(result);
        hasData.current = true;
        setError(null);
      })
      .catch((caught: unknown) => {
        if ((caught as Error).name === 'AbortError') return;
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'internal_error', 'Ett tekniskt fel uppstod.'));
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const setData = useCallback((updater: (current: T | null) => T | null) => {
    setDataState((current) => updater(current));
  }, []);

  return { data, error, loading, refreshing, reload, setData };
}

/** Hanterar ett skrivande anrop med laddningsläge och felöversättning. */
export function useMutation<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
): {
  run: (input: TInput) => Promise<TResult | null>;
  pending: boolean;
  error: ApiError | null;
  reset: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (input: TInput) => {
      setPending(true);
      setError(null);
      try {
        return await fn(input);
      } catch (caught) {
        const apiError =
          caught instanceof ApiError ? caught : new ApiError(0, 'internal_error', 'Ett tekniskt fel uppstod.');
        setError(apiError);
        return null;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending, error, reset: () => setError(null) };
}
