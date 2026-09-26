import { useState, type FormEvent } from 'react';
import type { ConversionParams } from '../types';

export interface ConversionFormProps {
  /** Available output targets for the dropdown. */
  targets: string[];
  /** Called with parsed params when the form is valid. */
  onSubmit: (params: ConversionParams) => void;
  /** Disable all controls (e.g. while a request is in flight). */
  disabled?: boolean;
}

export function ConversionForm({ targets, onSubmit, disabled = false }: ConversionFormProps) {
  const [target, setTarget] = useState(targets[0] ?? 'clash');
  const [urlText, setUrlText] = useState('');
  const [config, setConfig] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [udp, setUdp] = useState(false);
  const [newName, setNewName] = useState(false);
  const [appendType, setAppendType] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const url = urlText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (url.length === 0) {
      setError('At least one subscription URL is required.');
      return;
    }
    setError(null);

    const params: ConversionParams = {
      target,
      url,
      emoji,
      udp,
      newName,
      appendType,
    };
    if (config.trim()) params.config = config.trim();

    onSubmit(params);
  }

  return (
    <form className="conversion-form" onSubmit={handleSubmit}>
      <label>
        <span>Target</span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={disabled}
          aria-label="Target"
        >
          {targets.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Subscription URL (one per line)</span>
        <textarea
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          rows={4}
          placeholder="https://example.com/subscribe/abc"
          disabled={disabled}
          aria-label="Subscription URL"
        />
      </label>

      <label>
        <span>Config URL (optional)</span>
        <input
          type="text"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          placeholder="https://example.com/config.yaml"
          disabled={disabled}
          aria-label="Config URL"
        />
      </label>

      <fieldset className="toggles" disabled={disabled}>
        <legend>Options</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={emoji}
            onChange={(e) => setEmoji(e.target.checked)}
            aria-label="Emoji"
          />
          <span>Emoji</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={udp}
            onChange={(e) => setUdp(e.target.checked)}
            aria-label="UDP"
          />
          <span>UDP</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={newName}
            onChange={(e) => setNewName(e.target.checked)}
            aria-label="New name"
          />
          <span>New name</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={appendType}
            onChange={(e) => setAppendType(e.target.checked)}
            aria-label="Append type"
          />
          <span>Append type</span>
        </label>
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={disabled}>
        Convert
      </button>
    </form>
  );
}
