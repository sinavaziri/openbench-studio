const API_BASE = '/api';
const TOKEN_KEY = 'openbench_token';

// Request timeout in milliseconds
const DEFAULT_TIMEOUT = 30000;

/**
 * Custom API Error class with additional context
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly detail: string;
  public readonly isNetworkError: boolean;
  public readonly isAuthError: boolean;
  public readonly recoverable: boolean;

  constructor(
    message: string,
    statusCode: number = 0,
    detail?: string,
    options?: { isNetworkError?: boolean; isAuthError?: boolean }
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.detail = detail || message;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isAuthError = options?.isAuthError ?? (statusCode === 401);
    
    // Determine if error is recoverable (can retry)
    this.recoverable = this.isNetworkError || 
      statusCode === 429 || // Rate limited
      statusCode >= 500;    // Server errors
  }
}

// =============================================================================
// Auth Types
// =============================================================================

export interface User {
  user_id: string;
  email: string;
  created_at: string;
  is_active: boolean;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
}

// =============================================================================
// API Key Types
// =============================================================================

// Dynamic provider type (string for flexibility)
export type ApiKeyProvider = string;

export interface ApiKeyPublic {
  key_id: string;
  provider: string;
  key_preview: string;
  custom_env_var?: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyCreate {
  provider: string;
  key: string;
  custom_env_var?: string;
}

export interface ProviderInfo {
  provider: string;
  env_var: string;
  display_name: string;
  color: string;
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  envVar: string;
  color: string;
}

// =============================================================================
// Model Discovery Types
// =============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

export interface ModelProvider {
  name: string;
  provider_key: string;
  models: ModelInfo[];
}

export interface AvailableModelsResponse {
  providers: ModelProvider[];
}

// =============================================================================
// Benchmark Types
// =============================================================================

export interface Benchmark {
  name: string;
  category: string;
  description_short: string;
  description?: string;  // Full description for detail view
  tags: string[];
  featured?: boolean;  // Whether this is a featured/popular benchmark
  source?: string;  // Source of benchmark: "builtin", "plugin", "github", "cli"
}

export interface RunConfig {
  schema_version?: number;  // Config schema version for reproducibility
  benchmark: string;
  model: string;
  limit?: number;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  timeout?: number;
  epochs?: number;
  max_connections?: number;
}

export interface RunSummary {
  run_id: string;
  benchmark: string;
  model: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  created_at: string;
  finished_at?: string;
  primary_metric?: number;
  primary_metric_name?: string;
  tags: string[];
}

export interface RunFilters {
  limit?: number;
  search?: string;
  status?: string;
  benchmark?: string;
  tag?: string;
}

// Structured summary types
export interface MetricValue {
  name: string;
  value: number;
  unit?: string | null;
}

export interface BreakdownItem {
  key: string;
  value: number;
  unit?: string | null;
}

export interface Breakdown {
  name: string;
  items: BreakdownItem[];
}

export interface ResultSummary {
  schema_version: number;
  primary_metric: MetricValue | null;
  metrics: MetricValue[];
  breakdowns: Breakdown[];
  notes: string[];
  raw: {
    source: string;
    hint: string;
  };
}

export interface RunDetail extends RunSummary {
  started_at?: string;
  artifact_dir?: string;
  exit_code?: number;
  error?: string;
  config?: RunConfig;
  command?: string;  // Exact CLI command for reproducibility
  artifacts: string[];
  stdout_tail?: string;
  stderr_tail?: string;
  summary?: ResultSummary | null;  // Structured results summary
  tags: string[];  // User-defined tags for organization
}

// SSE Event Types
export interface SSEStatusEvent {
  status: string;
  timestamp: string;
}

export interface SSELogLineEvent {
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface SSEProgressEvent {
  current: number;
  total: number;
  percentage: number;
  message?: string;
}

export interface SSECompletedEvent {
  exit_code: number;
  finished_at: string | null;
}

export interface SSEFailedEvent {
  exit_code: number;
  error: string | null;
  finished_at: string | null;
}

export interface SSECanceledEvent {
  finished_at: string | null;
}

export interface SSEHeartbeatEvent {
  timestamp: string;
}

export type SSEEventHandlers = {
  onStatus?: (event: SSEStatusEvent) => void;
  onLogLine?: (event: SSELogLineEvent) => void;
  onProgress?: (event: SSEProgressEvent) => void;
  onCompleted?: (event: SSECompletedEvent) => void;
  onFailed?: (event: SSEFailedEvent) => void;
  onCanceled?: (event: SSECanceledEvent) => void;
  onHeartbeat?: (event: SSEHeartbeatEvent) => void;
  onError?: (error: Error) => void;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage on init
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  // ===========================================================================
  // Token Management
  // ===========================================================================

  setToken(token: string | null): void {
    this.token = token;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  // ===========================================================================
  // HTTP Request Helper
  // ===========================================================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = false,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Add auth header if we have a token
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    } else if (requireAuth) {
      throw new ApiError(
        'Please sign in to continue.',
        401,
        'Authentication required',
        { isAuthError: true }
      );
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorDetail = '';
        let errorBody: Record<string, unknown> = {};
        
        try {
          errorBody = await response.json();
          errorDetail = (errorBody.detail as string) || '';
        } catch {
          // Response wasn't JSON
        }
        
        // Map status codes to user-friendly messages
        const statusMessages: Record<number, string> = {
          400: errorDetail || 'The request was invalid. Please check your input.',
          401: 'Your session has expired. Please sign in again.',
          403: "You don't have permission to perform this action.",
          404: errorDetail || 'The requested resource was not found.',
          409: errorDetail || 'This action conflicts with existing data.',
          422: errorDetail || 'The provided data is invalid.',
          429: 'Too many requests. Please wait a moment and try again.',
          500: 'Something went wrong on our end. Please try again.',
          502: 'The server is temporarily unavailable.',
          503: 'The service is temporarily unavailable. Please try again later.',
          504: 'The request timed out. Please try again.',
        };
        
        const userMessage = statusMessages[response.status] || 
          errorDetail || 
          `Request failed (${response.status})`;
        
        // Handle auth errors specially - clear token
        if (response.status === 401) {
          this.setToken(null);
        }
        
        throw new ApiError(
          userMessage,
          response.status,
          errorDetail,
          { isAuthError: response.status === 401 }
        );
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return {} as T;
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Already an ApiError, re-throw
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Handle abort/timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(
          'The request timed out. Please check your connection and try again.',
          0,
          'Request timeout',
          { isNetworkError: true }
        );
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new ApiError(
          'Unable to connect to the server. Please check your internet connection.',
          0,
          'Network error',
          { isNetworkError: true }
        );
      }
      
      // Unknown error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new ApiError(
        `An unexpected error occurred: ${errorMessage}`,
        0,
        errorMessage
      );
    }
  }

  // ===========================================================================
  // Auth Endpoints
  // ===========================================================================

  async register(credentials: RegisterCredentials): Promise<AuthToken> {
    const result = await this.request<AuthToken>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    this.setToken(result.access_token);
    return result;
  }

  async login(credentials: LoginCredentials): Promise<AuthToken> {
    const result = await this.request<AuthToken>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    this.setToken(result.access_token);
    return result;
  }

  logout(): void {
    this.setToken(null);
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me', {}, true);
  }

  // ===========================================================================
  // API Keys Endpoints
  // ===========================================================================

  async listApiKeys(): Promise<ApiKeyPublic[]> {
    return this.request<ApiKeyPublic[]>('/api-keys', {}, true);
  }

  async createOrUpdateApiKey(keyCreate: ApiKeyCreate): Promise<ApiKeyPublic> {
    return this.request<ApiKeyPublic>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(keyCreate),
    }, true);
  }

  async deleteApiKey(provider: ApiKeyProvider): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/api-keys/${provider}`, {
      method: 'DELETE',
    }, true);
  }

  async listProviders(): Promise<ProviderInfo[]> {
    return this.request<ProviderInfo[]>('/api-keys/providers');
  }

  async getAvailableModels(forceRefresh: boolean = false): Promise<AvailableModelsResponse> {
    const params = forceRefresh ? '?force_refresh=true' : '';
    return this.request<AvailableModelsResponse>(`/available-models${params}`, {}, true);
  }

  // ===========================================================================
  // Health & Benchmarks
  // ===========================================================================

  async healthCheck(): Promise<{ status: string }> {
    return this.request('/health');
  }

  async getVersion(): Promise<{ web_ui: string; openbench: string | null; openbench_available: boolean }> {
    return this.request('/version');
  }

  async listBenchmarks(): Promise<Benchmark[]> {
    return this.request('/benchmarks');
  }

  async getBenchmark(name: string): Promise<Benchmark> {
    return this.request(`/benchmarks/${name}`);
  }

  // ===========================================================================
  // Runs Endpoints
  // ===========================================================================

  async createRun(config: RunConfig): Promise<{ run_id: string }> {
    return this.request('/runs', {
      method: 'POST',
      body: JSON.stringify(config),
    }, true);  // Requires auth
  }

  async listRuns(filters: RunFilters = {}): Promise<RunSummary[]> {
    const params = new URLSearchParams();
    if (filters.limit) params.set('limit', filters.limit.toString());
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    if (filters.benchmark) params.set('benchmark', filters.benchmark);
    if (filters.tag) params.set('tag', filters.tag);
    const query = params.toString();
    return this.request(`/runs${query ? `?${query}` : ''}`);
  }

  async getRun(runId: string, logLines: number = 100): Promise<RunDetail> {
    return this.request(`/runs/${runId}?log_lines=${logLines}`);
  }

  async cancelRun(runId: string): Promise<{ status: string }> {
    return this.request(`/runs/${runId}/cancel`, {
      method: 'POST',
    }, true);  // Requires auth
  }

  async deleteRun(runId: string): Promise<{ status: string }> {
    return this.request(`/runs/${runId}`, {
      method: 'DELETE',
    }, true);  // Requires auth
  }

  async bulkDeleteRuns(runIds: string[]): Promise<{
    status: string;
    summary: {
      total: number;
      deleted: number;
      failed: number;
      running: number;
      not_found: number;
    };
    details: {
      deleted: string[];
      failed: string[];
      running: string[];
      not_found: string[];
    };
  }> {
    return this.request('/runs/bulk-delete', {
      method: 'POST',
      body: JSON.stringify(runIds),
    }, true);  // Requires auth
  }

  async updateRunTags(runId: string, tags: string[]): Promise<{ tags: string[] }> {
    return this.request(`/runs/${runId}/tags`, {
      method: 'PATCH',
      body: JSON.stringify({ tags }),
    }, true);  // Requires auth
  }

  async listAllTags(): Promise<string[]> {
    return this.request('/runs/tags');
  }

  /**
   * Subscribe to run events via Server-Sent Events (SSE).
   * Returns a cleanup function to close the connection.
   */
  subscribeToRunEvents(runId: string, handlers: SSEEventHandlers): () => void {
    const eventSource = new EventSource(`${API_BASE}/runs/${runId}/events`);

    // Handle each event type
    eventSource.addEventListener('status', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEStatusEvent;
        handlers.onStatus?.(data);
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse status event'));
      }
    });

    eventSource.addEventListener('log_line', (e) => {
      try {
        const data = JSON.parse(e.data) as SSELogLineEvent;
        handlers.onLogLine?.(data);
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse log_line event'));
      }
    });

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEProgressEvent;
        handlers.onProgress?.(data);
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse progress event'));
      }
    });

    eventSource.addEventListener('completed', (e) => {
      try {
        const data = JSON.parse(e.data) as SSECompletedEvent;
        handlers.onCompleted?.(data);
        eventSource.close();
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse completed event'));
      }
    });

    eventSource.addEventListener('failed', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEFailedEvent;
        handlers.onFailed?.(data);
        eventSource.close();
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse failed event'));
      }
    });

    eventSource.addEventListener('canceled', (e) => {
      try {
        const data = JSON.parse(e.data) as SSECanceledEvent;
        handlers.onCanceled?.(data);
        eventSource.close();
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error('Failed to parse canceled event'));
      }
    });

    eventSource.addEventListener('heartbeat', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEHeartbeatEvent;
        handlers.onHeartbeat?.(data);
      } catch (err) {
        // Heartbeat errors are non-critical
      }
    });

    eventSource.onerror = () => {
      handlers.onError?.(new Error('SSE connection error'));
      eventSource.close();
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  }
}

export const api = new ApiClient();

