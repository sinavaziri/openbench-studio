import { Benchmark } from '../api/client';
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
