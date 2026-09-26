export interface ResultViewerProps {
  /** Converted configuration text to display. */
  content: string;
  /** Suggested download filename. */
  filename?: string;
}

export function ResultViewer({ content, filename = 'config.yaml' }: ResultViewerProps) {
  async function handleCopy() {
    await navigator.clipboard.writeText(content);
  }

  function handleDownload() {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="result-viewer">
      <div className="result-toolbar">
        <button type="button" onClick={handleCopy}>
          Copy
        </button>
        <button type="button" onClick={handleDownload}>
          Download
        </button>
      </div>
      <pre className="result-content">
        <code>{content}</code>
      </pre>
    </div>
  );
}
