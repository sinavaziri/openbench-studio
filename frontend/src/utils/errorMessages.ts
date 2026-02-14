/**
 * Error message utilities for consistent, user-friendly error handling.
 * 
 * This module provides:
 * - Mapping of technical errors to user-friendly messages
 * - Network error detection
 * - Retry suggestions
 */

export interface ParsedError {
  /** User-friendly title */
  title: string;
  /** Detailed description */
  message: string;
  /** Suggested action */
  action?: string;
  /** Whether the error is recoverable with retry */
  recoverable: boolean;
  /** Original error for logging */
  originalError?: unknown;
}

/**
 * Known error patterns and their user-friendly equivalents
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp | string;
  parse: (match: string) => Omit<ParsedError, 'originalError'>;
}> = [
  // Network errors
  {
    pattern: /Failed to fetch|NetworkError|ERR_NETWORK|net::ERR_/i,
    parse: () => ({
      title: 'Connection Failed',
      message: 'Unable to connect to the server. Please check your internet connection.',
      action: 'Check your connection and try again.',
      recoverable: true,
    }),
  },
  {
    pattern: /timeout|ETIMEDOUT|ECONNABORTED/i,
    parse: () => ({
      title: 'Request Timed Out',
      message: 'The server took too long to respond.',
      action: 'The server might be busy. Please try again in a moment.',
      recoverable: true,
    }),
  },
  
  // Authentication errors
  {
    pattern: /Authentication required|401/,
    parse: () => ({
      title: 'Session Expired',
      message: 'Your session has expired or you are not logged in.',
      action: 'Please sign in to continue.',
      recoverable: true,
    }),
  },
  {
    pattern: /Invalid email or password/i,
    parse: () => ({
      title: 'Invalid Credentials',
      message: 'The email or password you entered is incorrect.',
      action: 'Please check your credentials and try again.',
      recoverable: true,
    }),
  },
  {
    pattern: /Email already registered/i,
    parse: () => ({
      title: 'Email Already In Use',
      message: 'An account with this email address already exists.',
      action: 'Try signing in instead, or use a different email.',
      recoverable: true,
    }),
  },
  
  // Permission errors
  {
    pattern: /Access denied|403|Forbidden/i,
    parse: () => ({
      title: 'Access Denied',
      message: "You don't have permission to perform this action.",
      action: 'Contact support if you believe this is an error.',
      recoverable: false,
    }),
  },
  
  // Not found errors
  {
    pattern: /Run not found/i,
    parse: () => ({
      title: 'Run Not Found',
      message: 'The benchmark run you requested could not be found.',
      action: 'It may have been deleted or the ID is incorrect.',
      recoverable: false,
    }),
  },
  {
    pattern: /Artifact not found/i,
    parse: () => ({
      title: 'File Not Found',
      message: 'The requested file could not be found.',
      action: 'The file may have been deleted or is not yet available.',
      recoverable: false,
    }),
  },
  {
    pattern: /Eval file not found/i,
    parse: () => ({
      title: 'Evaluation Results Not Found',
      message: 'The evaluation results file could not be found.',
      action: 'The benchmark may not have completed yet.',
      recoverable: false,
    }),
  },
  {
    pattern: /No API key found for provider/i,
    parse: () => ({
      title: 'API Key Not Found',
      message: 'No API key is configured for this provider.',
      action: 'Add an API key in Settings to use this provider.',
      recoverable: false,
    }),
  },
  
  // Run-related errors
  {
    pattern: /Cannot delete a running benchmark/i,
    parse: () => ({
      title: 'Cannot Delete Running Benchmark',
      message: 'This benchmark is still running and cannot be deleted.',
      action: 'Cancel the benchmark first, then try deleting again.',
      recoverable: false,
    }),
  },
  {
    pattern: /Run is not currently running/i,
    parse: () => ({
      title: 'Cannot Cancel',
      message: 'This benchmark is not currently running.',
      action: 'The benchmark may have already completed or failed.',
      recoverable: false,
    }),
  },
  
  // API key errors
  {
    pattern: /API key is required/i,
    parse: () => ({
      title: 'API Key Required',
      message: 'Please enter an API key.',
      action: 'Paste your API key from the provider\'s dashboard.',
      recoverable: true,
    }),
  },
  {
    pattern: /Invalid API key format/i,
    parse: () => ({
      title: 'Invalid API Key',
      message: 'The API key format appears to be incorrect.',
      action: 'Check that you copied the full key from your provider.',
      recoverable: true,
    }),
  },
  
  // Model/benchmark errors
  {
    pattern: /No models available/i,
    parse: () => ({
      title: 'No Models Available',
      message: 'No models could be loaded from your configured providers.',
      action: 'Add API keys in Settings to enable model selection.',
      recoverable: true,
    }),
  },
  {
    pattern: /inspect_ai not available/i,
    parse: () => ({
      title: 'Evaluation Tools Missing',
      message: 'The inspect_ai package is not installed on the server.',
      action: 'Contact your administrator to install inspect_ai.',
      recoverable: false,
    }),
  },
  {
    pattern: /Failed to parse eval file/i,
    parse: () => ({
      title: 'Unable to Read Results',
      message: 'The evaluation results file could not be parsed.',
      action: 'The file may be corrupted or in an unexpected format.',
      recoverable: false,
    }),
  },
  
  // Validation errors
  {
    pattern: /Passwords do not match/i,
    parse: () => ({
      title: 'Passwords Don\'t Match',
      message: 'The password and confirmation password are different.',
      action: 'Re-enter your password in both fields.',
      recoverable: true,
    }),
  },
  {
    pattern: /Password must be at least (\d+) characters/i,
    parse: (match) => ({
      title: 'Password Too Short',
      message: match,
      action: 'Choose a longer, more secure password.',
      recoverable: true,
    }),
  },
  {
    pattern: /Email and password are required/i,
    parse: () => ({
      title: 'Missing Information',
      message: 'Both email and password are required to continue.',
      action: 'Fill in all required fields.',
      recoverable: true,
    }),
  },
  
  // Server errors
  {
    pattern: /500|Internal Server Error/i,
    parse: () => ({
      title: 'Server Error',
      message: 'Something went wrong on our end.',
      action: 'Please try again. If the problem persists, contact support.',
      recoverable: true,
    }),
  },
  {
    pattern: /502|503|504|Service Unavailable|Bad Gateway/i,
    parse: () => ({
      title: 'Server Unavailable',
      message: 'The server is temporarily unavailable.',
      action: 'Please wait a moment and try again.',
      recoverable: true,
    }),
  },
  {
    pattern: /Rate limit|429|Too many requests/i,
    parse: () => ({
      title: 'Too Many Requests',
      message: 'You\'ve made too many requests in a short time.',
      action: 'Please wait a moment before trying again.',
      recoverable: true,
    }),
  },
];

/**
 * Parse an error into a user-friendly format
 */
export function parseError(error: unknown): ParsedError {
  let errorMessage = '';
  
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object') {
    errorMessage = JSON.stringify(error);
  } else {
    errorMessage = 'Unknown error';
  }
  
  // Try to match known patterns
  for (const { pattern, parse } of ERROR_PATTERNS) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    if (regex.test(errorMessage)) {
      return {
        ...parse(errorMessage),
        originalError: error,
      };
    }
  }
  
  // Default fallback
  return {
    title: 'Something Went Wrong',
    message: errorMessage || 'An unexpected error occurred.',
    action: 'Please try again. If the problem persists, contact support.',
    recoverable: true,
    originalError: error,
  };
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const patterns = [
      /Failed to fetch/i,
      /NetworkError/i,
      /net::ERR_/i,
      /ECONNREFUSED/i,
      /ENOTFOUND/i,
      /ETIMEDOUT/i,
    ];
    return patterns.some(p => p.test(error.message));
  }
  return false;
}

/**
 * Check if an error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const patterns = [
      /401/,
      /Authentication required/i,
      /Unauthorized/i,
      /Session expired/i,
      /Invalid token/i,
    ];
    return patterns.some(p => p.test(error.message));
  }
  return false;
}

/**
 * Get a short toast-friendly message
 */
export function getToastMessage(error: unknown): string {
  const parsed = parseError(error);
  return parsed.title;
}

/**
 * Get a detailed error message suitable for display
 */
export function getDetailedMessage(error: unknown): string {
  const parsed = parseError(error);
  return parsed.action ? `${parsed.message} ${parsed.action}` : parsed.message;
}

/**
 * Format error for logging (includes technical details)
 */
export function formatErrorForLog(error: unknown): string {
  const parsed = parseError(error);
  const original = error instanceof Error ? error.stack : String(error);
  return `[${parsed.title}] ${parsed.message}\n\nOriginal: ${original}`;
}
