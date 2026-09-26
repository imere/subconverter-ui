import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultViewer } from './ResultViewer';

describe('ResultViewer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'navigator',
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the converted content', () => {
    render(<ResultViewer content={'port: 7890\nproxy-groups:'} />);
    expect(screen.getByText(/port: 7890/)).toBeInTheDocument();
  });

  it('copy button writes the content to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'navigator',
      Object.assign(navigator, { clipboard: { writeText } }),
    );
    render(<ResultViewer content={'hello-world'} />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith('hello-world');
  });

  it('download creates a blob and triggers an anchor click with the right filename', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const origCreate = document.createElement.bind(document);
    const clickSpy = vi.fn();
    const createSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation(((tag: string) => {
        const el = origCreate(tag);
        if (tag === 'a') {
          (el as HTMLAnchorElement).click = clickSpy;
        }
        return el;
      }) as typeof document.createElement);

    render(<ResultViewer content={'x: 1'} filename="out.yaml" />);
    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    createSpy.mockRestore();
  });
});
