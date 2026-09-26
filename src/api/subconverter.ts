import type { ConversionParams, VersionInfo } from '../types';
import { buildSubUrl } from '../utils/buildSubUrl';

/** Normalize a base URL so it has no trailing slash before appending a path. */
function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Convert a subscription via the subconverter `/sub` endpoint.
 * Returns the raw converted configuration text (e.g. a Clash YAML document).
 *
 * @throws on non-2xx responses, surfacing the HTTP status for diagnostics.
 */
export async function convert(baseUrl: string, params: ConversionParams): Promise<string> {
  const url = `${normalizeBase(baseUrl)}${buildSubUrl(params)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`subconverter /sub failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/**
 * Fetch engine metadata from the subconverter `/version` endpoint.
 *
 * @throws on non-2xx responses.
 */
export async function getVersion(baseUrl: string): Promise<VersionInfo> {
  const res = await fetch(`${normalizeBase(baseUrl)}/version`);
  if (!res.ok) {
    throw new Error(`subconverter /version failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as VersionInfo;
}
