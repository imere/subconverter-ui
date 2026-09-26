import { useCallback, useState } from 'react';
import { convert } from '../api/subconverter';
import type { ConversionParams, ConversionState } from '../types';

/**
 * State-machine hook wrapping a subconverter conversion request.
 *
 * The state flows: `idle` -> `loading` -> `success` | `error`, and can be
 * returned to `idle` via `reset()`.
 */
export function useConversion(baseUrl = '') {
  const [state, setState] = useState<ConversionState>({ status: 'idle' });

  const run = useCallback(
    async (params: ConversionParams) => {
      setState({ status: 'loading' });
      try {
        const content = await convert(baseUrl, params);
        setState({ status: 'success', content });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: 'error', error: message });
      }
    },
    [baseUrl],
  );

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { state, convert: run, reset };
}
