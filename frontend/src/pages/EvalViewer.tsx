import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

interface Score {
  value: number | null;
  name: string;
  explanation?: string;
}

interface Sample {
  id: string | number;
  epoch: number;
  input: string | null;
  target: string | null;
  output: string | null;
  score: Score | null;
  error: string | null;
}

interface Metric {
  value: number | null;
  name: string;
  reducer?: string;
}

interface EvalData {
  status: string;
  eval_name: string;
  model: string;
  dataset: string | null;
  created: string | null;
  completed: string | null;
  total_samples: number;
  metrics: Record<string, Metric>;
  samples: Sample[];
  config: {
    limit: number | null;
    epochs: number | null;
  };
}

export default function EvalViewer() {
  const { id, '*': evalPath } = useParams<{ id: string; '*': string }>();
  const navigate = useNavigate();
  const [evalData, setEvalData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSample, setExpandedSample] = useState<string | number | null>(null);

  useEffect(() => {
    if (!id || !evalPath) return;

    const fetchEvalData = async () => {
      try {
        const response = await fetch(`/api/runs/${id}/eval-data/${evalPath}`);
        if (!response.ok) {
          throw new Error(`Failed to load eval data: ${response.status}`);
        }
        const data = await response.json();
        setEvalData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load eval data');
      } finally {
        setLoading(false);
      }
    };

    fetchEvalData();
  }, [id, evalPath]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-16">
          <div className="text-[15px] text-muted-foreground">Loading evaluation data...</div>
        </div>
      </Layout>
    );
  }

  if (error || !evalData) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-[15px] text-muted mb-4">{error || 'Failed to load evaluation'}</p>
          <button
            onClick={() => navigate(`/runs/${id}`)}
            className="text-[14px] text-foreground hover:opacity-70 transition-opacity"
          >
            ← Back to Run
          </button>
        </div>
      </Layout>
    );
  }

  // Show all samples
  const filteredSamples = evalData.samples;

  // Calculate pass rate
  const samplesWithScores = evalData.samples.filter(s => s.score && s.score.value !== null);
  const passedSamples = samplesWithScores.filter(s => s.score && s.score.value! > 0);
  const passRate = samplesWithScores.length > 0 
    ? ((passedSamples.length / samplesWithScores.length) * 100).toFixed(1)
    : '0.0';

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8">
        <Link
          to={`/runs/${id}`}
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-4 inline-block"
        >
          ← Back to Run
        </Link>
        <h1 className="text-[28px] text-foreground tracking-tight mb-2">
          Evaluation Results
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {evalData.eval_name} • {evalData.model}
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-4 gap-6 mb-12">
        {/* Total Samples */}
        <div className="bg-background-secondary border border-border p-6">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
            Total Samples
          </p>
          <p className="text-[32px] text-foreground font-light">
            {evalData.total_samples}
          </p>
        </div>

        {/* Pass Rate */}
        <div className="bg-background-secondary border border-border p-6">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
            Pass Rate
          </p>
          <p className="text-[32px] text-foreground font-light">
            {passRate}%
          </p>
          <p className="text-[12px] text-muted-foreground mt-1">
            {passedSamples.length} / {samplesWithScores.length}
          </p>
        </div>

        {/* Primary Metrics */}
        {Object.entries(evalData.metrics).slice(0, 2).map(([key, metric]) => (
          <div key={key} className="bg-background-secondary border border-border p-6">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
              {metric.name}
            </p>
            <p className="text-[32px] text-foreground font-light">
              {metric.value !== null ? metric.value.toFixed(3) : 'N/A'}
            </p>
          </div>
        ))}
      </div>

      {/* Samples Section */}
      <div className="mb-12">
        <div className="mb-6">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
            Samples ({filteredSamples.length})
          </p>
        </div>

        {/* Samples List */}
        <div className="space-y-3">
          {filteredSamples.map((sample) => {
            const isExpanded = expandedSample === sample.id;
            const passed = sample.score && sample.score.value !== null && sample.score.value > 0;
            const failed = sample.score && sample.score.value !== null && sample.score.value === 0;

            return (
              <div
                key={sample.id}
                className="bg-background-secondary border border-border overflow-hidden"
              >
                {/* Sample Header */}
                <button
                  onClick={() => setExpandedSample(isExpanded ? null : sample.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-background-tertiary transition-colors text-left"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <span className="text-[13px] text-muted-foreground font-mono">
                      Sample {sample.id}
                    </span>
                    {sample.input && (
                      <span className="text-[14px] text-muted truncate max-w-md">
                        {sample.input}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {sample.score && (
                      <span
                        className={`px-3 py-1 text-[11px] uppercase tracking-wide ${
                          passed
                            ? 'bg-success-bg text-success border border-success-border'
                            : failed
                            ? 'bg-error-bg text-error border border-error-border'
                            : 'bg-background-tertiary text-muted-foreground border border-border-secondary'
                        }`}
                      >
                        {sample.score.value !== null ? sample.score.value.toFixed(2) : 'N/A'}
                      </span>
                    )}
                    <svg
                      className={`w-4 h-4 text-muted-foreground transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </button>

                {/* Expanded Sample Details */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-border pt-6 space-y-6">
                    {/* Input */}
                    {sample.input && (
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                          Input
                        </p>
                        <pre className="text-[13px] text-foreground-secondary font-mono whitespace-pre-wrap bg-background-tertiary p-4 border border-border rounded">
                          {sample.input}
                        </pre>
                      </div>
                    )}

                    {/* Output */}
                    {sample.output && (
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                          Output
                        </p>
                        <pre className="text-[13px] text-foreground-secondary font-mono whitespace-pre-wrap bg-background-tertiary p-4 border border-border rounded">
                          {sample.output}
                        </pre>
                      </div>
                    )}

                    {/* Target */}
                    {sample.target && (
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                          Expected
                        </p>
                        <pre className="text-[13px] text-foreground-secondary font-mono whitespace-pre-wrap bg-background-tertiary p-4 border border-border rounded">
                          {sample.target}
                        </pre>
                      </div>
                    )}

                    {/* Score Explanation */}
                    {sample.score?.explanation && (
                      <div>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                          Evaluation
                        </p>
                        <p className="text-[13px] text-muted leading-relaxed">
                          {sample.score.explanation}
                        </p>
                      </div>
                    )}

                    {/* Error */}
                    {sample.error && (
                      <div>
                        <p className="text-[11px] text-error uppercase tracking-[0.1em] mb-2">
                          Error
                        </p>
                        <pre className="text-[13px] text-error font-mono whitespace-pre-wrap bg-error-bg p-4 border border-error-border rounded">
                          {sample.error}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredSamples.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No samples match the selected filter
          </div>
        )}
      </div>
    </Layout>
  );
}
