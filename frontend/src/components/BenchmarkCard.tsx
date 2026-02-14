import { Benchmark, BenchmarkRequirements } from '../api/client';
import { getCategoryIcon } from '../utils/categoryIcons';
import { ExternalLink, Package } from 'lucide-react';

interface BenchmarkCardProps {
  benchmark: Benchmark;
  onClick: () => void;
  isSelected?: boolean;
}

const getSourceBadge = (source?: string) => {
  if (source === 'plugin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-background-tertiary text-muted border border-border-secondary">
        <Package size={10} />
        Plugin
      </span>
    );
  }
  return null;
};

/**
 * Render requirement indicator badges for a benchmark.
 * Shows capability requirements: vision, function calling, code execution, context length.
 */
const RequirementBadges = ({ requirements }: { requirements?: BenchmarkRequirements }) => {
  if (!requirements) return null;
  
  const hasAnyRequirement = 
    requirements.vision || 
    requirements.function_calling || 
    requirements.code_execution || 
    requirements.min_context_length;
  
  if (!hasAnyRequirement) return null;
  
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {requirements.vision && (
        <span 
          className="inline-flex items-center justify-center w-6 h-6 text-sm bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 dark:border-blue-400/20 rounded"
          title="Requires vision-capable model"
        >
          📷
        </span>
      )}
      {requirements.function_calling && (
        <span 
          className="inline-flex items-center justify-center w-6 h-6 text-sm bg-purple-500/10 dark:bg-purple-400/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 dark:border-purple-400/20 rounded"
          title="Requires function calling support"
        >
          🔧
        </span>
      )}
      {requirements.code_execution && (
        <span 
          className="inline-flex items-center justify-center w-6 h-6 text-sm bg-green-500/10 dark:bg-green-400/10 text-green-600 dark:text-green-400 border border-green-500/20 dark:border-green-400/20 rounded"
          title="Requires code execution capability"
        >
          💻
        </span>
      )}
      {requirements.min_context_length && (
        <span 
          className="inline-flex items-center justify-center h-6 px-1.5 text-[10px] font-medium bg-amber-500/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 dark:border-amber-400/20 rounded"
          title={`Requires ${requirements.min_context_length.toLocaleString()}+ context length`}
        >
          {Math.round(requirements.min_context_length / 1000)}K+
        </span>
      )}
    </div>
  );
};

export default function BenchmarkCard({ benchmark, onClick, isSelected }: BenchmarkCardProps) {
  const Icon = getCategoryIcon(benchmark.category || '');
  const sourceBadge = getSourceBadge(benchmark.source);
  
  return (
    <div
      onClick={onClick}
      className={`
        p-6 space-y-4 cursor-pointer transition-colors
        bg-background-secondary 
        ${isSelected 
          ? 'border border-foreground bg-background-tertiary' 
          : 'border border-border hover:border-border-secondary'
        }
      `}
    >
      {/* Icon */}
      <div>
        <Icon size={20} className="text-muted-foreground" />
      </div>

      {/* Name and Source Badge */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] text-foreground font-medium">
          {benchmark.name}
        </h3>
        {sourceBadge}
      </div>

      {/* Metadata */}
      <div className="text-[11px] text-muted-foreground">
        {benchmark.category && (
          <>
            {benchmark.category}
            {benchmark.tags && benchmark.tags.length > 0 && ' · '}
          </>
        )}
        {benchmark.tags?.slice(0, 2).join(' · ')}
      </div>

      {/* Requirement Badges */}
      <RequirementBadges requirements={benchmark.requirements} />

      {/* Description */}
      <p className="text-[13px] text-muted line-clamp-3">
        {benchmark.description || 'No description available'}
      </p>

      {/* Documentation Link */}
      <a
        href={`https://github.com/groq/openbench/tree/main/docs/benchmarks/${benchmark.name}.md`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="
          inline-flex items-center gap-1.5 text-[11px] text-muted-foreground 
          hover:text-foreground transition-colors
        "
      >
        <ExternalLink size={12} />
        Official Docs
      </a>
    </div>
  );
}
