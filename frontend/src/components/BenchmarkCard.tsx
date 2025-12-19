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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-[#1a1a1a] text-[#888] border border-[#333]">
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
        bg-[#0a0a0a] 
        ${isSelected 
          ? 'border border-white bg-[#111]' 
          : 'border border-[#1a1a1a] hover:border-[#333]'
        }
      `}
    >
      {/* Icon */}
      <div>
        <Icon size={20} className="text-[#666]" />
      </div>

      {/* Name and Source Badge */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] text-white font-medium">
          {benchmark.name}
        </h3>
        {sourceBadge}
      </div>

      {/* Metadata */}
      <div className="text-[11px] text-[#666]">
        {benchmark.category && (
          <>
            {benchmark.category}
            {benchmark.tags && benchmark.tags.length > 0 && ' · '}
          </>
        )}
        {benchmark.tags?.slice(0, 2).join(' · ')}
      </div>

      {/* Description */}
      <p className="text-[13px] text-[#888] line-clamp-3">
        {benchmark.description || 'No description available'}
      </p>

      {/* Documentation Link */}
      <a
        href={`https://github.com/groq/openbench/tree/main/docs/benchmarks/${benchmark.name}.md`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="
          inline-flex items-center gap-1.5 text-[11px] text-[#666] 
          hover:text-white transition-colors
        "
      >
        <ExternalLink size={12} />
        Official Docs
      </a>
    </div>
  );
}

