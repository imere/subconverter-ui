import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversion } from './useConversion';

const BASE = 'http://localhost:25500';

describe('useConversion', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts in the idle state', () => {
    const { result } = renderHook(() => useConversion(BASE));
    expect(result.current.state.status).toBe('idle');
  });

  it('transitions idle -> loading -> success with the returned content', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('port: 7890\n', { status: 200 }) as Response,
    );
    const { result } = renderHook(() => useConversion(BASE));

    await act(async () => {
      await result.current.convert({
        target: 'clash',
        url: ['https://e.com/s'],
      });
    });

    expect(result.current.state.status).toBe('success');
    if (result.current.state.status === 'success') {
      expect(result.current.state.content).toBe('port: 7890\n');
    }
  });

  it('transitions to error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('boom', { status: 500 }) as Response,
    );
    const { result } = renderHook(() => useConversion(BASE));

    await act(async () => {
      await result.current.convert({
        target: 'clash',
        url: ['https://e.com/s'],
      });
    });

    expect(result.current.state.status).toBe('error');
    if (result.current.state.status === 'error') {
      expect(result.current.state.error).toMatch(/500/);
    }
  });

  it('reset returns the state to idle', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('ok', { status: 200 }) as Response,
    );
    const { result } = renderHook(() => useConversion(BASE));

    await act(async () => {
      await result.current.convert({ target: 'clash', url: ['https://e.com/s'] });
    });
    expect(result.current.state.status).toBe('success');

    act(() => result.current.reset());
    expect(result.current.state.status).toBe('idle');
  });
});
