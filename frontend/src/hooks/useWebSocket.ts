import { useCallback, useEffect, useRef, useState } from 'react';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketMessage<T = unknown> {
  event: string;
  data: T;
}

export interface UseWebSocketOptions {
  /** URL path (will be converted to ws:// or wss://) */
  url: string;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Base delay for reconnection in ms (default: 1000) */
  reconnectBaseDelay?: number;
  /** Maximum delay between reconnections in ms (default: 30000) */
  reconnectMaxDelay?: number;
  /** Send ping interval in ms (default: 25000) */
  pingInterval?: number;
  /** Event handlers */
  onMessage?: (message: WebSocketMessage) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
}

export interface UseWebSocketReturn {
  /** Current connection status */
  status: WebSocketStatus;
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Send a message through the socket */
  send: (data: unknown) => void;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Last received message */
  lastMessage: WebSocketMessage | null;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
}

/**
 * Custom hook for WebSocket connections with auto-reconnect and exponential backoff.
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    autoConnect = true,
    autoReconnect = true,
    maxReconnectAttempts = 10,
    reconnectBaseDelay = 1000,
    reconnectMaxDelay = 30000,
    pingInterval = 25000,
    onMessage,
    onOpen,
    onClose,
    onError,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const shouldReconnectRef = useRef(autoReconnect);

  // Build WebSocket URL from path
  const getWebSocketUrl = useCallback((path: string): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${protocol}//${host}${normalizedPath}`;
  }, []);

  // Calculate reconnection delay with exponential backoff
  const getReconnectDelay = useCallback(
    (attempt: number): number => {
      // Exponential backoff: delay = baseDelay * 2^attempt + random jitter
      const exponentialDelay = reconnectBaseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 1000; // 0-1s random jitter
      return Math.min(exponentialDelay + jitter, reconnectMaxDelay);
    },
    [reconnectBaseDelay, reconnectMaxDelay]
  );

  // Clear any pending reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Clear ping interval
  const clearPingInterval = useCallback(() => {
    if (pingIntervalRef.current !== null) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  // Start ping interval
  const startPingInterval = useCallback(() => {
    clearPingInterval();
    pingIntervalRef.current = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, pingInterval);
  }, [pingInterval, clearPingInterval]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Don't connect if already connected/connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Clear any pending reconnect
    clearReconnectTimeout();

    setStatus('connecting');
    const wsUrl = getWebSocketUrl(url);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus('connected');
        setReconnectAttempts(0);
        startPingInterval();
        onOpen?.();
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          setLastMessage(message);
          
          // Don't trigger handler for pong messages
          if (message.event !== 'pong') {
            onMessage?.(message);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        clearPingInterval();
        setStatus('disconnected');
        onClose?.(event);

        // Attempt reconnection if enabled and not a clean close
        if (shouldReconnectRef.current && !event.wasClean && reconnectAttempts < maxReconnectAttempts) {
          const delay = getReconnectDelay(reconnectAttempts);
          setReconnectAttempts((prev) => prev + 1);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (mountedRef.current && shouldReconnectRef.current) {
              connect();
            }
          }, delay);
        }
      };

      ws.onerror = (error) => {
        if (!mountedRef.current) return;
        setStatus('error');
        onError?.(error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setStatus('error');
    }
  }, [
    url,
    getWebSocketUrl,
    clearReconnectTimeout,
    clearPingInterval,
    startPingInterval,
    reconnectAttempts,
    maxReconnectAttempts,
    getReconnectDelay,
    onMessage,
    onOpen,
    onClose,
    onError,
  ]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimeout();
    clearPingInterval();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setStatus('disconnected');
    setReconnectAttempts(0);
  }, [clearReconnectTimeout, clearPingInterval]);

  // Send a message
  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    mountedRef.current = true;
    shouldReconnectRef.current = autoReconnect;

    if (autoConnect) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      shouldReconnectRef.current = false;
      clearReconnectTimeout();
      clearPingInterval();

      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
    };
  }, [autoConnect, autoReconnect, connect, clearReconnectTimeout, clearPingInterval]);

  return {
    status,
    isConnected: status === 'connected',
    send,
    connect,
    disconnect,
    lastMessage,
    reconnectAttempts,
  };
}

// =============================================================================
// Specialized hooks for specific WebSocket endpoints
// =============================================================================

export interface RunProgressEvent {
  current: number;
  total: number;
  percentage: number;
  message?: string;
}

export interface RunStatusEvent {
  status: string;
  timestamp: string;
}

export interface RunLogLineEvent {
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface RunCompletedEvent {
  exit_code: number;
  finished_at: string | null;
}

export interface RunFailedEvent {
  exit_code: number;
  error: string | null;
  finished_at: string | null;
}

export interface RunCanceledEvent {
  finished_at: string | null;
}

export interface UseRunWebSocketOptions {
  runId: string;
  autoConnect?: boolean;
  onStatus?: (event: RunStatusEvent) => void;
  onLogLine?: (event: RunLogLineEvent) => void;
  onProgress?: (event: RunProgressEvent) => void;
  onCompleted?: (event: RunCompletedEvent) => void;
  onFailed?: (event: RunFailedEvent) => void;
  onCanceled?: (event: RunCanceledEvent) => void;
  onError?: () => void;
}

/**
 * Specialized hook for subscribing to run events via WebSocket.
 */
export function useRunWebSocket(options: UseRunWebSocketOptions) {
  const {
    runId,
    autoConnect = true,
    onStatus,
    onLogLine,
    onProgress,
    onCompleted,
    onFailed,
    onCanceled,
    onError,
  } = options;

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.event) {
        case 'status':
          onStatus?.(message.data as RunStatusEvent);
          break;
        case 'log_line':
          onLogLine?.(message.data as RunLogLineEvent);
          break;
        case 'progress':
          onProgress?.(message.data as RunProgressEvent);
          break;
        case 'completed':
          onCompleted?.(message.data as RunCompletedEvent);
          break;
        case 'failed':
          onFailed?.(message.data as RunFailedEvent);
          break;
        case 'canceled':
          onCanceled?.(message.data as RunCanceledEvent);
          break;
      }
    },
    [onStatus, onLogLine, onProgress, onCompleted, onFailed, onCanceled]
  );

  return useWebSocket({
    url: `/api/ws/runs/${runId}`,
    autoConnect,
    autoReconnect: true,
    maxReconnectAttempts: 10,
    onMessage: handleMessage,
    onError: () => onError?.(),
  });
}

export interface DashboardRunEvent {
  run_id: string;
  status?: string;
  benchmark?: string;
  model?: string;
  timestamp: string;
}

export interface UseDashboardWebSocketOptions {
  autoConnect?: boolean;
  onRunStatus?: (event: DashboardRunEvent) => void;
  onRunCreated?: (event: DashboardRunEvent) => void;
  onRunDeleted?: (event: DashboardRunEvent) => void;
  onError?: () => void;
}

/**
 * Specialized hook for subscribing to dashboard-level events via WebSocket.
 */
export function useDashboardWebSocket(options: UseDashboardWebSocketOptions) {
  const {
    autoConnect = true,
    onRunStatus,
    onRunCreated,
    onRunDeleted,
    onError,
  } = options;

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.event) {
        case 'run_status':
          onRunStatus?.(message.data as DashboardRunEvent);
          break;
        case 'run_created':
          onRunCreated?.(message.data as DashboardRunEvent);
          break;
        case 'run_deleted':
          onRunDeleted?.(message.data as DashboardRunEvent);
          break;
      }
    },
    [onRunStatus, onRunCreated, onRunDeleted]
  );

  return useWebSocket({
    url: '/api/ws/dashboard',
    autoConnect,
    autoReconnect: true,
    maxReconnectAttempts: 10,
    onMessage: handleMessage,
    onError: () => onError?.(),
  });
}
