import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convert, getVersion } from './subconverter';

const BASE = 'http://localhost:25500';

describe('subconverter API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('convert() returns the response text on success', async () => {
    const fakeText = 'port: 7890\nproxy-groups:\n';
    vi.mocked(fetch).mockResolvedValue(
      new Response(fakeText, { status: 200 }) as Response,
    );
    const result = await convert(BASE, {
      target: 'clash',
      url: ['https://e.com/s'],
    });
    expect(result).toBe(fakeText);

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/sub?');
    expect(calledUrl).toContain('target=clash');
  });

  it('convert() throws on non-200 responses', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('boom', { status: 500 }) as Response,
    );
    await expect(
      convert(BASE, { target: 'clash', url: ['https://e.com/s'] }),
    ).rejects.toThrow();
  });

  it('convert() forwards a trailing slash in base URL correctly', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('ok', { status: 200 }) as Response,
    );
    await convert(`${BASE}/`, { target: 'clash', url: ['https://e.com/s'] });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toBe(`${BASE}/sub?target=clash&url=https%3A%2F%2Fe.com%2Fs`);
  });

  it('getVersion() returns parsed JSON on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ version: '0.9.0' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }) as Response,
    );
    const v = await getVersion(BASE);
    expect(v.version).toBe('0.9.0');
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/version');
  });

  it('getVersion() throws on non-200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('', { status: 404 }) as Response,
    );
    await expect(getVersion(BASE)).rejects.toThrow();
  });
});
