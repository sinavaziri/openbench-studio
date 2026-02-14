import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHotkeys } from '../hooks/useHotkeys';

export interface Shortcut {
  key: string;
  description: string;
  category: 'navigation' | 'actions' | 'list';
}

export const SHORTCUTS: Shortcut[] = [
  // Navigation
  { key: 'g d', description: 'Go to Dashboard (History)', category: 'navigation' },
  { key: 'g s', description: 'Go to Settings', category: 'navigation' },
  { key: 'g n', description: 'Go to New Run', category: 'navigation' },
  
  // Actions
  { key: 'n', description: 'New run', category: 'actions' },
  { key: '/', description: 'Focus search', category: 'actions' },
  { key: '?', description: 'Show keyboard shortcuts', category: 'actions' },
  { key: 'r', description: 'Refresh current view', category: 'actions' },
  { key: 'Escape', description: 'Close modal / Clear selection', category: 'actions' },
  
  // List Navigation (Dashboard)
  { key: 'j', description: 'Move down in list', category: 'list' },
  { key: 'k', description: 'Move up in list', category: 'list' },
  { key: 'Enter', description: 'Open selected run', category: 'list' },
  { key: 'd', description: 'Delete selected run', category: 'list' },
];

interface KeyboardShortcutsContextType {
  isHelpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextType | null>(null);

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
}

export function KeyboardShortcutsProvider({ children }: KeyboardShortcutsProviderProps) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);
  const toggleHelp = useCallback(() => setIsHelpOpen(prev => !prev), []);

  // Global shortcuts that work everywhere
  
  // ? - Show help
  useHotkeys('?', toggleHelp);
  
  // Escape - Close help modal
  useHotkeys('escape', () => {
    if (isHelpOpen) {
      closeHelp();
    }
  }, { enableOnInputs: true });

  // g d - Go to Dashboard (History)
  useHotkeys('g d', () => {
    if (!isHelpOpen) {
      navigate('/history');
    }
  });

  // g s - Go to Settings
  useHotkeys('g s', () => {
    if (!isHelpOpen) {
      navigate('/settings');
    }
  });

  // g n - Go to New Run
  useHotkeys('g n', () => {
    if (!isHelpOpen) {
      navigate('/');
    }
  });

  // n - New run (go to new run page)
  useHotkeys('n', () => {
    if (!isHelpOpen && location.pathname !== '/') {
      navigate('/');
    }
  });

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        isHelpOpen,
        openHelp,
        closeHelp,
        toggleHelp,
      }}
    >
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcuts() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error('useKeyboardShortcuts must be used within a KeyboardShortcutsProvider');
  }
  return context;
}
