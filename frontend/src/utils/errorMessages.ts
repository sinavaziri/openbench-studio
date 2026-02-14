/**
 * Error message utilities for consistent, user-friendly error handling.
 * 
 * This module provides:
 * - Mapping of technical errors to user-friendly messages
 * - Network error detection
 * - Retry suggestions
 * - Context-aware error formatting
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
  /** Error code from backend (if available) */
  code?: string;
  /** HTTP status code (if available) */
  statusCode?: number;
  /** Original error for logging */
  originalError?: unknown;
}

/** Context for error parsing to provide better messages */
export type ErrorContext = 
  | 'loading-runs'
  | 'loading-run'
  | 'creating-run'
  | 'deleting-run'
  | 'canceling-run'
  | 'duplicating-run'
  | 'scheduling-run'
  | 'canceling-scheduled-run'
  | 'updating-scheduled-run'
  | 'loading-benchmarks'
  | 'loading-models'
  | 'saving-api-key'
  | 'login'
  | 'register'
  | 'loading-eval'
  | 'comparing-runs'
  | 'loading-analytics'
  | 'default';

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
  
  // Eval-specific errors
  {
    pattern: /inspect_ai not available/i,
    parse: () => ({
      title: 'Evaluation Tools Not Installed',
      message: 'The inspect_ai package is required to view evaluation results.',
      action: 'Contact your administrator to install inspect_ai on the server.',
      recoverable: false,
    }),
  },
  {
    pattern: /Failed to parse eval/i,
    parse: () => ({
      title: 'Unable to Parse Results',
      message: 'The evaluation results file could not be parsed.',
      action: 'The file may be corrupted or in an unexpected format. Try downloading and viewing it manually.',
      recoverable: false,
    }),
  },
  {
    pattern: /Only .eval files can be parsed/i,
    parse: () => ({
      title: 'Invalid File Type',
      message: 'Only .eval files can be viewed in the browser.',
      action: 'Download the file to view it with another tool.',
      recoverable: false,
    }),
  },
  
  // Model discovery errors
  {
    pattern: /No providers configured|No models available/i,
    parse: () => ({
      title: 'No Models Available',
      message: 'No AI models are configured for use.',
      action: 'Add API keys in Settings to enable model selection.',
      recoverable: false,
    }),
  },
  
  // Benchmark execution errors  
  {
    pattern: /benchmark.*not found|unknown benchmark/i,
    parse: () => ({
      title: 'Benchmark Not Found',
      message: 'The selected benchmark could not be found.',
      action: 'Select a different benchmark or check that inspect_ai is installed correctly.',
      recoverable: false,
    }),
  },
  {
    pattern: /model.*not found|unknown model/i,
    parse: () => ({
      title: 'Model Not Available',
      message: 'The selected model could not be accessed.',
      action: 'Check your API key for this provider in Settings.',
      recoverable: false,
    }),
  },
  
  // Quota/billing errors
  {
    pattern: /quota|billing|insufficient.*credits|payment required/i,
    parse: () => ({
      title: 'API Quota Exceeded',
      message: 'Your API quota has been exceeded or there\'s a billing issue.',
      action: 'Check your API provider dashboard for quota and billing status.',
      recoverable: false,
    }),
  },
];

/** Context-specific default messages when no pattern matches */
const CONTEXT_DEFAULTS: Record<ErrorContext, Omit<ParsedError, 'originalError'>> = {
  'loading-runs': {
    title: 'Unable to Load Runs',
    message: 'We couldn\'t fetch your benchmark runs.',
    action: 'Check your connection and try refreshing the page.',
    recoverable: true,
  },
  'loading-run': {
    title: 'Run Not Found',
    message: 'The requested benchmark run could not be loaded.',
    action: 'It may have been deleted or the link may be incorrect.',
    recoverable: false,
  },
  'creating-run': {
    title: 'Failed to Start Run',
    message: 'The benchmark couldn\'t be started.',
    action: 'Check your configuration and try again.',
    recoverable: true,
  },
  'deleting-run': {
    title: 'Failed to Delete Run',
    message: 'The run couldn\'t be deleted.',
    action: 'It may still be running. Cancel it first, then try deleting.',
    recoverable: true,
  },
  'canceling-run': {
    title: 'Failed to Cancel Run',
    message: 'The run couldn\'t be canceled.',
    action: 'It may have already completed or failed.',
    recoverable: false,
  },
  'loading-benchmarks': {
    title: 'Unable to Load Benchmarks',
    message: 'The benchmark catalog couldn\'t be loaded.',
    action: 'Check that inspect_ai is installed on the server.',
    recoverable: true,
  },
  'loading-models': {
    title: 'Unable to Load Models',
    message: 'Available models couldn\'t be fetched.',
    action: 'Add API keys in Settings to discover available models.',
    recoverable: true,
  },
  'saving-api-key': {
    title: 'Failed to Save API Key',
    message: 'Your API key couldn\'t be saved.',
    action: 'Check the key format and try again.',
    recoverable: true,
  },
  'login': {
    title: 'Login Failed',
    message: 'We couldn\'t sign you in.',
    action: 'Check your email and password, then try again.',
    recoverable: true,
  },
  'register': {
    title: 'Registration Failed',
    message: 'We couldn\'t create your account.',
    action: 'Try a different email address or check your password.',
    recoverable: true,
  },
  'loading-eval': {
    title: 'Unable to Load Evaluation',
    message: 'The evaluation results couldn\'t be loaded.',
    action: 'The run may not have completed yet, or the results may be unavailable.',
    recoverable: true,
  },
  'comparing-runs': {
    title: 'Comparison Failed',
    message: 'We couldn\'t load the runs for comparison.',
    action: 'Some runs may have been deleted. Select different runs to compare.',
    recoverable: true,
  },
  'duplicating-run': {
    title: 'Failed to Duplicate Run',
    message: 'The run couldn\'t be duplicated.',
    action: 'Check your configuration and try again.',
    recoverable: true,
  },
  'scheduling-run': {
    title: 'Failed to Schedule Run',
    message: 'The run couldn\'t be scheduled.',
    action: 'Check that the scheduled time is in the future.',
    recoverable: true,
  },
  'canceling-scheduled-run': {
    title: 'Failed to Cancel Scheduled Run',
    message: 'The scheduled run couldn\'t be canceled.',
    action: 'It may have already started. Check the runs list.',
    recoverable: true,
  },
  'updating-scheduled-run': {
    title: 'Failed to Update Schedule',
    message: 'The scheduled time couldn\'t be updated.',
    action: 'Check that the new time is in the future.',
    recoverable: true,
  },
  'loading-analytics': {
    title: 'Unable to Load Analytics',
    message: 'Analytics data couldn\'t be loaded.',
    action: 'Check your connection and try again.',
    recoverable: true,
  },
  'default': {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred.',
    action: 'Please try again. If the problem persists, contact support.',
    recoverable: true,
  },
};

/**
 * Extract error details from various error types
 */
function extractErrorDetails(error: unknown): {
  message: string;
  statusCode?: number;
  code?: string;
} {
  let message = '';
  let statusCode: number | undefined;
  let code: string | undefined;
  
  if (error instanceof Error) {
    message = error.message;
    // Check for ApiError properties
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      statusCode = error.statusCode;
    }
    if ('code' in error && typeof error.code === 'string') {
      code = error.code;
    }
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    message = (obj.message as string) || (obj.detail as string) || JSON.stringify(error);
    if (typeof obj.statusCode === 'number') statusCode = obj.statusCode;
    if (typeof obj.code === 'string') code = obj.code;
  } else {
    message = 'Unknown error';
  }
  
  return { message, statusCode, code };
}

/**
 * Parse an error into a user-friendly format
 * 
 * @param error - The error to parse
 * @param context - Optional context for better default messages
 */
export function parseError(error: unknown, context: ErrorContext = 'default'): ParsedError {
  const { message: errorMessage, statusCode, code } = extractErrorDetails(error);
  
  // Try to match known patterns
  for (const { pattern, parse } of ERROR_PATTERNS) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    if (regex.test(errorMessage)) {
      const parsed = parse(errorMessage);
      return {
        ...parsed,
        code,
        statusCode,
        originalError: error,
      };
    }
  }
  
  // Use context-specific default if no pattern matched
  const contextDefault = CONTEXT_DEFAULTS[context] || CONTEXT_DEFAULTS['default'];
  
  // If we have a specific error message, include it
  const hasSpecificMessage = errorMessage && 
    errorMessage !== 'Unknown error' && 
    !errorMessage.includes('[object Object]');
  
  return {
    title: contextDefault.title,
    message: hasSpecificMessage ? errorMessage : contextDefault.message,
    action: contextDefault.action,
    recoverable: contextDefault.recoverable,
    code,
    statusCode,
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
export function getToastMessage(error: unknown, context?: ErrorContext): string {
  const parsed = parseError(error, context);
  return parsed.title;
}

/**
 * Get a detailed error message suitable for display
 */
export function getDetailedMessage(error: unknown, context?: ErrorContext): string {
  const parsed = parseError(error, context);
  return parsed.action ? `${parsed.message} ${parsed.action}` : parsed.message;
}

/**
 * Format error for logging (includes technical details)
 */
export function formatErrorForLog(error: unknown, context?: ErrorContext): string {
  const parsed = parseError(error, context);
  const original = error instanceof Error ? error.stack : String(error);
  const codeInfo = parsed.code ? ` [${parsed.code}]` : '';
  const statusInfo = parsed.statusCode ? ` (HTTP ${parsed.statusCode})` : '';
  return `[${parsed.title}]${codeInfo}${statusInfo} ${parsed.message}\n\nOriginal: ${original}`;
}

/**
 * Create an error handler that updates state with parsed error
 */
export function createErrorHandler(
  setError: (error: { title: string; message: string; action?: string; recoverable: boolean } | null) => void,
  context?: ErrorContext
) {
  return (error: unknown) => {
    const parsed = parseError(error, context);
    setError({
      title: parsed.title,
      message: parsed.message,
      action: parsed.action,
      recoverable: parsed.recoverable,
    });
  };
}

/**
 * Get user-friendly HTTP status message
 */
export function getHttpStatusMessage(status: number): string {
  const messages: Record<number, string> = {
    400: 'Invalid request',
    401: 'Please sign in to continue',
    403: 'You don\'t have permission for this action',
    404: 'Not found',
    408: 'Request timed out',
    409: 'Conflict with existing data',
    422: 'Invalid data provided',
    429: 'Too many requests - please wait',
    500: 'Server error - please try again',
    502: 'Server temporarily unavailable',
    503: 'Service unavailable',
    504: 'Request timed out',
  };
  return messages[status] || `Request failed (${status})`;
}
