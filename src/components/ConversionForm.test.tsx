import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversionForm } from './ConversionForm';

const TARGETS = ['clash', 'clashr', 'surge', 'v2ray', 'singbox'];

describe('ConversionForm', () => {
  it('renders target, url, config and toggle controls', () => {
    render(<ConversionForm onSubmit={vi.fn()} targets={TARGETS} />);
    expect(screen.getByLabelText(/target/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/subscription url/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/config url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/emoji/i)).toBeInTheDocument();
  });

  it('submits parsed params for a valid form (urls split by line)', () => {
    const onSubmit = vi.fn();
    render(<ConversionForm onSubmit={onSubmit} targets={TARGETS} />);

    fireEvent.change(screen.getByLabelText(/target/i), {
      target: { value: 'clash' },
    });
    fireEvent.change(screen.getByLabelText(/subscription url/i), {
      target: { value: 'https://a.com/1\nhttps://b.com/2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /convert/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'clash',
        url: ['https://a.com/1', 'https://b.com/2'],
      }),
    );
  });

  it('passes toggle values through to params', () => {
    const onSubmit = vi.fn();
    render(<ConversionForm onSubmit={onSubmit} targets={TARGETS} />);

    fireEvent.change(screen.getByLabelText(/target/i), {
      target: { value: 'surge' },
    });
    fireEvent.change(screen.getByLabelText(/subscription url/i), {
      target: { value: 'https://a.com/1' },
    });
    fireEvent.click(screen.getByLabelText(/emoji/i));
    fireEvent.click(screen.getByLabelText(/udp/i));
    fireEvent.click(screen.getByRole('button', { name: /convert/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'surge',
        emoji: true,
        udp: true,
        newName: false,
        appendType: false,
      }),
    );
  });

  it('shows a validation error and does not submit when url is empty', () => {
    const onSubmit = vi.fn();
    render(<ConversionForm onSubmit={onSubmit} targets={TARGETS} />);

    fireEvent.change(screen.getByLabelText(/target/i), {
      target: { value: 'clash' },
    });
    fireEvent.click(screen.getByRole('button', { name: /convert/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/at least one subscription url/i),
    ).toBeInTheDocument();
  });

  it('disables the submit button while submitting', () => {
    render(<ConversionForm onSubmit={vi.fn()} targets={TARGETS} disabled />);
    expect(screen.getByRole('button', { name: /convert/i })).toBeDisabled();
  });
});
