const API_BASE = '/api';
const TOKEN_KEY = 'openbench_token';

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

export type ApiKeyProvider = 
  | 'openai' 
  | 'anthropic' 
  | 'google' 
  | 'mistral' 
  | 'cohere' 
  | 'together' 
  | 'groq' 
  | 'fireworks'
  | 'openrouter'
  | 'custom';

export interface ApiKeyPublic {
  key_id: string;
  provider: ApiKeyProvider;
  key_preview: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyCreate {
  provider: ApiKeyProvider;
  key: string;
}

export interface ProviderInfo {
  provider: ApiKeyProvider;
  env_var: string;
  display_name: string;
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
    requireAuth: boolean = false
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Add auth header if we have a token
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    } else if (requireAuth) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      
      // Handle auth errors specially
      if (response.status === 401) {
        this.setToken(null); // Clear invalid token
        throw new Error(error.detail || 'Authentication required');
      }
      
      throw new Error(error.detail || `Request failed: ${response.status}`);
    }

    return response.json();
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

  // ===========================================================================
  // Health & Benchmarks
  // ===========================================================================

  async healthCheck(): Promise<{ status: string }> {
    return this.request('/health');
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

