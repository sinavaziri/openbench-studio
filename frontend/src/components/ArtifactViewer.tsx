import { useEffect, useState } from 'react';

interface ArtifactViewerProps {
  runId: string;
  artifact: string;
  onClose: () => void;
}

export default function ArtifactViewer({ runId, artifact, onClose }: ArtifactViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTextFile, setIsTextFile] = useState(true);

  useEffect(() => {
    const fetchArtifact = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/runs/${runId}/artifacts/${artifact}`);
        
        if (!response.ok) {
          throw new Error(`Failed to load artifact: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        
        // Check if it's a text file
        const textTypes = [
          'text/',
          'application/json',
          'application/xml',
          'application/javascript',
          'application/x-yaml',
        ];
        
        const isText = textTypes.some(type => contentType.includes(type)) ||
                      artifact.match(/\.(txt|log|json|xml|yaml|yml|md|csv|tsv|py|js|ts|jsx|tsx|html|css|sh|bash|eval)$/i) !== null;
        
        setIsTextFile(isText);
        
        if (isText) {
          const text = await response.text();
          setContent(text);
        } else {
          setContent('Binary file - preview not available');
          setIsTextFile(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load artifact');
      } finally {
        setLoading(false);
      }
    };

    fetchArtifact();
  }, [runId, artifact]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `/api/runs/${runId}/artifacts/${artifact}`;
    link.download = artifact.split('/').pop() || artifact;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const lineCount = content ? content.split('\n').length : 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary border border-border-secondary w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[13px] text-foreground font-mono truncate">{artifact}</span>
            {lineCount > 0 && isTextFile && (
              <span className="text-[11px] text-muted-foreground">
                {lineCount.toLocaleString()} lines
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-[11px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[11px] text-muted-foreground border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-[13px] text-muted-foreground">Loading...</div>
            </div>
          )}
          
          {error && (
            <div className="p-4">
              <div className="text-[13px] text-error bg-error-bg border border-error-border px-4 py-3">
                {error}
              </div>
            </div>
          )}
          
          {!loading && !error && (
            <>
              {isTextFile ? (
                <pre className="p-4 text-[13px] font-mono text-muted whitespace-pre-wrap break-words">
                  {content || <span className="text-muted-foreground italic">Empty file</span>}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <svg className="w-16 h-16 text-border-secondary mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-[14px] text-muted-foreground mb-2">
                    Preview not available for this file type
                  </p>
                  <p className="text-[12px] text-muted-foreground mb-4">
                    Click the download button to save the file
                  </p>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 text-[13px] text-foreground bg-background-tertiary border border-border-secondary hover:bg-border transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download File
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

