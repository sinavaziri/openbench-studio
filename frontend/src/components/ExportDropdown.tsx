import { useState, useRef, useEffect } from 'react';

interface ExportOption {
  label: string;
  format: 'csv' | 'json';
  onClick: () => void;
}

interface ExportDropdownProps {
  options: ExportOption[];
  disabled?: boolean;
  label?: string;
  className?: string;
}

export default function ExportDropdown({
  options,
  disabled = false,
  label = 'Export',
  className = '',
}: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleOptionClick = (option: ExportOption) => {
    option.onClick();
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-2 text-[13px] border transition-colors ${
          disabled
            ? 'text-[#444] border-[#1a1a1a] cursor-not-allowed'
            : 'text-[#888] border-[#222] hover:border-[#444] hover:text-white'
        }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        {label}
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 py-1 bg-[#111] border border-[#222] shadow-lg z-50 min-w-[140px]">
          {options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleOptionClick(option)}
              className="w-full px-4 py-2 text-left text-[13px] text-[#888] hover:text-white hover:bg-[#1a1a1a] transition-colors flex items-center gap-3"
            >
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  option.format === 'csv'
                    ? 'bg-[#1a2a1a] text-[#6a8]'
                    : 'bg-[#1a1a2a] text-[#68a]'
                }`}
              >
                {option.format.toUpperCase()}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
