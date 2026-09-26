import { useEffect, useState } from 'react';
import { ConversionForm } from './components/ConversionForm';
import { ResultViewer } from './components/ResultViewer';
import { useConversion } from './hooks/useConversion';
import { getVersion } from './api/subconverter';
import type { VersionInfo } from './types';

const TARGETS = [
  'clash',
  'clashr',
  'surge',
  'surfboard',
  'quan',
  'quanx',
  'loon',
  'ss',
  'ssr',
  'v2ray',
  'singbox',
  'mixed',
];

export default function App() {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const { state, convert, reset } = useConversion('');

  useEffect(() => {
    let active = true;
    getVersion('')
      .then((v) => active && setVersion(v))
      .catch((e) => active && setVersionError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, []);

  const statusText = version
    ? `engine v${version.version}`
    : versionError
      ? 'engine unreachable'
      : 'checking engine…';
  const statusClass = version ? 'ok' : versionError ? 'err' : 'pending';

  return (
    <main className="app">
      <header className="app-header">
        <h1>Subconverter WebUI</h1>
        <span className={`status ${statusClass}`}>{statusText}</span>
      </header>

      <section className="panel">
        <h2>Convert subscription</h2>
        <ConversionForm
          targets={TARGETS}
          onSubmit={convert}
          disabled={state.status === 'loading'}
        />
      </section>

      {state.status === 'loading' && <p className="hint">Converting…</p>}

      {state.status === 'error' && (
        <div className="result-error" role="alert">
          <p>Conversion failed: {state.error}</p>
          <button type="button" onClick={reset}>
            Dismiss
          </button>
        </div>
      )}

      {state.status === 'success' && (
        <section className="panel">
          <h2>Result</h2>
          <ResultViewer content={state.content} filename="config.yaml" />
        </section>
      )}
    </main>
  );
}
