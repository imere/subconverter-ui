import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the title and the conversion form', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText('Subconverter WebUI')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /convert/i }),
    ).toBeInTheDocument();
  });
});
