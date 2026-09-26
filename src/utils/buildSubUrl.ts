import type { ConversionParams } from '../types';

/**
 * Build the relative request path + query string for the subconverter `/sub`
 * endpoint from structured parameters.
 *
 * - `url` entries are joined with `|` (subconverter's multi-subscription syntax).
 * - Boolean toggles are serialized to `1`/`0` and only appended when defined,
 *   so callers opt-in explicitly instead of sending `undefined`.
 *
 * @throws if `target` is empty or `url` is empty (both required by the API).
 */
export function buildSubUrl(params: ConversionParams, path = '/sub'): string {
  if (!params.target) {
    throw new Error('buildSubUrl: `target` is required');
  }
  if (!params.url || params.url.length === 0) {
    throw new Error('buildSubUrl: at least one `url` is required');
  }

  const query = new URLSearchParams();
  query.set('target', params.target);
  query.set('url', params.url.join('|'));

  if (params.config) query.set('config', params.config);
  if (params.emoji !== undefined) query.set('emoji', params.emoji ? '1' : '0');
  if (params.udp !== undefined) query.set('udp', params.udp ? '1' : '0');
  if (params.newName !== undefined) query.set('new_name', params.newName ? '1' : '0');
  if (params.appendType !== undefined) query.set('append_type', params.appendType ? '1' : '0');
  if (params.interval !== undefined) query.set('interval', String(params.interval));

  return `${path}?${query.toString()}`;
}
