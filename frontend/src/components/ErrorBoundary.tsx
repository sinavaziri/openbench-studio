import { Component, ErrorInfo, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatErrorForLog } from '../utils/errorMessages';

interface Props {
  children: ReactNode;
  /** Optional fallback component */
  fallback?: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the child 
 * component tree and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Log the error
    console.error('[ErrorBoundary]', formatErrorForLog(error));
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    // Call the optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            {/* Error icon */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-error-bg border border-error-border flex items-center justify-center">
              <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Error message */}
            <h1 className="text-[24px] text-foreground mb-3">
              Something Went Wrong
            </h1>
            <p className="text-[15px] text-muted mb-6 leading-relaxed">
              We encountered an unexpected error. This has been logged and we'll look into it.
            </p>

            {/* Error details (collapsible) */}
            {this.state.error && (
              <details className="mb-8 text-left bg-background-secondary border border-border rounded p-4">
                <summary className="text-[13px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Technical details
                </summary>
                <pre className="mt-4 text-[12px] text-muted font-mono overflow-x-auto whitespace-pre-wrap">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack && (
                    <>
                      {'\n\nComponent Stack:'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={this.handleRetry}
                className="px-6 py-3 bg-accent text-accent-foreground text-[14px] hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
              <Link
                to="/"
                className="px-6 py-3 border border-border-secondary text-foreground text-[14px] hover:bg-background-tertiary transition-colors"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component that wraps a component with an error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
): React.FC<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Inline error display component for non-fatal errors
 */
export function InlineError({ 
  title, 
  message, 
  action, 
  onRetry,
  onDismiss,
}: { 
  title: string; 
  message: string; 
  action?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="bg-error-bg border border-error-border p-5 rounded">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1">
          <p className="text-[14px] text-error font-medium mb-1">{title}</p>
          <p className="text-[13px] text-muted leading-relaxed">
            {message}
            {action && <span className="text-muted-foreground"> {action}</span>}
          </p>
          {(onRetry || onDismiss) && (
            <div className="flex items-center gap-3 mt-3">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-[12px] text-muted hover:text-foreground transition-colors"
                >
                  Try again
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="text-[12px] text-muted-foreground hover:text-muted transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state with error styling
 */
export function ErrorState({ 
  title, 
  message, 
  action,
  onRetry,
  children,
}: { 
  title: string; 
  message: string; 
  action?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="text-center py-16 px-4">
      <div className="w-12 h-12 mx-auto mb-6 rounded-full bg-background-tertiary border border-border-secondary flex items-center justify-center">
        <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-[18px] text-foreground mb-2">{title}</h3>
      <p className="text-[14px] text-muted max-w-md mx-auto">
        {message}
        {action && <span className="block mt-1 text-muted-foreground">{action}</span>}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-6 px-5 py-2 text-[13px] text-foreground border border-border-secondary hover:bg-background-tertiary transition-colors"
        >
          Try Again
        </button>
      )}
      {children}
    </div>
  );
}
