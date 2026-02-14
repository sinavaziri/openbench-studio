import { useEffect, useRef } from 'react';
import { useKeyboardShortcuts, SHORTCUTS, Shortcut } from '../context/KeyboardShortcutsContext';

function KeyboardKey({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-background-tertiary border border-border-secondary rounded text-[12px] text-muted font-mono">
      {children}
    </kbd>
  );
}

function ShortcutDisplay({ shortcut }: { shortcut: string }) {
  // Handle special display cases
  const displayKey = (key: string) => {
    switch (key.toLowerCase()) {
      case 'escape':
        return 'Esc';
      case 'enter':
        return '↵';
      case 'ctrl':
        return '⌃';
      case 'alt':
        return '⌥';
      case 'shift':
        return '⇧';
      case 'meta':
      case 'cmd':
      case 'command':
        return '⌘';
      default:
        return key.toUpperCase();
    }
  };

  // Check if it's a sequence (space-separated)
  const isSequence = shortcut.includes(' ') && !shortcut.includes('+');
  
  if (isSequence) {
    const parts = shortcut.split(' ');
    return (
      <div className="flex items-center gap-1">
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <KeyboardKey>{displayKey(part)}</KeyboardKey>
            {i < parts.length - 1 && <span className="text-muted-foreground text-[11px]">then</span>}
          </span>
        ))}
      </div>
    );
  }

  // Check if it's a combination (plus-separated)
  if (shortcut.includes('+')) {
    const parts = shortcut.split('+');
    return (
      <div className="flex items-center gap-0.5">
        {parts.map((part, i) => (
          <span key={i} className="flex items-center">
            <KeyboardKey>{displayKey(part)}</KeyboardKey>
            {i < parts.length - 1 && <span className="text-muted-foreground mx-0.5">+</span>}
          </span>
        ))}
      </div>
    );
  }

  // Single key
  return <KeyboardKey>{displayKey(shortcut)}</KeyboardKey>;
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-[14px] text-muted">{shortcut.description}</span>
      <ShortcutDisplay shortcut={shortcut.key} />
    </div>
  );
}

function ShortcutSection({ 
  title, 
  shortcuts 
}: { 
  title: string; 
  shortcuts: Shortcut[];
}) {
  return (
    <div className="mb-8 last:mb-0">
      <h3 className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-3">
        {title}
      </h3>
      <div className="bg-background border border-border px-4">
        {shortcuts.map((shortcut) => (
          <ShortcutRow key={shortcut.key} shortcut={shortcut} />
        ))}
      </div>
    </div>
  );
}

export default function KeyboardShortcutsModal() {
  const { isHelpOpen, closeHelp } = useKeyboardShortcuts();
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        closeHelp();
      }
    }

    if (isHelpOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isHelpOpen, closeHelp]);

  if (!isHelpOpen) return null;

  const navigationShortcuts = SHORTCUTS.filter(s => s.category === 'navigation');
  const actionShortcuts = SHORTCUTS.filter(s => s.category === 'actions');
  const listShortcuts = SHORTCUTS.filter(s => s.category === 'list');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-background-secondary border border-border-secondary max-w-lg w-full max-h-[80vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="text-[18px] text-foreground tracking-tight">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={closeHelp}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <ShortcutSection title="Navigation" shortcuts={navigationShortcuts} />
          <ShortcutSection title="Actions" shortcuts={actionShortcuts} />
          <ShortcutSection title="List Navigation (Dashboard)" shortcuts={listShortcuts} />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border text-center">
          <p className="text-[12px] text-muted-foreground">
            Press <KeyboardKey>Esc</KeyboardKey> or <KeyboardKey>?</KeyboardKey> to close
          </p>
        </div>
      </div>
    </div>
  );
}
