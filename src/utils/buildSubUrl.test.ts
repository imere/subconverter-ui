import { describe, it, expect } from 'vitest';
import type { ConversionParams } from '../types';
import { buildSubUrl } from './buildSubUrl';

const base: ConversionParams = {
  target: 'clash',
  url: ['https://example.com/sub1'],
};

describe('buildSubUrl', () => {
  it('builds /sub with target and a single url (URL-encoded)', () => {
    const url = buildSubUrl(base);
    const parsed = new URL(`http://localhost${url}`);
    expect(parsed.pathname).toBe('/sub');
    expect(parsed.searchParams.get('target')).toBe('clash');
    expect(parsed.searchParams.get('url')).toBe('https://example.com/sub1');
  });

  it('joins multiple subscription urls with |', () => {
    const url = buildSubUrl({
      ...base,
      url: ['https://a.com/x', 'https://b.com/y'],
    });
    const parsed = new URL(`http://localhost${url}`);
    expect(parsed.searchParams.get('url')).toBe('https://a.com/x|https://b.com/y');
  });

  it('omits config when not provided', () => {
    const url = buildSubUrl(base);
    expect(new URL(`http://localhost${url}`).searchParams.has('config')).toBe(false);
  });

  it('includes config when provided', () => {
    const url = buildSubUrl({
      ...base,
      config: 'https://example.com/config',
    });
    const parsed = new URL(`http://localhost${url}`);
    expect(parsed.searchParams.get('config')).toBe('https://example.com/config');
  });

  it('encodes boolean flags as 1/0', () => {
    const url = buildSubUrl({
      ...base,
      emoji: true,
      udp: false,
      newName: true,
      appendType: false,
    });
    const p = new URL(`http://localhost${url}`).searchParams;
    expect(p.get('emoji')).toBe('1');
    expect(p.get('udp')).toBe('0');
    expect(p.get('new_name')).toBe('1');
    expect(p.get('append_type')).toBe('0');
  });

  it('includes interval as a stringified number', () => {
    const url = buildSubUrl({ ...base, interval: 3600 });
    expect(new URL(`http://localhost${url}`).searchParams.get('interval')).toBe('3600');
  });

  it('throws when target is missing', () => {
    expect(() => buildSubUrl({ ...base, target: '' })).toThrow();
  });

  it('throws when url list is empty', () => {
    expect(() => buildSubUrl({ ...base, url: [] })).toThrow();
  });

  it('honors a custom base path', () => {
    const url = buildSubUrl(base, '/api/sub');
    expect(new URL(`http://localhost${url}`).pathname).toBe('/api/sub');
  });
});
