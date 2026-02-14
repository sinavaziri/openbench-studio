import { useEffect, useCallback, useRef } from 'react';

type HotkeyCallback = (event: KeyboardEvent) => void;

interface HotkeyOptions {
  enabled?: boolean;
  // If true, the hotkey works even when an input element is focused
  enableOnInputs?: boolean;
  // If true, prevents default browser behavior
  preventDefault?: boolean;
}

const defaultOptions: HotkeyOptions = {
  enabled: true,
  enableOnInputs: false,
  preventDefault: true,
};

/**
 * Check if the current focus is on an input element
 */
function isInputElement(element: Element | null): boolean {
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    (element as HTMLElement).isContentEditable
  );
}

/**
 * Parse a hotkey string into its components
 * Examples: "n", "shift+n", "ctrl+shift+k", "g d" (sequence)
 */
function parseHotkey(hotkey: string): {
  sequence: Array<{
    key: string;
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  }>;
} {
  const parts = hotkey.toLowerCase().split(' ').filter(Boolean);
  
  return {
    sequence: parts.map(part => {
      const keys = part.split('+');
      const key = keys[keys.length - 1];
      return {
        key,
        ctrl: keys.includes('ctrl') || keys.includes('control'),
        alt: keys.includes('alt'),
        shift: keys.includes('shift'),
        meta: keys.includes('meta') || keys.includes('cmd') || keys.includes('command'),
      };
    }),
  };
}

/**
 * Check if an event matches a key definition
 */
function matchesKey(
  event: KeyboardEvent,
  keyDef: { key: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }
): boolean {
  const eventKey = event.key.toLowerCase();
  
  // Handle special keys
  const keyMatches = 
    eventKey === keyDef.key ||
    (keyDef.key === 'escape' && eventKey === 'escape') ||
    (keyDef.key === 'esc' && eventKey === 'escape') ||
    (keyDef.key === 'enter' && eventKey === 'enter') ||
    (keyDef.key === '/' && eventKey === '/') ||
    (keyDef.key === '?' && event.shiftKey && eventKey === '/');

  return (
    keyMatches &&
    event.ctrlKey === keyDef.ctrl &&
    event.altKey === keyDef.alt &&
    (keyDef.key === '?' ? true : event.shiftKey === keyDef.shift) &&
    event.metaKey === keyDef.meta
  );
}

/**
 * Hook for handling keyboard shortcuts
 * Supports single keys, modifier combinations, and sequences (e.g., "g d")
 * 
 * @example
 * // Single key
 * useHotkeys('n', () => console.log('n pressed'));
 * 
 * // With modifier
 * useHotkeys('ctrl+k', () => console.log('ctrl+k pressed'));
 * 
 * // Sequence
 * useHotkeys('g d', () => console.log('g then d pressed'));
 */
export function useHotkeys(
  hotkey: string,
  callback: HotkeyCallback,
  options: HotkeyOptions = {}
): void {
  const opts = { ...defaultOptions, ...options };
  const callbackRef = useRef(callback);
  const sequenceRef = useRef<string[]>([]);
  const sequenceTimeoutRef = useRef<number | null>(null);

  // Update callback ref on each render
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!opts.enabled) return;

      // Skip if focused on input and not enabled for inputs
      if (!opts.enableOnInputs && isInputElement(document.activeElement)) {
        return;
      }

      const parsed = parseHotkey(hotkey);
      const isSequence = parsed.sequence.length > 1;

      if (isSequence) {
        // Handle sequence hotkeys (e.g., "g d")
        const currentKey = event.key.toLowerCase();
        
        // Clear timeout and reset sequence if too much time has passed
        if (sequenceTimeoutRef.current) {
          clearTimeout(sequenceTimeoutRef.current);
        }

        // Check if current key matches next expected key in sequence
        const nextIndex = sequenceRef.current.length;
        const expectedKeyDef = parsed.sequence[nextIndex];
        
        if (matchesKey(event, expectedKeyDef)) {
          sequenceRef.current.push(currentKey);
          
          if (sequenceRef.current.length === parsed.sequence.length) {
            // Full sequence matched
            if (opts.preventDefault) {
              event.preventDefault();
            }
            callbackRef.current(event);
            sequenceRef.current = [];
          } else {
            // Set timeout to reset sequence
            sequenceTimeoutRef.current = window.setTimeout(() => {
              sequenceRef.current = [];
            }, 1000);
          }
        } else {
          // Reset sequence if wrong key
          sequenceRef.current = [];
          
          // But check if it starts a new sequence
          if (matchesKey(event, parsed.sequence[0])) {
            sequenceRef.current.push(currentKey);
            sequenceTimeoutRef.current = window.setTimeout(() => {
              sequenceRef.current = [];
            }, 1000);
          }
        }
      } else {
        // Handle single key or modifier combination
        const keyDef = parsed.sequence[0];
        
        if (matchesKey(event, keyDef)) {
          if (opts.preventDefault) {
            event.preventDefault();
          }
          callbackRef.current(event);
        }
      }
    },
    [hotkey, opts.enabled, opts.enableOnInputs, opts.preventDefault]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    };
  }, [handleKeyDown]);
}

/**
 * Hook to check if we're currently in an input element
 */
export function useIsInputFocused(): boolean {
  return isInputElement(document.activeElement);
}

export default useHotkeys;
