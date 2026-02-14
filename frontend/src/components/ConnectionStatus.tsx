import { type WebSocketStatus } from '../hooks/useWebSocket';

interface ConnectionStatusProps {
  /** Current WebSocket connection status */
  status: WebSocketStatus;
  /** Number of reconnection attempts (optional) */
  reconnectAttempts?: number;
  /** Whether to show detailed status text */
  showText?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const statusConfig: Record<WebSocketStatus, { color: string; bgColor: string; label: string; animate: boolean }> = {
  connected: {
    color: 'bg-success',
    bgColor: 'bg-success/10',
    label: 'Live',
    animate: false,
  },
  connecting: {
    color: 'bg-warning',
    bgColor: 'bg-warning/10',
    label: 'Connecting',
    animate: true,
  },
  disconnected: {
    color: 'bg-muted-foreground',
    bgColor: 'bg-muted-foreground/10',
    label: 'Offline',
    animate: false,
  },
  error: {
    color: 'bg-error',
    bgColor: 'bg-error/10',
    label: 'Error',
    animate: false,
  },
};

/**
 * Visual indicator for WebSocket connection status.
 * Shows a colored dot with optional label text.
 */
export default function ConnectionStatus({
  status,
  reconnectAttempts = 0,
  showText = true,
  className = '',
}: ConnectionStatusProps) {
  const config = statusConfig[status];
  
  // Show reconnecting state if we have attempts
  const isReconnecting = status === 'disconnected' && reconnectAttempts > 0;
  const displayConfig = isReconnecting
    ? { ...statusConfig.connecting, label: `Reconnecting (${reconnectAttempts})` }
    : config;

  return (
    <div 
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={`Connection: ${displayConfig.label}`}
    >
      <span
        className={`
          w-1.5 h-1.5 rounded-full
          ${displayConfig.color}
          ${displayConfig.animate ? 'animate-pulse' : ''}
        `}
      />
      {showText && (
        <span className={`
          text-[11px] font-medium tracking-wide
          ${status === 'connected' ? 'text-success' : ''}
          ${status === 'connecting' || isReconnecting ? 'text-warning' : ''}
          ${status === 'disconnected' && !isReconnecting ? 'text-muted-foreground' : ''}
          ${status === 'error' ? 'text-error' : ''}
        `}>
          {displayConfig.label}
        </span>
      )}
    </div>
  );
}

/**
 * Minimal version of ConnectionStatus - just the dot indicator.
 */
export function ConnectionDot({
  status,
  reconnectAttempts = 0,
  className = '',
}: Omit<ConnectionStatusProps, 'showText'>) {
  return (
    <ConnectionStatus
      status={status}
      reconnectAttempts={reconnectAttempts}
      showText={false}
      className={className}
    />
  );
}
