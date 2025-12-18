import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiKeyPublic, Benchmark, RunConfig } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import RunForm from '../components/RunForm';

interface LocationState {
  prefill?: RunConfig;
}

export default function NewRun() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  
  // Get prefill from location state (from "Run Again")
  const prefillConfig = (location.state as LocationState)?.prefill;
  
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
      return;
    }
    
    if (isAuthenticated) {
      loadData();
    }
  }, [authLoading, isAuthenticated, navigate]);

  const loadData = async () => {
    try {
      const [benchmarksData, keysData] = await Promise.all([
        api.listBenchmarks(),
        api.listApiKeys(),
      ]);
      setBenchmarks(benchmarksData);
      setApiKeys(keysData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (config: RunConfig) => {
    setSubmitting(true);
    setError(null);

    try {
      const result = await api.createRun(config);
      navigate(`/runs/${result.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
      setSubmitting(false);
    }
  };

  const hasApiKeys = apiKeys.length > 0;

  return (
    <Layout>
      {/* Header */}
      <div className="mb-12">
        <Link 
          to="/"
          className="text-[13px] text-[#666] hover:text-white transition-colors mb-4 inline-block"
        >
          ← Back
        </Link>
        <h1 className="text-[28px] text-white tracking-tight">
          New Benchmark Run
        </h1>
        <p className="text-[15px] text-[#666] mt-2">
          Configure and start a new benchmark evaluation
        </p>
      </div>

      {/* API Keys Warning */}
      {!loading && !hasApiKeys && (
        <div className="mb-8 py-4 px-5 bg-[#1a1500] border border-[#3a3000]">
          <p className="text-[14px] text-[#c9a227] mb-2">
            ⚠ No API keys configured
          </p>
          <p className="text-[13px] text-[#8a7020]">
            You need to add at least one API key to run benchmarks.{' '}
            <Link to="/settings" className="text-[#c9a227] hover:underline">
              Go to Settings →
            </Link>
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-8 py-3 px-4 bg-[#1a0a0a] border border-[#3a1a1a] text-[14px] text-[#c44]">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="max-w-2xl">
        {loading || authLoading ? (
          <div className="space-y-8">
            <div className="h-6 w-32 bg-[#1a1a1a] rounded animate-pulse" />
            <div className="grid grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 bg-[#1a1a1a] rounded animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <RunForm
            benchmarks={benchmarks}
            onSubmit={handleSubmit}
            loading={submitting}
            prefill={prefillConfig}
          />
        )}
      </div>
    </Layout>
  );
}
