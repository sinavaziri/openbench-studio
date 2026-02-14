import { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Benchmark } from '../api/client';
import BenchmarkCard from './BenchmarkCard';

interface BenchmarkCatalogProps {
  benchmarks: Benchmark[];
  onBenchmarkSelect: (benchmark: Benchmark) => void;
  selectedBenchmark?: Benchmark;
}

const ITEMS_PER_PAGE = 9;

export default function BenchmarkCatalog({ 
  benchmarks, 
  onBenchmarkSelect,
  selectedBenchmark 
}: BenchmarkCatalogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(benchmarks.map(b => b.category).filter(Boolean));
    return ['all', ...Array.from(cats).sort()];
  }, [benchmarks]);

  // Filter benchmarks
  const filteredBenchmarks = useMemo(() => {
    let filtered = benchmarks;

    // Apply category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(b => b.category === selectedCategory);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(b =>
        b.name.toLowerCase().includes(query) ||
        b.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [benchmarks, selectedCategory, searchQuery]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredBenchmarks.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedBenchmarks = filteredBenchmarks.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="mb-8 sm:mb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6">
        <div>
          <h2 className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-1">
            Browse Benchmarks
          </h2>
          <p className="text-[12px] sm:text-[13px] text-muted">
            {filteredBenchmarks.length === benchmarks.length
              ? `${benchmarks.length} benchmarks`
              : `Showing ${filteredBenchmarks.length} result${filteredBenchmarks.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search benchmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="
              w-full h-12 sm:h-10 pl-10 pr-4 
              bg-background-secondary border border-border 
              text-[14px] sm:text-[13px] text-foreground placeholder-muted-foreground
              focus:border-border-secondary focus:outline-none
              transition-colors
            "
          />
        </div>

        {/* Category Filter */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="
              w-full h-12 sm:h-10 px-4 
              bg-background-secondary border border-border 
              text-[14px] sm:text-[13px] text-foreground
              focus:border-border-secondary focus:outline-none
              transition-colors
              appearance-none
              cursor-pointer
            "
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Grid */}
      {paginatedBenchmarks.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {paginatedBenchmarks.map((benchmark) => (
              <BenchmarkCard
                key={benchmark.name}
                benchmark={benchmark}
                onClick={() => onBenchmarkSelect(benchmark)}
                isSelected={selectedBenchmark?.name === benchmark.name}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border">
              {/* Previous Button */}
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className={`
                  flex items-center justify-center gap-2 text-[13px] transition-colors min-h-[44px] min-w-[100px]
                  ${currentPage === 1 
                    ? 'text-muted-foreground cursor-not-allowed' 
                    : 'text-foreground hover:text-foreground-secondary cursor-pointer'
                  }
                `}
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              {/* Page Indicator */}
              <div className="text-[12px] sm:text-[13px] text-muted text-center order-first sm:order-none">
                <span className="block sm:inline">Page {currentPage} of {totalPages}</span>
                <span className="text-muted-foreground mx-2 hidden sm:inline">·</span>
                <span className="block sm:inline text-muted-foreground">
                  {startIndex + 1}-{Math.min(endIndex, filteredBenchmarks.length)} of {filteredBenchmarks.length}
                </span>
              </div>

              {/* Next Button */}
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className={`
                  flex items-center justify-center gap-2 text-[13px] transition-colors min-h-[44px] min-w-[100px]
                  ${currentPage === totalPages
                    ? 'text-muted-foreground cursor-not-allowed'
                    : 'text-foreground hover:text-foreground-secondary cursor-pointer'
                  }
                `}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 sm:py-16">
          <p className="text-[14px] text-muted-foreground">
            No benchmarks found
          </p>
          {(searchQuery || selectedCategory !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-4 text-[13px] text-foreground hover:text-foreground-secondary transition-colors min-h-[44px] inline-flex items-center"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
