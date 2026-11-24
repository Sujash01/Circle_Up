import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';

type ListState<T> =
  | { status: 'loading' }
  | { status: 'ready'; items: T[] }
  | { status: 'network-error' | 'server-error' };

export function useStorefrontList<T>(load: (signal: AbortSignal) => Promise<T[]>) {
  const [state, setState] = useState<ListState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then((items) => {
      if (!controller.signal.aborted) setState({ status: 'ready', items });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const networkFailure = isAxiosError(error) && !error.response;
      setState({ status: networkFailure ? 'network-error' : 'server-error' });
    });
    return () => controller.abort();
  }, [load, attempt]);

  return {
    ...state,
    retry() {
      setState({ status: 'loading' });
      setAttempt((value) => value + 1);
    },
  };
}
